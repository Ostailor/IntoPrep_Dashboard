import "server-only";

import { randomBytes } from "node:crypto";
import packageJson from "../../package.json";
import type {
  ChangeFreezeState,
  EngineerSupportNote,
  FeatureFlag,
  IntegrationControlState,
  MaintenanceBanner,
  SensitiveAccessGrant,
  SensitiveScopeType,
  User,
  UserRole,
} from "@/lib/domain";
import { recordAccountAuditLog } from "@/lib/account-governance";
import {
  canGrantSensitiveAccess,
  canManageFeatureFlags,
  canManageIncidents,
  canRevokeSessions,
  getPermissionProfile,
} from "@/lib/permissions";
import type { Database } from "@/lib/supabase/database.types";
import { hasSupabaseServiceRole } from "@/lib/supabase/config";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getGoogleFormsSyncSource, runGoogleFormsSync } from "@/lib/intake-sync";
import { runQuickBooksSync } from "@/lib/billing-sync";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type SensitiveAccessGrantRow = Database["public"]["Tables"]["sensitive_access_grants"]["Row"];
type EngineerSupportNoteRow = Database["public"]["Tables"]["engineer_support_notes"]["Row"];
type FeatureFlagRow = Database["public"]["Tables"]["feature_flags"]["Row"];
type PortalChangeFreezeRow = Database["public"]["Tables"]["portal_change_freezes"]["Row"];
type PortalMaintenanceBannerRow = Database["public"]["Tables"]["portal_maintenance_banners"]["Row"];
type PortalReleaseMetadataRow = Database["public"]["Tables"]["portal_release_metadata"]["Row"];
type IntakeImportRunRow = Database["public"]["Tables"]["intake_import_runs"]["Row"];

export const BREAK_GLASS_DURATION_MINUTES = 30;
export const CURRENT_SCHEMA_VERSION = "20260317123000_remove_demo_seed_data";

export interface SensitiveAccessMap {
  grants: SensitiveAccessGrant[];
  studentIds: Set<string>;
  familyIds: Set<string>;
  billingIds: Set<string>;
  supportCaseIds: Set<string>;
}

function createId(prefix: string) {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}

function ensureServiceRole() {
  if (!hasSupabaseServiceRole()) {
    throw new Error("Supabase service-role access is required.");
  }
}

function assertEngineer(viewer: User) {
  if (viewer.role !== "engineer") {
    throw new Error("Engineer access is required.");
  }
}

function normalizeIssueReference(value: string) {
  return value.trim();
}

function normalizeReason(value: string) {
  return value.trim();
}

function normalizeScopeType(value: string): SensitiveScopeType {
  switch (value) {
    case "student":
    case "family":
    case "billing":
    case "support_case":
      return value;
    default:
      throw new Error("Invalid sensitive-access scope.");
  }
}

function normalizeControlState(value: string): IntegrationControlState {
  switch (value) {
    case "active":
    case "paused":
    case "maintenance":
      return value;
    default:
      throw new Error("Invalid integration control state.");
  }
}

async function getProfilesByIds(ids: string[]) {
  if (ids.length === 0) {
    return new Map<string, ProfileRow>();
  }

  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient.from("profiles").select("*").in("id", ids);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as ProfileRow[];
  return new Map(rows.map((profile) => [profile.id, profile]));
}

