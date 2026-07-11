import "server-only";

import { randomBytes } from "node:crypto";
import type { User } from "@/lib/domain";
import { viewerCanAccessCohort } from "@/lib/attendance";
import { recordAccountAuditLog } from "@/lib/account-governance";
import { getDemoPartition, isSameDemoPartition } from "@/lib/demo-partition";
import { assertWritesAllowed } from "@/lib/engineer-controls";
import { hasSupabaseServiceRole } from "@/lib/supabase/config";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/database.types";

type SessionRow = Database["public"]["Tables"]["sessions"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type InstructionBlockRow = Database["public"]["Tables"]["session_instruction_blocks"]["Row"];

function createId() {
  return `instruction-block-${randomBytes(6).toString("hex")}`;
}

function ensureServiceRole() {
  if (!hasSupabaseServiceRole()) {
    throw new Error("Supabase service-role access is required.");
  }
}

function assertCanManageInstructionBlocks(viewer: User) {
  if (viewer.role !== "admin" && viewer.role !== "staff" && viewer.role !== "ta") {
    throw new Error("You cannot edit class teaching schedules.");
  }
}

function normalizeRequiredText(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

function normalizeDateTime(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new Error(`${label} is required.`);
  }

  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    throw new Error(`${label} must be a valid time.`);
  }

  return new Date(timestamp).toISOString();
}

function assertWithinSessionWindow(session: SessionRow, startAt: string, endAt: string) {
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  const sessionStart = Date.parse(session.start_at);
  const sessionEnd = Date.parse(session.end_at);

  if (start >= end) {
    throw new Error("The teaching segment must end after it starts.");
  }

  if (start < sessionStart || end > sessionEnd) {
    throw new Error("The teaching segment must stay inside the selected class start and end time.");
  }
}

export async function persistSessionInstructionBlock({
  viewer,
  blockId,
  sessionId,
  instructorId,
  title,
  startAt,
  endAt,
}: {
  viewer: User;
  blockId?: string | null;
  sessionId: unknown;
  instructorId: unknown;
  title: unknown;
  startAt: unknown;
  endAt: unknown;
}) {
  ensureServiceRole();
  assertCanManageInstructionBlocks(viewer);
  await assertWritesAllowed("operational_writes");

  const normalizedSessionId = normalizeRequiredText(sessionId, "Class");
  const normalizedInstructorId = normalizeRequiredText(instructorId, "Instructor");
  const normalizedTitle = normalizeRequiredText(title, "Teaching topic");
  const normalizedStartAt = normalizeDateTime(startAt, "Start time");
  const normalizedEndAt = normalizeDateTime(endAt, "End time");
  const serviceClient = createSupabaseServiceClient();

  const [{ data: sessionData, error: sessionError }, { data: instructorData, error: instructorError }] =
    await Promise.all([
      serviceClient.from("sessions").select("*").eq("id", normalizedSessionId).maybeSingle(),
      serviceClient.from("profiles").select("*").eq("id", normalizedInstructorId).maybeSingle(),
    ]);
  const session = (sessionData ?? null) as SessionRow | null;
  const instructor = (instructorData ?? null) as ProfileRow | null;

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (instructorError) {
    throw new Error(instructorError.message);
  }

  if (!session || !viewerCanAccessCohort(viewer, session.cohort_id) || !isSameDemoPartition(viewer, session)) {
    throw new Error("That class could not be found.");
  }

  if (
    !instructor ||
    instructor.account_status !== "active" ||
    !["admin", "staff", "ta", "instructor"].includes(instructor.role) ||
    !isSameDemoPartition(viewer, instructor)
  ) {
    throw new Error("That instructor could not be found.");
  }

  assertWithinSessionWindow(session, normalizedStartAt, normalizedEndAt);

  const now = new Date().toISOString();
  const normalizedBlockId =
    typeof blockId === "string" && blockId.trim().length > 0 ? blockId.trim() : createId();
  const existingBlock =
    blockId && typeof blockId === "string"
      ? await serviceClient
          .from("session_instruction_blocks")
          .select("*")
          .eq("id", normalizedBlockId)
          .maybeSingle()
      : { data: null, error: null };

  if (existingBlock.error) {
    throw new Error(existingBlock.error.message);
  }

  const existingRow = (existingBlock.data ?? null) as InstructionBlockRow | null;

  if (existingRow && existingRow.session_id !== normalizedSessionId) {
    throw new Error("That teaching segment does not belong to the selected class.");
  }

  const payload = {
    id: normalizedBlockId,
    session_id: normalizedSessionId,
    instructor_id: normalizedInstructorId,
    title: normalizedTitle,
    start_at: normalizedStartAt,
    end_at: normalizedEndAt,
    created_by: existingRow?.created_by ?? viewer.id,
    created_at: existingRow?.created_at ?? now,
    updated_at: now,
    demo: getDemoPartition(viewer),
  };

  const { error } = await serviceClient.from("session_instruction_blocks").upsert(payload);

  if (error) {
    throw new Error(error.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "session",
    action: "cohort_operation_run",
    summary: `${viewer.name} updated a class teaching schedule.`,
    details: {
      blockId: normalizedBlockId,
      sessionId: normalizedSessionId,
      instructorId: normalizedInstructorId,
      title: normalizedTitle,
    },
  });

  return { blockId: normalizedBlockId };
}

export async function deleteSessionInstructionBlock({
  viewer,
  blockId,
}: {
  viewer: User;
  blockId: unknown;
}) {
  ensureServiceRole();
  assertCanManageInstructionBlocks(viewer);
  await assertWritesAllowed("operational_writes");

  const normalizedBlockId = normalizeRequiredText(blockId, "Teaching segment");
  const serviceClient = createSupabaseServiceClient();
  const { data: blockData, error: blockError } = await serviceClient
    .from("session_instruction_blocks")
    .select("*")
    .eq("id", normalizedBlockId)
    .maybeSingle();
  const block = (blockData ?? null) as InstructionBlockRow | null;

  if (blockError) {
    throw new Error(blockError.message);
  }

  if (!block || !isSameDemoPartition(viewer, block)) {
    throw new Error("That teaching segment could not be found.");
  }

  const { data: sessionData, error: sessionError } = await serviceClient
    .from("sessions")
    .select("*")
    .eq("id", block.session_id)
    .maybeSingle();
  const session = (sessionData ?? null) as SessionRow | null;

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (!session || !viewerCanAccessCohort(viewer, session.cohort_id) || !isSameDemoPartition(viewer, session)) {
    throw new Error("That teaching segment could not be found.");
  }

  const { error: deleteError } = await serviceClient
    .from("session_instruction_blocks")
    .delete()
    .eq("id", normalizedBlockId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "session",
    action: "cohort_operation_run",
    summary: `${viewer.name} removed a class teaching segment.`,
    details: {
      blockId: normalizedBlockId,
      sessionId: block.session_id,
    },
  });
}
