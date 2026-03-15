import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { AccountStatus, User, UserRole } from "@/lib/domain";
import { users } from "@/lib/mock-data";
import { normalizeRole } from "@/lib/permissions";
import type { Database } from "@/lib/supabase/database.types";
import { isSupabaseConfigured, hasSupabaseServiceRole } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export interface PortalViewer {
  mode: "preview" | "live" | "live-role-preview";
  user: User;
  email?: string;
  accountStatus?: AccountStatus;
  mustChangePassword?: boolean;
  previewRole?: UserRole;
  previewSourceUserId?: string | null;
  previewSourceName?: string | null;
}

const previewUsersByRole = new Map(users.map((user) => [user.role, user]));
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type UserTemplateRow = Database["public"]["Tables"]["user_templates"]["Row"];
type CohortAssignmentRow = Database["public"]["Tables"]["cohort_assignments"]["Row"];

function getPreviewViewer(roleInput?: string | string[]): PortalViewer {
  const role = normalizeRole(roleInput);
  const user = previewUsersByRole.get(role) ?? previewUsersByRole.get("admin")!;
  return {
    mode: "preview",
    user,
  };
}

async function ensureLiveProfile(
  authUser: SupabaseAuthUser,
): Promise<{ profile: ProfileRow | null; assignedCohortIds: string[] } | null> {
  if (!hasSupabaseServiceRole()) {
    return null;
  }

  const serviceClient = createSupabaseServiceClient();
  const normalizedEmail = authUser.email?.toLowerCase();
  const existingProfileResult = await serviceClient
    .from("profiles")
    .select("*")
    .eq("id", authUser.id)
    .maybeSingle();
  const existingProfile = (existingProfileResult.data ?? null) as ProfileRow | null;
  const templateResult =
    !existingProfile && normalizedEmail
      ? await serviceClient
          .from("user_templates")
          .select("*")
          .eq("email", normalizedEmail)
          .maybeSingle()
      : { data: null };
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
  const mustChangePassword =
    template?.must_change_password ?? existingProfile?.must_change_password ?? false;
  const needsProfileUpsert =
    !existingProfile ||
    existingProfile.email !== email ||
    existingProfile.full_name !== fullName ||
    existingProfile.role !== role ||
    existingProfile.title !== title ||
    existingProfile.account_status !== accountStatus ||
    existingProfile.must_change_password !== mustChangePassword;

  if (needsProfileUpsert) {
    await serviceClient.from("profiles").upsert({
      id: authUser.id,
      email,
      full_name: fullName,
      role,
      title,
      account_status: accountStatus,
      must_change_password: mustChangePassword,
    });
  }

  if (template && !existingProfile) {
    const desiredAssignments = template.assigned_cohort_ids.map((cohortId) => ({
      cohort_id: cohortId,
      user_id: authUser.id,
      role: template.role,
    }));

    if (desiredAssignments.length > 0) {
      await serviceClient
        .from("cohort_assignments")
        .upsert(desiredAssignments, { onConflict: "user_id,cohort_id" });
    }
  }
  const assignmentsResult = await serviceClient
    .from("cohort_assignments")
    .select("cohort_id")
    .eq("user_id", authUser.id);
  const assignments = (assignmentsResult.data ?? []) as Pick<CohortAssignmentRow, "cohort_id">[];
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
        } as ProfileRow)
      : existingProfile;

  return {
    profile: hydratedProfile,
    assignedCohortIds: assignments?.map((assignment) => assignment.cohort_id) ?? [],
  };
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
  const fallbackPreview = previewUsersByRole.get(normalizedPreviewRole);

  return {
    ...viewer,
    mode: "live-role-preview",
    previewRole: normalizedPreviewRole,
    previewSourceUserId: previewProfile?.id ?? fallbackPreview?.id ?? null,
    previewSourceName: previewProfile?.full_name ?? fallbackPreview?.name ?? null,
    user: {
      id: viewer.user.id,
      name: viewer.user.name,
      role: normalizedPreviewRole,
      title: fallbackPreview?.title ?? `${normalizedPreviewRole[0]?.toUpperCase()}${normalizedPreviewRole.slice(1)} preview`,
      assignedCohortIds:
        previewProfile || fallbackPreview
          ? assignedCohortIds.length > 0
            ? assignedCohortIds
            : fallbackPreview?.assignedCohortIds ?? []
          : [],
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
  if (!isSupabaseConfigured()) {
    return getPreviewViewer(previewRole);
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }

  const liveProfile = await ensureLiveProfile(authUser);
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
      },
    })),
  };
}

export async function getAuthenticatedViewerForRequest() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return null;
  }

  const liveProfile = await ensureLiveProfile(authUser);

  return {
    mode: "live" as const,
    email: authUser.email,
    accountStatus: liveProfile?.profile?.account_status ?? "active",
    mustChangePassword: liveProfile?.profile?.must_change_password ?? false,
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
    },
  };
}
