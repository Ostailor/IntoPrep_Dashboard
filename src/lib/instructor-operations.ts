import "server-only";

import { randomBytes } from "node:crypto";
import type { InstructorFollowUpTargetType, User } from "@/lib/domain";
import { viewerCanAccessCohort } from "@/lib/attendance";
import { recordAccountAuditLog } from "@/lib/account-governance";
import { assertWritesAllowed } from "@/lib/engineer-controls";
import {
  buildFallbackFollowUpReason,
  buildFallbackSessionNoteBody,
  isFallbackSessionNoteBody,
  isMissingSupabaseTableError,
} from "@/lib/instructor-fallbacks";
import type { Database } from "@/lib/supabase/database.types";
import { hasSupabaseServiceRole } from "@/lib/supabase/config";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type SessionRow = Database["public"]["Tables"]["sessions"]["Row"];
type EnrollmentRow = Database["public"]["Tables"]["enrollments"]["Row"];
type SessionInstructionNoteRow =
  Database["public"]["Tables"]["session_instruction_notes"]["Row"];
type SessionHandoffNoteRow =
  Database["public"]["Tables"]["session_handoff_notes"]["Row"];

function createId(prefix: string) {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}

function ensureServiceRole() {
  if (!hasSupabaseServiceRole()) {
    throw new Error("Supabase service-role access is required.");
  }
}

function assertInstructor(viewer: User) {
  if (viewer.role !== "instructor") {
    throw new Error("Instructor access is required.");
  }
}

