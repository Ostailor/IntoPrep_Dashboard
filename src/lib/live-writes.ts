import "server-only";

import { randomBytes } from "node:crypto";
import type { User } from "@/lib/domain";
import { viewerCanAccessCohort } from "@/lib/attendance";
import { recordAccountAuditLog } from "@/lib/account-governance";
import { assertWritesAllowed } from "@/lib/engineer-controls";
import {
  canManageCohortAssignments,
  getPermissionProfile,
} from "@/lib/permissions";
import type { Database } from "@/lib/supabase/database.types";
import { hasSupabaseServiceRole } from "@/lib/supabase/config";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type AssessmentRow = Database["public"]["Tables"]["assessments"]["Row"];
type AssessmentResultRow = Database["public"]["Tables"]["assessment_results"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type ThreadRow = Database["public"]["Tables"]["message_threads"]["Row"];
type CohortRow = Database["public"]["Tables"]["cohorts"]["Row"];

export const RESOURCE_BUCKET_NAME = "portal-resources";

function createId(prefix: string) {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}

function normalizeResourceKind(value: string) {
  switch (value) {
    case "Worksheet":
    case "Deck":
    case "Replay":
      return value;
    default:
      throw new Error("Invalid resource kind.");
  }
}

function normalizeSectionScores(
  value: unknown,
): { label: string; score: number }[] {
  if (!Array.isArray(value)) {
    throw new Error("Section scores must be an array.");
  }

  const normalized = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const label = "label" in entry && typeof entry.label === "string" ? entry.label.trim() : "";
    const score = "score" in entry && typeof entry.score === "number" ? entry.score : null;

    if (label.length === 0 || score === null || Number.isNaN(score)) {
      return [];
    }

    return [{ label, score }];
  });

  if (normalized.length === 0) {
    throw new Error("At least one section score is required.");
  }

  return normalized;
}

async function ensureResourceBucket() {
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient.storage.listBuckets();

  if (error) {
    throw new Error(error.message);
  }

  const exists = (data ?? []).some((bucket) => bucket.name === RESOURCE_BUCKET_NAME);

  if (!exists) {
    const { error: createError } = await serviceClient.storage.createBucket(
      RESOURCE_BUCKET_NAME,
      {
        public: false,
        fileSizeLimit: 20 * 1024 * 1024,
      },
    );

    if (createError && !createError.message.toLowerCase().includes("already exists")) {
      throw new Error(createError.message);
    }
  }
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

async function getActiveStudentCohortIds(studentId: string) {
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("enrollments")
    .select("cohort_id")
    .eq("student_id", studentId)
    .eq("status", "active");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => row.cohort_id);
}

