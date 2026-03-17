import "server-only";

import { randomBytes } from "node:crypto";
import type {
  AdminAnnouncement,
  AdminEscalationStatus,
  ApprovalRequestStatus,
  BillingFollowUpState,
  ContactSource,
  PortalSection,
  User,
  UserRole,
} from "@/lib/domain";
import { recordAccountAuditLog } from "@/lib/account-governance";
import { assertWritesAllowed } from "@/lib/engineer-controls";
import {
  canExportBilling,
  canManageAdminAnnouncements,
  canManageBillingFollowUp,
  canManageBulkOperations,
  canManageOperationalTasks,
  canManageSavedViews,
  canManageSchedules,
} from "@/lib/permissions";
import type { Database, Json } from "@/lib/supabase/database.types";
import { hasSupabaseServiceRole } from "@/lib/supabase/config";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type FamilyRow = Database["public"]["Tables"]["families"]["Row"];
type StudentRow = Database["public"]["Tables"]["students"]["Row"];
type CohortRow = Database["public"]["Tables"]["cohorts"]["Row"];
type SessionRow = Database["public"]["Tables"]["sessions"]["Row"];
type EnrollmentRow = Database["public"]["Tables"]["enrollments"]["Row"];
type ProgramRow = Database["public"]["Tables"]["programs"]["Row"];
type ApprovalRequestRow = Database["public"]["Tables"]["approval_requests"]["Row"];
type AdminEscalationRow = Database["public"]["Tables"]["admin_escalations"]["Row"];

function createId(prefix: string) {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}

function ensureServiceRole() {
  if (!hasSupabaseServiceRole()) {
    throw new Error("Supabase service-role access is required.");
  }
}

function assertAdminAccess(viewer: User) {
  if (viewer.role !== "admin") {
    throw new Error("Admin access is required.");
  }
}

function normalizeFollowUpState(value: string): BillingFollowUpState {
  switch (value) {
    case "open":
    case "in_progress":
    case "resolved":
      return value;
    default:
      throw new Error("Invalid follow-up state.");
  }
}

function normalizeTaskType(value: string) {
  switch (value) {
    case "billing_follow_up":
    case "family_communication":
    case "attendance_follow_up":
    case "score_cleanup":
    case "cohort_staffing":
      return value;
    default:
      throw new Error("Invalid task type.");
  }
}

function normalizeTaskStatus(value: string) {
  switch (value) {
    case "open":
    case "in_progress":
    case "done":
      return value;
    default:
      throw new Error("Invalid task status.");
  }
}

function normalizeTaskTargetType(value: string) {
  switch (value) {
    case "invoice":
    case "family":
    case "cohort":
    case "student":
    case "user":
      return value;
    default:
      throw new Error("Invalid task target type.");
  }
}

function normalizeContactSource(value: string): ContactSource {
  switch (value) {
    case "email":
    case "phone":
    case "sms":
    case "meeting":
    case "portal_message":
      return value;
    default:
      throw new Error("Invalid contact source.");
  }
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
      throw new Error("Invalid saved-view section.");
  }
}

function normalizeAnnouncementTone(value: string): AdminAnnouncement["tone"] {
  switch (value) {
    case "info":
    case "warning":
      return value;
    default:
      throw new Error("Invalid announcement tone.");
  }
}

function normalizeAnnouncementRoles(value: unknown): UserRole[] {
  if (!Array.isArray(value)) {
    return ["admin", "staff", "ta"];
  }

  const roles = value.flatMap((entry) => {
    switch (entry) {
      case "admin":
      case "staff":
      case "ta":
        return [entry];
      default:
        return [];
    }
  });

  return roles.length > 0 ? roles : ["admin", "staff", "ta"];
}

function normalizeApprovalRequestStatus(value: string): ApprovalRequestStatus {
  switch (value) {
    case "pending":
    case "approved":
    case "rejected":
    case "withdrawn":
      return value;
    default:
      throw new Error("Invalid approval status.");
  }
}

function normalizeEscalationStatus(value: string): AdminEscalationStatus {
  switch (value) {
    case "open":
    case "acknowledged":
    case "closed":
      return value;
    default:
      throw new Error("Invalid escalation status.");
  }
}

