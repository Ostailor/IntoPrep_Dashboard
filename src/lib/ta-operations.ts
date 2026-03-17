import "server-only";

import { randomBytes } from "node:crypto";
import type {
  AttendanceExceptionFlagType,
  MessageThreadCategory,
  SessionCoverageStatus,
  User,
} from "@/lib/domain";
import { viewerCanAccessCohort } from "@/lib/attendance";
import { recordAccountAuditLog } from "@/lib/account-governance";
import { assertWritesAllowed } from "@/lib/engineer-controls";
import type { Database } from "@/lib/supabase/database.types";
import { hasSupabaseServiceRole } from "@/lib/supabase/config";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createFamilyThread } from "@/lib/staff-operations";

type SessionRow = Database["public"]["Tables"]["sessions"]["Row"];
type EnrollmentRow = Database["public"]["Tables"]["enrollments"]["Row"];

function createId(prefix: string) {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}

function ensureServiceRole() {
  if (!hasSupabaseServiceRole()) {
    throw new Error("Supabase service-role access is required.");
  }
}

function assertTaVisibility(viewer: User) {
  if (viewer.role !== "ta") {
    throw new Error("TA support access is required.");
  }
}

function normalizeThreadCategory(value: string): MessageThreadCategory {
  switch (value) {
    case "attendance":
    case "scheduling":
    case "academic_follow_up":
      return value;
    default:
      throw new Error("Choose an allowed thread category.");
  }
}

function normalizeAttendanceExceptionFlagType(value: string): AttendanceExceptionFlagType {
  switch (value) {
    case "late_pattern":
    case "missing_guardian_reply":
    case "needs_staff_follow_up":
      return value;
    default:
      throw new Error("Choose a valid attendance exception flag.");
  }
}

function normalizeCoverageStatus(value: string): SessionCoverageStatus {
  switch (value) {
    case "needs_substitute":
    case "availability_change":
    case "clear":
      return value;
    default:
      throw new Error("Choose a valid coverage status.");
  }
}

async function getAccessibleSession(sessionId: string, viewer: User) {
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

  return session;
}

async function assertStudentIsInSessionCohort({
  session,
  studentId,
}: {
  session: SessionRow;
  studentId: string;
}) {
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("enrollments")
    .select("*")
    .eq("cohort_id", session.cohort_id)
    .eq("student_id", studentId)
    .eq("status", "active")
    .maybeSingle();
  const enrollment = (data ?? null) as EnrollmentRow | null;

  if (error) {
    throw new Error(error.message);
  }

  if (!enrollment) {
    throw new Error("That student is not active in the selected session cohort.");
  }
}

export async function createTaFamilyThread({
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
  category: string;
  subject: string;
  body: string;
}) {
  ensureServiceRole();
  assertTaVisibility(viewer);
  await assertWritesAllowed("operational_writes");

  return createFamilyThread({
    viewer,
    cohortId,
    familyId,
    category: normalizeThreadCategory(category),
    subject,
    body,
  });
}

export async function persistSessionHandoffNote({
  viewer,
  sessionId,
  body,
}: {
  viewer: User;
  sessionId: string;
  body: string;
}) {
  ensureServiceRole();
  assertTaVisibility(viewer);
  await assertWritesAllowed("operational_writes");

  const normalizedBody = body.trim();
  if (normalizedBody.length < 8) {
    throw new Error("Add a clearer instructor handoff note.");
  }

  const session = await getAccessibleSession(sessionId, viewer);
  const serviceClient = createSupabaseServiceClient();
  const noteId = createId("handoff");
  const createdAt = new Date().toISOString();
  const { error } = await serviceClient.from("session_handoff_notes").insert({
    id: noteId,
    session_id: session.id,
    author_id: viewer.id,
    body: normalizedBody,
    created_at: createdAt,
  });

  if (error) {
    throw new Error(error.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "session",
    action: "session_handoff_logged",
    summary: `${viewer.name} logged an instructor handoff note.`,
    details: {
      sessionId,
      noteId,
    },
  });

  return { noteId };
}

export async function persistAttendanceExceptionFlag({
  viewer,
  sessionId,
  studentId,
  flagType,
  note,
}: {
  viewer: User;
  sessionId: string;
  studentId: string;
  flagType: string;
  note: string;
}) {
  ensureServiceRole();
  assertTaVisibility(viewer);
  await assertWritesAllowed("operational_writes");

  const normalizedNote = note.trim();
  if (normalizedNote.length < 6) {
    throw new Error("Add a short note for the attendance exception.");
  }

  const session = await getAccessibleSession(sessionId, viewer);
  await assertStudentIsInSessionCohort({ session, studentId });

  const serviceClient = createSupabaseServiceClient();
  const flagId = createId("attendance-flag");
  const createdAt = new Date().toISOString();
  const { error } = await serviceClient.from("attendance_exception_flags").insert({
    id: flagId,
    session_id: session.id,
    student_id: studentId,
    flag_type: normalizeAttendanceExceptionFlagType(flagType),
    note: normalizedNote,
    created_by: viewer.id,
    created_at: createdAt,
  });

  if (error) {
    throw new Error(error.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "attendance",
    action: "attendance_exception_flagged",
    summary: `${viewer.name} flagged an attendance exception.`,
    details: {
      sessionId,
      studentId,
      flagId,
      flagType,
    },
  });

  return { flagId };
}

export async function persistSessionCoverageFlag({
  viewer,
  sessionId,
  status,
  note,
}: {
  viewer: User;
  sessionId: string;
  status: string;
  note: string;
}) {
  ensureServiceRole();
  assertTaVisibility(viewer);
  await assertWritesAllowed("operational_writes");

  const session = await getAccessibleSession(sessionId, viewer);
  const normalizedNote = note.trim();

  if (normalizedNote.length < 4) {
    throw new Error("Add a note for the coverage marker.");
  }

  const serviceClient = createSupabaseServiceClient();
  const now = new Date().toISOString();
  const { error } = await serviceClient.from("session_coverage_flags").upsert(
    {
      id: `coverage-${session.id}`,
      session_id: session.id,
      status: normalizeCoverageStatus(status),
      note: normalizedNote,
      updated_by: viewer.id,
      created_at: now,
      updated_at: now,
    },
    { onConflict: "session_id" },
  );

  if (error) {
    throw new Error(error.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "session",
    action: "session_coverage_flagged",
    summary: `${viewer.name} updated a session coverage marker.`,
    details: {
      sessionId,
      status,
    },
  });
}
