import "server-only";

import { randomBytes } from "node:crypto";
import type {
  AdminEscalationSourceType,
  AdminTaskStatus,
  ApprovalRequestStatus,
  ApprovalRequestType,
  ApprovalTargetType,
  BillingFollowUpState,
  ContactSource,
  LeadStage,
  OutreachTemplateCategory,
  PortalSection,
  TaskActivityNoteType,
  User,
} from "@/lib/domain";
import { viewerCanAccessCohort } from "@/lib/attendance";
import { recordAccountAuditLog } from "@/lib/account-governance";
import { assertWritesAllowed } from "@/lib/engineer-controls";
import {
  canClaimLeads,
  canEditSessions,
  canEscalateToAdmin,
  canLogFamilyContact,
  canManageAssignedBillingFollowUp,
  canManageOwnTemplates,
  canMoveSingleEnrollment,
  canSavePersonalViews,
  canStartFamilyThreads,
  canSubmitApprovalRequests,
  canUpdateAssignedTasks,
  canUpdateSessionChecklists,
} from "@/lib/permissions";
import type { Database, Json } from "@/lib/supabase/database.types";
import { hasSupabaseServiceRole } from "@/lib/supabase/config";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
type FamilyRow = Database["public"]["Tables"]["families"]["Row"];
type SessionRow = Database["public"]["Tables"]["sessions"]["Row"];
type CohortRow = Database["public"]["Tables"]["cohorts"]["Row"];
type EnrollmentRow = Database["public"]["Tables"]["enrollments"]["Row"];
type StudentRow = Database["public"]["Tables"]["students"]["Row"];
type AdminTaskRow = Database["public"]["Tables"]["admin_tasks"]["Row"];
type AdminSavedViewRow = Database["public"]["Tables"]["admin_saved_views"]["Row"];

function createId(prefix: string) {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}

function ensureServiceRole() {
  if (!hasSupabaseServiceRole()) {
    throw new Error("Supabase service-role access is required.");
  }
}