function ensureJsonObject(
  value: unknown,
): Record<string, string | string[] | boolean | number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Filter state must be an object.");
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

function overlaps(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string) {
  return Date.parse(leftStart) < Date.parse(rightEnd) && Date.parse(rightStart) < Date.parse(leftEnd);
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

function escapeCsv(value: string | number | null) {
  if (value === null) {
    return "";
  }

  const stringValue = String(value);

  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }

  return stringValue;
}

export async function persistBillingFollowUp({
  viewer,
  invoiceId,
  followUpState,
  body,
}: {
  viewer: User;
  invoiceId: string;
  followUpState: BillingFollowUpState;
  body?: string;
}) {
  ensureServiceRole();
  assertAdminAccess(viewer);

  if (!canManageBillingFollowUp(viewer.role)) {
    throw new Error("You cannot manage billing follow-up.");
  }

  await assertWritesAllowed("operational_writes");

  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();
  const invoice = (data ?? null) as InvoiceRow | null;

  if (error) {
    throw new Error(error.message);
  }

  if (!invoice) {
    throw new Error("That invoice could not be found.");
  }

  const normalizedState = normalizeFollowUpState(followUpState);
  const normalizedBody = body?.trim() ? body.trim() : null;
  const now = new Date().toISOString();

  const { error: updateError } = await serviceClient
    .from("invoices")
    .update({
      follow_up_state: normalizedState,
      last_follow_up_at: now,
      last_follow_up_by: viewer.id,
    })
    .eq("id", invoiceId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  if (normalizedBody) {
    const { error: noteError } = await serviceClient.from("billing_follow_up_notes").insert({
      id: createId("billing-note"),
      invoice_id: invoice.id,
      family_id: invoice.family_id,
      author_id: viewer.id,
      body: normalizedBody,
    });

    if (noteError) {
      throw new Error(noteError.message);
    }
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "invoice",
    targetEmail: null,
    action: "billing_follow_up_updated",
    summary: `${viewer.name} marked invoice ${invoice.id} as ${normalizedState.replaceAll("_", " ")}.`,
    details: {
      invoiceId: invoice.id,
      familyId: invoice.family_id,
      followUpState: normalizedState,
      noteAdded: Boolean(normalizedBody),
    },
  });
}

export async function exportBillingCsv({ viewer }: { viewer: User }) {
  ensureServiceRole();
  assertAdminAccess(viewer);

  if (!canExportBilling(viewer.role)) {
    throw new Error("You cannot export billing data.");
  }

  const serviceClient = createSupabaseServiceClient();
  const [{ data: invoiceData, error: invoiceError }, { data: familyData, error: familyError }] =
    await Promise.all([
      serviceClient.from("invoices").select("*").order("due_date", { ascending: true }),
      serviceClient.from("families").select("*"),
    ]);

  if (invoiceError) {
    throw new Error(invoiceError.message);
  }

  if (familyError) {
    throw new Error(familyError.message);
  }

  const invoices = (invoiceData ?? []) as InvoiceRow[];
  const familiesById = new Map(((familyData ?? []) as FamilyRow[]).map((family) => [family.id, family]));
  const header = [
    "Invoice ID",
    "Family",
    "Amount Due",
    "Due Date",
    "Status",
    "Source",
    "Follow-up State",
    "Last Follow-up At",
  ];
  const rows = invoices.map((invoice) => {
    const family = familiesById.get(invoice.family_id);
    return [
      invoice.id,
      family?.family_name ?? invoice.family_id,
      invoice.amount_due,
      invoice.due_date,
      invoice.status,
      invoice.source,
      invoice.follow_up_state,
      invoice.last_follow_up_at,
    ]
      .map(escapeCsv)
      .join(",");
  });

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "billing_export",
    action: "billing_exported",
    summary: `${viewer.name} exported the admin billing follow-up report.`,
    details: {
      invoiceCount: invoices.length,
    },
  });

  return [header.join(","), ...rows].join("\n");
}

