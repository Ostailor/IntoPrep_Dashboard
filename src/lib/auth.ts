import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";
import type { AccountStatus, User, UserRole } from "@/lib/domain";
import {
  getLocalQaEmail,
  getLocalQaRole,
  getLocalQaUser,
  isLocalQaMode,
  LOCAL_QA_COOKIE,
} from "@/lib/local-qa";
import { normalizeRole } from "@/lib/permissions";
import type { Database } from "@/lib/supabase/database.types";
import { isSupabaseConfigured, hasSupabaseServiceRole } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export interface PortalViewer {
  mode: "live" | "live-role-preview";
  user: User;
  email?: string;
  accountStatus?: AccountStatus;
  mustChangePassword?: boolean;
  previewRole?: UserRole;
  previewSourceUserId?: string | null;
  previewSourceName?: string | null;
}

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type UserTemplateRow = Database["public"]["Tables"]["user_templates"]["Row"];
type CohortAssignmentRow = Database["public"]["Tables"]["cohort_assignments"]["Row"];
interface AuthUserCacheFields {
  id: string;
  email: string | null;
  user_metadata: SupabaseAuthUser["user_metadata"];
}

const LAST_SIGNED_IN_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

function formatPreviewTitle(role: UserRole) {
  return `${role[0]?.toUpperCase()}${role.slice(1)} preview`;
}

function shouldRefreshLastSignedInAt(lastSignedInAt: string | null) {
  if (!lastSignedInAt) {
    return true;
  }

  const lastRefreshTime = new Date(lastSignedInAt).getTime();

  return (
    !Number.isFinite(lastRefreshTime) ||
    Date.now() - lastRefreshTime > LAST_SIGNED_IN_REFRESH_INTERVAL_MS
  );
}

function getAccessTokenIssuedAt(accessToken?: string | null) {
  if (!accessToken) {
    return null;
  }

  const [, payload] = accessToken.split(".");

  if (!payload) {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const parsed = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as {
      iat?: number;
    };

    return typeof parsed.iat === "number" ? parsed.iat * 1000 : null;
  } catch {
    return null;
  }
}

function isSessionRevoked(profile: ProfileRow | null | undefined, accessToken?: string | null) {
  const sessionRevokedAt = profile?.session_revoked_at ?? null;

  if (!sessionRevokedAt) {
    return false;
  }

  const tokenIssuedAt = getAccessTokenIssuedAt(accessToken);

  return tokenIssuedAt !== null && tokenIssuedAt <= new Date(sessionRevokedAt).getTime();
}

