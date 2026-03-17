import {
  type AdminEscalation,
  type AdminAnnouncement,
  type AdminSavedView,
  type AdminTask,
  type ApprovalRequest,
  USER_ROLES,
  type AcademicNote,
  type AccountStatus,
  type Assessment,
  type AssessmentResult,
  type BillingSyncSource,
  type BillingFollowUpNote,
  type BillingFollowUpState,
  type Campus,
  type CapacityForecastRow,
  type ChangeFreezeState,
  type Cohort,
  type Enrollment,
  type EngineerChangeLogEntry,
  type EngineerSupportNote,
  type EngineerSystemStatus,
  type FeatureFlag,
  type Family,
  type FamilyContactEvent,
  type ImportRun,
  type InstructionalAccommodation,
  type InstructorFollowUpFlag,
  type MaintenanceBanner,
  type IntakeSyncSource,
  type Invoice,
  type Lead,
  type MessagePost,
  type MessageThread,
  type MessageThreadCategory,
  type OutreachTemplate,
  type Program,
  type ProgramTrack,
  type Resource,
  type Session,
  type SessionChecklist,
  type SessionCoverageFlag,
  type SessionHandoffNote,
  type SessionInstructionNote,
  type SensitiveAccessGrant,
  type SyncStatus,
  type SyncJob,
  type SchemaInspectorRow,
  type Student,
  type AttendanceExceptionFlag,
  type TaskActivity,
  type Term,
  type User,
  type UserRole,
  type PortalSection,
} from "@/lib/domain";
import {
  canViewFamilyContactBasics,
  canRunIntakeImports,
  getPermissionProfile,
  hasGlobalPortalScope,
} from "@/lib/permissions";
import {
  canEngineerViewBillingSensitiveData,
  canEngineerViewFamilySensitiveData,
  canEngineerViewStudentSensitiveData,
  CURRENT_SCHEMA_VERSION,
  getActiveSensitiveAccessMap,
  getBuildMetadata,
  getChangeFreeze,
  getEngineerSupportNotes,
  getFeatureFlags,
  getMaintenanceBanner,
  getReleaseMetadata,
  getSchemaInspectorRows,
} from "@/lib/engineer-controls";
import {
  isFallbackSessionNoteBody,
  mapEscalationStatusToInstructorFollowUpStatus,
  parseFallbackFollowUpReason,
  stripFallbackSessionNoteBody,
} from "@/lib/instructor-fallbacks";
import { RESOURCE_BUCKET_NAME } from "@/lib/live-writes";
import type { Database, Json } from "@/lib/supabase/database.types";
import { hasSupabaseServiceRole } from "@/lib/supabase/config";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type CohortRow = Database["public"]["Tables"]["cohorts"]["Row"];
type SessionRow = Database["public"]["Tables"]["sessions"]["Row"];
type EnrollmentRow = Database["public"]["Tables"]["enrollments"]["Row"];
type StudentRow = Database["public"]["Tables"]["students"]["Row"];
type FamilyRow = Database["public"]["Tables"]["families"]["Row"];
type CampusRow = Database["public"]["Tables"]["campuses"]["Row"];
type ProgramRow = Database["public"]["Tables"]["programs"]["Row"];
type TermRow = Database["public"]["Tables"]["terms"]["Row"];
type AssessmentRow = Database["public"]["Tables"]["assessments"]["Row"];
type AssessmentResultRow = Database["public"]["Tables"]["assessment_results"]["Row"];
type AcademicNoteRow = Database["public"]["Tables"]["academic_notes"]["Row"];
type SessionInstructionNoteRow =
  Database["public"]["Tables"]["session_instruction_notes"]["Row"];
type InstructionalAccommodationRow =
  Database["public"]["Tables"]["instructional_accommodations"]["Row"];
type InstructorFollowUpFlagRow =
  Database["public"]["Tables"]["instructor_follow_up_flags"]["Row"];
type ResourceRow = Database["public"]["Tables"]["resources"]["Row"];
type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
type MessageThreadRow = Database["public"]["Tables"]["message_threads"]["Row"];
type MessagePostRow = Database["public"]["Tables"]["message_posts"]["Row"];
type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type SyncJobRow = Database["public"]["Tables"]["sync_jobs"]["Row"];
type BillingSyncSourceRow = Database["public"]["Tables"]["billing_sync_sources"]["Row"];
type IntakeSyncSourceRow = Database["public"]["Tables"]["intake_sync_sources"]["Row"];
type IntakeImportRunRow = Database["public"]["Tables"]["intake_import_runs"]["Row"];
type CohortAssignmentRow = Database["public"]["Tables"]["cohort_assignments"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type UserTemplateRow = Database["public"]["Tables"]["user_templates"]["Row"];
type AccountAuditLogRow = Database["public"]["Tables"]["account_audit_logs"]["Row"];
type BillingFollowUpNoteRow = Database["public"]["Tables"]["billing_follow_up_notes"]["Row"];
type AdminTaskRow = Database["public"]["Tables"]["admin_tasks"]["Row"];
type AdminSavedViewRow = Database["public"]["Tables"]["admin_saved_views"]["Row"];
type FamilyContactEventRow = Database["public"]["Tables"]["family_contact_events"]["Row"];
type AdminAnnouncementRow = Database["public"]["Tables"]["admin_announcements"]["Row"];
type TaskActivityRow = Database["public"]["Tables"]["task_activities"]["Row"];
type SessionChecklistRow = Database["public"]["Tables"]["session_checklists"]["Row"];
type SessionHandoffNoteRow = Database["public"]["Tables"]["session_handoff_notes"]["Row"];
type AttendanceExceptionFlagRow = Database["public"]["Tables"]["attendance_exception_flags"]["Row"];
type SessionCoverageFlagRow = Database["public"]["Tables"]["session_coverage_flags"]["Row"];
type ApprovalRequestRow = Database["public"]["Tables"]["approval_requests"]["Row"];
type AdminEscalationRow = Database["public"]["Tables"]["admin_escalations"]["Row"];
type OutreachTemplateRow = Database["public"]["Tables"]["outreach_templates"]["Row"];

export interface LiveSettingsRoleStats {
  activeUsers: Record<UserRole, number>;
  suspendedUsers: Record<UserRole, number>;
  templateUsers: Record<UserRole, number>;
  assignmentLinks: Record<UserRole, number>;
}

export interface LiveSettingsUserRow {
  id: string;
  name: string;
  email: string | null;
  role: UserRole;
  title: string;
  assignedCohortIds: string[];
  templateRole: UserRole | null;
  accountStatus: AccountStatus;
  mustChangePassword: boolean;
  lastSignedInAt: string | null;
}

export interface LiveSettingsAuditRow {
  id: string;
  actorName: string;
  targetLabel: string;
  action: string;
  summary: string;
  createdAt: string;
  targetType: string | null;
  issueReference: string | null;
}

export interface LiveEngineerConsoleBundle {
  activeSensitiveAccessGrants: SensitiveAccessGrant[];
  supportNotes: EngineerSupportNote[];
  featureFlags: FeatureFlag[];
  maintenanceBanner: MaintenanceBanner | null;
  changeFreeze: ChangeFreezeState | null;
  systemStatus: EngineerSystemStatus | null;
  schemaInspectorRows: SchemaInspectorRow[];
  changeLogEntries: EngineerChangeLogEntry[];
}

export interface LiveAdminOpsBundle {
  billingFollowUpNotes: BillingFollowUpNote[];
  savedViews: AdminSavedView[];
  familyContactEvents: FamilyContactEvent[];
  capacityForecastRows: CapacityForecastRow[];
  archivedCohorts: Cohort[];
  archivedPrograms: Program[];
  approvalRequests: ApprovalRequest[];
  escalations: AdminEscalation[];
}

export interface LiveStaffOpsBundle {
  taskActivities: TaskActivity[];
  savedViews: AdminSavedView[];
  billingFollowUpNotes: BillingFollowUpNote[];
  familyContactEvents: FamilyContactEvent[];
  sessionChecklists: SessionChecklist[];
  approvalRequests: ApprovalRequest[];
  escalations: AdminEscalation[];
  outreachTemplates: OutreachTemplate[];
}

export interface LiveTaOpsBundle {
  taskActivities: TaskActivity[];
  sessionChecklists: SessionChecklist[];
  handoffNotes: SessionHandoffNote[];
  attendanceExceptionFlags: AttendanceExceptionFlag[];
  coverageFlags: SessionCoverageFlag[];
}

export interface LiveInstructorOpsBundle {
  taskActivities: TaskActivity[];
  sessionInstructionNotes: SessionInstructionNote[];
  instructionalAccommodations: InstructionalAccommodation[];
}

export interface LivePortalBundle {
  currentDate: string;
  visiblePrograms: Program[];
  visibleCampuses: Campus[];
  visibleTerms: Term[];
  visibleUsers: User[];
  visibleCohorts: Cohort[];
  visibleSessions: Session[];
  visibleEnrollments: Enrollment[];
  visibleStudents: Student[];
  visibleFamilies: Family[];
  visibleAssessments: Assessment[];
  visibleResults: AssessmentResult[];
  visibleNotes: AcademicNote[];
  visibleInstructorFollowUpFlags: InstructorFollowUpFlag[];
  visibleResources: Resource[];
  visibleInvoices: Invoice[];
  visibleAdminTasks: AdminTask[];
  visibleAdminAnnouncements: AdminAnnouncement[];
  visibleThreads: MessageThread[];
  visibleThreadPosts: Record<string, MessagePost[]>;
  visibleLeads: Lead[];
  visibleSyncJobs: SyncJob[];
  visibleImportRuns: ImportRun[];
  intakeSyncSource: IntakeSyncSource | null;
  billingSyncSource: BillingSyncSource | null;
  maintenanceBanner: MaintenanceBanner | null;
  settingsRoleStats: LiveSettingsRoleStats | null;
  settingsUsers: LiveSettingsUserRow[] | null;
  settingsAuditLogs: LiveSettingsAuditRow[] | null;
  adminOps: LiveAdminOpsBundle | null;
  staffOps: LiveStaffOpsBundle | null;
  taOps: LiveTaOpsBundle | null;
  instructorOps: LiveInstructorOpsBundle | null;
  engineerConsole: LiveEngineerConsoleBundle | null;
}

function createEmptyLivePortalBundle(currentDate: string): LivePortalBundle {
  return {
    currentDate,
    visiblePrograms: [],
    visibleCampuses: [],
    visibleTerms: [],
    visibleUsers: [],
    visibleCohorts: [],
    visibleSessions: [],
    visibleEnrollments: [],
    visibleStudents: [],
    visibleFamilies: [],
    visibleAssessments: [],
    visibleResults: [],
    visibleNotes: [],
    visibleInstructorFollowUpFlags: [],
    visibleResources: [],
    visibleInvoices: [],
    visibleAdminTasks: [],
    visibleAdminAnnouncements: [],
    visibleThreads: [],
    visibleThreadPosts: {},
    visibleLeads: [],
    visibleSyncJobs: [],
    visibleImportRuns: [],
    intakeSyncSource: null,
    billingSyncSource: null,
    maintenanceBanner: null,
    settingsRoleStats: null,
    settingsUsers: null,
    settingsAuditLogs: null,
    adminOps: null,
    staffOps: null,
    taOps: null,
    instructorOps: null,
    engineerConsole: null,
  };
}

function getNewYorkDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function mapFallbackInstructorFollowUpFlags({
  escalationRows,
  sessionById,
  studentCohortById,
  profilesById,
  visibleCohortIds,
}: {
  escalationRows: AdminEscalationRow[];
  sessionById: Map<string, SessionRow>;
  studentCohortById: Map<string, string>;
  profilesById: Map<string, ProfileRow>;
  visibleCohortIds: string[];
}) {
  return escalationRows.flatMap((escalation) => {
    const parsedReason = parseFallbackFollowUpReason(escalation.reason);
    if (!parsedReason) {
      return [];
    }

    const status = mapEscalationStatusToInstructorFollowUpStatus(escalation.status);
    if (!status) {
      return [];
    }

    const cohortId =
      parsedReason.targetType === "session"
        ? (sessionById.get(escalation.source_id)?.cohort_id ?? null)
        : (studentCohortById.get(escalation.source_id) ?? null);

    if (!cohortId || !visibleCohortIds.includes(cohortId)) {
      return [];
    }

    return [
      {
        id: escalation.id,
        targetType: parsedReason.targetType,
        targetId: escalation.source_id,
        cohortId,
        summary: parsedReason.summary,
        note: escalation.handoff_note,
        createdBy: escalation.created_by,
        createdByName: profilesById.get(escalation.created_by)?.full_name ?? "IntoPrep Instructor",
        createdAt: escalation.created_at,
        status,
      } satisfies InstructorFollowUpFlag,
    ];
  });
}

function normalizeTrack(value: string): ProgramTrack {
  switch (value) {
    case "SAT":
    case "ACT":
    case "Admissions":
    case "Support":
      return value;
    default:
      return "Support";
  }
}

function normalizeMode(value: string): Session["mode"] {
  switch (value) {
    case "In person":
    case "Hybrid":
    case "Zoom":
      return value;
    default:
      return "Hybrid";
  }
}

function normalizeCampusModality(value: string): Campus["modality"] {
  switch (value) {
    case "In person":
    case "Hybrid":
    case "Online":
      return value;
    default:
      return "Hybrid";
  }
}

function parseScoreArray(value: Json): { label: string; score: number }[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const label = typeof entry.label === "string" ? entry.label : null;
    const score = typeof entry.score === "number" ? entry.score : null;

    return label !== null && score !== null ? [{ label, score }] : [];
  });
}