export async function persistAdminTask({
  viewer,
  taskId,
  taskType,
  targetType,
  targetId,
  title,
  details,
  assignedTo,
  dueAt,
  status,
}: {
  viewer: User;
  taskId?: string;
  taskType: string;
  targetType: string;
  targetId: string;
  title: string;
  details?: string | null;
  assignedTo?: string | null;
  dueAt?: string | null;
  status?: string;
}) {
  ensureServiceRole();
  assertAdminAccess(viewer);

  if (!canManageOperationalTasks(viewer.role)) {
    throw new Error("You cannot manage operational tasks.");
  }

  await assertWritesAllowed("operational_writes");

  const normalizedTaskType = normalizeTaskType(taskType);
  const normalizedTargetType = normalizeTaskTargetType(targetType);
  const normalizedStatus = normalizeTaskStatus(status ?? "open");
  const normalizedTitle = title.trim();
  const normalizedDetails = details?.trim() ? details.trim() : null;
  const normalizedDueAt = dueAt?.trim() ? new Date(dueAt).toISOString() : null;

  if (normalizedTitle.length < 6) {
    throw new Error("Task title is required.");
  }

  const serviceClient = createSupabaseServiceClient();
  const id = taskId ?? createId("admin-task");
  const payload = {
    task_type: normalizedTaskType,
    target_type: normalizedTargetType,
    target_id: targetId,
    title: normalizedTitle,
    details: normalizedDetails,
    assigned_to: assignedTo ?? null,
    due_at: normalizedDueAt,
    status: normalizedStatus,
    created_by: viewer.id,
    updated_at: new Date().toISOString(),
  };

  const { error } = taskId
    ? await serviceClient.from("admin_tasks").update(payload).eq("id", id)
    : await serviceClient.from("admin_tasks").insert({
        id,
        ...payload,
      });

  if (error) {
    throw new Error(error.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: normalizedTargetType,
    action: "admin_task_updated",
    summary: `${viewer.name} ${taskId ? "updated" : "created"} task ${normalizedTitle}.`,
    details: {
      taskId: id,
      taskType: normalizedTaskType,
      targetType: normalizedTargetType,
      targetId,
      assignedTo: assignedTo ?? null,
      status: normalizedStatus,
    },
  });

  return id;
}

export async function persistAdminSavedView({
  viewer,
  viewId,
  name,
  section,
  filterState,
}: {
  viewer: User;
  viewId?: string;
  name: string;
  section: string;
  filterState: unknown;
}) {
  ensureServiceRole();
  assertAdminAccess(viewer);

  if (!canManageSavedViews(viewer.role)) {
    throw new Error("You cannot manage saved views.");
  }

  const normalizedName = name.trim();
  const normalizedSection = normalizePortalSection(section);
  const normalizedFilterState = ensureJsonObject(filterState);

  if (normalizedName.length < 3) {
    throw new Error("Saved-view name is required.");
  }

  const serviceClient = createSupabaseServiceClient();
  const id = viewId ?? createId("saved-view");
  const payload = {
    name: normalizedName,
    section: normalizedSection,
    filter_state: normalizedFilterState as Json,
    created_by: viewer.id,
    updated_at: new Date().toISOString(),
  };

  const { error } = viewId
    ? await serviceClient.from("admin_saved_views").update(payload).eq("id", id)
    : await serviceClient.from("admin_saved_views").insert({
        id,
        ...payload,
      });

  if (error) {
    throw new Error(error.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "saved_view",
    action: "admin_saved_view_updated",
    summary: `${viewer.name} ${viewId ? "updated" : "saved"} admin view ${normalizedName}.`,
    details: {
      viewId: id,
      section: normalizedSection,
      filterState: normalizedFilterState,
    },
  });

  return id;
}

export async function deleteAdminSavedView({
  viewer,
  viewId,
}: {
  viewer: User;
  viewId: string;
}) {
  ensureServiceRole();
  assertAdminAccess(viewer);

  if (!canManageSavedViews(viewer.role)) {
    throw new Error("You cannot manage saved views.");
  }

  const serviceClient = createSupabaseServiceClient();
  const { error } = await serviceClient.from("admin_saved_views").delete().eq("id", viewId);

  if (error) {
    throw new Error(error.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "saved_view",
    action: "admin_saved_view_updated",
    summary: `${viewer.name} removed an admin saved view.`,
    details: {
      viewId,
      deleted: true,
    },
  });
}