function assertStaffVisibility(viewer: User) {
  if (
    viewer.role !== "staff" &&
    viewer.role !== "ta" &&
    viewer.role !== "instructor" &&
    viewer.role !== "admin" &&
    viewer.role !== "engineer"
  ) {
    throw new Error("Staff operations access is required.");
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

function normalizeTaskStatus(value: string): AdminTaskStatus {
  switch (value) {
    case "open":
    case "in_progress":
    case "done":
      return value;
    default:
      throw new Error("Invalid task status.");
  }
}

function normalizeTaskActivityType(value: string): TaskActivityNoteType {
  switch (value) {
    case "progress":
    case "handoff":
    case "blocker":
      return value;
    default:
      throw new Error("Invalid task activity type.");
  }
}

function normalizeLeadStage(value: string): LeadStage {
  switch (value) {
    case "inquiry":
    case "assessment":
    case "registered":
    case "waitlist":
      return value;
    default:
      throw new Error("Invalid lead stage.");
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
      throw new Error("Invalid section.");
  }
}

function normalizeApprovalRequestType(value: string): ApprovalRequestType {
  switch (value) {
    case "bulk_cohort_move":
    case "staffing_change":
    case "archive_restore":
    case "billing_export":
    case "source_configuration":
      return value;
    default:
      throw new Error("Invalid approval request type.");
  }
}

function normalizeApprovalTargetType(value: string): ApprovalTargetType {
  switch (value) {
    case "cohort":
    case "session":
    case "invoice":
    case "family":
    case "integration_source":
      return value;
    default:
      throw new Error("Invalid approval target type.");
  }
}

function normalizeApprovalStatus(value: string): ApprovalRequestStatus {
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

function normalizeEscalationSourceType(value: string): AdminEscalationSourceType {
  switch (value) {
    case "task":
    case "lead":
    case "billing_follow_up":
    case "family":
    case "thread":
    case "cohort":
    case "session":
      return value;
    default:
      throw new Error("Invalid escalation source type.");
  }
}

function normalizeTemplateCategory(value: string): OutreachTemplateCategory {
  switch (value) {
    case "schedule_change":
    case "missed_attendance":
    case "score_follow_up":
    case "billing_handoff":
    case "general":
      return value;
    default:
      throw new Error("Invalid outreach template category.");
  }
}

function normalizeSessionMode(value: string): SessionRow["mode"] {
  switch (value) {
    case "In person":
    case "Hybrid":
    case "Zoom":
      return value;
    default:
      throw new Error("Invalid session mode.");
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

async function getAssignedTaskForViewer({
  taskId,
  viewer,
}: {
  taskId: string;
  viewer: User;
}) {
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("admin_tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const task = (data ?? null) as AdminTaskRow | null;

  if (!task) {
    throw new Error("That task could not be found.");
  }

  const isPrivileged = viewer.role === "admin" || viewer.role === "engineer";

  if (!isPrivileged && task.assigned_to !== viewer.id) {
    throw new Error("You can only update tasks assigned to you.");
  }

  return task;
}

async function assertAssignedBillingTask({
  viewer,
  invoiceId,
  familyId,
}: {
  viewer: User;
  invoiceId: string;
  familyId: string;
}) {
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("admin_tasks")
    .select("*")
    .eq("assigned_to", viewer.id)
    .eq("task_type", "billing_follow_up")
    .neq("status", "done");

  if (error) {
    throw new Error(error.message);
  }

  const tasks = (data ?? []) as AdminTaskRow[];
  const matches = tasks.some(
    (task) =>
      (task.target_type === "invoice" && task.target_id === invoiceId) ||
      (task.target_type === "family" && task.target_id === familyId),
  );

  if (!matches) {
    throw new Error("You can only update billing follow-up assigned to you.");
  }
}

async function getSessionConflictWarnings({
  cohort,
  sessionId,
  startAt,
  endAt,
  roomLabel,
}: {
  cohort: CohortRow;
  sessionId: string;
  startAt: string;
  endAt: string;
  roomLabel: string;
}) {
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

      if (session.room_label.trim().toLowerCase() === roomLabel.trim().toLowerCase()) {
        warnings.add(`Room conflict with ${session.title} in ${session.room_label}.`);
      }

      if (relatedCohort.campus_id === cohort.campus_id) {
        warnings.add(`Campus/time conflict with ${session.title} at the same campus window.`);
      }
    });

  return Array.from(warnings);
}

export async function persistStaffTaskUpdate({
  viewer,
  taskId,
  status,
  body,
  noteType,
}: {
  viewer: User;
  taskId: string;
  status: string;
  body: string;
  noteType: string;
}) {
  ensureServiceRole();
  assertStaffVisibility(viewer);

  if (!canUpdateAssignedTasks(viewer.role)) {
    throw new Error("You cannot update operational tasks.");
  }

  await assertWritesAllowed("operational_writes");

  const task = await getAssignedTaskForViewer({ taskId, viewer });
  const nextStatus = normalizeTaskStatus(status);
  const normalizedBody = body.trim();

  if (normalizedBody.length < 6) {
    throw new Error("Add a clearer task update note.");
  }

  const serviceClient = createSupabaseServiceClient();
  const activityId = createId("task-activity");
  const now = new Date().toISOString();

  const { error: updateError } = await serviceClient
    .from("admin_tasks")
    .update({
      status: nextStatus,
      updated_at: now,
    })
    .eq("id", taskId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: activityError } = await serviceClient.from("task_activities").insert({
    id: activityId,
    task_id: taskId,
    author_id: viewer.id,
    body: normalizedBody,
    note_type: normalizeTaskActivityType(noteType),
    status_from: task.status,
    status_to: nextStatus,
    created_at: now,
  });

  if (activityError) {
    throw new Error(activityError.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "task",
    action: "task_activity_logged",
    summary: `${viewer.name} updated an assigned operational task.`,
    details: {
      taskId,
      noteType,
      statusFrom: task.status,
      statusTo: nextStatus,
    },
  });

  return { taskId, activityId };
}

export async function persistStaffBillingFollowUp({
  viewer,
  invoiceId,
  followUpState,
  body,
}: {
  viewer: User;
  invoiceId: string;
  followUpState: string;
  body?: string;
}) {
  ensureServiceRole();
  assertStaffVisibility(viewer);

  if (!canManageAssignedBillingFollowUp(viewer.role)) {
    throw new Error("You cannot update billing follow-up.");
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

  await assertAssignedBillingTask({
    viewer,
    invoiceId,
    familyId: invoice.family_id,
  });

  const nextState = normalizeFollowUpState(followUpState);
  const now = new Date().toISOString();
  const noteBody = body?.trim() ? body.trim() : null;

  const { error: invoiceError } = await serviceClient
    .from("invoices")
    .update({
      follow_up_state: nextState,
      last_follow_up_at: now,
      last_follow_up_by: viewer.id,
    })
    .eq("id", invoiceId);

  if (invoiceError) {
    throw new Error(invoiceError.message);
  }

  if (noteBody) {
    const { error: noteError } = await serviceClient.from("billing_follow_up_notes").insert({
      id: createId("billing-note"),
      invoice_id: invoiceId,
      family_id: invoice.family_id,
      author_id: viewer.id,
      body: noteBody,
      created_at: now,
    });

    if (noteError) {
      throw new Error(noteError.message);
    }
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "invoice",
    action: "billing_follow_up_updated",
    summary: `${viewer.name} updated assigned billing follow-up.`,
    details: {
      invoiceId,
      followUpState: nextState,
    },
  });

  return { invoiceId };
}

export async function persistOperationalSavedView({
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
  assertStaffVisibility(viewer);

  if (!(canSavePersonalViews(viewer.role) || viewer.role === "admin" || viewer.role === "engineer")) {
    throw new Error("You cannot save views.");
  }

  const normalizedName = name.trim();
  if (normalizedName.length < 3) {
    throw new Error("Saved view name is too short.");
  }

  const normalizedSection = normalizePortalSection(section);
  const payload = {
    name: normalizedName,
    section: normalizedSection,
    filter_state: ensureJsonObject(filterState) as Json,
    created_by: viewer.id,
    updated_at: new Date().toISOString(),
  };

  const serviceClient = createSupabaseServiceClient();

  if (viewId) {
    const { data, error } = await serviceClient
      .from("admin_saved_views")
      .select("*")
      .eq("id", viewId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    const existing = (data ?? null) as AdminSavedViewRow | null;

    if (!existing || (viewer.role === "staff" && existing.created_by !== viewer.id)) {
      throw new Error("That saved view cannot be updated.");
    }
  }

  const { error } = viewId
    ? await serviceClient.from("admin_saved_views").update(payload).eq("id", viewId)
    : await serviceClient.from("admin_saved_views").insert({
        id: createId("view"),
        ...payload,
        created_at: new Date().toISOString(),
      });

  if (error) {
    throw new Error(error.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "saved_view",
    action: "admin_saved_view_updated",
    summary: `${viewer.name} saved a personal operational view.`,
    details: {
      viewId: viewId ?? null,
      section: normalizedSection,
    },
  });
}

export async function deleteOperationalSavedView({
  viewer,
  viewId,
}: {
  viewer: User;
  viewId: string;
}) {
  ensureServiceRole();
  assertStaffVisibility(viewer);

  if (!canSavePersonalViews(viewer.role) && viewer.role !== "admin" && viewer.role !== "engineer") {
    throw new Error("You cannot remove saved views.");
  }

  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("admin_saved_views")
    .select("*")
    .eq("id", viewId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const existing = (data ?? null) as AdminSavedViewRow | null;

  if (!existing || (viewer.role === "staff" && existing.created_by !== viewer.id)) {
    throw new Error("That saved view could not be found.");
  }

  const { error: deleteError } = await serviceClient.from("admin_saved_views").delete().eq("id", viewId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "saved_view",
    action: "admin_saved_view_updated",
    summary: `${viewer.name} removed a personal operational view.`,
    details: {
      viewId,
      deleted: true,
    },
  });
}

export async function persistStaffFamilyContactEvent({
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
  assertStaffVisibility(viewer);

  if (!canLogFamilyContact(viewer.role)) {
    throw new Error("You cannot log family outreach.");
  }

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

export async function updateLeadOwnership({
  viewer,
  leadId,
  action,
  stage,
  notes,
  followUpDueAt,
}: {
  viewer: User;
  leadId: string;
  action: "claim" | "release" | "update";
  stage?: string;
  notes?: string | null;
  followUpDueAt?: string | null;
}) {
  ensureServiceRole();
  assertStaffVisibility(viewer);

  if (!canClaimLeads(viewer.role)) {
    throw new Error("You cannot manage lead ownership.");
  }

  await assertWritesAllowed("operational_writes");

  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient.from("leads").select("*").eq("id", leadId).maybeSingle();
  const lead = (data ?? null) as LeadRow | null;

  if (error) {
    throw new Error(error.message);
  }

  if (!lead) {
    throw new Error("That lead could not be found.");
  }

  const updatePayload: Partial<LeadRow> = {};

  if (action === "claim") {
    if (lead.owner_id && lead.owner_id !== viewer.id) {
      throw new Error("This lead is already owned by another staff member.");
    }
    updatePayload.owner_id = viewer.id;
  } else if (action === "release") {
    if (lead.owner_id !== viewer.id && viewer.role === "staff") {
      throw new Error("You can only release leads you own.");
    }
    updatePayload.owner_id = null;
  } else {
    if (lead.owner_id !== viewer.id && viewer.role === "staff") {
      throw new Error("You can only update leads you own.");
    }
    updatePayload.stage = stage ? normalizeLeadStage(stage) : lead.stage;
    updatePayload.notes = notes?.trim() ? notes.trim() : null;
    updatePayload.follow_up_due_at = followUpDueAt?.trim()
      ? new Date(followUpDueAt).toISOString()
      : null;
  }

  const { error: updateError } = await serviceClient.from("leads").update(updatePayload).eq("id", leadId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "lead",
    action: "lead_updated",
    summary: `${viewer.name} ${action === "claim" ? "claimed" : action === "release" ? "released" : "updated"} a lead.`,
    details: {
      leadId,
      action,
      stage: updatePayload.stage ?? null,
      followUpDueAt: updatePayload.follow_up_due_at ?? null,
    },
  });
}

export async function persistSessionChecklist({
  viewer,
  sessionId,
  checklist,
}: {
  viewer: User;
  sessionId: string;
  checklist: {
    roomConfirmed: boolean;
    rosterReviewed: boolean;
    materialsReady: boolean;
    familyNoticeSentIfNeeded: boolean;
    attendanceComplete: boolean;
    scoresLoggedIfNeeded: boolean;
    followUpSentIfNeeded: boolean;
    notesClosedOut: boolean;
  };
}) {
  ensureServiceRole();
  assertStaffVisibility(viewer);

  if (!canUpdateSessionChecklists(viewer.role)) {
    throw new Error("You cannot update session checklists.");
  }

  await assertWritesAllowed("operational_writes");

  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  const session = (data ?? null) as SessionRow | null;

  if (error) {
    throw new Error(error.message);
  }

  if (!session || !viewerCanAccessCohort(viewer, session.cohort_id)) {
    throw new Error("You do not have access to that session.");
  }

  const now = new Date().toISOString();
  const { error: upsertError } = await serviceClient.from("session_checklists").upsert(
    {
      id: `checklist-${sessionId}`,
      session_id: sessionId,
      room_confirmed: checklist.roomConfirmed,
      roster_reviewed: checklist.rosterReviewed,
      materials_ready: checklist.materialsReady,
      family_notice_sent_if_needed: checklist.familyNoticeSentIfNeeded,
      attendance_complete: checklist.attendanceComplete,
      scores_logged_if_needed: checklist.scoresLoggedIfNeeded,
      follow_up_sent_if_needed: checklist.followUpSentIfNeeded,
      notes_closed_out: checklist.notesClosedOut,
      updated_by: viewer.id,
      updated_at: now,
    },
    { onConflict: "session_id" },
  );

  if (upsertError) {
    throw new Error(upsertError.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "session",
    action: "session_checklist_updated",
    summary: `${viewer.name} updated a session prep or closeout checklist.`,
    details: {
      sessionId,
    },
  });
}

export async function updateStaffSession({
  viewer,
  sessionId,
  title,
  startAt,
  endAt,
  roomLabel,
  mode,
  force,
}: {
  viewer: User;
  sessionId: string;
  title: string;
  startAt: string;
  endAt: string;
  roomLabel: string;
  mode: string;
  force?: boolean;
}) {
  ensureServiceRole();
  assertStaffVisibility(viewer);

  if (!canEditSessions(viewer.role)) {
    throw new Error("You cannot update session details.");
  }

  await assertWritesAllowed("operational_writes");

  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  const session = (data ?? null) as SessionRow | null;

  if (error) {
    throw new Error(error.message);
  }

  if (!session || !viewerCanAccessCohort(viewer, session.cohort_id)) {
    throw new Error("You do not have access to that session.");
  }

  const { data: cohortData, error: cohortError } = await serviceClient
    .from("cohorts")
    .select("*")
    .eq("id", session.cohort_id)
    .maybeSingle();
  const cohort = (cohortData ?? null) as CohortRow | null;

  if (cohortError) {
    throw new Error(cohortError.message);
  }

  if (!cohort) {
    throw new Error("That cohort could not be found.");
  }

  const normalizedTitle = title.trim();
  const normalizedRoomLabel = roomLabel.trim();
  const normalizedStartAt = new Date(startAt).toISOString();
  const normalizedEndAt = new Date(endAt).toISOString();
  const warnings = await getSessionConflictWarnings({
    cohort,
    sessionId,
    startAt: normalizedStartAt,
    endAt: normalizedEndAt,
    roomLabel: normalizedRoomLabel,
  });

  if (warnings.length > 0 && !force) {
    return {
      updated: false,
      warnings,
    };
  }

  const { error: updateError } = await serviceClient
    .from("sessions")
    .update({
      title: normalizedTitle,
      start_at: normalizedStartAt,
      end_at: normalizedEndAt,
      room_label: normalizedRoomLabel,
      mode: normalizeSessionMode(mode),
    })
    .eq("id", sessionId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "session",
    action: "cohort_operation_run",
    summary: `${viewer.name} updated day-to-day session details.`,
    details: {
      sessionId,
      warnings,
      forced: Boolean(force),
    },
  });

  return {
    updated: true,
    warnings,
  };
}

export async function moveSingleEnrollment({
  viewer,
  studentId,
  targetCohortId,
}: {
  viewer: User;
  studentId: string;
  targetCohortId: string;
}) {
  ensureServiceRole();
  assertStaffVisibility(viewer);

  if (!canMoveSingleEnrollment(viewer.role)) {
    throw new Error("You cannot move enrollments.");
  }

  await assertWritesAllowed("operational_writes");

  const serviceClient = createSupabaseServiceClient();
  const { data: enrollmentData, error: enrollmentError } = await serviceClient
    .from("enrollments")
    .select("*")
    .eq("student_id", studentId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const enrollment = (enrollmentData ?? null) as EnrollmentRow | null;

  if (enrollmentError) {
    throw new Error(enrollmentError.message);
  }

  if (!enrollment || !viewerCanAccessCohort(viewer, enrollment.cohort_id)) {
    throw new Error("That enrollment could not be found.");
  }

  if (!viewerCanAccessCohort(viewer, targetCohortId)) {
    throw new Error("You do not have access to the target cohort.");
  }

  if (enrollment.cohort_id === targetCohortId) {
    throw new Error("That student is already in the selected cohort.");
  }

  const { data: targetCohortData, error: targetCohortError } = await serviceClient
    .from("cohorts")
    .select("*")
    .eq("id", targetCohortId)
    .maybeSingle();
  const targetCohort = (targetCohortData ?? null) as CohortRow | null;

  if (targetCohortError) {
    throw new Error(targetCohortError.message);
  }

  if (!targetCohort) {
    throw new Error("The target cohort could not be found.");
  }

  if (targetCohort.enrolled >= targetCohort.capacity) {
    throw new Error("That cohort is already full.");
  }

  const { data: duplicateData, error: duplicateError } = await serviceClient
    .from("enrollments")
    .select("id")
    .eq("student_id", studentId)
    .eq("cohort_id", targetCohortId)
    .eq("status", "active")
    .maybeSingle();

  if (duplicateError) {
    throw new Error(duplicateError.message);
  }

  if (duplicateData) {
    throw new Error("That student is already actively enrolled in the target cohort.");
  }

  const { data: sourceCohortCountData, error: sourceCohortCountError } = await serviceClient
    .from("cohorts")
    .select("enrolled")
    .eq("id", enrollment.cohort_id)
    .maybeSingle();

  if (sourceCohortCountError) {
    throw new Error(sourceCohortCountError.message);
  }

  const { error: updateEnrollmentError } = await serviceClient
    .from("enrollments")
    .update({
      cohort_id: targetCohortId,
    })
    .eq("id", enrollment.id);

  if (updateEnrollmentError) {
    throw new Error(updateEnrollmentError.message);
  }

  const { error: sourceCohortError } = await serviceClient
    .from("cohorts")
    .update({
      enrolled: Math.max(0, (sourceCohortCountData?.enrolled ?? 1) - 1),
    })
    .eq("id", enrollment.cohort_id);

  if (sourceCohortError) {
    throw new Error(sourceCohortError.message);
  }

  const { error: targetUpdateError } = await serviceClient
    .from("cohorts")
    .update({
      enrolled: targetCohort.enrolled + 1,
    })
    .eq("id", targetCohortId);

  if (targetUpdateError) {
    throw new Error(targetUpdateError.message);
  }

  const { data: studentData, error: studentError } = await serviceClient
    .from("students")
    .select("*")
    .eq("id", studentId)
    .maybeSingle();
  const student = (studentData ?? null) as StudentRow | null;

  if (studentError) {
    throw new Error(studentError.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "cohort",
    action: "cohort_operation_run",
    summary: `${viewer.name} moved ${student ? `${student.first_name} ${student.last_name}` : "a student"} into a different cohort.`,
    details: {
      studentId,
      fromCohortId: enrollment.cohort_id,
      toCohortId: targetCohortId,
    },
  });
}

export async function createAdminEscalation({
  viewer,
  sourceType,
  sourceId,
  reason,
  handoffNote,
}: {
  viewer: User;
  sourceType: string;
  sourceId: string;
  reason: string;
  handoffNote?: string | null;
}) {
  ensureServiceRole();
  assertStaffVisibility(viewer);

  if (!canEscalateToAdmin(viewer.role)) {
    throw new Error("You cannot escalate work to admin.");
  }

  await assertWritesAllowed("operational_writes");

  const normalizedReason = reason.trim();

  if (normalizedReason.length < 8) {
    throw new Error("Add a clearer escalation reason.");
  }

  const serviceClient = createSupabaseServiceClient();
  const escalationId = createId("escalation");
  const normalizedSourceType = normalizeEscalationSourceType(sourceType);
  const { error } = await serviceClient.from("admin_escalations").insert({
    id: escalationId,
    source_type: normalizedSourceType,
    source_id: sourceId,
    reason: normalizedReason,
    handoff_note: handoffNote?.trim() ? handoffNote.trim() : null,
    created_by: viewer.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: normalizedSourceType,
    action: "escalation_updated",
    summary: `${viewer.name} escalated a blocked item to admin.`,
    details: {
      escalationId,
      sourceId,
    },
  });

  return { escalationId };
}

export async function persistApprovalRequest({
  viewer,
  requestId,
  requestType,
  targetType,
  targetId,
  reason,
  handoffNote,
  status,
}: {
  viewer: User;
  requestId?: string;
  requestType: string;
  targetType: string;
  targetId: string;
  reason: string;
  handoffNote?: string | null;
  status?: string;
}) {
  ensureServiceRole();
  assertStaffVisibility(viewer);

  if (!canSubmitApprovalRequests(viewer.role)) {
    throw new Error("You cannot submit approval requests.");
  }

  await assertWritesAllowed("operational_writes");

  const normalizedReason = reason.trim();

  if (normalizedReason.length < 8) {
    throw new Error("Add more context for the approval request.");
  }

  const serviceClient = createSupabaseServiceClient();
  const payload = {
    request_type: normalizeApprovalRequestType(requestType),
    target_type: normalizeApprovalTargetType(targetType),
    target_id: targetId,
    reason: normalizedReason,
    handoff_note: handoffNote?.trim() ? handoffNote.trim() : null,
    requested_by: viewer.id,
    status: normalizeApprovalStatus(status ?? "pending"),
  };

  if (requestId) {
    const { data, error } = await serviceClient
      .from("approval_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    const existing = (data ?? null) as Database["public"]["Tables"]["approval_requests"]["Row"] | null;
    if (!existing || existing.requested_by !== viewer.id) {
      throw new Error("That approval request could not be updated.");
    }
  }

  const id = requestId ?? createId("approval");
  const { error } = requestId
    ? await serviceClient.from("approval_requests").update(payload).eq("id", requestId)
    : await serviceClient.from("approval_requests").insert({
        id,
        ...payload,
      });

  if (error) {
    throw new Error(error.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: targetType,
    action: "approval_request_updated",
    summary: `${viewer.name} submitted an approval request.`,
    details: {
      requestId: id,
      requestType,
      targetId,
    },
  });

  return { requestId: id };
}

export async function persistOutreachTemplate({
  viewer,
  templateId,
  title,
  category,
  subject,
  body,
}: {
  viewer: User;
  templateId?: string;
  title: string;
  category: string;
  subject: string;
  body: string;
}) {
  ensureServiceRole();
  assertStaffVisibility(viewer);

  if (!canManageOwnTemplates(viewer.role)) {
    throw new Error("You cannot manage outreach templates.");
  }

  await assertWritesAllowed("operational_writes");

  const normalizedTitle = title.trim();
  const normalizedSubject = subject.trim();
  const normalizedBody = body.trim();

  if (normalizedTitle.length < 3 || normalizedSubject.length < 3 || normalizedBody.length < 8) {
    throw new Error("Add a title, subject, and complete template body.");
  }

  const serviceClient = createSupabaseServiceClient();

  if (templateId) {
    const { data, error } = await serviceClient
      .from("outreach_templates")
      .select("*")
      .eq("id", templateId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    const existing = (data ?? null) as Database["public"]["Tables"]["outreach_templates"]["Row"] | null;

    if (!existing || existing.owner_id !== viewer.id) {
      throw new Error("That template could not be updated.");
    }
  }

  const id = templateId ?? createId("template");
  const { error } = templateId
    ? await serviceClient
        .from("outreach_templates")
        .update({
          title: normalizedTitle,
          category: normalizeTemplateCategory(category),
          subject: normalizedSubject,
          body: normalizedBody,
          updated_at: new Date().toISOString(),
        })
        .eq("id", templateId)
    : await serviceClient.from("outreach_templates").insert({
        id,
        owner_id: viewer.id,
        title: normalizedTitle,
        category: normalizeTemplateCategory(category),
        subject: normalizedSubject,
        body: normalizedBody,
        updated_at: new Date().toISOString(),
      });

  if (error) {
    throw new Error(error.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "template",
    action: "outreach_template_updated",
    summary: `${viewer.name} updated a personal outreach template.`,
    details: {
      templateId: id,
    },
  });

  return { templateId: id };
}

export async function deleteOutreachTemplate({
  viewer,
  templateId,
}: {
  viewer: User;
  templateId: string;
}) {
  ensureServiceRole();
  assertStaffVisibility(viewer);

  if (!canManageOwnTemplates(viewer.role)) {
    throw new Error("You cannot remove outreach templates.");
  }

  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("outreach_templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const existing = (data ?? null) as Database["public"]["Tables"]["outreach_templates"]["Row"] | null;

  if (!existing || existing.owner_id !== viewer.id) {
    throw new Error("That template could not be found.");
  }

  const { error: deleteError } = await serviceClient.from("outreach_templates").delete().eq("id", templateId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "template",
    action: "outreach_template_updated",
    summary: `${viewer.name} removed a personal outreach template.`,
    details: {
      templateId,
      deleted: true,
    },
  });
}

export async function createFamilyThread({
  viewer,
  cohortId,
  familyId,
  category,
  subject,
  body,
}: {
  viewer: User;
  cohortId: string;
  familyId: string;
  category?: string | null;
  subject: string;
  body: string;
}) {
  ensureServiceRole();
  assertStaffVisibility(viewer);

  if (!canStartFamilyThreads(viewer.role)) {
    throw new Error("You cannot start family threads.");
  }

  await assertWritesAllowed("operational_writes");

  if (!viewerCanAccessCohort(viewer, cohortId)) {
    throw new Error("You do not have access to that cohort.");
  }

  const normalizedSubject = subject.trim();
  const normalizedBody = body.trim();

  if (normalizedSubject.length < 3 || normalizedBody.length < 8) {
    throw new Error("Add a subject and a complete message.");
  }

  const serviceClient = createSupabaseServiceClient();
  const { data: familyData, error: familyError } = await serviceClient
    .from("families")
    .select("*")
    .eq("id", familyId)
    .maybeSingle();
  const family = (familyData ?? null) as FamilyRow | null;

  if (familyError) {
    throw new Error(familyError.message);
  }

  if (!family) {
    throw new Error("That family could not be found.");
  }

  const { data: familyStudentData, error: familyStudentError } = await serviceClient
    .from("students")
    .select("id")
    .eq("family_id", familyId);

  if (familyStudentError) {
    throw new Error(familyStudentError.message);
  }

  const familyStudentIds = ((familyStudentData ?? []) as Pick<StudentRow, "id">[]).map((student) => student.id);

  if (familyStudentIds.length === 0) {
    throw new Error("That family does not have a student record available.");
  }

  const { data: enrollmentData, error: enrollmentError } = await serviceClient
    .from("enrollments")
    .select("id")
    .eq("cohort_id", cohortId)
    .eq("status", "active")
    .in("student_id", familyStudentIds)
    .limit(1);

  if (enrollmentError) {
    throw new Error(enrollmentError.message);
  }

  if (!enrollmentData || enrollmentData.length === 0) {
    throw new Error("That family is not active inside the selected cohort.");
  }

  const threadId = createId("thread");
  const { error: threadError } = await serviceClient.from("message_threads").insert({
    id: threadId,
    cohort_id: cohortId,
    family_id: familyId,
    category: category?.trim() ? category.trim() : null,
    subject: normalizedSubject,
    participants: family.guardian_names,
    last_message_preview: normalizedBody.slice(0, 160),
    unread_count: 0,
  });

  if (threadError) {
    throw new Error(threadError.message);
  }

  const { error: postError } = await serviceClient.from("message_posts").insert({
    thread_id: threadId,
    author_id: viewer.id,
    body: normalizedBody,
  });

  if (postError) {
    throw new Error(postError.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "thread",
    action: "message_thread_started",
    summary: `${viewer.name} started a one-off family thread.`,
    details: {
      threadId,
      familyId,
      cohortId,
      category: category?.trim() ? category.trim() : null,
    },
  });

  return { threadId };
}