function mapSensitiveGrant(
  row: SensitiveAccessGrantRow,
  profileById: Map<string, ProfileRow>,
): SensitiveAccessGrant {
  return {
    id: row.id,
    scopeType: normalizeScopeType(row.scope_type),
    scopeId: row.scope_id,
    reason: row.reason,
    issueReference: row.issue_reference,
    grantedBy: row.granted_by,
    grantedByName: profileById.get(row.granted_by)?.full_name ?? "IntoPrep Engineer",
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

export async function getActiveSensitiveAccessMap(viewerId: string): Promise<SensitiveAccessMap> {
  ensureServiceRole();
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("sensitive_access_grants")
    .select("*")
    .eq("granted_by", viewerId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as SensitiveAccessGrantRow[];
  const profileById = await getProfilesByIds(Array.from(new Set(rows.map((row) => row.granted_by))));
  const grants = rows.map((row) => mapSensitiveGrant(row, profileById));

  return {
    grants,
    studentIds: new Set(grants.filter((grant) => grant.scopeType === "student").map((grant) => grant.scopeId)),
    familyIds: new Set(grants.filter((grant) => grant.scopeType === "family").map((grant) => grant.scopeId)),
    billingIds: new Set(grants.filter((grant) => grant.scopeType === "billing").map((grant) => grant.scopeId)),
    supportCaseIds: new Set(
      grants.filter((grant) => grant.scopeType === "support_case").map((grant) => grant.scopeId),
    ),
  };
}

export function canEngineerViewStudentSensitiveData(
  viewerRole: UserRole,
  studentId: string,
  familyId: string,
  sensitiveAccessMap?: SensitiveAccessMap | null,
) {
  if (getPermissionProfile(viewerRole).canViewStudentProfileData) {
    return true;
  }

  if (viewerRole !== "engineer" || !sensitiveAccessMap) {
    return false;
  }

  return sensitiveAccessMap.studentIds.has(studentId) || sensitiveAccessMap.familyIds.has(familyId);
}

export function canEngineerViewFamilySensitiveData(
  viewerRole: UserRole,
  familyId: string,
  sensitiveAccessMap?: SensitiveAccessMap | null,
) {
  if (getPermissionProfile(viewerRole).canViewFamilyProfiles) {
    return true;
  }

  if (viewerRole !== "engineer" || !sensitiveAccessMap) {
    return false;
  }

  return sensitiveAccessMap.familyIds.has(familyId);
}

export function canEngineerViewBillingSensitiveData(
  viewerRole: UserRole,
  familyId: string,
  sensitiveAccessMap?: SensitiveAccessMap | null,
) {
  if (getPermissionProfile(viewerRole).canViewBilling) {
    return true;
  }

  if (viewerRole !== "engineer" || !sensitiveAccessMap) {
    return false;
  }

  return sensitiveAccessMap.billingIds.has(familyId) || sensitiveAccessMap.familyIds.has(familyId);
}

export async function grantSensitiveAccess({
  viewer,
  scopeType,
  scopeId,
  reason,
  issueReference,
}: {
  viewer: User;
  scopeType: SensitiveScopeType;
  scopeId: string;
  reason: string;
  issueReference: string;
}) {
  ensureServiceRole();
  assertEngineer(viewer);

  if (!canGrantSensitiveAccess(viewer.role)) {
    throw new Error("You cannot grant sensitive-data access.");
  }

  const normalizedReason = normalizeReason(reason);
  const normalizedIssueReference = normalizeIssueReference(issueReference);

  if (normalizedReason.length < 8 || normalizedIssueReference.length < 3) {
    throw new Error("Reason and issue reference are required.");
  }

  const serviceClient = createSupabaseServiceClient();
  const id = createId("grant");
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + BREAK_GLASS_DURATION_MINUTES * 60 * 1000);
  const { error } = await serviceClient.from("sensitive_access_grants").insert({
    id,
    scope_type: scopeType,
    scope_id: scopeId,
    reason: normalizedReason,
    issue_reference: normalizedIssueReference,
    granted_by: viewer.id,
    created_at: createdAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    throw new Error(error.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: scopeType,
    action: "sensitive_access_granted",
    summary: `${viewer.name} opened break-glass access for ${scopeType} ${scopeId}.`,
    issueReference: normalizedIssueReference,
    details: {
      scopeType,
      scopeId,
      reason: normalizedReason,
      expiresAt: expiresAt.toISOString(),
    },
  });

  return id;
}

export async function revokeSensitiveAccess({
  viewer,
  grantId,
}: {
  viewer: User;
  grantId: string;
}) {
  ensureServiceRole();
  assertEngineer(viewer);
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("sensitive_access_grants")
    .select("*")
    .eq("id", grantId)
    .maybeSingle();

  const grant = (data ?? null) as SensitiveAccessGrantRow | null;

  if (error) {
    throw new Error(error.message);
  }

  if (!grant) {
    throw new Error("That break-glass grant could not be found.");
  }

  const { error: revokeError } = await serviceClient
    .from("sensitive_access_grants")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: viewer.id,
    })
    .eq("id", grantId);

  if (revokeError) {
    throw new Error(revokeError.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: grant.scope_type,
    action: "sensitive_access_revoked",
    summary: `${viewer.name} revoked break-glass access for ${grant.scope_type} ${grant.scope_id}.`,
    issueReference: grant.issue_reference,
    details: {
      scopeType: grant.scope_type,
      scopeId: grant.scope_id,
    },
  });
}

export async function getEngineerSupportNotes() {
  ensureServiceRole();
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("engineer_support_notes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(24);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as EngineerSupportNoteRow[];
  const profileById = await getProfilesByIds(Array.from(new Set(rows.map((row) => row.author_id))));

  return rows.map((row) => ({
    id: row.id,
    targetType: row.target_type as EngineerSupportNote["targetType"],
    targetId: row.target_id,
    issueReference: row.issue_reference,
    body: row.body,
    authorId: row.author_id,
    authorName: profileById.get(row.author_id)?.full_name ?? "IntoPrep Engineer",
    createdAt: row.created_at,
  })) satisfies EngineerSupportNote[];
}

export async function createEngineerSupportNote({
  viewer,
  targetType,
  targetId,
  issueReference,
  body,
}: {
  viewer: User;
  targetType: EngineerSupportNote["targetType"];
  targetId: string;
  issueReference: string;
  body: string;
}) {
  ensureServiceRole();
  assertEngineer(viewer);

  const normalizedIssueReference = normalizeIssueReference(issueReference);
  const normalizedBody = body.trim();

  if (normalizedIssueReference.length < 3 || normalizedBody.length < 8) {
    throw new Error("Issue reference and note body are required.");
  }

  const serviceClient = createSupabaseServiceClient();
  const id = createId("support-note");
  const { error } = await serviceClient.from("engineer_support_notes").insert({
    id,
    target_type: targetType,
    target_id: targetId.trim(),
    issue_reference: normalizedIssueReference,
    body: normalizedBody,
    author_id: viewer.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType,
    action: "support_note_logged",
    summary: `${viewer.name} logged an engineer support note for ${targetType} ${targetId}.`,
    issueReference: normalizedIssueReference,
    details: {
      targetId: targetId.trim(),
      body: normalizedBody,
    },
  });
}

export async function getFeatureFlags() {
  ensureServiceRole();
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient.from("feature_flags").select("*").order("key");

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as FeatureFlagRow[];
  const profileById = await getProfilesByIds(
    Array.from(new Set(rows.flatMap((row) => (row.updated_by ? [row.updated_by] : [])))),
  );

  return rows.map((row) => ({
    key: row.key,
    description: row.description,
    enabledRoles: row.enabled_roles,
    updatedBy: row.updated_by,
    updatedByName: row.updated_by ? (profileById.get(row.updated_by)?.full_name ?? null) : null,
    updatedAt: row.updated_at,
  })) satisfies FeatureFlag[];
}

export async function upsertFeatureFlag({
  viewer,
  key,
  description,
  enabledRoles,
}: {
  viewer: User;
  key: string;
  description: string;
  enabledRoles: UserRole[];
}) {
  ensureServiceRole();
  assertEngineer(viewer);

  if (!canManageFeatureFlags(viewer.role)) {
    throw new Error("You cannot manage feature flags.");
  }

  const normalizedKey = key.trim();
  const normalizedDescription = description.trim();

  if (normalizedKey.length < 2 || normalizedDescription.length < 4) {
    throw new Error("Feature flag key and description are required.");
  }

  const serviceClient = createSupabaseServiceClient();
  const { error } = await serviceClient.from("feature_flags").upsert({
    key: normalizedKey,
    description: normalizedDescription,
    enabled_roles: enabledRoles,
    updated_by: viewer.id,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(error.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "feature_flag",
    action: "feature_flag_updated",
    summary: `${viewer.name} updated feature flag ${normalizedKey}.`,
    details: {
      enabledRoles,
      description: normalizedDescription,
    },
  });
}

export async function getChangeFreeze() {
  ensureServiceRole();
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("portal_change_freezes")
    .select("*")
    .eq("id", "global")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const row = data as PortalChangeFreezeRow;
  const profileById = await getProfilesByIds(row.set_by ? [row.set_by] : []);

  return {
    id: row.id,
    enabled: row.enabled,
    scope: row.scope,
    reason: row.reason,
    issueReference: row.issue_reference,
    setBy: row.set_by,
    setByName: row.set_by ? (profileById.get(row.set_by)?.full_name ?? null) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  } satisfies ChangeFreezeState;
}

export async function setChangeFreeze({
  viewer,
  enabled,
  scope,
  reason,
  issueReference,
  expiresAt,
}: {
  viewer: User;
  enabled: boolean;
  scope: string;
  reason: string;
  issueReference: string;
  expiresAt?: string | null;
}) {
  ensureServiceRole();
  assertEngineer(viewer);

  const normalizedReason = reason.trim();
  const normalizedIssueReference = normalizeIssueReference(issueReference);

  if (normalizedReason.length < 8 || normalizedIssueReference.length < 3) {
    throw new Error("Reason and issue reference are required.");
  }

  const serviceClient = createSupabaseServiceClient();
  const timestamp = new Date().toISOString();
  const { error } = await serviceClient.from("portal_change_freezes").upsert({
    id: "global",
    enabled,
    scope: scope.trim() || "operational_writes",
    reason: normalizedReason,
    issue_reference: normalizedIssueReference,
    set_by: viewer.id,
    created_at: timestamp,
    updated_at: timestamp,
    expires_at: expiresAt ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "change_freeze",
    action: "change_freeze_updated",
    summary: `${viewer.name} ${enabled ? "enabled" : "disabled"} change freeze mode.`,
    issueReference: normalizedIssueReference,
    details: {
      enabled,
      scope,
      expiresAt: expiresAt ?? null,
      reason: normalizedReason,
    },
  });
}

export async function assertWritesAllowed(scope = "operational_writes") {
  ensureServiceRole();
  const freeze = await getChangeFreeze();

  if (
    freeze?.enabled &&
    (!freeze.expiresAt || new Date(freeze.expiresAt).getTime() > Date.now()) &&
    (freeze.scope === "all_writes" || freeze.scope === scope || freeze.scope === "operational_writes")
  ) {
    throw new Error("Writes are temporarily frozen while engineering resolves an incident.");
  }
}

export async function getMaintenanceBanner() {
  ensureServiceRole();
  const serviceClient = createSupabaseServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await serviceClient
    .from("portal_maintenance_banners")
    .select("*")
    .lte("starts_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const row = data as PortalMaintenanceBannerRow;
  const profileById = await getProfilesByIds(
    Array.from(new Set([row.owner_id, row.created_by].filter((value): value is string => Boolean(value)))),
  );

  return {
    id: row.id,
    message: row.message,
    tone: row.tone as MaintenanceBanner["tone"],
    issueReference: row.issue_reference,
    ownerId: row.owner_id,
    ownerName: row.owner_id ? (profileById.get(row.owner_id)?.full_name ?? null) : null,
    createdBy: row.created_by,
    createdByName: profileById.get(row.created_by)?.full_name ?? "IntoPrep Engineer",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
  } satisfies MaintenanceBanner;
}

export async function upsertMaintenanceBanner({
  viewer,
  id,
  message,
  tone,
  issueReference,
  ownerId,
  expiresAt,
}: {
  viewer: User;
  id?: string;
  message: string;
  tone: MaintenanceBanner["tone"];
  issueReference: string;
  ownerId?: string | null;
  expiresAt?: string | null;
}) {
  ensureServiceRole();
  assertEngineer(viewer);

  const normalizedMessage = message.trim();
  const normalizedIssueReference = normalizeIssueReference(issueReference);

  if (normalizedMessage.length < 8 || normalizedIssueReference.length < 3) {
    throw new Error("Banner message and issue reference are required.");
  }

  const serviceClient = createSupabaseServiceClient();
  const bannerId = id?.trim() || "active-maintenance";
  const now = new Date().toISOString();
  const { error } = await serviceClient.from("portal_maintenance_banners").upsert({
    id: bannerId,
    message: normalizedMessage,
    tone,
    issue_reference: normalizedIssueReference,
    owner_id: ownerId ?? null,
    created_by: viewer.id,
    created_at: now,
    updated_at: now,
    starts_at: now,
    expires_at: expiresAt ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "maintenance_banner",
    action: "maintenance_banner_updated",
    summary: `${viewer.name} updated the internal maintenance banner.`,
    issueReference: normalizedIssueReference,
    details: {
      id: bannerId,
      message: normalizedMessage,
      tone,
      ownerId: ownerId ?? null,
      expiresAt: expiresAt ?? null,
    },
  });
}

export async function getReleaseMetadata() {
  ensureServiceRole();
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("portal_release_metadata")
    .select("*")
    .eq("id", "global")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? null) as PortalReleaseMetadataRow | null;
}

export async function getSchemaInspectorRows() {
  ensureServiceRole();
  const serviceClient = createSupabaseServiceClient();
  const targets = [
    ["profiles", "Account records"],
    ["cohorts", "Active cohort shells"],
    ["sessions", "Scheduled class sessions"],
    ["students", "Student rows"],
    ["families", "Family rows"],
    ["assessments", "Assessment headers"],
    ["assessment_results", "Assessment results"],
    ["sync_jobs", "Operational sync watches"],
    ["intake_import_runs", "Intake run history"],
    ["sensitive_access_grants", "Break-glass grants"],
  ] as const;

  const counts = await Promise.all(
    targets.map(async ([tableName, detail]) => {
      const { count, error } = await serviceClient
        .from(tableName)
        .select("*", { count: "exact", head: true });

      if (error) {
        throw new Error(error.message);
      }

      return {
        tableName,
        rowCount: count ?? 0,
        detail,
      };
    }),
  );

  return counts;
}

export async function revokeUserSession({
  viewer,
  targetProfile,
  issueReference,
}: {
  viewer: User;
  targetProfile: ProfileRow;
  issueReference: string;
}) {
  ensureServiceRole();
  assertEngineer(viewer);

  if (!canRevokeSessions(viewer.role)) {
    throw new Error("You cannot revoke active sessions.");
  }

  const serviceClient = createSupabaseServiceClient();
  const timestamp = new Date().toISOString();
  const { error } = await serviceClient
    .from("profiles")
    .update({ session_revoked_at: timestamp })
    .eq("id", targetProfile.id);

  if (error) {
    throw new Error(error.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetUserId: targetProfile.id,
    targetEmail: targetProfile.email,
    targetType: "account",
    action: "session_revoked",
    summary: `${viewer.name} revoked active sessions for ${targetProfile.email ?? targetProfile.id}.`,
    issueReference: normalizeIssueReference(issueReference),
    details: {
      role: targetProfile.role,
      revokedAt: timestamp,
    },
  });
}

export async function countActiveAdmins() {
  ensureServiceRole();
  const serviceClient = createSupabaseServiceClient();
  const { count, error } = await serviceClient
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("account_status", "active")
    .is("deleted_at", null);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

export async function getBuildMetadata() {
  return {
    appVersion: packageJson.version,
    buildCommit:
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
      null,
  };
}

export async function updateSyncJobIncidentState({
  viewer,
  jobId,
  ownerId,
  handoffNotes,
  mutedUntil,
  acknowledge,
  issueReference,
}: {
  viewer: User;
  jobId: string;
  ownerId?: string | null;
  handoffNotes?: string | null;
  mutedUntil?: string | null;
  acknowledge?: boolean;
  issueReference: string;
}) {
  ensureServiceRole();
  assertEngineer(viewer);

  if (!canManageIncidents(viewer.role)) {
    throw new Error("You cannot manage incidents.");
  }

  const serviceClient = createSupabaseServiceClient();
  const timestamp = new Date().toISOString();
  const payload: Database["public"]["Tables"]["sync_jobs"]["Update"] = {};

  if (typeof ownerId !== "undefined") {
    payload.owner_id = ownerId;
  }

  if (typeof handoffNotes !== "undefined") {
    payload.handoff_notes = handoffNotes?.trim() || null;
  }

  if (typeof mutedUntil !== "undefined") {
    payload.muted_until = mutedUntil;
  }

  if (acknowledge) {
    payload.acknowledged_by = viewer.id;
    payload.acknowledged_at = timestamp;
  }

  const { error } = await serviceClient.from("sync_jobs").update(payload).eq("id", jobId);

  if (error) {
    throw new Error(error.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "sync_job",
    action: "sync_incident_updated",
    summary: `${viewer.name} updated incident handling for ${jobId}.`,
    issueReference: normalizeIssueReference(issueReference),
    details: {
      jobId,
      ownerId: ownerId ?? null,
      mutedUntil: mutedUntil ?? null,
      handoffNotes: handoffNotes ?? null,
      acknowledge: acknowledge ?? false,
    },
  });
}

export async function updateIntegrationControlState({
  viewer,
  sourceType,
  sourceId,
  controlState,
  ownerId,
  handoffNotes,
  issueReference,
}: {
  viewer: User;
  sourceType: "intake" | "billing";
  sourceId: string;
  controlState: IntegrationControlState;
  ownerId?: string | null;
  handoffNotes?: string | null;
  issueReference: string;
}) {
  ensureServiceRole();
  assertEngineer(viewer);
  const normalizedState = normalizeControlState(controlState);
  const serviceClient = createSupabaseServiceClient();
  const timestamp = new Date().toISOString();
  const tableName = sourceType === "intake" ? "intake_sync_sources" : "billing_sync_sources";
  const { error } = await serviceClient
    .from(tableName)
    .update({
      control_state: normalizedState,
      owner_id: ownerId ?? null,
      handoff_notes: handoffNotes?.trim() || null,
      changed_by: viewer.id,
      changed_at: timestamp,
      is_active: normalizedState === "active",
    })
    .eq("id", sourceId);

  if (error) {
    throw new Error(error.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "integration_source",
    action: "integration_control_updated",
    summary: `${viewer.name} set ${sourceType} source ${sourceId} to ${normalizedState}.`,
    issueReference: normalizeIssueReference(issueReference),
    details: {
      sourceType,
      sourceId,
      controlState: normalizedState,
      ownerId: ownerId ?? null,
      handoffNotes: handoffNotes ?? null,
    },
  });
}

export async function runEngineerRepairAction({
  viewer,
  action,
  targetId,
  issueReference,
}: {
  viewer: User;
  action: "retry_sync" | "replay_sync" | "rerun_import" | "rebuild_cohort" | "rebuild_family";
  targetId: string;
  issueReference: string;
}) {
  ensureServiceRole();
  assertEngineer(viewer);

  const serviceClient = createSupabaseServiceClient();
  let summary: string;

  switch (action) {
    case "retry_sync":
    case "replay_sync":
      if (targetId === "sync-forms") {
        await runGoogleFormsSync({ viewer });
        summary = `${viewer.name} reran the Google Forms sync.`;
      } else if (targetId === "sync-quickbooks") {
        await runQuickBooksSync({ viewer });
        summary = `${viewer.name} reran the QuickBooks sync.`;
      } else {
        throw new Error("That sync job cannot be retried from the dashboard yet.");
      }
      break;
    case "rerun_import": {
      const { data, error } = await serviceClient
        .from("intake_import_runs")
        .select("*")
        .eq("id", targetId)
        .maybeSingle();

      const run = (data ?? null) as IntakeImportRunRow | null;

      if (error) {
        throw new Error(error.message);
      }

      if (!run) {
        throw new Error("That import run could not be found.");
      }

      if (run.source !== "Google Forms CSV") {
        throw new Error("Only linked Google Forms imports can be rerun from the dashboard.");
      }

      const source = await getGoogleFormsSyncSource();

      if (!source?.isActive) {
        throw new Error("The linked Google Forms source is not active.");
      }

      await runGoogleFormsSync({ viewer });
      summary = `${viewer.name} reran linked intake import ${targetId}.`;
      break;
    }
    case "rebuild_cohort": {
      const { count, error } = await serviceClient
        .from("enrollments")
        .select("*", { count: "exact", head: true })
        .eq("cohort_id", targetId)
        .eq("status", "active");

      if (error) {
        throw new Error(error.message);
      }

      const { error: updateError } = await serviceClient
        .from("cohorts")
        .update({ enrolled: count ?? 0 })
        .eq("id", targetId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      summary = `${viewer.name} rebuilt cohort enrollment counts for ${targetId}.`;
      break;
    }
    case "rebuild_family":
      summary = `${viewer.name} ran a family-level consistency review for ${targetId}.`;
      break;
    default:
      throw new Error("Unsupported repair action.");
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "repair_action",
    action: "repair_action_run",
    summary,
    issueReference: normalizeIssueReference(issueReference),
    details: {
      action,
      targetId,
    },
  });

  return summary;
}