export async function persistFamilyContactEvent({
  viewer,
  familyId,
  contactSource,
  summary,
  outcome,
  contactAt,
}: {
  viewer: User;
  familyId: string;
  contactSource: string;
  summary: string;
  outcome: string;
  contactAt?: string | null;
}) {
  ensureServiceRole();
  assertAdminAccess(viewer);
  await assertWritesAllowed("operational_writes");

  const normalizedSummary = summary.trim();
  const normalizedOutcome = outcome.trim();

  if (normalizedSummary.length < 8 || normalizedOutcome.length < 4) {
    throw new Error("Add both a contact summary and outcome.");
  }

  const serviceClient = createSupabaseServiceClient();
  const { error } = await serviceClient.from("family_contact_events").insert({
    id: createId("contact"),
    family_id: familyId,
    contact_source: normalizeContactSource(contactSource),
    summary: normalizedSummary,
    outcome: normalizedOutcome,
    actor_id: viewer.id,
    contact_at: contactAt?.trim() ? new Date(contactAt).toISOString() : new Date().toISOString(),
  });

  if (error) {
    throw new Error(error.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "family",
    action: "family_contact_logged",
    summary: `${viewer.name} logged a family outreach update.`,
    details: {
      familyId,
      contactSource,
    },
  });
}

export async function persistAdminAnnouncement({
  viewer,
  title,
  body,
  tone,
  visibleRoles,
  expiresAt,
  isActive,
}: {
  viewer: User;
  title: string;
  body: string;
  tone: string;
  visibleRoles: unknown;
  expiresAt?: string | null;
  isActive?: boolean;
}) {
  ensureServiceRole();
  assertAdminAccess(viewer);

  if (!canManageAdminAnnouncements(viewer.role)) {
    throw new Error("You cannot manage admin announcements.");
  }

  await assertWritesAllowed("operational_writes");

  const normalizedTitle = title.trim();
  const normalizedBody = body.trim();

  if (normalizedTitle.length < 3 || normalizedBody.length < 8) {
    throw new Error("Announcement title and message are required.");
  }

  const serviceClient = createSupabaseServiceClient();
  const id = createId("announcement");
  const { error } = await serviceClient.from("admin_announcements").insert({
    id,
    title: normalizedTitle,
    body: normalizedBody,
    tone: normalizeAnnouncementTone(tone),
    visible_roles: normalizeAnnouncementRoles(visibleRoles),
    is_active: isActive ?? true,
    created_by: viewer.id,
    expires_at: expiresAt?.trim() ? new Date(expiresAt).toISOString() : null,
  });

  if (error) {
    throw new Error(error.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "announcement",
    action: "admin_announcement_updated",
    summary: `${viewer.name} posted an internal admin announcement.`,
    details: {
      announcementId: id,
      visibleRoles: normalizeAnnouncementRoles(visibleRoles),
    },
  });
}

async function getConflictWarnings({
  cohort,
  sessionId,
  startAt,
  endAt,
  roomLabel,
  leadInstructorId,
}: {
  cohort: CohortRow;
  sessionId?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  roomLabel?: string | null;
  leadInstructorId?: string | null;
}) {
  if (!startAt || !endAt) {
    return [];
  }

  const serviceClient = createSupabaseServiceClient();
  const [{ data: sessionsData, error: sessionsError }, { data: cohortsData, error: cohortsError }] =
    await Promise.all([
      serviceClient.from("sessions").select("*"),
      serviceClient.from("cohorts").select("*"),
    ]);

  if (sessionsError) {
    throw new Error(sessionsError.message);
  }

  if (cohortsError) {
    throw new Error(cohortsError.message);
  }

  const sessions = (sessionsData ?? []) as SessionRow[];
  const cohortsById = new Map(((cohortsData ?? []) as CohortRow[]).map((row) => [row.id, row]));
  const warnings = new Set<string>();

  sessions
    .filter((session) => session.id !== sessionId && overlaps(startAt, endAt, session.start_at, session.end_at))
    .forEach((session) => {
      const relatedCohort = cohortsById.get(session.cohort_id);

      if (!relatedCohort) {
        return;
      }

      if (roomLabel && session.room_label.trim().toLowerCase() === roomLabel.trim().toLowerCase()) {
        warnings.add(`Room conflict with ${session.title} in ${session.room_label}.`);
      }

      if (leadInstructorId && relatedCohort.lead_instructor_id === leadInstructorId) {
        warnings.add(`Instructor conflict with ${session.title}.`);
      }

      if (relatedCohort.campus_id === cohort.campus_id) {
        warnings.add(`Campus/time conflict with ${session.title} at the same campus window.`);
      }
    });

  return Array.from(warnings);
}