export async function persistAcademicNote({
  viewer,
  noteId,
  studentId,
  summary,
}: {
  viewer: User;
  noteId?: string;
  studentId: string;
  summary: string;
}) {
  if (!hasSupabaseServiceRole()) {
    throw new Error("Supabase service role is not configured.");
  }

  if (!getPermissionProfile(viewer.role).canWriteAcademicNotes) {
    throw new Error("You cannot write academic notes.");
  }

  await assertWritesAllowed("operational_writes");

  const normalizedSummary = summary.trim();

  if (normalizedSummary.length < 8) {
    throw new Error("Add a more complete coaching note.");
  }

  const cohortIds = await getActiveStudentCohortIds(studentId);

  if (!cohortIds.some((cohortId) => viewerCanAccessCohort(viewer, cohortId))) {
    throw new Error("You do not have access to that student.");
  }

  const serviceClient = createSupabaseServiceClient();

  if (noteId) {
    const { data: noteData, error: noteError } = await serviceClient
      .from("academic_notes")
      .select("id, student_id, author_id")
      .eq("id", noteId)
      .maybeSingle();

    if (noteError) {
      throw new Error(noteError.message);
    }

    if (!noteData || noteData.student_id !== studentId) {
      throw new Error("That note could not be found.");
    }

    if (viewer.role === "instructor" && noteData.author_id !== viewer.id) {
      throw new Error("Instructors can only edit their own instructional notes.");
    }

    const { error: updateError } = await serviceClient
      .from("academic_notes")
      .update({
        summary: normalizedSummary,
      })
      .eq("id", noteId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return { noteId };
  }

  const createdNoteId = createId("note");
  const { error } = await serviceClient.from("academic_notes").insert({
    id: createdNoteId,
    student_id: studentId,
    author_id: viewer.id,
    visibility: "internal",
    summary: normalizedSummary,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { noteId: createdNoteId };
}

export async function persistResource({
  viewer,
  cohortId,
  title,
  kind,
  linkUrl,
  file,
}: {
  viewer: User;
  cohortId: string;
  title: string;
  kind: string;
  linkUrl?: string | null;
  file?: File | null;
}) {
  if (!hasSupabaseServiceRole()) {
    throw new Error("Supabase service role is not configured.");
  }

  if (!getPermissionProfile(viewer.role).canPublishResources) {
    throw new Error("You cannot publish cohort resources.");
  }

  await assertWritesAllowed("operational_writes");

  if (!viewerCanAccessCohort(viewer, cohortId)) {
    throw new Error("You do not have access to that cohort.");
  }

  const normalizedTitle = title.trim();
  const normalizedKind = normalizeResourceKind(kind);
  const normalizedLinkUrl = linkUrl?.trim() ? linkUrl.trim() : null;

  if (normalizedTitle.length < 3) {
    throw new Error("Resource title is required.");
  }

  const serviceClient = createSupabaseServiceClient();
  const resourceId = createId("resource");
  let fileName: string | null = null;
  let storagePath: string | null = null;

  if (file && file.size > 0) {
    await ensureResourceBucket();
    fileName = sanitizeFileName(file.name);
    storagePath = `${cohortId}/${Date.now()}-${fileName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await serviceClient.storage
      .from(RESOURCE_BUCKET_NAME)
      .upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }
  }

  const { error } = await serviceClient.from("resources").insert({
    id: resourceId,
    cohort_id: cohortId,
    title: normalizedTitle,
    kind: normalizedKind,
    link_url: normalizedLinkUrl,
    file_name: fileName,
    storage_path: storagePath,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { resourceId };
}

function parseAssessmentSections(assessment: AssessmentRow) {
  if (!Array.isArray(assessment.sections)) {
    return [];
  }

  return assessment.sections.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    return typeof entry.label === "string" ? [entry.label] : [];
  });
}

export async function persistAssessmentResult({
  viewer,
  assessmentId,
  studentId,
  totalScore,
  sectionScores,
}: {
  viewer: User;
  assessmentId: string;
  studentId: string;
  totalScore: number;
  sectionScores: unknown;
}) {
  if (!hasSupabaseServiceRole()) {
    throw new Error("Supabase service role is not configured.");
  }

  if (!getPermissionProfile(viewer.role).canManageScores) {
    throw new Error("You cannot manage scores.");
  }

  await assertWritesAllowed("operational_writes");

  if (!Number.isFinite(totalScore)) {
    throw new Error("Total score must be numeric.");
  }

  const normalizedSectionScores = normalizeSectionScores(sectionScores);
  const serviceClient = createSupabaseServiceClient();
  const { data: assessmentData, error: assessmentError } = await serviceClient
    .from("assessments")
    .select("*")
    .eq("id", assessmentId)
    .maybeSingle();
  const assessment = (assessmentData ?? null) as AssessmentRow | null;

  if (assessmentError) {
    throw new Error(assessmentError.message);
  }

  if (!assessment || !viewerCanAccessCohort(viewer, assessment.cohort_id)) {
    throw new Error("You do not have access to that assessment.");
  }

  const { data: enrollmentData, error: enrollmentError } = await serviceClient
    .from("enrollments")
    .select("id")
    .eq("cohort_id", assessment.cohort_id)
    .eq("student_id", studentId)
    .eq("status", "active")
    .maybeSingle();

  if (enrollmentError) {
    throw new Error(enrollmentError.message);
  }

  if (!enrollmentData) {
    throw new Error("That student is not actively enrolled in this cohort.");
  }

  const assessmentLabels = parseAssessmentSections(assessment);
  const invalidLabels = normalizedSectionScores.filter(
    (entry) => !assessmentLabels.includes(entry.label),
  );

  if (invalidLabels.length > 0) {
    throw new Error("Section labels do not match the assessment.");
  }

  const { data: cohortAssessmentsData, error: cohortAssessmentsError } = await serviceClient
    .from("assessments")
    .select("id, date")
    .eq("cohort_id", assessment.cohort_id);

  if (cohortAssessmentsError) {
    throw new Error(cohortAssessmentsError.message);
  }

  const cohortAssessments = (cohortAssessmentsData ?? []) as Pick<
    AssessmentRow,
    "id" | "date"
  >[];
  const previousAssessmentIds = cohortAssessments
    .filter(
      (candidate) =>
        candidate.id !== assessment.id &&
        candidate.date.localeCompare(assessment.date) < 0,
    )
    .sort((left, right) => right.date.localeCompare(left.date))
    .map((candidate) => candidate.id);

  let previousTotal = 0;

  if (previousAssessmentIds.length > 0) {
    const { data: previousResultsData, error: previousResultsError } =
      await serviceClient
        .from("assessment_results")
        .select("assessment_id, total_score")
        .eq("student_id", studentId)
        .in("assessment_id", previousAssessmentIds);

    if (previousResultsError) {
      throw new Error(previousResultsError.message);
    }

    const previousResults = (previousResultsData ?? []) as Pick<
      AssessmentResultRow,
      "assessment_id" | "total_score"
    >[];
    const previousResult = previousAssessmentIds
      .map((candidateId) =>
        previousResults.find((result) => result.assessment_id === candidateId),
      )
      .find((entry) => entry !== undefined);

    previousTotal = previousResult?.total_score ?? 0;
  }

  const deltaFromPrevious = totalScore - previousTotal;
  const resultId = `${assessmentId}:${studentId}`;
  const { error } = await serviceClient.from("assessment_results").upsert(
    {
      id: resultId,
      assessment_id: assessmentId,
      student_id: studentId,
      total_score: Math.round(totalScore),
      section_scores: normalizedSectionScores,
      delta_from_previous: deltaFromPrevious,
    },
    { onConflict: "assessment_id,student_id" },
  );

  if (error) {
    throw new Error(error.message);
  }

  return {
    resultId,
    deltaFromPrevious,
  };
}

export async function persistMessageReply({
  viewer,
  threadId,
  body,
}: {
  viewer: User;
  threadId: string;
  body: string;
}) {
  if (!hasSupabaseServiceRole()) {
    throw new Error("Supabase service role is not configured.");
  }

  if (!getPermissionProfile(viewer.role).canMessageFamilies) {
    throw new Error("You cannot reply to family threads.");
  }

  await assertWritesAllowed("operational_writes");

  const normalizedBody = body.trim();

  if (normalizedBody.length < 3) {
    throw new Error("Reply body is required.");
  }

  const serviceClient = createSupabaseServiceClient();
  const { data: threadData, error: threadError } = await serviceClient
    .from("message_threads")
    .select("*")
    .eq("id", threadId)
    .maybeSingle();
  const thread = (threadData ?? null) as ThreadRow | null;

  if (threadError) {
    throw new Error(threadError.message);
  }

  if (!thread || !viewerCanAccessCohort(viewer, thread.cohort_id)) {
    throw new Error("You do not have access to that thread.");
  }

  const postId = createId("post");
  const participants = thread.participants.includes(viewer.name)
    ? thread.participants
    : [...thread.participants, viewer.name];

  const [postInsert, threadUpdate] = await Promise.all([
    serviceClient.from("message_posts").insert({
      id: postId,
      thread_id: threadId,
      author_id: viewer.id,
      body: normalizedBody,
    }),
    serviceClient
      .from("message_threads")
      .update({
        participants,
        last_message_preview: normalizedBody.slice(0, 180),
        last_message_at: new Date().toISOString(),
        unread_count: 0,
      })
      .eq("id", threadId),
  ]);

  if (postInsert.error) {
    throw new Error(postInsert.error.message);
  }

  if (threadUpdate.error) {
    throw new Error(threadUpdate.error.message);
  }

  return { postId };
}

function unique(items: string[]) {
  return Array.from(new Set(items));
}

export async function persistCohortAssignments({
  viewer,
  targetUserId,
  cohortIds,
}: {
  viewer: User;
  targetUserId: string;
  cohortIds: string[];
}) {
  if (!hasSupabaseServiceRole()) {
    throw new Error("Supabase service role is not configured.");
  }

  const permissionProfile = getPermissionProfile(viewer.role);

  if (!permissionProfile.canManageRoles) {
    throw new Error("You cannot manage cohort assignments.");
  }

  await assertWritesAllowed("operational_writes");

  if (targetUserId === viewer.id) {
    throw new Error("You cannot edit your own cohort assignments.");
  }

  const serviceClient = createSupabaseServiceClient();
  const { data: targetProfileData, error: targetProfileError } = await serviceClient
    .from("profiles")
    .select("*")
    .eq("id", targetUserId)
    .maybeSingle();
  const targetProfile = (targetProfileData ?? null) as ProfileRow | null;

  if (targetProfileError) {
    throw new Error(targetProfileError.message);
  }

  if (!targetProfile) {
    throw new Error("That user profile could not be found.");
  }

  if (!canManageCohortAssignments(viewer.role, targetProfile.role)) {
    throw new Error("You cannot manage assignments for that role.");
  }

  const normalizedCohortIds = unique(cohortIds.filter((item) => item.trim().length > 0));
  const { data: cohortData, error: cohortError } = await serviceClient
    .from("cohorts")
    .select("id, name")
    .in("id", normalizedCohortIds.length > 0 ? normalizedCohortIds : ["__none__"]);
  const matchedCohorts = (cohortData ?? []) as Pick<CohortRow, "id" | "name">[];

  if (cohortError) {
    throw new Error(cohortError.message);
  }

  if (normalizedCohortIds.length !== matchedCohorts.length) {
    throw new Error("One or more selected cohorts are invalid.");
  }

  const { error: deleteError } = await serviceClient
    .from("cohort_assignments")
    .delete()
    .eq("user_id", targetUserId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (normalizedCohortIds.length > 0) {
    const { error: insertError } = await serviceClient.from("cohort_assignments").insert(
      normalizedCohortIds.map((cohortId) => ({
        cohort_id: cohortId,
        user_id: targetUserId,
        role: targetProfile.role,
      })),
    );

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  if (targetProfile.email) {
    const { error: templateError } = await serviceClient
      .from("user_templates")
      .update({ assigned_cohort_ids: normalizedCohortIds })
      .eq("email", targetProfile.email.toLowerCase());

    if (templateError) {
      throw new Error(templateError.message);
    }
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetUserId,
    targetEmail: targetProfile.email,
    targetType: "account",
    action: "role_updated",
    summary: `${viewer.name} updated cohort assignments for ${targetProfile.email ?? targetUserId}.`,
    details: {
      assignedCohortIds: normalizedCohortIds,
      role: targetProfile.role,
    },
  });

  return { cohortIds: normalizedCohortIds };
}