function normalizeSyncStatus(value: string): SyncStatus | null {
  switch (value) {
    case "healthy":
    case "warning":
    case "error":
      return value;
    default:
      return null;
  }
}

function normalizeFollowUpState(value: string): BillingFollowUpState | null {
  switch (value) {
    case "open":
    case "in_progress":
    case "resolved":
      return value;
    default:
      return null;
  }
}

function normalizeContactSource(value: string): FamilyContactEvent["contactSource"] | null {
  switch (value) {
    case "email":
    case "phone":
    case "sms":
    case "meeting":
    case "portal_message":
      return value;
    default:
      return null;
  }
}

function normalizeTaskType(value: string): AdminTask["taskType"] | null {
  switch (value) {
    case "billing_follow_up":
    case "family_communication":
    case "attendance_follow_up":
    case "score_cleanup":
    case "cohort_staffing":
      return value;
    default:
      return null;
  }
}

function normalizeTaskStatus(value: string): AdminTask["status"] | null {
  switch (value) {
    case "open":
    case "in_progress":
    case "done":
      return value;
    default:
      return null;
  }
}

function parseSavedViewFilterState(
  value: Json,
): Record<string, string | string[] | boolean | number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalizedEntries: Array<[string, string | string[] | boolean | number]> = [];

  Object.entries(value).forEach(([key, entry]) => {
    if (
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean"
    ) {
      normalizedEntries.push([key, entry]);
      return;
    }

    if (Array.isArray(entry) && entry.every((item) => typeof item === "string")) {
      normalizedEntries.push([key, entry]);
    }
  });

  return Object.fromEntries(normalizedEntries);
}

function parseAnnouncementRoles(value: Json): UserRole[] {
  if (!Array.isArray(value)) {
    return ["admin", "staff", "ta"];
  }

  return value.flatMap((entry) => {
    switch (entry) {
      case "engineer":
      case "admin":
      case "staff":
      case "ta":
      case "instructor":
        return [entry];
      default:
        return [];
    }
  });
}

function normalizePortalSection(value: string): PortalSection {
  switch (value) {
    case "dashboard":
    case "calendar":
    case "cohorts":
    case "attendance":
    case "students":
    case "families":
    case "programs":
    case "academics":
    case "messaging":
    case "billing":
    case "integrations":
    case "settings":
      return value;
    default:
      return "dashboard";
  }
}

function buildCapacityForecastRows(cohorts: Cohort[]): CapacityForecastRow[] {
  return cohorts
    .map((cohort) => {
      const fillRate = cohort.capacity > 0 ? Math.round((cohort.enrolled / cohort.capacity) * 100) : 0;
      const state =
        fillRate >= 85 ? "near_full" : fillRate <= 50 ? "underfilled" : "balanced";
      const detail =
        state === "near_full"
          ? "Near-full cohort. Review rebalancing and staffing before the next intake push."
          : state === "underfilled"
            ? "Underfilled cohort. Review placement, outreach, or schedule adjustments."
            : "Cohort capacity is in a workable range right now.";

      return {
        cohortId: cohort.id,
        cohortName: cohort.name,
        enrolled: cohort.enrolled,
        capacity: cohort.capacity,
        fillRate,
        state,
        detail,
      } satisfies CapacityForecastRow;
    })
    .sort((left, right) => right.fillRate - left.fillRate);
}

function mapIntakeSyncSource(
  row: IntakeSyncSourceRow,
  profileById?: Map<string, ProfileRow>,
): IntakeSyncSource {
  return {
    id: row.id,
    label: row.label,
    sourceUrl: row.source_url,
    cadence: row.cadence,
    isActive: row.is_active,
    lastSyncedAt: row.last_synced_at,
    lastSyncStatus: row.last_sync_status ? normalizeSyncStatus(row.last_sync_status) : null,
    lastSyncSummary: row.last_sync_summary,
    controlState:
      row.control_state === "active" || row.control_state === "paused" || row.control_state === "maintenance"
        ? row.control_state
        : "active",
    ownerId: row.owner_id,
    ownerName: row.owner_id ? (profileById?.get(row.owner_id)?.full_name ?? null) : null,
    handoffNotes: row.handoff_notes,
    changedAt: row.changed_at,
    runbookUrl: row.runbook_url,
  };
}

function mapBillingSyncSource(
  row: BillingSyncSourceRow,
  profileById?: Map<string, ProfileRow>,
): BillingSyncSource {
  return {
    id: row.id,
    label: row.label,
    sourceUrl: row.source_url,
    cadence: row.cadence,
    isActive: row.is_active,
    lastSyncedAt: row.last_synced_at,
    lastSyncStatus: row.last_sync_status ? normalizeSyncStatus(row.last_sync_status) : null,
    lastSyncSummary: row.last_sync_summary,
    controlState:
      row.control_state === "active" || row.control_state === "paused" || row.control_state === "maintenance"
        ? row.control_state
        : "active",
    ownerId: row.owner_id,
    ownerName: row.owner_id ? (profileById?.get(row.owner_id)?.full_name ?? null) : null,
    handoffNotes: row.handoff_notes,
    changedAt: row.changed_at,
    runbookUrl: row.runbook_url,
  };
}

function createEmptyRoleCounts(): Record<UserRole, number> {
  return USER_ROLES.reduce(
    (counts, role) => ({
      ...counts,
      [role]: 0,
    }),
    {} as Record<UserRole, number>,
  );
}

function getSystemHealthStatus(syncJobs: SyncJob[]): SyncStatus {
  if (syncJobs.some((job) => job.status === "error")) {
    return "error";
  }

  if (syncJobs.some((job) => job.status === "warning")) {
    return "warning";
  }

  return "healthy";
}

async function getProfilesByIds(userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<string, ProfileRow>();
  }

  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient.from("profiles").select("*").in("id", userIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(((data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]));
}

async function buildEngineerSystemStatus({
  syncJobs,
  intakeSource,
  billingSource,
}: {
  syncJobs: SyncJob[];
  intakeSource: IntakeSyncSource | null;
  billingSource: BillingSyncSource | null;
}): Promise<EngineerSystemStatus> {
  const buildMetadata = await getBuildMetadata();
  const releaseMetadata = await getReleaseMetadata();
  const currentHealth = getSystemHealthStatus(syncJobs);
  const configDrift = [
    {
      id: "app-version",
      label: "App version",
      tone:
        releaseMetadata?.app_version && releaseMetadata.app_version === buildMetadata.appVersion
          ? ("healthy" as const)
          : ("warning" as const),
      detail:
        releaseMetadata?.app_version && releaseMetadata.app_version === buildMetadata.appVersion
          ? `App release metadata matches version ${buildMetadata.appVersion}.`
          : `Build version ${buildMetadata.appVersion} differs from recorded release metadata ${releaseMetadata?.app_version ?? "missing"}.`,
    },
    {
      id: "schema-version",
      label: "Schema version",
      tone:
        releaseMetadata?.schema_version === CURRENT_SCHEMA_VERSION ? ("healthy" as const) : ("warning" as const),
      detail:
        releaseMetadata?.schema_version === CURRENT_SCHEMA_VERSION
          ? `Database metadata matches schema ${CURRENT_SCHEMA_VERSION}.`
          : `Expected schema ${CURRENT_SCHEMA_VERSION}, but metadata reports ${releaseMetadata?.schema_version ?? "missing"}.`,
    },
    {
      id: "cron-state",
      label: "Cron scheduler",
      tone: syncJobs.find((job) => job.id === "sync-morning-ops")?.status ?? "warning",
      detail:
        syncJobs.find((job) => job.id === "sync-morning-ops")?.summary ??
        "Morning automation status is not available.",
    },
    {
      id: "integration-setup",
      label: "Integration setup",
      tone:
        intakeSource?.sourceUrl && billingSource?.sourceUrl
          ? ("healthy" as const)
          : ("warning" as const),
      detail:
        intakeSource?.sourceUrl && billingSource?.sourceUrl
          ? "Linked Google Forms and QuickBooks sources are configured."
          : "One or more linked sources are missing or incomplete.",
    },
  ];

  const credentialHealth = [
    {
      id: "google-forms",
      label: "Google Forms source",
      tone: intakeSource?.lastSyncStatus ?? (intakeSource?.sourceUrl ? "warning" : "error"),
      detail:
        intakeSource?.sourceUrl
          ? intakeSource.lastSyncSummary ?? `${intakeSource.label} is configured.`
          : "No linked Google Forms source is configured.",
    },
    {
      id: "quickbooks",
      label: "QuickBooks source",
      tone: billingSource?.lastSyncStatus ?? (billingSource?.sourceUrl ? "warning" : "error"),
      detail:
        billingSource?.sourceUrl
          ? billingSource.lastSyncSummary ?? `${billingSource.label} is configured.`
          : "No linked QuickBooks source is configured.",
    },
    {
      id: "email",
      label: "Email delivery",
      tone:
        process.env.RESEND_API_KEY?.trim() && process.env.SYNC_ALERT_EMAIL_FROM?.trim()
          ? ("healthy" as const)
          : ("warning" as const),
      detail:
        process.env.RESEND_API_KEY?.trim() && process.env.SYNC_ALERT_EMAIL_FROM?.trim()
          ? "Alert email delivery is configured."
          : "Alert email delivery is incomplete or disabled.",
    },
    {
      id: "cron-secret",
      label: "Cron authorization",
      tone: process.env.CRON_SECRET?.trim() ? ("healthy" as const) : ("warning" as const),
      detail: process.env.CRON_SECRET?.trim()
        ? "Cron authorization secret is configured."
        : "Cron authorization secret is missing.",
    },
  ];

  return {
    appVersion: buildMetadata.appVersion,
    buildCommit: buildMetadata.buildCommit,
    schemaVersion: releaseMetadata?.schema_version ?? null,
    currentHealth,
    configDrift,
    credentialHealth,
  };
}