export async function updateAdminCohortOperation({
  viewer,
  cohortId,
  capacity,
  cadence,
  roomLabel,
  leadInstructorId,
  sessionId,
  sessionTitle,
  sessionStartAt,
  sessionEndAt,
  sessionMode,
  sessionRoomLabel,
  force,
}: {
  viewer: User;
  cohortId: string;
  capacity?: number;
  cadence?: string;
  roomLabel?: string;
  leadInstructorId?: string | null;
  sessionId?: string | null;
  sessionTitle?: string;
  sessionStartAt?: string;
  sessionEndAt?: string;
  sessionMode?: string;
  sessionRoomLabel?: string;
  force?: boolean;
}) {
  ensureServiceRole();
  assertAdminAccess(viewer);

  if (!canManageSchedules(viewer.role)) {
    throw new Error("You cannot manage cohort operations.");
  }

  await assertWritesAllowed("operational_writes");

  const serviceClient = createSupabaseServiceClient();
  const { data: cohortData, error: cohortError } = await serviceClient
    .from("cohorts")
    .select("*")
    .eq("id", cohortId)
    .maybeSingle();
  const cohort = (cohortData ?? null) as CohortRow | null;

  if (cohortError) {
    throw new Error(cohortError.message);
  }

  if (!cohort) {
    throw new Error("That cohort could not be found.");
  }

  const normalizedCapacity = typeof capacity === "number" ? capacity : cohort.capacity;
  const normalizedCadence = cadence?.trim() ? cadence.trim() : cohort.cadence;
  const normalizedRoomLabel = roomLabel?.trim() ? roomLabel.trim() : cohort.room_label;
  const normalizedLeadInstructorId = leadInstructorId?.trim() ? leadInstructorId.trim() : cohort.lead_instructor_id;
  const normalizedSessionStartAt = sessionStartAt?.trim() ?? null;
  const normalizedSessionEndAt = sessionEndAt?.trim() ?? null;
  const normalizedSessionRoomLabel = sessionRoomLabel?.trim() || normalizedRoomLabel;
  const warnings = await getConflictWarnings({
    cohort,
    sessionId,
    startAt: normalizedSessionStartAt,
    endAt: normalizedSessionEndAt,
    roomLabel: normalizedSessionRoomLabel,
    leadInstructorId: normalizedLeadInstructorId,
  });

  if (warnings.length > 0 && !force) {
    return {
      warnings,
      updated: false,
    };
  }

  const { error: cohortUpdateError } = await serviceClient
    .from("cohorts")
    .update({
      capacity: normalizedCapacity,
      cadence: normalizedCadence,
      room_label: normalizedRoomLabel,
      lead_instructor_id: normalizedLeadInstructorId,
    })
    .eq("id", cohortId);

  if (cohortUpdateError) {
    throw new Error(cohortUpdateError.message);
  }

  if (sessionId) {
    const sessionPayload = {
      title: sessionTitle?.trim() ? sessionTitle.trim() : undefined,
      start_at: normalizedSessionStartAt ?? undefined,
      end_at: normalizedSessionEndAt ?? undefined,
      mode: sessionMode?.trim() ? sessionMode.trim() : undefined,
      room_label: normalizedSessionRoomLabel,
    };
    const { error: sessionUpdateError } = await serviceClient
      .from("sessions")
      .update(sessionPayload)
      .eq("id", sessionId);

    if (sessionUpdateError) {
      throw new Error(sessionUpdateError.message);
    }
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "cohort",
    action: "cohort_operation_run",
    summary: `${viewer.name} updated cohort operations for ${cohort.name}.`,
    details: {
      cohortId,
      sessionId: sessionId ?? null,
      warnings,
      forced: Boolean(force),
    },
  });

  return {
    warnings,
    updated: true,
  };
}