async function loadLiveProfile(
  authUser: AuthUserCacheFields,
): Promise<{ profile: ProfileRow | null; assignedCohortIds: string[] } | null> {
  if (!hasSupabaseServiceRole()) {
    return null;
  }

  const serviceClient = createSupabaseServiceClient();
  const normalizedEmail = authUser.email?.toLowerCase();
  const [existingProfileResult, templateResult] = await Promise.all([
    serviceClient
      .from("profiles")
      .select("*")
      .eq("id", authUser.id)
      .maybeSingle(),
    normalizedEmail
      ? serviceClient
          .from("user_templates")
          .select("*")
          .eq("email", normalizedEmail)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const existingProfile = (existingProfileResult.data ?? null) as ProfileRow | null;
  const template = (templateResult.data ?? null) as UserTemplateRow | null;
  const email = normalizedEmail ?? null;

  const fullName =
    existingProfile?.full_name ??
    template?.full_name ??
    authUser.user_metadata.full_name ??
    authUser.email?.split("@")[0] ??
    "IntoPrep User";

  const title =
    existingProfile?.title ??
    template?.title ??
    authUser.user_metadata.title ??
    "Portal User";

  const role =
    template?.role ??
    existingProfile?.role ??
    (authUser.user_metadata.role as UserRole | undefined) ??
    "instructor";
  const accountStatus = template?.account_status ?? existingProfile?.account_status ?? "active";
  const firstPortalSignIn = !existingProfile?.last_signed_in_at;
  const metadataMustChangePassword = authUser.user_metadata.must_change_password === true;
  const mustChangePassword =
    template?.must_change_password ??
    (existingProfile?.must_change_password === true ||
      metadataMustChangePassword ||
      firstPortalSignIn);
  const demo =
    template?.demo ??
    existingProfile?.demo ??
    authUser.user_metadata.demo === true;
  const needsProfileUpsert =
    !existingProfile ||
    existingProfile.email !== email ||
    existingProfile.full_name !== fullName ||
    existingProfile.role !== role ||
    existingProfile.title !== title ||
    existingProfile.account_status !== accountStatus ||
    existingProfile.must_change_password !== mustChangePassword ||
    existingProfile.demo !== demo;
  const lastSignedInAt = new Date().toISOString();
  const needsLastSignedInRefresh = shouldRefreshLastSignedInAt(
    existingProfile?.last_signed_in_at ?? null,
  );

  const profileWrite = needsProfileUpsert
    ? serviceClient.from("profiles").upsert({
        id: authUser.id,
        email,
        full_name: fullName,
        role,
        title,
        account_status: accountStatus,
        must_change_password: mustChangePassword,
        demo,
        last_signed_in_at: lastSignedInAt,
      })
    : needsLastSignedInRefresh
      ? serviceClient
          .from("profiles")
          .update({ last_signed_in_at: lastSignedInAt })
          .eq("id", authUser.id)
      : Promise.resolve();
  const [currentAssignmentsResult] = await Promise.all([
    serviceClient
      .from("cohort_assignments")
      .select("cohort_id,role")
      .eq("user_id", authUser.id),
    profileWrite,
  ]);
  const currentAssignments =
    (currentAssignmentsResult.data ?? []) as Pick<CohortAssignmentRow, "cohort_id" | "role">[];
  let assignedCohortIds = currentAssignments.map((assignment) => assignment.cohort_id);

  if (template) {
    const desiredAssignmentIds = new Set(template.assigned_cohort_ids);
    const assignmentsToUpsert = template.assigned_cohort_ids
      .filter((cohortId) => {
        const currentAssignment = currentAssignments.find((assignment) => assignment.cohort_id === cohortId);
        return !currentAssignment || currentAssignment.role !== template.role;
      })
      .map((cohortId) => ({
        cohort_id: cohortId,
        user_id: authUser.id,
        role: template.role,
      }));
    const assignmentsToDelete = currentAssignments
      .filter((assignment) => !desiredAssignmentIds.has(assignment.cohort_id))
      .map((assignment) => assignment.cohort_id);

    const mutationResults = await Promise.all([
      assignmentsToUpsert.length > 0
        ? serviceClient
            .from("cohort_assignments")
            .upsert(assignmentsToUpsert, { onConflict: "user_id,cohort_id" })
        : Promise.resolve({ error: null }),
      assignmentsToDelete.length > 0
        ? serviceClient
            .from("cohort_assignments")
            .delete()
            .eq("user_id", authUser.id)
            .in("cohort_id", assignmentsToDelete)
        : Promise.resolve({ error: null }),
    ]);

    if (mutationResults.some((result) => result.error)) {
      const assignmentsResult = await serviceClient
        .from("cohort_assignments")
        .select("cohort_id")
        .eq("user_id", authUser.id);
      const assignments =
        (assignmentsResult.data ?? []) as Pick<CohortAssignmentRow, "cohort_id">[];
      assignedCohortIds = assignments.map((assignment) => assignment.cohort_id);
    } else {
      assignedCohortIds = template.assigned_cohort_ids;
    }
  }
  const hydratedProfile =
    needsProfileUpsert
      ? ({
          ...(existingProfile ?? {}),
          id: authUser.id,
          email,
          full_name: fullName,
          role,
          title,
          account_status: accountStatus,
          must_change_password: mustChangePassword,
          demo,
          last_signed_in_at: lastSignedInAt,
        } as ProfileRow)
      : existingProfile;

  return {
    profile: hydratedProfile,
    assignedCohortIds,
  };
}

function getLiveProfileCacheUser(authUser: SupabaseAuthUser) {
  return JSON.stringify({
    id: authUser.id,
    email: authUser.email?.toLowerCase() ?? null,
    user_metadata: authUser.user_metadata,
  } satisfies AuthUserCacheFields);
}

const getCachedLiveProfile = unstable_cache(
  async (authUserJson: string) => {
    const authUser = JSON.parse(authUserJson) as AuthUserCacheFields;

    return loadLiveProfile(authUser);
  },
  ["live-profile-v1"],
  {
    revalidate: 15,
    tags: ["portal-live"],
  },
);

async function ensureLiveProfile(
  authUser: SupabaseAuthUser,
): Promise<{ profile: ProfileRow | null; assignedCohortIds: string[] } | null> {
  if (!hasSupabaseServiceRole()) {
    return null;
  }

  return getCachedLiveProfile(getLiveProfileCacheUser(authUser));
}

async function resolveLiveRolePreview(
  previewRole: string | string[] | undefined,
  viewer: PortalViewer,
): Promise<PortalViewer> {
  if (!previewRole) {
    return viewer;
  }

  const normalizedPreviewRole = normalizeRole(previewRole);

  if (
    viewer.user.role !== "engineer" ||
    normalizedPreviewRole === "engineer" ||
    !hasSupabaseServiceRole()
  ) {
    return viewer;
  }

  const serviceClient = createSupabaseServiceClient();
  const { data: previewProfileData, error: previewProfileError } = await serviceClient
    .from("profiles")
    .select("*")
    .eq("role", normalizedPreviewRole)
    .eq("account_status", "active")
    .is("deleted_at", null)
    .order("full_name", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (previewProfileError) {
    return viewer;
  }

  const previewProfile = (previewProfileData ?? null) as ProfileRow | null;
  const previewAssignments =
    previewProfile && (normalizedPreviewRole === "ta" || normalizedPreviewRole === "instructor")
      ? await serviceClient
          .from("cohort_assignments")
          .select("cohort_id")
          .eq("user_id", previewProfile.id)
      : { data: [] };
  const assignedCohortIds =
    normalizedPreviewRole === "admin" || normalizedPreviewRole === "staff"
      ? []
      : ((previewAssignments.data ?? []) as Pick<CohortAssignmentRow, "cohort_id">[]).map(
          (assignment) => assignment.cohort_id,
        );

  return {
    ...viewer,
    mode: "live-role-preview",
    previewRole: normalizedPreviewRole,
    previewSourceUserId: previewProfile?.id ?? null,
    previewSourceName: previewProfile?.full_name ?? null,
      user: {
        id: viewer.user.id,
        name: viewer.user.name,
        role: normalizedPreviewRole,
        title: previewProfile?.title ?? formatPreviewTitle(normalizedPreviewRole),
        assignedCohortIds,
        demo: previewProfile?.demo ?? viewer.user.demo,
      },
  };
}

export async function resolvePortalViewer({
  previewRole,
  path,
}: {
  previewRole?: string | string[];
  path: string;
}): Promise<PortalViewer> {
  if (isLocalQaMode()) {
    const cookieStore = await cookies();
    const role =
      getLocalQaRole(previewRole) ??
      getLocalQaRole(cookieStore.get(LOCAL_QA_COOKIE)?.value) ??
      "admin";
    const user = getLocalQaUser(role);

    return {
      mode: "live",
      email: getLocalQaEmail(role),
      accountStatus: "active",
      mustChangePassword: false,
      user,
    };
  }

  if (!isSupabaseConfigured()) {
    redirect("/login?error=Portal%20authentication%20is%20not%20configured.");
  }

  const supabase = await createSupabaseServerClient();
  const [userResult, sessionResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);
  const authUser = userResult.data.user;
  const session = sessionResult.data.session;

  if (!authUser) {
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }

  const liveProfile = await ensureLiveProfile(authUser);
  const deletedAt = liveProfile?.profile?.deleted_at ?? null;
  const accountStatus = liveProfile?.profile?.account_status ?? "active";

  if (isSessionRevoked(liveProfile?.profile, session?.access_token)) {
    redirect("/login?error=Your%20session%20was%20revoked.%20Sign%20in%20again.");
  }

  if (deletedAt || accountStatus === "suspended") {
    redirect(
      deletedAt
        ? "/login?error=This%20IntoPrep%20portal%20account%20is%20no%20longer%20active."
        : "/login?error=Your%20IntoPrep%20portal%20account%20is%20suspended.",
    );
  }

  const role = liveProfile?.profile?.role ?? "instructor";
  const title = liveProfile?.profile?.title ?? "Portal User";
  const fullName =
    liveProfile?.profile?.full_name ??
    authUser.user_metadata.full_name ??
    authUser.email?.split("@")[0] ??
    "IntoPrep User";

  return {
    ...(await resolveLiveRolePreview(previewRole, {
      mode: "live",
      email: authUser.email,
      accountStatus: liveProfile?.profile?.account_status ?? "active",
      mustChangePassword: liveProfile?.profile?.must_change_password ?? false,
      user: {
        id: authUser.id,
        name: fullName,
        role,
        title,
        assignedCohortIds: liveProfile?.assignedCohortIds ?? [],
        demo: liveProfile?.profile?.demo ?? false,
      },
    })),
  };
}

export async function getAuthenticatedViewerForRequest({
  allowPasswordChangeRequired = false,
}: {
  allowPasswordChangeRequired?: boolean;
} = {}) {
  if (isLocalQaMode()) {
    const cookieStore = await cookies();
    const role = getLocalQaRole(cookieStore.get(LOCAL_QA_COOKIE)?.value);

    if (!role) {
      return null;
    }

    return {
      mode: "live" as const,
      email: getLocalQaEmail(role),
      accountStatus: "active" as const,
      mustChangePassword: false,
      user: getLocalQaUser(role),
    };
  }

  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const [userResult, sessionResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);
  const authUser = userResult.data.user;
  const session = sessionResult.data.session;

  if (!authUser) {
    return null;
  }

  const liveProfile = await ensureLiveProfile(authUser);
  const accountStatus = liveProfile?.profile?.account_status ?? "active";
  const mustChangePassword = liveProfile?.profile?.must_change_password ?? false;

  if (
    liveProfile?.profile?.deleted_at ||
    accountStatus === "suspended" ||
    (!allowPasswordChangeRequired && mustChangePassword) ||
    isSessionRevoked(liveProfile?.profile, session?.access_token)
  ) {
    return null;
  }

  return {
    mode: "live" as const,
    email: authUser.email,
    accountStatus: liveProfile?.profile?.account_status ?? "active",
    mustChangePassword,
    user: {
      id: authUser.id,
      name:
        liveProfile?.profile?.full_name ??
        authUser.user_metadata.full_name ??
        authUser.email?.split("@")[0] ??
        "IntoPrep User",
      role: liveProfile?.profile?.role ?? "instructor",
      title: liveProfile?.profile?.title ?? "Portal User",
      assignedCohortIds: liveProfile?.assignedCohortIds ?? [],
      demo: liveProfile?.profile?.demo ?? false,
    },
  };
}