async function getAccessibleCohortIds(viewer: User) {
  if (hasGlobalPortalScope(viewer.role)) {
    return null;
  }

  if (viewer.assignedCohortIds.length > 0) {
    return viewer.assignedCohortIds;
  }

  const serviceClient = createSupabaseServiceClient();
  const { data } = await serviceClient
    .from("cohort_assignments")
    .select("cohort_id")
    .eq("user_id", viewer.id);

  return ((data ?? []) as Pick<CohortAssignmentRow, "cohort_id">[]).map(
    (assignment) => assignment.cohort_id,
  );
}

export async function getLivePortalBundle(
  viewer: User,
  section?: PortalSection,
): Promise<LivePortalBundle | null> {
  if (!hasSupabaseServiceRole()) {
    return null;
  }

  const serviceClient = createSupabaseServiceClient();
  const currentDate = getNewYorkDate();
  const accessibleCohortIds = await getAccessibleCohortIds(viewer);

  if (
    section === "dashboard" &&
    viewer.role === "instructor"
  ) {
    const baseBundle = createEmptyLivePortalBundle(currentDate);
    const cohortQuery = serviceClient
      .from("cohorts")
      .select("*")
      .eq("is_archived", false)
      .order("name", { ascending: true });
    const scopedCohortQuery =
      accessibleCohortIds && accessibleCohortIds.length > 0
        ? cohortQuery.in("id", accessibleCohortIds)
        : accessibleCohortIds?.length === 0
          ? null
          : cohortQuery;
    const cohortsResult = scopedCohortQuery ? await scopedCohortQuery : { data: [] };
    const cohortRows = (cohortsResult.data ?? []) as CohortRow[];
    const cohortIds = cohortRows.map((cohort) => cohort.id);
    const [sessionsResult, assignmentsResult, syncJobsResult] =
      await Promise.all([
        cohortIds.length > 0
          ? serviceClient
              .from("sessions")
              .select("*")
              .in("cohort_id", cohortIds)
              .order("start_at", { ascending: true })
          : Promise.resolve({ data: [] }),
        cohortIds.length > 0
          ? serviceClient
              .from("cohort_assignments")
              .select("*")
              .in("cohort_id", cohortIds)
          : Promise.resolve({ data: [] }),
        serviceClient.from("sync_jobs").select("*").order("label", { ascending: true }),
      ]);

    const sessionRows = (sessionsResult.data ?? []) as SessionRow[];
    const assignmentRows = (assignmentsResult.data ?? []) as CohortAssignmentRow[];
    const syncJobRows = (syncJobsResult.data ?? []) as SyncJobRow[];
    const [enrollmentsResult, assessmentsResult, adminTasksResult, adminAnnouncementsResult, followUpFlagsResult, fallbackEscalationsResult] = await Promise.all([
      cohortIds.length > 0
        ? serviceClient
            .from("enrollments")
            .select("*")
            .in("cohort_id", cohortIds)
            .eq("status", "active")
        : Promise.resolve({ data: [] }),
      cohortIds.length > 0
        ? serviceClient
            .from("assessments")
            .select("*")
            .in("cohort_id", cohortIds)
            .order("date", { ascending: true })
        : Promise.resolve({ data: [] }),
      serviceClient
        .from("admin_tasks")
        .select("*")
        .eq("assigned_to", viewer.id)
        .neq("status", "done")
        .order("due_at", { ascending: true, nullsFirst: false }),
      serviceClient
        .from("admin_announcements")
        .select("*")
        .eq("is_active", true)
        .order("starts_at", { ascending: false }),
      cohortIds.length > 0
        ? serviceClient
            .from("instructor_follow_up_flags")
            .select("*")
            .in("cohort_id", cohortIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      cohortIds.length > 0
        ? serviceClient
            .from("admin_escalations")
            .select("*")
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

    const enrollmentRows = (enrollmentsResult.data ?? []) as EnrollmentRow[];
    const assessmentRows = (assessmentsResult.data ?? []) as AssessmentRow[];
    const adminTaskRows = (adminTasksResult.data ?? []) as AdminTaskRow[];
    const adminAnnouncementRows = (adminAnnouncementsResult.data ?? []) as AdminAnnouncementRow[];
    const followUpFlagRows = (followUpFlagsResult.data ?? []) as InstructorFollowUpFlagRow[];
    const fallbackEscalationRows = (fallbackEscalationsResult.data ?? []) as AdminEscalationRow[];
    const studentIds = unique(enrollmentRows.map((enrollment) => enrollment.student_id));
    const assessmentIds = assessmentRows.map((assessment) => assessment.id);
    const taskIds = adminTaskRows.map((task) => task.id);
    const [studentsResult, resultsResult, taskActivitiesResult] = await Promise.all([
      studentIds.length > 0
        ? serviceClient.from("students").select("*").in("id", studentIds)
        : Promise.resolve({ data: [] }),
      assessmentIds.length > 0
        ? serviceClient
            .from("assessment_results")
            .select("*")
            .in("assessment_id", assessmentIds)
        : Promise.resolve({ data: [] }),
      taskIds.length > 0
        ? serviceClient
            .from("task_activities")
            .select("*")
            .in("task_id", taskIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

    const studentRows = (studentsResult.data ?? []) as StudentRow[];
    const resultRows = (resultsResult.data ?? []) as AssessmentResultRow[];
    const taskActivityRows = (taskActivitiesResult.data ?? []) as TaskActivityRow[];
    const compactExtraProfileIds = unique([
      ...adminTaskRows
        .flatMap((task) => [task.assigned_to, task.created_by])
        .filter((profileId): profileId is string => typeof profileId === "string"),
      ...adminAnnouncementRows
        .map((announcement) => announcement.created_by)
        .filter((profileId): profileId is string => typeof profileId === "string"),
      ...taskActivityRows
        .map((activity) => activity.author_id)
        .filter((profileId): profileId is string => typeof profileId === "string"),
      ...followUpFlagRows
        .map((flag) => flag.created_by)
        .filter((profileId): profileId is string => typeof profileId === "string"),
      ...fallbackEscalationRows
        .map((escalation) => escalation.created_by)
        .filter((profileId): profileId is string => typeof profileId === "string"),
    ]);
    const compactProfilesById =
      compactExtraProfileIds.length > 0
        ? await getProfilesByIds(compactExtraProfileIds)
        : new Map<string, ProfileRow>();
    const assignmentsByCohort = new Map<string, CohortAssignmentRow[]>();
    assignmentRows.forEach((assignment) => {
      const existing = assignmentsByCohort.get(assignment.cohort_id) ?? [];
      existing.push(assignment);
      assignmentsByCohort.set(assignment.cohort_id, existing);
    });
    const assignmentIdsByUser = new Map<string, string[]>();
    assignmentRows.forEach((assignment) => {
      const existing = assignmentIdsByUser.get(assignment.user_id) ?? [];
      existing.push(assignment.cohort_id);
      assignmentIdsByUser.set(assignment.user_id, existing);
    });
    const visibleAdminAnnouncements = adminAnnouncementRows.flatMap((announcement) => {
      const visibleRoles = parseAnnouncementRoles(announcement.visible_roles as Json);
      const tone =
        announcement.tone === "info" || announcement.tone === "warning"
          ? (announcement.tone as AdminAnnouncement["tone"])
          : null;
      const now = new Date().toISOString();

      return tone &&
        visibleRoles.includes(viewer.role) &&
        announcement.starts_at <= now &&
        (!announcement.expires_at || announcement.expires_at > now)
        ? [
            {
              id: announcement.id,
              title: announcement.title,
              body: announcement.body,
              tone,
              visibleRoles,
              isActive: announcement.is_active,
              createdBy: announcement.created_by,
              createdByName: announcement.created_by
                ? (compactProfilesById.get(announcement.created_by)?.full_name ?? null)
                : null,
              createdAt: announcement.created_at,
              updatedAt: announcement.updated_at,
              startsAt: announcement.starts_at,
              expiresAt: announcement.expires_at,
            },
          ]
        : [];
    });
    const mappedTaskActivities = taskActivityRows.flatMap((activity) => {
      if (
        activity.note_type !== "progress" &&
        activity.note_type !== "handoff" &&
        activity.note_type !== "blocker"
      ) {
        return [];
      }

      const statusFrom = normalizeTaskStatus(activity.status_from ?? "");
      const statusTo = normalizeTaskStatus(activity.status_to ?? "");

      return [
        {
          id: activity.id,
          taskId: activity.task_id,
          authorId: activity.author_id,
          authorName: compactProfilesById.get(activity.author_id)?.full_name ?? "IntoPrep Team",
          body: activity.body,
          noteType: activity.note_type as TaskActivity["noteType"],
          statusFrom,
          statusTo,
          createdAt: activity.created_at,
        },
      ];
    });
    const compactSessionById = new Map(sessionRows.map((session) => [session.id, session]));
    const compactStudentCohortById = new Map(
      enrollmentRows.map((enrollment) => [enrollment.student_id, enrollment.cohort_id]),
    );
    const directInstructorFollowUpFlags = followUpFlagRows.flatMap((flag) => {
      if (
        flag.target_type !== "student" &&
        flag.target_type !== "session"
      ) {
        return [];
      }

      if (
        flag.status !== "open" &&
        flag.status !== "acknowledged" &&
        flag.status !== "resolved"
      ) {
        return [];
      }

      return [
        {
          id: flag.id,
          targetType: flag.target_type as InstructorFollowUpFlag["targetType"],
          targetId: flag.target_id,
          cohortId: flag.cohort_id,
          summary: flag.summary,
          note: flag.note,
          createdBy: flag.created_by,
          createdByName: compactProfilesById.get(flag.created_by)?.full_name ?? "IntoPrep Instructor",
          createdAt: flag.created_at,
          status: flag.status as InstructorFollowUpFlag["status"],
        },
      ];
    });
    const fallbackInstructorFollowUpFlags = mapFallbackInstructorFollowUpFlags({
      escalationRows: fallbackEscalationRows,
      sessionById: compactSessionById,
      studentCohortById: compactStudentCohortById,
      profilesById: compactProfilesById,
      visibleCohortIds: cohortIds,
    });
    const visibleInstructorFollowUpFlags = [...directInstructorFollowUpFlags, ...fallbackInstructorFollowUpFlags]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return {
      ...baseBundle,
      visibleUsers: [],
      visibleCohorts: cohortRows.map((cohort) => {
        const scopedAssignments = assignmentsByCohort.get(cohort.id) ?? [];
        const leadInstructorId =
          cohort.lead_instructor_id ??
          scopedAssignments.find((assignment) => assignment.role === "instructor")?.user_id ??
          "";

        return {
          id: cohort.id,
          name: cohort.name,
          programId: cohort.program_id,
          campusId: cohort.campus_id,
          termId: cohort.term_id,
          capacity: cohort.capacity,
          enrolled: cohort.enrolled,
          leadInstructorId,
          taIds: scopedAssignments
            .filter((assignment) => assignment.role === "ta")
            .map((assignment) => assignment.user_id),
          cadence: cohort.cadence,
          roomLabel: cohort.room_label,
        };
      }),
      visibleSessions: sessionRows.map((session) => ({
        id: session.id,
        cohortId: session.cohort_id,
        title: session.title,
        startAt: session.start_at,
        endAt: session.end_at,
        mode: normalizeMode(session.mode),
        roomLabel: session.room_label,
      })),
      visibleEnrollments: enrollmentRows.map((enrollment) => ({
        id: enrollment.id,
        studentId: enrollment.student_id,
        cohortId: enrollment.cohort_id,
        status: enrollment.status === "waitlist" ? "waitlist" : "active",
        registeredAt: enrollment.registered_at,
      })),
      visibleStudents: studentRows.map((student) => ({
        id: student.id,
        familyId: student.family_id,
        firstName: student.first_name,
        lastName: student.last_name,
        gradeLevel: student.grade_level,
        school: student.school,
        targetTest: normalizeTrack(student.target_test),
        focus: student.focus,
      })),
      visibleAssessments: assessmentRows.map((assessment) => ({
        id: assessment.id,
        cohortId: assessment.cohort_id,
        title: assessment.title,
        date: assessment.date,
        sections: parseScoreArray(assessment.sections),
      })),
      visibleResults: resultRows.map((result) => ({
        id: result.id,
        assessmentId: result.assessment_id,
        studentId: result.student_id,
        totalScore: result.total_score,
        sectionScores: parseScoreArray(result.section_scores),
        deltaFromPrevious: result.delta_from_previous,
      })),
      visibleInstructorFollowUpFlags,
      visibleAdminTasks: adminTaskRows.flatMap((task) => {
        const taskType = normalizeTaskType(task.task_type);
        const taskStatus = normalizeTaskStatus(task.status);

        return taskType && taskStatus
          ? [
              {
                id: task.id,
                taskType,
                targetType: task.target_type as AdminTask["targetType"],
                targetId: task.target_id,
                title: task.title,
                details: task.details,
                assignedTo: task.assigned_to,
                assignedToName: task.assigned_to
                  ? (compactProfilesById.get(task.assigned_to)?.full_name ?? null)
                  : null,
                dueAt: task.due_at,
                status: taskStatus,
                createdBy: task.created_by,
                createdByName: task.created_by
                  ? (compactProfilesById.get(task.created_by)?.full_name ?? null)
                  : null,
                createdAt: task.created_at,
                updatedAt: task.updated_at,
              },
            ]
          : [];
      }),
      visibleAdminAnnouncements,
      visibleSyncJobs: syncJobRows.flatMap((job) => {
        const status = normalizeSyncStatus(job.status);

        return status
          ? [
              {
                id: job.id,
                label: job.label,
                cadence: job.cadence,
                status,
                lastRunAt: job.last_run_at,
                summary: job.summary,
              },
            ]
          : [];
      }),
      instructorOps: {
        taskActivities: mappedTaskActivities,
        sessionInstructionNotes: [],
        instructionalAccommodations: [],
      },
    };
  }

  const cohortQuery = serviceClient
    .from("cohorts")
    .select("*")
    .eq("is_archived", false)
    .order("name", { ascending: true });
  const scopedCohortQuery =
    accessibleCohortIds && accessibleCohortIds.length > 0
      ? cohortQuery.in("id", accessibleCohortIds)
      : accessibleCohortIds?.length === 0
        ? null
        : cohortQuery;
  const cohortsResult = scopedCohortQuery ? await scopedCohortQuery : { data: [] };
  const cohortRows = (cohortsResult.data ?? []) as CohortRow[];
  const cohortIds = cohortRows.map((cohort) => cohort.id);
  const programIds = unique(cohortRows.map((cohort) => cohort.program_id));
  const campusIds = unique(cohortRows.map((cohort) => cohort.campus_id));
  const termIds = unique(cohortRows.map((cohort) => cohort.term_id));
  const [sessionsResult, enrollmentsResult, assessmentsResult, assignmentsResult, programsResult, campusesResult, termsResult, archivedCohortsResult, archivedProgramsResult] =
    await Promise.all([
      cohortIds.length > 0
        ? serviceClient
            .from("sessions")
            .select("*")
            .in("cohort_id", cohortIds)
            .order("start_at", { ascending: true })
        : Promise.resolve({ data: [] }),
      cohortIds.length > 0
        ? serviceClient
            .from("enrollments")
            .select("*")
            .in("cohort_id", cohortIds)
            .eq("status", "active")
        : Promise.resolve({ data: [] }),
      cohortIds.length > 0
        ? serviceClient
            .from("assessments")
            .select("*")
            .in("cohort_id", cohortIds)
            .order("date", { ascending: true })
        : Promise.resolve({ data: [] }),
      cohortIds.length > 0
        ? serviceClient
            .from("cohort_assignments")
            .select("*")
            .in("cohort_id", cohortIds)
        : Promise.resolve({ data: [] }),
      programIds.length > 0
        ? serviceClient.from("programs").select("*").eq("is_archived", false).in("id", programIds)
        : Promise.resolve({ data: [] }),
      campusIds.length > 0
        ? serviceClient.from("campuses").select("*").in("id", campusIds)
        : Promise.resolve({ data: [] }),
      termIds.length > 0
        ? serviceClient.from("terms").select("*").in("id", termIds)
        : Promise.resolve({ data: [] }),
      viewer.role === "admin"
        ? serviceClient
            .from("cohorts")
            .select("*")
            .eq("is_archived", true)
            .order("name", { ascending: true })
        : Promise.resolve({ data: [] }),
      viewer.role === "admin"
        ? serviceClient
            .from("programs")
            .select("*")
            .eq("is_archived", true)
            .order("name", { ascending: true })
        : Promise.resolve({ data: [] }),
    ]);

  const sessionRows = (sessionsResult.data ?? []) as SessionRow[];
  const enrollmentRows = (enrollmentsResult.data ?? []) as EnrollmentRow[];
  const assessmentRows = (assessmentsResult.data ?? []) as AssessmentRow[];
  const assignmentRows = (assignmentsResult.data ?? []) as CohortAssignmentRow[];
  const programRows = (programsResult.data ?? []) as ProgramRow[];
  const campusRows = (campusesResult.data ?? []) as CampusRow[];
  const termRows = (termsResult.data ?? []) as TermRow[];
  const archivedCohortRows = (archivedCohortsResult.data ?? []) as CohortRow[];
  const archivedProgramRows = (archivedProgramsResult.data ?? []) as ProgramRow[];

  const studentIds = unique(enrollmentRows.map((enrollment) => enrollment.student_id));
  const assessmentIds = assessmentRows.map((assessment) => assessment.id);
  const assignedUserIds = unique(assignmentRows.map((assignment) => assignment.user_id));
  const sessionIds = sessionRows.map((session) => session.id);

  const studentsResult =
    studentIds.length > 0
      ? await serviceClient
          .from("students")
          .select("*")
          .in("id", studentIds)
      : { data: [] };
  const studentRows = (studentsResult.data ?? []) as StudentRow[];
  const familyIds =
    viewer.role === "engineer" ||
    getPermissionProfile(viewer.role).canViewFamilyProfiles ||
    canViewFamilyContactBasics(viewer.role)
      ? unique(studentRows.map((student) => student.family_id))
      : [];

  const [familiesResult, resultsResult, notesResult, sessionNotesResult, accommodationsResult, followUpFlagsResult, resourcesResult, invoicesResult, threadsResult, leadsResult, syncJobsResult, importRunsResult, syncSourceResult, billingSyncSourceResult, profilesResult, templatesResult, auditLogsResult, billingFollowUpNotesResult, adminTasksResult, savedViewsResult, contactEventsResult, adminAnnouncementsResult, sessionChecklistsResult, handoffNotesResult, attendanceFlagsResult, coverageFlagsResult, approvalRequestsResult, escalationsResult, outreachTemplatesResult] = await Promise.all([
    familyIds.length > 0
      ? serviceClient.from("families").select("*").in("id", familyIds)
      : Promise.resolve({ data: [] }),
    assessmentIds.length > 0
      ? serviceClient
          .from("assessment_results")
          .select("*")
          .in("assessment_id", assessmentIds)
      : Promise.resolve({ data: [] }),
    viewer.role === "engineer" || viewer.role === "admin" || viewer.role === "staff" || viewer.role === "ta" || viewer.role === "instructor"
      ? studentIds.length > 0
        ? serviceClient
            .from("academic_notes")
            .select("*")
            .in("student_id", studentIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] })
      : Promise.resolve({ data: [] }),
    sessionIds.length > 0 && (viewer.role === "engineer" || viewer.role === "admin" || viewer.role === "staff" || viewer.role === "ta" || viewer.role === "instructor")
      ? serviceClient
          .from("session_instruction_notes")
          .select("*")
          .in("session_id", sessionIds)
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    viewer.role === "instructor" && studentIds.length > 0
      ? serviceClient
          .from("instructional_accommodations")
          .select("*")
          .in("student_id", studentIds)
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    cohortIds.length > 0 && (viewer.role === "engineer" || viewer.role === "admin" || viewer.role === "staff" || viewer.role === "ta" || viewer.role === "instructor")
      ? serviceClient
          .from("instructor_follow_up_flags")
          .select("*")
          .in("cohort_id", cohortIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    viewer.role === "engineer" || viewer.role === "admin" || viewer.role === "staff" || viewer.role === "ta"
      ? cohortIds.length > 0
        ? serviceClient
            .from("resources")
            .select("*")
            .in("cohort_id", cohortIds)
            .order("published_at", { ascending: false })
        : Promise.resolve({ data: [] })
      : Promise.resolve({ data: [] }),
    viewer.role === "engineer" || viewer.role === "admin" || viewer.role === "staff"
      ? familyIds.length > 0
        ? serviceClient
            .from("invoices")
            .select("*")
            .in("family_id", familyIds)
            .order("due_date", { ascending: true })
        : Promise.resolve({ data: [] })
      : Promise.resolve({ data: [] }),
    viewer.role === "engineer" || viewer.role === "admin" || viewer.role === "staff" || viewer.role === "ta"
      ? cohortIds.length > 0
        ? serviceClient
            .from("message_threads")
            .select("*")
            .in("cohort_id", cohortIds)
            .order("last_message_at", { ascending: false })
        : Promise.resolve({ data: [] })
      : Promise.resolve({ data: [] }),
    viewer.role === "engineer" || viewer.role === "admin" || viewer.role === "staff"
      ? serviceClient.from("leads").select("*").order("submitted_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    serviceClient.from("sync_jobs").select("*").order("label", { ascending: true }),
    canRunIntakeImports(viewer.role)
      ? serviceClient
          .from("intake_import_runs")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(6)
      : Promise.resolve({ data: [] }),
    canRunIntakeImports(viewer.role)
      ? serviceClient
          .from("intake_sync_sources")
          .select("*")
          .eq("id", "google-forms-primary")
          .maybeSingle()
      : Promise.resolve({ data: null }),
    canRunIntakeImports(viewer.role)
      ? serviceClient
          .from("billing_sync_sources")
          .select("*")
          .eq("id", "quickbooks-primary")
          .maybeSingle()
      : Promise.resolve({ data: null }),
    viewer.role === "engineer" || viewer.role === "admin"
      ? serviceClient.from("profiles").select("*").order("full_name", { ascending: true })
      : assignedUserIds.length > 0
        ? serviceClient.from("profiles").select("*").in("id", assignedUserIds)
        : Promise.resolve({ data: [] }),
    viewer.role === "engineer" || viewer.role === "admin"
      ? serviceClient.from("user_templates").select("*").order("email", { ascending: true })
      : Promise.resolve({ data: [] }),
    viewer.role === "engineer" || viewer.role === "admin"
      ? serviceClient
          .from("account_audit_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] }),
    (viewer.role === "admin" || viewer.role === "staff") && familyIds.length > 0
      ? serviceClient
          .from("billing_follow_up_notes")
          .select("*")
          .in("family_id", familyIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    viewer.role === "admin"
      ? serviceClient
          .from("admin_tasks")
          .select("*")
          .order("due_at", { ascending: true, nullsFirst: false })
      : viewer.role === "staff" || viewer.role === "ta" || viewer.role === "instructor"
        ? serviceClient
            .from("admin_tasks")
            .select("*")
            .eq("assigned_to", viewer.id)
            .neq("status", "done")
            .order("due_at", { ascending: true, nullsFirst: false })
        : Promise.resolve({ data: [] }),
    viewer.role === "admin"
      ? serviceClient
          .from("admin_saved_views")
          .select("*")
          .order("updated_at", { ascending: false })
      : viewer.role === "staff"
        ? serviceClient
            .from("admin_saved_views")
            .select("*")
            .eq("created_by", viewer.id)
            .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    (viewer.role === "admin" || viewer.role === "staff") && familyIds.length > 0
      ? serviceClient
          .from("family_contact_events")
          .select("*")
          .in("family_id", familyIds)
          .order("contact_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    viewer.role === "admin" || viewer.role === "staff" || viewer.role === "ta" || viewer.role === "instructor"
      ? serviceClient
          .from("admin_announcements")
          .select("*")
          .eq("is_active", true)
          .order("starts_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    viewer.role === "admin" || viewer.role === "staff" || viewer.role === "ta"
      ? serviceClient
          .from("session_checklists")
          .select("*")
      : Promise.resolve({ data: [] }),
    (viewer.role === "ta" || viewer.role === "instructor") && sessionIds.length > 0
      ? serviceClient
          .from("session_handoff_notes")
          .select("*")
          .in("session_id", sessionIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    viewer.role === "ta" && sessionIds.length > 0
      ? serviceClient
          .from("attendance_exception_flags")
          .select("*")
          .in("session_id", sessionIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    viewer.role === "ta" && sessionIds.length > 0
      ? serviceClient
          .from("session_coverage_flags")
          .select("*")
          .in("session_id", sessionIds)
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    viewer.role === "admin"
      ? serviceClient
          .from("approval_requests")
          .select("*")
          .order("created_at", { ascending: false })
      : viewer.role === "staff"
        ? serviceClient
            .from("approval_requests")
            .select("*")
            .eq("requested_by", viewer.id)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    viewer.role === "admin" || viewer.role === "staff"
      ? serviceClient
          .from("admin_escalations")
          .select("*")
          .order("created_at", { ascending: false })
        : viewer.role === "ta" || viewer.role === "instructor"
          ? serviceClient
              .from("admin_escalations")
              .select("*")
              .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    viewer.role === "staff"
      ? serviceClient
          .from("outreach_templates")
          .select("*")
          .eq("owner_id", viewer.id)
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const familyRows = (familiesResult.data ?? []) as FamilyRow[];
  const resultRows = (resultsResult.data ?? []) as AssessmentResultRow[];
  const noteRows = (notesResult.data ?? []) as AcademicNoteRow[];
  const sessionInstructionNoteRows = (sessionNotesResult.data ?? []) as SessionInstructionNoteRow[];
  const accommodationRows = (accommodationsResult.data ?? []) as InstructionalAccommodationRow[];
  const followUpFlagRows = (followUpFlagsResult.data ?? []) as InstructorFollowUpFlagRow[];
  const resourceRows = (resourcesResult.data ?? []) as ResourceRow[];
  const invoiceRows = (invoicesResult.data ?? []) as InvoiceRow[];
  const threadRows = (threadsResult.data ?? []) as MessageThreadRow[];
  const leadRows = (leadsResult.data ?? []) as LeadRow[];
  const syncJobRows = (syncJobsResult.data ?? []) as SyncJobRow[];
  const importRunRows = (importRunsResult.data ?? []) as IntakeImportRunRow[];
  const syncSourceRow = (syncSourceResult.data ?? null) as IntakeSyncSourceRow | null;
  const billingSyncSourceRow = (billingSyncSourceResult.data ?? null) as BillingSyncSourceRow | null;
  const profileRows = (profilesResult.data ?? []) as ProfileRow[];
  const templateRows = (templatesResult.data ?? []) as UserTemplateRow[];
  const auditLogRows = (auditLogsResult.data ?? []) as AccountAuditLogRow[];
  const billingFollowUpNoteRows = (billingFollowUpNotesResult.data ?? []) as BillingFollowUpNoteRow[];
  const adminTaskRows = (adminTasksResult.data ?? []) as AdminTaskRow[];
  const savedViewRows = (savedViewsResult.data ?? []) as AdminSavedViewRow[];
  const contactEventRows = (contactEventsResult.data ?? []) as FamilyContactEventRow[];
  const adminAnnouncementRows = (adminAnnouncementsResult.data ?? []) as AdminAnnouncementRow[];
  const sessionChecklistRows = (sessionChecklistsResult.data ?? []) as SessionChecklistRow[];
  const handoffNoteRows = (handoffNotesResult.data ?? []) as SessionHandoffNoteRow[];
  const attendanceFlagRows = (attendanceFlagsResult.data ?? []) as AttendanceExceptionFlagRow[];
  const coverageFlagRows = (coverageFlagsResult.data ?? []) as SessionCoverageFlagRow[];
  const approvalRequestRows = (approvalRequestsResult.data ?? []) as ApprovalRequestRow[];
  const escalationRows = (escalationsResult.data ?? []) as AdminEscalationRow[];
  const outreachTemplateRows = (outreachTemplatesResult.data ?? []) as OutreachTemplateRow[];
  const threadIds = threadRows.map((thread) => thread.id);
  const taskIds = adminTaskRows.map((task) => task.id);

  const [threadPostsResult, resourceSignedUrlsResult, taskActivitiesResult] = await Promise.all([
    threadIds.length > 0
      ? serviceClient
          .from("message_posts")
          .select("*")
          .in("thread_id", threadIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    Promise.all(
      resourceRows.map(async (resource) => {
        if (!resource.storage_path) {
          return [resource.id, resource.link_url ?? null] as const;
        }

        const { data, error } = await serviceClient.storage
          .from(RESOURCE_BUCKET_NAME)
          .createSignedUrl(resource.storage_path, 60 * 60);

        if (error) {
          return [resource.id, resource.link_url ?? null] as const;
        }

        return [resource.id, data.signedUrl] as const;
      }),
    ),
    taskIds.length > 0 && (viewer.role === "admin" || viewer.role === "staff" || viewer.role === "ta" || viewer.role === "instructor")
      ? serviceClient
          .from("task_activities")
          .select("*")
          .in("task_id", taskIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const threadPostRows = (threadPostsResult.data ?? []) as MessagePostRow[];
  const taskActivityRows = (taskActivitiesResult.data ?? []) as TaskActivityRow[];
  const resourceUrlById = new Map(resourceSignedUrlsResult);
  const threadPostAuthorIds = unique(
    threadPostRows
      .map((post) => post.author_id)
      .filter((authorId): authorId is string => typeof authorId === "string"),
  );
  const missingProfileIds = unique([
    ...leadRows
      .map((lead) => lead.owner_id)
      .filter((profileId): profileId is string => typeof profileId === "string"),
    ...threadPostAuthorIds,
    ...billingFollowUpNoteRows
      .map((note) => note.author_id)
      .filter((authorId): authorId is string => typeof authorId === "string"),
    ...adminTaskRows
      .flatMap((task) => [task.assigned_to, task.created_by])
      .filter((profileId): profileId is string => typeof profileId === "string"),
    ...contactEventRows
      .map((event) => event.actor_id)
      .filter((profileId): profileId is string => typeof profileId === "string"),
    ...adminAnnouncementRows
      .map((announcement) => announcement.created_by)
      .filter((profileId): profileId is string => typeof profileId === "string"),
    ...taskActivityRows
      .map((activity) => activity.author_id)
      .filter((profileId): profileId is string => typeof profileId === "string"),
    ...sessionChecklistRows
      .map((checklist) => checklist.updated_by)
      .filter((profileId): profileId is string => typeof profileId === "string"),
    ...handoffNoteRows
      .map((note) => note.author_id)
      .filter((profileId): profileId is string => typeof profileId === "string"),
    ...sessionInstructionNoteRows
      .map((note) => note.author_id)
      .filter((profileId): profileId is string => typeof profileId === "string"),
    ...accommodationRows
      .map((accommodation) => accommodation.created_by)
      .filter((profileId): profileId is string => typeof profileId === "string"),
    ...attendanceFlagRows
      .map((flag) => flag.created_by)
      .filter((profileId): profileId is string => typeof profileId === "string"),
    ...coverageFlagRows
      .map((flag) => flag.updated_by)
      .filter((profileId): profileId is string => typeof profileId === "string"),
    ...followUpFlagRows
      .map((flag) => flag.created_by)
      .filter((profileId): profileId is string => typeof profileId === "string"),
    ...approvalRequestRows
      .flatMap((request) => [request.requested_by, request.reviewed_by])
      .filter((profileId): profileId is string => typeof profileId === "string"),
    ...escalationRows
      .map((escalation) => escalation.created_by)
      .filter((profileId): profileId is string => typeof profileId === "string"),
    ...outreachTemplateRows
      .map((template) => template.owner_id)
      .filter((profileId): profileId is string => typeof profileId === "string"),
    ...invoiceRows
      .map((invoice) => invoice.last_follow_up_by)
      .filter((profileId): profileId is string => typeof profileId === "string"),
  ]);
  const missingAuthorIds = missingProfileIds.filter(
    (authorId) => !profileRows.some((profile) => profile.id === authorId),
  );
  const messageAuthorProfilesResult =
    missingAuthorIds.length > 0
      ? await serviceClient.from("profiles").select("*").in("id", missingAuthorIds)
      : { data: [] };
  const messageAuthorProfiles = (messageAuthorProfilesResult.data ?? []) as ProfileRow[];
  const allProfileRows = [...profileRows, ...messageAuthorProfiles];
  const activeProfileRows = allProfileRows.filter((profile) => !profile.deleted_at);

  const assignmentsByCohort = new Map<string, CohortAssignmentRow[]>();
  assignmentRows.forEach((assignment) => {
    const existing = assignmentsByCohort.get(assignment.cohort_id) ?? [];
    existing.push(assignment);
    assignmentsByCohort.set(assignment.cohort_id, existing);
  });

  const assignmentIdsByUser = new Map<string, string[]>();
  assignmentRows.forEach((assignment) => {
    const existing = assignmentIdsByUser.get(assignment.user_id) ?? [];
    existing.push(assignment.cohort_id);
    assignmentIdsByUser.set(assignment.user_id, existing);
  });

  const profilesById = new Map(allProfileRows.map((profile) => [profile.id, profile]));
  const sensitiveAccessMap =
    viewer.role === "engineer" ? await getActiveSensitiveAccessMap(viewer.id) : null;
  const mappedSyncJobs = syncJobRows.flatMap((job) => {
    const status = normalizeSyncStatus(job.status);

    return status
      ? [
          {
            id: job.id,
            label: job.label,
            cadence: job.cadence,
            status,
            lastRunAt: job.last_run_at,
            summary: job.summary,
            ownerId: job.owner_id,
            ownerName: job.owner_id ? (profilesById.get(job.owner_id)?.full_name ?? null) : null,
            acknowledgedAt: job.acknowledged_at,
            mutedUntil: job.muted_until,
            handoffNotes: job.handoff_notes,
            runbookUrl: job.runbook_url,
          },
        ]
      : [];
  });
  const mappedIntakeSyncSource = syncSourceRow ? mapIntakeSyncSource(syncSourceRow, profilesById) : null;
  const mappedBillingSyncSource = billingSyncSourceRow
    ? mapBillingSyncSource(billingSyncSourceRow, profilesById)
    : null;

  const settingsRoleStats =
    viewer.role === "engineer" || viewer.role === "admin"
      ? {
          activeUsers: activeProfileRows.reduce((counts, profile) => {
            if (profile.account_status === "active") {
              counts[profile.role] += 1;
            }
            return counts;
          }, createEmptyRoleCounts()),
          suspendedUsers: activeProfileRows.reduce((counts, profile) => {
            if (profile.account_status === "suspended") {
              counts[profile.role] += 1;
            }
            return counts;
          }, createEmptyRoleCounts()),
          templateUsers: templateRows.reduce((counts, template) => {
            if (template.deleted_at) {
              return counts;
            }
            counts[template.role] += 1;
            return counts;
          }, createEmptyRoleCounts()),
          assignmentLinks: assignmentRows.reduce((counts, assignment) => {
            counts[assignment.role] += 1;
            return counts;
          }, createEmptyRoleCounts()),
        }
      : null;
  const templateRoleByEmail = new Map(
    templateRows.map((template) => [template.email.toLowerCase(), template.role]),
  );
  const settingsUsers =
    viewer.role === "engineer" || viewer.role === "admin"
      ? activeProfileRows.map((profile) => ({
          id: profile.id,
          name: profile.full_name ?? "IntoPrep User",
          email: profile.email,
          role: profile.role,
          title: profile.title ?? "Portal User",
          assignedCohortIds: assignmentIdsByUser.get(profile.id) ?? [],
          templateRole: profile.email ? (templateRoleByEmail.get(profile.email.toLowerCase()) ?? null) : null,
          accountStatus: profile.account_status,
          mustChangePassword: profile.must_change_password,
          lastSignedInAt: profile.last_signed_in_at,
        }))
      : null;
  const threadPostsById = threadPostRows.reduce<Record<string, MessagePost[]>>((accumulator, post) => {
    const existing = accumulator[post.thread_id] ?? [];
    existing.push({
      id: post.id,
      threadId: post.thread_id,
      authorId: post.author_id,
      authorName:
        (post.author_id ? profilesById.get(post.author_id)?.full_name : null) ??
        "IntoPrep Team",
      body: post.body,
      createdAt: post.created_at,
    });
    accumulator[post.thread_id] = existing;
    return accumulator;
  }, {});
  const adminVisibleAuditActions = new Set([
    "account_provisioned",
    "role_updated",
    "account_suspended",
    "account_reactivated",
    "account_deleted",
    "password_reset_requested",
    "password_changed",
    "billing_follow_up_updated",
    "billing_exported",
    "admin_task_updated",
    "admin_saved_view_updated",
    "family_contact_logged",
    "admin_announcement_updated",
    "cohort_operation_run",
    "bulk_operation_run",
    "archive_state_updated",
    "task_activity_logged",
    "lead_updated",
    "approval_request_updated",
    "escalation_updated",
    "outreach_template_updated",
    "session_checklist_updated",
    "message_thread_started",
    "session_handoff_logged",
    "session_instruction_note_saved",
    "instructor_follow_up_flag_created",
    "attendance_exception_flagged",
    "session_coverage_flagged",
  ]);
  const filteredAuditRows =
    viewer.role === "admin"
      ? auditLogRows.filter((log) => adminVisibleAuditActions.has(log.action))
      : auditLogRows;
  const settingsAuditLogs =
    viewer.role === "engineer" || viewer.role === "admin"
      ? filteredAuditRows.map((log) => ({
          id: log.id,
          actorName:
            log.actor_id && profilesById.get(log.actor_id)?.full_name
              ? profilesById.get(log.actor_id)?.full_name ?? "IntoPrep User"
              : "System",
          targetLabel:
            log.target_email ??
            (typeof log.details === "object" &&
            log.details !== null &&
            "scopeId" in log.details &&
            typeof log.details.scopeId === "string"
              ? log.details.scopeId
              : log.target_type
                ? `${log.target_type.replaceAll("_", " ")} target`
                : "System target"),
          action: log.action,
          summary: log.summary,
          createdAt: log.created_at,
          targetType: log.target_type,
          issueReference: log.issue_reference,
        }))
      : null;
  const engineerSupportNotes =
    viewer.role === "engineer" ? await getEngineerSupportNotes() : [];
  const engineerFeatureFlags = viewer.role === "engineer" ? await getFeatureFlags() : [];
  const engineerChangeFreeze = viewer.role === "engineer" ? await getChangeFreeze() : null;
  const activeMaintenanceBanner = await getMaintenanceBanner();
  const engineerSchemaInspectorRows = viewer.role === "engineer" ? await getSchemaInspectorRows() : [];
  const engineerSystemStatus =
    viewer.role === "engineer"
      ? await buildEngineerSystemStatus({
          syncJobs: mappedSyncJobs,
          intakeSource: mappedIntakeSyncSource,
          billingSource: mappedBillingSyncSource,
        })
      : null;
  const engineerChangeLogEntries =
    viewer.role === "engineer" && settingsAuditLogs
      ? settingsAuditLogs
          .filter((entry) =>
            [
              "feature_flag_updated",
              "maintenance_banner_updated",
              "integration_control_updated",
              "change_freeze_updated",
            ].includes(entry.action),
          )
          .slice(0, 12)
          .map((entry) => ({
            id: entry.id,
            action: entry.action,
            summary: entry.summary,
            actorName: entry.actorName,
            createdAt: entry.createdAt,
            issueReference: entry.issueReference,
          }))
      : [];
  const mappedCohorts = cohortRows.map((cohort) => {
    const scopedAssignments = assignmentsByCohort.get(cohort.id) ?? [];
    const leadInstructorId =
      cohort.lead_instructor_id ??
      scopedAssignments.find((assignment) => assignment.role === "instructor")?.user_id ??
      "";

    return {
      id: cohort.id,
      name: cohort.name,
      programId: cohort.program_id,
      campusId: cohort.campus_id,
      termId: cohort.term_id,
      capacity: cohort.capacity,
      enrolled: cohort.enrolled,
      leadInstructorId,
      taIds: scopedAssignments
        .filter((assignment) => assignment.role === "ta")
        .map((assignment) => assignment.user_id),
      cadence: cohort.cadence,
      roomLabel: cohort.room_label,
    } satisfies Cohort;
  });
  const visibleAdminTasks = adminTaskRows.flatMap((task) => {
    const taskType = normalizeTaskType(task.task_type);
    const taskStatus = normalizeTaskStatus(task.status);

    return taskType && taskStatus
      ? [
          {
            id: task.id,
            taskType,
            targetType: task.target_type as AdminTask["targetType"],
            targetId: task.target_id,
            title: task.title,
            details: task.details,
            assignedTo: task.assigned_to,
            assignedToName: task.assigned_to ? (profilesById.get(task.assigned_to)?.full_name ?? null) : null,
            dueAt: task.due_at,
            status: taskStatus,
            createdBy: task.created_by,
            createdByName: task.created_by ? (profilesById.get(task.created_by)?.full_name ?? null) : null,
            createdAt: task.created_at,
            updatedAt: task.updated_at,
          },
        ]
      : [];
  });
  const visibleAdminAnnouncements = adminAnnouncementRows.flatMap((announcement) => {
    const visibleRoles = parseAnnouncementRoles(announcement.visible_roles as Json);
    const tone =
      announcement.tone === "info" || announcement.tone === "warning"
        ? (announcement.tone as AdminAnnouncement["tone"])
        : null;
    const now = new Date().toISOString();

    return tone &&
      visibleRoles.includes(viewer.role) &&
      announcement.starts_at <= now &&
      (!announcement.expires_at || announcement.expires_at > now)
      ? [
          {
            id: announcement.id,
            title: announcement.title,
            body: announcement.body,
            tone,
            visibleRoles,
            isActive: announcement.is_active,
            createdBy: announcement.created_by,
            createdByName: announcement.created_by
              ? (profilesById.get(announcement.created_by)?.full_name ?? null)
              : null,
            createdAt: announcement.created_at,
            updatedAt: announcement.updated_at,
            startsAt: announcement.starts_at,
            expiresAt: announcement.expires_at,
          },
        ]
      : [];
  });
  const mappedSavedViews = savedViewRows.map((view) => ({
    id: view.id,
    name: view.name,
    section: normalizePortalSection(view.section),
    filterState: parseSavedViewFilterState(view.filter_state),
    createdBy: view.created_by,
    createdByName: view.created_by ? (profilesById.get(view.created_by)?.full_name ?? null) : null,
    createdAt: view.created_at,
    updatedAt: view.updated_at,
  }));
  const mappedFamilyContactEvents = contactEventRows.flatMap((event) => {
    const contactSource = normalizeContactSource(event.contact_source);

    return contactSource
      ? [
          {
            id: event.id,
            familyId: event.family_id,
            contactSource,
            summary: event.summary,
            outcome: event.outcome,
            actorId: event.actor_id,
            actorName: event.actor_id ? (profilesById.get(event.actor_id)?.full_name ?? "IntoPrep Team") : "IntoPrep Team",
            contactAt: event.contact_at,
            createdAt: event.created_at,
          },
        ]
      : [];
  });
  const mappedTaskActivities = taskActivityRows.flatMap((activity) => {
    if (
      activity.note_type !== "progress" &&
      activity.note_type !== "handoff" &&
      activity.note_type !== "blocker"
    ) {
      return [];
    }

    const statusFrom = normalizeTaskStatus(activity.status_from ?? "");
    const statusTo = normalizeTaskStatus(activity.status_to ?? "");

    return [
      {
        id: activity.id,
        taskId: activity.task_id,
        authorId: activity.author_id,
        authorName: profilesById.get(activity.author_id)?.full_name ?? "IntoPrep Team",
        body: activity.body,
        noteType: activity.note_type as TaskActivity["noteType"],
        statusFrom,
        statusTo,
        createdAt: activity.created_at,
      },
    ];
  });
  const sessionIdSet = new Set(sessionRows.map((session) => session.id));
  const sessionById = new Map(sessionRows.map((session) => [session.id, session]));
  const studentCohortById = new Map(
    enrollmentRows.map((enrollment) => [enrollment.student_id, enrollment.cohort_id]),
  );
  const mappedSessionChecklists = sessionChecklistRows
    .filter((checklist) => sessionIdSet.has(checklist.session_id))
    .map((checklist) => ({
      id: checklist.id,
      sessionId: checklist.session_id,
      roomConfirmed: checklist.room_confirmed,
      rosterReviewed: checklist.roster_reviewed,
      materialsReady: checklist.materials_ready,
      familyNoticeSentIfNeeded: checklist.family_notice_sent_if_needed,
      attendanceComplete: checklist.attendance_complete,
      scoresLoggedIfNeeded: checklist.scores_logged_if_needed,
      followUpSentIfNeeded: checklist.follow_up_sent_if_needed,
      notesClosedOut: checklist.notes_closed_out,
      updatedBy: checklist.updated_by,
      updatedByName: checklist.updated_by
        ? (profilesById.get(checklist.updated_by)?.full_name ?? null)
        : null,
      updatedAt: checklist.updated_at,
    }));
  const mappedSessionHandoffNotes = handoffNoteRows
    .filter((note) => sessionIdSet.has(note.session_id) && !isFallbackSessionNoteBody(note.body))
    .map((note) => ({
      id: note.id,
      sessionId: note.session_id,
      authorId: note.author_id,
      authorName: profilesById.get(note.author_id)?.full_name ?? "IntoPrep TA",
      body: note.body,
      createdAt: note.created_at,
    }));
  const fallbackSessionInstructionNotes = handoffNoteRows
    .filter((note) => sessionIdSet.has(note.session_id) && isFallbackSessionNoteBody(note.body))
    .map((note) => ({
      id: note.id,
      sessionId: note.session_id,
      authorId: note.author_id,
      authorName: profilesById.get(note.author_id)?.full_name ?? "IntoPrep Instructor",
      body: stripFallbackSessionNoteBody(note.body),
      createdAt: note.created_at,
      updatedAt: note.created_at,
    }));
  const mappedSessionInstructionNotes = [
    ...sessionInstructionNoteRows
      .filter((note) => sessionIdSet.has(note.session_id))
      .map((note) => ({
        id: note.id,
        sessionId: note.session_id,
        authorId: note.author_id,
        authorName: profilesById.get(note.author_id)?.full_name ?? "IntoPrep Instructor",
        body: note.body,
        createdAt: note.created_at,
        updatedAt: note.updated_at,
      })),
    ...fallbackSessionInstructionNotes,
  ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const studentIdSet = new Set(studentRows.map((student) => student.id));
  const directInstructionalAccommodations = accommodationRows
    .filter((accommodation) => studentIdSet.has(accommodation.student_id))
    .map((accommodation) => ({
      id: accommodation.id,
      studentId: accommodation.student_id,
      title: accommodation.title,
      detail: accommodation.detail,
      createdBy: accommodation.created_by,
      createdAt: accommodation.created_at,
      updatedAt: accommodation.updated_at,
    }));
  const accommodationStudentIds = new Set(
    directInstructionalAccommodations.map((accommodation) => accommodation.studentId),
  );
  const fallbackInstructionalAccommodations = studentRows.flatMap((student) => {
    const detail = student.focus.trim();

    return detail && !accommodationStudentIds.has(student.id)
      ? [
          {
            id: `fallback-accommodation-${student.id}`,
            studentId: student.id,
            title: "Classroom support",
            detail,
            createdBy: null,
            createdAt: currentDate,
            updatedAt: currentDate,
          } satisfies InstructionalAccommodation,
        ]
      : [];
  });
  const mappedInstructionalAccommodations = [
    ...directInstructionalAccommodations,
    ...fallbackInstructionalAccommodations,
  ];
  const mappedAttendanceExceptionFlags = attendanceFlagRows
    .filter((flag) => sessionIdSet.has(flag.session_id))
    .flatMap((flag) => {
      if (
        flag.flag_type !== "late_pattern" &&
        flag.flag_type !== "missing_guardian_reply" &&
        flag.flag_type !== "needs_staff_follow_up"
      ) {
        return [];
      }

      return [
        {
          id: flag.id,
          sessionId: flag.session_id,
          studentId: flag.student_id,
          flagType: flag.flag_type as AttendanceExceptionFlag["flagType"],
          note: flag.note,
          createdBy: flag.created_by,
          createdByName: profilesById.get(flag.created_by)?.full_name ?? "IntoPrep TA",
          createdAt: flag.created_at,
        },
      ];
    });
  const directInstructorFollowUpFlags = followUpFlagRows
    .filter((flag) => cohortIds.includes(flag.cohort_id))
    .flatMap((flag) => {
      if (flag.target_type !== "student" && flag.target_type !== "session") {
        return [];
      }

      if (
        flag.status !== "open" &&
        flag.status !== "acknowledged" &&
        flag.status !== "resolved"
      ) {
        return [];
      }

      return [
        {
          id: flag.id,
          targetType: flag.target_type as InstructorFollowUpFlag["targetType"],
          targetId: flag.target_id,
          cohortId: flag.cohort_id,
          summary: flag.summary,
          note: flag.note,
          createdBy: flag.created_by,
          createdByName: profilesById.get(flag.created_by)?.full_name ?? "IntoPrep Instructor",
          createdAt: flag.created_at,
          status: flag.status as InstructorFollowUpFlag["status"],
        },
      ];
    });
  const fallbackInstructorFollowUpFlags = mapFallbackInstructorFollowUpFlags({
    escalationRows,
    sessionById,
    studentCohortById,
    profilesById,
    visibleCohortIds: cohortIds,
  });
  const mappedInstructorFollowUpFlags = [
    ...directInstructorFollowUpFlags,
    ...fallbackInstructorFollowUpFlags,
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const mappedCoverageFlags = coverageFlagRows
    .filter((flag) => sessionIdSet.has(flag.session_id))
    .flatMap((flag) => {
      if (
        flag.status !== "needs_substitute" &&
        flag.status !== "availability_change" &&
        flag.status !== "clear"
      ) {
        return [];
      }

      return [
        {
          id: flag.id,
          sessionId: flag.session_id,
          status: flag.status as SessionCoverageFlag["status"],
          note: flag.note,
          updatedBy: flag.updated_by,
          updatedByName: profilesById.get(flag.updated_by)?.full_name ?? "IntoPrep TA",
          createdAt: flag.created_at,
          updatedAt: flag.updated_at,
        },
      ];
    });
  const mappedApprovalRequests = approvalRequestRows.flatMap((request) => {
    if (
      request.status !== "pending" &&
      request.status !== "approved" &&
      request.status !== "rejected" &&
      request.status !== "withdrawn"
    ) {
      return [];
    }

    if (
      request.request_type !== "bulk_cohort_move" &&
      request.request_type !== "staffing_change" &&
      request.request_type !== "archive_restore" &&
      request.request_type !== "billing_export" &&
      request.request_type !== "source_configuration"
    ) {
      return [];
    }

    if (
      request.target_type !== "cohort" &&
      request.target_type !== "session" &&
      request.target_type !== "invoice" &&
      request.target_type !== "family" &&
      request.target_type !== "integration_source"
    ) {
      return [];
    }

    return [
      {
        id: request.id,
        requestType: request.request_type as ApprovalRequest["requestType"],
        targetType: request.target_type as ApprovalRequest["targetType"],
        targetId: request.target_id,
        reason: request.reason,
        handoffNote: request.handoff_note,
        requestedBy: request.requested_by,
        requestedByName:
          profilesById.get(request.requested_by)?.full_name ?? "IntoPrep Staff",
        status: request.status as ApprovalRequest["status"],
        reviewedBy: request.reviewed_by,
        reviewedByName: request.reviewed_by
          ? (profilesById.get(request.reviewed_by)?.full_name ?? null)
          : null,
        reviewedAt: request.reviewed_at,
        createdAt: request.created_at,
      },
    ];
  });
  const mappedEscalations = escalationRows.flatMap((escalation) => {
    if (parseFallbackFollowUpReason(escalation.reason)) {
      return [];
    }

    if (viewer.role === "staff" && escalation.created_by !== viewer.id) {
      return [];
    }

    if (
      escalation.status !== "open" &&
      escalation.status !== "acknowledged" &&
      escalation.status !== "closed"
    ) {
      return [];
    }

    if (
      escalation.source_type !== "task" &&
      escalation.source_type !== "lead" &&
      escalation.source_type !== "billing_follow_up" &&
      escalation.source_type !== "family" &&
      escalation.source_type !== "thread" &&
      escalation.source_type !== "cohort" &&
      escalation.source_type !== "session"
    ) {
      return [];
    }

    return [
      {
        id: escalation.id,
        sourceType: escalation.source_type as AdminEscalation["sourceType"],
        sourceId: escalation.source_id,
        reason: escalation.reason,
        handoffNote: escalation.handoff_note,
        createdBy: escalation.created_by,
        createdByName: profilesById.get(escalation.created_by)?.full_name ?? "IntoPrep Staff",
        createdAt: escalation.created_at,
        status: escalation.status as AdminEscalation["status"],
      },
    ];
  });
  const mappedOutreachTemplates = outreachTemplateRows.flatMap((template) => {
    if (
      template.category !== "schedule_change" &&
      template.category !== "missed_attendance" &&
      template.category !== "score_follow_up" &&
      template.category !== "billing_handoff" &&
      template.category !== "general"
    ) {
      return [];
    }

    return [
      {
        id: template.id,
        ownerId: template.owner_id,
        title: template.title,
        category: template.category as OutreachTemplate["category"],
        subject: template.subject,
        body: template.body,
        updatedAt: template.updated_at,
      },
    ];
  });
  const adminOps =
    viewer.role === "admin"
      ? {
          billingFollowUpNotes: billingFollowUpNoteRows.map((note) => ({
            id: note.id,
            invoiceId: note.invoice_id,
            familyId: note.family_id,
            authorId: note.author_id,
            authorName: note.author_id ? (profilesById.get(note.author_id)?.full_name ?? "IntoPrep Admin") : "IntoPrep Admin",
            body: note.body,
            createdAt: note.created_at,
          })),
          savedViews: mappedSavedViews,
          familyContactEvents: mappedFamilyContactEvents,
          capacityForecastRows: buildCapacityForecastRows(mappedCohorts),
          archivedCohorts: archivedCohortRows.map((cohort) => ({
            id: cohort.id,
            name: cohort.name,
            programId: cohort.program_id,
            campusId: cohort.campus_id,
            termId: cohort.term_id,
            capacity: cohort.capacity,
            enrolled: cohort.enrolled,
            leadInstructorId: cohort.lead_instructor_id ?? "",
            taIds: [],
            cadence: cohort.cadence,
            roomLabel: cohort.room_label,
          })),
          archivedPrograms: archivedProgramRows.map((program) => ({
            id: program.id,
            name: program.name,
            track: normalizeTrack(program.track),
            format: program.format,
            tuition: program.tuition,
          })),
          approvalRequests: mappedApprovalRequests,
          escalations: mappedEscalations,
        }
      : null;
  const staffOps =
    viewer.role === "staff"
      ? {
          taskActivities: mappedTaskActivities,
          savedViews: mappedSavedViews,
          billingFollowUpNotes: billingFollowUpNoteRows.map((note) => ({
            id: note.id,
            invoiceId: note.invoice_id,
            familyId: note.family_id,
            authorId: note.author_id,
            authorName: note.author_id ? (profilesById.get(note.author_id)?.full_name ?? "IntoPrep Team") : "IntoPrep Team",
            body: note.body,
            createdAt: note.created_at,
          })),
          familyContactEvents: mappedFamilyContactEvents,
          sessionChecklists: mappedSessionChecklists,
          approvalRequests: mappedApprovalRequests,
          escalations: mappedEscalations,
          outreachTemplates: mappedOutreachTemplates,
        }
      : null;
  const taOps =
    viewer.role === "ta"
      ? {
          taskActivities: mappedTaskActivities,
          sessionChecklists: mappedSessionChecklists,
          handoffNotes: mappedSessionHandoffNotes,
          attendanceExceptionFlags: mappedAttendanceExceptionFlags,
          coverageFlags: mappedCoverageFlags,
        }
      : null;
  const instructorOps =
    viewer.role === "instructor"
      ? {
          taskActivities: mappedTaskActivities,
          sessionInstructionNotes: mappedSessionInstructionNotes,
          instructionalAccommodations: mappedInstructionalAccommodations,
        }
      : null;

  return {
    currentDate,
    visiblePrograms: programRows.map((program) => ({
      id: program.id,
      name: program.name,
      track: normalizeTrack(program.track),
      format: program.format,
      tuition: program.tuition,
    })),
    visibleCampuses: campusRows.map((campus) => ({
      id: campus.id,
      name: campus.name,
      location: campus.location,
      modality: normalizeCampusModality(campus.modality),
    })),
    visibleTerms: termRows.map((term) => ({
      id: term.id,
      name: term.name,
      startDate: term.start_date,
      endDate: term.end_date,
    })),
    visibleUsers: activeProfileRows.map((profile) => ({
      id: profile.id,
      name: profile.full_name ?? "IntoPrep User",
      role: profile.role,
      title: profile.title ?? "Portal User",
      assignedCohortIds: assignmentIdsByUser.get(profile.id) ?? [],
    })),
    visibleCohorts: mappedCohorts,
    visibleSessions: sessionRows.map((session) => ({
      id: session.id,
      cohortId: session.cohort_id,
      title: session.title,
      startAt: session.start_at,
      endAt: session.end_at,
      mode: normalizeMode(session.mode),
      roomLabel: session.room_label,
    })),
    visibleEnrollments: enrollmentRows.map((enrollment) => ({
      id: enrollment.id,
      studentId: enrollment.student_id,
      cohortId: enrollment.cohort_id,
      status: enrollment.status === "waitlist" ? "waitlist" : "active",
      registeredAt: enrollment.registered_at,
    })),
    visibleStudents: studentRows.map((student) => ({
      id: student.id,
      familyId: student.family_id,
      firstName: student.first_name,
      lastName: student.last_name,
      gradeLevel: canEngineerViewStudentSensitiveData(
        viewer.role,
        student.id,
        student.family_id,
        sensitiveAccessMap,
      )
        ? student.grade_level
        : "Protected",
      school: canEngineerViewStudentSensitiveData(
        viewer.role,
        student.id,
        student.family_id,
        sensitiveAccessMap,
      )
        ? student.school
        : "Protected",
      targetTest: normalizeTrack(student.target_test),
      focus: student.focus,
      sensitiveAccessGranted: canEngineerViewStudentSensitiveData(
        viewer.role,
        student.id,
        student.family_id,
        sensitiveAccessMap,
      ),
    })),
    visibleFamilies: familyRows.map((family) => ({
      id: family.id,
      familyName: family.family_name,
      guardianNames: family.guardian_names,
      email:
        canEngineerViewFamilySensitiveData(viewer.role, family.id, sensitiveAccessMap) ||
        canViewFamilyContactBasics(viewer.role)
        ? family.email
        : "Protected",
      phone:
        canEngineerViewFamilySensitiveData(viewer.role, family.id, sensitiveAccessMap) ||
        canViewFamilyContactBasics(viewer.role)
        ? family.phone
        : "Protected",
      preferredCampusId: family.preferred_campus_id,
      notes: canEngineerViewFamilySensitiveData(viewer.role, family.id, sensitiveAccessMap)
        ? family.notes
        : "Protected",
      sensitiveAccessGranted: canEngineerViewFamilySensitiveData(
        viewer.role,
        family.id,
        sensitiveAccessMap,
      ),
    })),
    visibleAssessments: assessmentRows.map((assessment) => ({
      id: assessment.id,
      cohortId: assessment.cohort_id,
      title: assessment.title,
      date: assessment.date,
      sections: parseScoreArray(assessment.sections),
    })),
    visibleResults: resultRows.map((result) => ({
      id: result.id,
      assessmentId: result.assessment_id,
      studentId: result.student_id,
      totalScore: result.total_score,
      sectionScores: parseScoreArray(result.section_scores),
      deltaFromPrevious: result.delta_from_previous,
    })),
    visibleNotes: noteRows.map((note) => ({
      id: note.id,
      studentId: note.student_id,
      authorId: note.author_id ?? "",
      authorName: note.author_id ? (profilesById.get(note.author_id)?.full_name ?? null) : null,
      visibility: "internal",
      summary: note.summary,
      createdAt: note.created_at,
    })),
    visibleInstructorFollowUpFlags: mappedInstructorFollowUpFlags,
    visibleResources: resourceRows.map((resource) => ({
      id: resource.id,
      cohortId: resource.cohort_id,
      title: resource.title,
      kind:
        resource.kind === "Worksheet" || resource.kind === "Deck" || resource.kind === "Replay"
          ? resource.kind
          : "Worksheet",
      publishedAt: resource.published_at,
      linkUrl: resourceUrlById.get(resource.id) ?? resource.link_url,
      fileName: resource.file_name,
    })),
    visibleInvoices: invoiceRows.flatMap((invoice) => {
      const status =
        invoice.status === "paid" || invoice.status === "pending" || invoice.status === "overdue"
          ? invoice.status
          : null;
      const source = invoice.source === "QuickBooks" || invoice.source === "Manual" ? invoice.source : null;
      const followUpState = normalizeFollowUpState(invoice.follow_up_state);
      return status && source
        ? [
            {
              id: invoice.id,
              familyId: invoice.family_id,
              amountDue: canEngineerViewBillingSensitiveData(
                viewer.role,
                invoice.family_id,
                sensitiveAccessMap,
              )
                ? invoice.amount_due
                : null,
              dueDate: invoice.due_date,
              status,
              source,
              followUpState:
                canEngineerViewBillingSensitiveData(viewer.role, invoice.family_id, sensitiveAccessMap) &&
                followUpState
                  ? followUpState
                  : undefined,
              lastFollowUpAt: canEngineerViewBillingSensitiveData(
                viewer.role,
                invoice.family_id,
                sensitiveAccessMap,
              )
                ? invoice.last_follow_up_at
                : null,
              lastFollowUpBy: canEngineerViewBillingSensitiveData(
                viewer.role,
                invoice.family_id,
                sensitiveAccessMap,
              )
                ? invoice.last_follow_up_by
                : null,
              lastFollowUpByName:
                canEngineerViewBillingSensitiveData(viewer.role, invoice.family_id, sensitiveAccessMap) &&
                invoice.last_follow_up_by
                  ? (profilesById.get(invoice.last_follow_up_by)?.full_name ?? null)
                  : null,
              sensitiveAccessGranted: canEngineerViewBillingSensitiveData(
                viewer.role,
                invoice.family_id,
                sensitiveAccessMap,
              ),
            },
          ]
        : [];
    }),
    visibleAdminTasks,
    visibleAdminAnnouncements,
    visibleThreads: threadRows.map((thread) => ({
      id: thread.id,
      cohortId: thread.cohort_id,
      familyId: thread.family_id,
      category:
        thread.category === "attendance" ||
        thread.category === "scheduling" ||
        thread.category === "academic_follow_up"
          ? (thread.category as MessageThreadCategory)
          : null,
      subject: thread.subject,
      participants: thread.participants,
      lastMessagePreview: thread.last_message_preview,
      lastMessageAt: thread.last_message_at,
      unreadCount: thread.unread_count,
    })),
    visibleThreadPosts: threadPostsById,
    visibleLeads: leadRows.flatMap((lead) => {
      const stage =
        lead.stage === "inquiry" ||
        lead.stage === "assessment" ||
        lead.stage === "registered" ||
        lead.stage === "waitlist"
          ? lead.stage
          : null;

      return stage
        ? [
            {
              id: lead.id,
              studentName: lead.student_name,
              guardianName: lead.guardian_name,
              targetProgram: lead.target_program,
              stage,
              submittedAt: lead.submitted_at,
              ownerId: lead.owner_id,
              ownerName: lead.owner_id ? (profilesById.get(lead.owner_id)?.full_name ?? null) : null,
              followUpDueAt: lead.follow_up_due_at,
              notes: lead.notes,
            },
          ]
        : [];
    }),
    visibleSyncJobs: mappedSyncJobs,
    visibleImportRuns: importRunRows.flatMap((run) => {
      const status =
        run.status === "completed" || run.status === "partial" || run.status === "failed"
          ? run.status
          : null;
      const source =
        run.source === "Google Forms CSV" || run.source === "Manual CSV"
          ? run.source
          : null;
      const errorSamples = Array.isArray(run.error_samples)
        ? run.error_samples.filter((entry): entry is string => typeof entry === "string")
        : [];

      return status && source
        ? [
            {
              id: run.id,
              source,
              filename: run.filename,
              status,
              startedAt: run.started_at,
              finishedAt: run.finished_at,
              importedCount: run.imported_count,
              leadCount: run.lead_count,
              familyCount: run.family_count,
              studentCount: run.student_count,
              enrollmentCount: run.enrollment_count,
              errorCount: run.error_count,
              summary: run.summary,
              errorSamples,
            },
          ]
        : [];
    }),
    intakeSyncSource: mappedIntakeSyncSource,
    billingSyncSource: mappedBillingSyncSource,
    maintenanceBanner: activeMaintenanceBanner,
    settingsRoleStats,
    settingsUsers,
    settingsAuditLogs,
    adminOps,
    staffOps,
    taOps,
    instructorOps,
    engineerConsole:
      viewer.role === "engineer"
        ? {
            activeSensitiveAccessGrants: sensitiveAccessMap?.grants ?? [],
            supportNotes: engineerSupportNotes,
            featureFlags: engineerFeatureFlags,
            maintenanceBanner: activeMaintenanceBanner,
            changeFreeze: engineerChangeFreeze,
            systemStatus: engineerSystemStatus,
            schemaInspectorRows: engineerSchemaInspectorRows,
            changeLogEntries: engineerChangeLogEntries,
          }
        : null,
  };
}