export async function setOperationalRecordArchived({
  viewer,
  targetType,
  targetId,
  archived,
}: {
  viewer: User;
  targetType: "cohort" | "program";
  targetId: string;
  archived: boolean;
}) {
  ensureServiceRole();
  assertAdminAccess(viewer);

  if (!canManageSchedules(viewer.role)) {
    throw new Error("You cannot archive operational records.");
  }

  await assertWritesAllowed("operational_writes");

  const serviceClient = createSupabaseServiceClient();
  const now = new Date().toISOString();

  if (targetType === "cohort") {
    const { data, error } = await serviceClient
      .from("cohorts")
      .select("*")
      .eq("id", targetId)
      .maybeSingle();
    const cohort = (data ?? null) as CohortRow | null;

    if (error) {
      throw new Error(error.message);
    }

    if (!cohort) {
      throw new Error("That cohort could not be found.");
    }

    const { error: updateError } = await serviceClient
      .from("cohorts")
      .update({
        is_archived: archived,
        archived_at: archived ? now : null,
      })
      .eq("id", targetId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    await recordAccountAuditLog(serviceClient, {
      actorId: viewer.id,
      targetType: "cohort",
      action: "archive_state_updated",
      summary: `${archived ? "Archived" : "Restored"} cohort ${cohort.name}.`,
      details: {
        targetType,
        targetId,
        archived,
      },
    });

    return {
      targetType,
      targetId,
      archived,
      label: cohort.name,
    };
  }

  const { data, error } = await serviceClient
    .from("programs")
    .select("*")
    .eq("id", targetId)
    .maybeSingle();
  const program = (data ?? null) as ProgramRow | null;

  if (error) {
    throw new Error(error.message);
  }

  if (!program) {
    throw new Error("That program could not be found.");
  }

  if (archived) {
    const { count, error: activeCohortError } = await serviceClient
      .from("cohorts")
      .select("id", { count: "exact", head: true })
      .eq("program_id", targetId)
      .eq("is_archived", false);

    if (activeCohortError) {
      throw new Error(activeCohortError.message);
    }

    if ((count ?? 0) > 0) {
      throw new Error("Archive all active cohorts under this program before archiving the program.");
    }
  }

  const { error: updateError } = await serviceClient
    .from("programs")
    .update({
      is_archived: archived,
      archived_at: archived ? now : null,
    })
    .eq("id", targetId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "program",
    action: "archive_state_updated",
    summary: `${archived ? "Archived" : "Restored"} program ${program.name}.`,
    details: {
      targetType,
      targetId,
      archived,
    },
  });

  return {
    targetType,
    targetId,
    archived,
    label: program.name,
  };
}

export async function reviewApprovalRequest({
  viewer,
  requestId,
  status,
}: {
  viewer: User;
  requestId: string;
  status: string;
}) {
  ensureServiceRole();
  assertAdminAccess(viewer);
  await assertWritesAllowed("operational_writes");

  const normalizedStatus = normalizeApprovalRequestStatus(status);

  if (normalizedStatus !== "approved" && normalizedStatus !== "rejected") {
    throw new Error("Admins can only approve or reject requests.");
  }

  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("approval_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  const request = (data ?? null) as ApprovalRequestRow | null;

  if (error) {
    throw new Error(error.message);
  }

  if (!request) {
    throw new Error("That approval request could not be found.");
  }

  const now = new Date().toISOString();
  const { error: updateError } = await serviceClient
    .from("approval_requests")
    .update({
      status: normalizedStatus,
      reviewed_by: viewer.id,
      reviewed_at: now,
    })
    .eq("id", requestId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: request.target_type,
    action: "approval_request_updated",
    summary: `${viewer.name} ${normalizedStatus} an approval request.`,
    details: {
      requestId,
      targetId: request.target_id,
    },
  });
}