function normalizeFollowUpTargetType(value: string): InstructorFollowUpTargetType {
  switch (value) {
    case "student":
    case "session":
      return value;
    default:
      throw new Error("Choose a valid follow-up target.");
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

async function getAccessibleStudentCohortId(studentId: string, viewer: User) {
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("enrollments")
    .select("*")
    .eq("student_id", studentId)
    .eq("status", "active");
  const enrollments = (data ?? []) as EnrollmentRow[];

  if (error) {
    throw new Error(error.message);
  }

  const accessibleEnrollment = enrollments.find((enrollment) =>
    viewerCanAccessCohort(viewer, enrollment.cohort_id),
  );

  if (!accessibleEnrollment) {
    throw new Error("You do not have access to that student.");
  }

  return accessibleEnrollment.cohort_id;
}

export async function persistSessionInstructionNote({
  viewer,
  noteId,
  sessionId,
  body,
}: {
  viewer: User;
  noteId?: string;
  sessionId: string;
  body: string;
}) {
  ensureServiceRole();
  assertInstructor(viewer);
  await assertWritesAllowed("operational_writes");

  const normalizedBody = body.trim();
  if (normalizedBody.length < 8) {
    throw new Error("Add a more complete instructional note.");
  }

  const session = await getAccessibleSession(sessionId, viewer);
  const serviceClient = createSupabaseServiceClient();
  const now = new Date().toISOString();

  if (noteId) {
    const { data, error } = await serviceClient
      .from("session_instruction_notes")
      .select("*")
      .eq("id", noteId)
      .maybeSingle();
    const existing = (data ?? null) as SessionInstructionNoteRow | null;

    if (error && !isMissingSupabaseTableError(error)) {
      throw new Error(error.message);
    }

    if (existing) {
      if (existing.session_id !== session.id) {
        throw new Error("That session note could not be found.");
      }

      if (existing.author_id !== viewer.id) {
        throw new Error("You can only edit your own session notes.");
      }

      const { error: updateError } = await serviceClient
        .from("session_instruction_notes")
        .update({
          body: normalizedBody,
          updated_at: now,
        })
        .eq("id", noteId);

      if (updateError) {
        throw new Error(updateError.message);
      }
    } else {
      const { data: fallbackData, error: fallbackError } = await serviceClient
        .from("session_handoff_notes")
        .select("*")
        .eq("id", noteId)
        .maybeSingle();
      const fallbackExisting = (fallbackData ?? null) as SessionHandoffNoteRow | null;

      if (fallbackError) {
        throw new Error(fallbackError.message);
      }

      if (
        !fallbackExisting ||
        fallbackExisting.session_id !== session.id ||
        fallbackExisting.author_id !== viewer.id ||
        !isFallbackSessionNoteBody(fallbackExisting.body)
      ) {
        throw new Error("That session note could not be found.");
      }

      const { error: fallbackUpdateError } = await serviceClient
        .from("session_handoff_notes")
        .update({
          body: buildFallbackSessionNoteBody(normalizedBody),
        })
        .eq("id", noteId);

      if (fallbackUpdateError) {
        throw new Error(fallbackUpdateError.message);
      }
    }

    await recordAccountAuditLog(serviceClient, {
      actorId: viewer.id,
      targetType: "session",
      action: "session_instruction_note_saved",
      summary: `${viewer.name} updated an instructional session note.`,
      details: {
        sessionId,
        noteId,
      },
    });

    return { noteId };
  }

  const createdNoteId = createId("session-note");
  const { error } = await serviceClient.from("session_instruction_notes").insert({
    id: createdNoteId,
    session_id: session.id,
    author_id: viewer.id,
    body: normalizedBody,
    created_at: now,
    updated_at: now,
  });

  if (error && !isMissingSupabaseTableError(error)) {
    throw new Error(error.message);
  }

  if (isMissingSupabaseTableError(error)) {
    const { error: fallbackError } = await serviceClient.from("session_handoff_notes").insert({
      id: createdNoteId,
      session_id: session.id,
      author_id: viewer.id,
      body: buildFallbackSessionNoteBody(normalizedBody),
      created_at: now,
    });

    if (fallbackError) {
      throw new Error(fallbackError.message);
    }
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "session",
    action: "session_instruction_note_saved",
    summary: `${viewer.name} logged an instructional session note.`,
    details: {
      sessionId,
      noteId: createdNoteId,
    },
  });

  return { noteId: createdNoteId };
}

export async function persistInstructorFollowUpFlag({
  viewer,
  targetType,
  targetId,
  summary,
  note,
}: {
  viewer: User;
  targetType: string;
  targetId: string;
  summary: string;
  note?: string | null;
}) {
  ensureServiceRole();
  assertInstructor(viewer);
  await assertWritesAllowed("operational_writes");

  const normalizedSummary = summary.trim();
  const normalizedNote = note?.trim() ? note.trim() : null;

  if (normalizedSummary.length < 4) {
    throw new Error("Add a short follow-up summary.");
  }

  const normalizedTargetType = normalizeFollowUpTargetType(targetType);
  const cohortId =
    normalizedTargetType === "student"
      ? await getAccessibleStudentCohortId(targetId, viewer)
      : (await getAccessibleSession(targetId, viewer)).cohort_id;

  const serviceClient = createSupabaseServiceClient();
  const flagId = createId("instructor-flag");
  const createdAt = new Date().toISOString();

  const { error } = await serviceClient.from("instructor_follow_up_flags").insert({
    id: flagId,
    target_type: normalizedTargetType,
    target_id: targetId,
    cohort_id: cohortId,
    summary: normalizedSummary,
    note: normalizedNote,
    created_by: viewer.id,
    created_at: createdAt,
    status: "open",
  });

  if (error && !isMissingSupabaseTableError(error)) {
    throw new Error(error.message);
  }

  if (isMissingSupabaseTableError(error)) {
    const fallbackSourceType = normalizedTargetType === "session" ? "session" : "cohort";
    const { error: fallbackError } = await serviceClient.from("admin_escalations").insert({
      id: flagId,
      source_type: fallbackSourceType,
      source_id: targetId,
      reason: buildFallbackFollowUpReason(normalizedTargetType, normalizedSummary),
      handoff_note: normalizedNote,
      created_by: viewer.id,
      created_at: createdAt,
      status: "open",
    });

    if (fallbackError) {
      throw new Error(fallbackError.message);
    }
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: normalizedTargetType,
    action: "instructor_follow_up_flag_created",
    summary: `${viewer.name} created an instructional follow-up flag.`,
    details: {
      flagId,
      targetType: normalizedTargetType,
      targetId,
      cohortId,
    },
  });

  return { flagId };
}