export async function updateAdminEscalationStatus({
  viewer,
  escalationId,
  status,
}: {
  viewer: User;
  escalationId: string;
  status: string;
}) {
  ensureServiceRole();
  assertAdminAccess(viewer);
  await assertWritesAllowed("operational_writes");

  const normalizedStatus = normalizeEscalationStatus(status);
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("admin_escalations")
    .select("*")
    .eq("id", escalationId)
    .maybeSingle();
  const escalation = (data ?? null) as AdminEscalationRow | null;

  if (error) {
    throw new Error(error.message);
  }

  if (!escalation) {
    throw new Error("That escalation could not be found.");
  }

  const { error: updateError } = await serviceClient
    .from("admin_escalations")
    .update({
      status: normalizedStatus,
    })
    .eq("id", escalationId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: escalation.source_type,
    action: "escalation_updated",
    summary: `${viewer.name} marked an escalation as ${normalizedStatus}.`,
    details: {
      escalationId,
      sourceId: escalation.source_id,
    },
  });
}

export async function runAdminBulkOperation({
  viewer,
  operation,
  sourceCohortId,
  targetCohortId,
  cohortId,
  studentIds,
  userIds,
  dueAt,
}: {
  viewer: User;
  operation: "move_students" | "assign_coverage" | "attendance_follow_up";
  sourceCohortId?: string;
  targetCohortId?: string;
  cohortId?: string;
  studentIds?: string[];
  userIds?: string[];
  dueAt?: string | null;
}) {
  ensureServiceRole();
  assertAdminAccess(viewer);

  if (!canManageBulkOperations(viewer.role)) {
    throw new Error("You cannot run bulk operations.");
  }

  await assertWritesAllowed("operational_writes");

  const serviceClient = createSupabaseServiceClient();

  if (operation === "move_students") {
    if (!sourceCohortId || !targetCohortId || !Array.isArray(studentIds) || studentIds.length === 0) {
      throw new Error("Source cohort, target cohort, and at least one student are required.");
    }

    const { data: enrollmentData, error: enrollmentError } = await serviceClient
      .from("enrollments")
      .select("*")
      .eq("cohort_id", sourceCohortId)
      .eq("status", "active")
      .in("student_id", studentIds);

    if (enrollmentError) {
      throw new Error(enrollmentError.message);
    }

    const enrollments = (enrollmentData ?? []) as EnrollmentRow[];
    if (enrollments.length === 0) {
      throw new Error("No active enrollments matched that source cohort selection.");
    }

    const movedStudentIds = enrollments.map((enrollment) => enrollment.student_id);
    const { error: updateError } = await serviceClient
      .from("enrollments")
      .update({ cohort_id: targetCohortId })
      .eq("cohort_id", sourceCohortId)
      .eq("status", "active")
      .in("student_id", movedStudentIds);

    if (updateError) {
      throw new Error(updateError.message);
    }

    const sourceCountDelta = movedStudentIds.length;
    const [sourceCohortResult, targetCohortResult] = await Promise.all([
      serviceClient.from("cohorts").select("enrolled").eq("id", sourceCohortId).maybeSingle(),
      serviceClient.from("cohorts").select("enrolled").eq("id", targetCohortId).maybeSingle(),
    ]);

    await Promise.all([
      sourceCohortResult.data
        ? serviceClient
            .from("cohorts")
            .update({ enrolled: Math.max(0, sourceCohortResult.data.enrolled - sourceCountDelta) })
            .eq("id", sourceCohortId)
        : Promise.resolve({ error: null }),
      targetCohortResult.data
        ? serviceClient
            .from("cohorts")
            .update({ enrolled: targetCohortResult.data.enrolled + sourceCountDelta })
            .eq("id", targetCohortId)
        : Promise.resolve({ error: null }),
    ]);

    await recordAccountAuditLog(serviceClient, {
      actorId: viewer.id,
      targetType: "cohort",
      action: "bulk_operation_run",
      summary: `${viewer.name} moved ${movedStudentIds.length} students into ${targetCohortId}.`,
      details: {
        operation,
        sourceCohortId,
        targetCohortId,
        studentIds: movedStudentIds,
      },
    });

    return {
      movedCount: movedStudentIds.length,
    };
  }

  if (operation === "assign_coverage") {
    if (!cohortId || !Array.isArray(userIds) || userIds.length === 0) {
      throw new Error("A cohort and at least one user are required.");
    }

    const profilesById = await getProfilesByIds(userIds);
    const payload = userIds.flatMap((userId) => {
      const profile = profilesById.get(userId);

      if (!profile || profile.deleted_at) {
        return [];
      }

      return [
        {
          cohort_id: cohortId,
          user_id: userId,
          role: profile.role,
        },
      ];
    });

    if (payload.length === 0) {
      throw new Error("No eligible users matched that coverage assignment.");
    }

    const { error } = await serviceClient
      .from("cohort_assignments")
      .upsert(payload, { onConflict: "user_id,cohort_id" });

    if (error) {
      throw new Error(error.message);
    }

    await recordAccountAuditLog(serviceClient, {
      actorId: viewer.id,
      targetType: "cohort",
      action: "bulk_operation_run",
      summary: `${viewer.name} assigned ${payload.length} team members to ${cohortId}.`,
      details: {
        operation,
        cohortId,
        userIds,
      },
    });

    return {
      assignedCount: payload.length,
    };
  }

  if (!cohortId || !Array.isArray(studentIds) || studentIds.length === 0) {
    throw new Error("A cohort and at least one student are required.");
  }

  const { data: studentData, error: studentError } = await serviceClient
    .from("students")
    .select("*")
    .in("id", studentIds);

  if (studentError) {
    throw new Error(studentError.message);
  }

  const students = (studentData ?? []) as StudentRow[];
  const createdTasks = students.map((student) => ({
    id: createId("admin-task"),
    task_type: "attendance_follow_up",
    target_type: "student",
    target_id: student.id,
    title: `Attendance follow-up for ${student.first_name} ${student.last_name}`,
    details: `Close out attendance follow-up linked to ${cohortId}.`,
    assigned_to: null,
    due_at: dueAt?.trim() ? new Date(dueAt).toISOString() : null,
    status: "open",
    created_by: viewer.id,
  }));

  const { error } = await serviceClient.from("admin_tasks").insert(createdTasks);

  if (error) {
    throw new Error(error.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "cohort",
    action: "bulk_operation_run",
    summary: `${viewer.name} opened ${createdTasks.length} attendance follow-up tasks.`,
    details: {
      operation,
      cohortId,
      studentIds,
    },
  });

  return {
    createdCount: createdTasks.length,
  };
}

export async function sendBulkFamilyMessage({
  viewer,
  cohortId,
  familyIds,
  subject,
  body,
}: {
  viewer: User;
  cohortId: string;
  familyIds: string[];
  subject: string;
  body: string;
}) {
  ensureServiceRole();
  assertAdminAccess(viewer);

  if (!canManageBulkOperations(viewer.role)) {
    throw new Error("You cannot send bulk family messages.");
  }

  await assertWritesAllowed("operational_writes");

  const normalizedSubject = subject.trim();
  const normalizedBody = body.trim();

  if (normalizedSubject.length < 3 || normalizedBody.length < 8) {
    throw new Error("Subject and message are required.");
  }

  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("families")
    .select("*")
    .in("id", familyIds);

  if (error) {
    throw new Error(error.message);
  }

  const families = (data ?? []) as FamilyRow[];
  const insertedThreads = families.map((family) => ({
    id: createId("thread"),
    cohort_id: cohortId,
    subject: normalizedSubject,
    participants: family.guardian_names,
    last_message_preview: normalizedBody.slice(0, 160),
    unread_count: 0,
  }));

  const { error: threadError } = await serviceClient.from("message_threads").insert(insertedThreads);

  if (threadError) {
    throw new Error(threadError.message);
  }

  const posts = insertedThreads.map((thread) => ({
    thread_id: thread.id,
    author_id: viewer.id,
    body: normalizedBody,
  }));
  const { error: postError } = await serviceClient.from("message_posts").insert(posts);

  if (postError) {
    throw new Error(postError.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "family",
    action: "bulk_operation_run",
    summary: `${viewer.name} sent ${insertedThreads.length} family message threads.`,
    details: {
      operation: "bulk_message_families",
      cohortId,
      familyIds,
      subject: normalizedSubject,
    },
  });

  return {
    sentCount: insertedThreads.length,
  };
}
