import "server-only";

import { randomBytes } from "node:crypto";
import type { ProgramTrack, User } from "@/lib/domain";
import { viewerCanAccessCohort } from "@/lib/attendance";
import { recordAccountAuditLog } from "@/lib/account-governance";
import { getDemoPartition, isSameDemoPartition } from "@/lib/demo-partition";
import { assertWritesAllowed } from "@/lib/engineer-controls";
import { canMoveSingleEnrollment, getPermissionProfile } from "@/lib/permissions";
import { moveSingleEnrollment } from "@/lib/staff-operations";
import type { Database } from "@/lib/supabase/database.types";
import { hasSupabaseServiceRole } from "@/lib/supabase/config";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { persistAssessmentResult } from "@/lib/live-writes";

type CampusRow = Database["public"]["Tables"]["campuses"]["Row"];
type CohortRow = Database["public"]["Tables"]["cohorts"]["Row"];
type FamilyRow = Database["public"]["Tables"]["families"]["Row"];
type StudentRow = Database["public"]["Tables"]["students"]["Row"];
type AssessmentRow = Database["public"]["Tables"]["assessments"]["Row"];

function createId(prefix: string) {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}

function ensureServiceRole() {
  if (!hasSupabaseServiceRole()) {
    throw new Error("Supabase service-role access is required.");
  }
}

function assertStudentDirectoryEditor(viewer: User) {
  if (viewer.role !== "admin" && viewer.role !== "staff") {
    throw new Error("You cannot edit the student directory.");
  }
}

function requiredText(value: unknown, label: string) {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function optionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTrack(value: unknown): ProgramTrack {
  switch (value) {
    case "SAT":
    case "ACT":
    case "Admissions":
    case "Support":
      return value;
    default:
      throw new Error("Choose a valid target test.");
  }
}

function getAssessmentLabels(assessment: AssessmentRow) {
  return Array.isArray(assessment.sections)
    ? assessment.sections.flatMap((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return [];
        }

        return "label" in entry && typeof entry.label === "string" ? [entry.label] : [];
      })
    : [];
}

async function getDefaultCampusId() {
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("campuses")
    .select("*")
    .order("name", { ascending: true })
    .limit(1)
    .maybeSingle();
  const campus = (data ?? null) as CampusRow | null;

  if (error) {
    throw new Error(error.message);
  }

  if (!campus) {
    throw new Error("Create a campus before adding students.");
  }

  return campus.id;
}

export async function upsertStudentDirectoryRecord({
  viewer,
  studentId,
  firstName,
  lastName,
  gradeLevel,
  school,
  targetTest,
  focus,
  guardianName,
  familyEmail,
  familyPhone,
  familyNotes,
}: {
  viewer: User;
  studentId?: string | null;
  firstName: unknown;
  lastName: unknown;
  gradeLevel: unknown;
  school: unknown;
  targetTest: unknown;
  focus: unknown;
  guardianName: unknown;
  familyEmail: unknown;
  familyPhone: unknown;
  familyNotes?: unknown;
}) {
  ensureServiceRole();
  assertStudentDirectoryEditor(viewer);
  await assertWritesAllowed("operational_writes");

  const normalizedStudent = {
    firstName: requiredText(firstName, "First name"),
    lastName: requiredText(lastName, "Last name"),
    gradeLevel: requiredText(gradeLevel, "Grade"),
    school: requiredText(school, "School"),
    targetTest: normalizeTrack(targetTest),
    focus: requiredText(focus, "Focus"),
  };
  const normalizedFamily = {
    guardianName: requiredText(guardianName, "Guardian name"),
    email: requiredText(familyEmail, "Family email"),
    phone: requiredText(familyPhone, "Family phone"),
    notes: optionalText(familyNotes),
  };
  const serviceClient = createSupabaseServiceClient();
  const demo = getDemoPartition(viewer);
  const existingStudentResult = studentId
    ? await serviceClient.from("students").select("*").eq("id", studentId).maybeSingle()
    : { data: null, error: null };
  const existingStudent = (existingStudentResult.data ?? null) as StudentRow | null;

  if (existingStudentResult.error) {
    throw new Error(existingStudentResult.error.message);
  }

  if (studentId && (!existingStudent || !isSameDemoPartition(viewer, existingStudent))) {
    throw new Error("That student could not be found.");
  }

  const familyId = existingStudent?.family_id ?? createId("family");
  const resolvedStudentId = existingStudent?.id ?? createId("student");

  if (existingStudent) {
    const { data: familyData, error: familyError } = await serviceClient
      .from("families")
      .select("*")
      .eq("id", existingStudent.family_id)
      .maybeSingle();
    const family = (familyData ?? null) as FamilyRow | null;

    if (familyError) {
      throw new Error(familyError.message);
    }

    if (!family || !isSameDemoPartition(viewer, family)) {
      throw new Error("That family could not be found.");
    }
  }

  if (!existingStudent) {
    const defaultCampusId = await getDefaultCampusId();
    const { error: familyInsertError } = await serviceClient.from("families").insert({
      id: familyId,
      family_name: `${normalizedStudent.lastName} family`,
      guardian_names: [normalizedFamily.guardianName],
      email: normalizedFamily.email,
      phone: normalizedFamily.phone,
      preferred_campus_id: defaultCampusId,
      notes: normalizedFamily.notes,
      demo,
    });

    if (familyInsertError) {
      throw new Error(familyInsertError.message);
    }
  } else {
    const { error: familyUpdateError } = await serviceClient
      .from("families")
      .update({
        family_name: `${normalizedStudent.lastName} family`,
        guardian_names: [normalizedFamily.guardianName],
        email: normalizedFamily.email,
        phone: normalizedFamily.phone,
        notes: normalizedFamily.notes,
      })
      .eq("id", familyId);

    if (familyUpdateError) {
      throw new Error(familyUpdateError.message);
    }
  }

  const studentPayload = {
    family_id: familyId,
    first_name: normalizedStudent.firstName,
    last_name: normalizedStudent.lastName,
    grade_level: normalizedStudent.gradeLevel,
    school: normalizedStudent.school,
    target_test: normalizedStudent.targetTest,
    focus: normalizedStudent.focus,
    demo,
  };

  const studentWrite = existingStudent
    ? await serviceClient.from("students").update(studentPayload).eq("id", resolvedStudentId)
    : await serviceClient.from("students").insert({
        id: resolvedStudentId,
        ...studentPayload,
      });

  if (studentWrite.error) {
    throw new Error(studentWrite.error.message);
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.id,
    targetType: "student",
    action: "bulk_operation_run",
    summary: `${viewer.name} ${existingStudent ? "updated" : "created"} ${normalizedStudent.firstName} ${normalizedStudent.lastName}.`,
    details: {
      studentId: resolvedStudentId,
      familyId,
    },
  });

  return { studentId: resolvedStudentId, familyId };
}

export async function bulkAssignStudentsToCohort({
  viewer,
  studentIds,
  targetCohortId,
}: {
  viewer: User;
  studentIds: unknown;
  targetCohortId: unknown;
}) {
  ensureServiceRole();

  if (!canMoveSingleEnrollment(viewer.role)) {
    throw new Error("You cannot move enrollments.");
  }

  const normalizedTargetCohortId = requiredText(targetCohortId, "Target cohort");
  const normalizedStudentIds = Array.isArray(studentIds)
    ? Array.from(new Set(studentIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)))
    : [];

  if (normalizedStudentIds.length === 0) {
    throw new Error("Choose at least one student.");
  }

  const results = {
    assigned: 0,
    skipped: 0,
  };

  for (const studentId of normalizedStudentIds) {
    try {
      await moveSingleEnrollment({
        viewer,
        studentId,
        targetCohortId: normalizedTargetCohortId,
      });
      results.assigned += 1;
    } catch (error) {
      if (error instanceof Error && error.message.includes("already")) {
        results.skipped += 1;
      } else {
        throw error;
      }
    }
  }

  return results;
}

export async function persistStudentDirectoryScore({
  viewer,
  studentId,
  cohortId,
  testTitle,
  testDate,
  rwScore,
  mathScore,
  totalScore,
}: {
  viewer: User;
  studentId: unknown;
  cohortId: unknown;
  testTitle: unknown;
  testDate: unknown;
  rwScore: unknown;
  mathScore: unknown;
  totalScore: unknown;
}) {
  ensureServiceRole();

  if (!getPermissionProfile(viewer.role).canManageScores) {
    throw new Error("You cannot manage scores.");
  }

  await assertWritesAllowed("operational_writes");

  const normalizedStudentId = requiredText(studentId, "Student");
  const normalizedCohortId = requiredText(cohortId, "Cohort");
  const normalizedTitle = requiredText(testTitle, "Test");
  const normalizedDate = requiredText(testDate, "Date");
  const normalizedRw = Number(rwScore);
  const normalizedMath = Number(mathScore);
  const normalizedTotal = Number(totalScore);

  if (!Number.isFinite(normalizedRw) || !Number.isFinite(normalizedMath) || !Number.isFinite(normalizedTotal)) {
    throw new Error("Scores must be numeric.");
  }

  if (!viewerCanAccessCohort(viewer, normalizedCohortId)) {
    throw new Error("You do not have access to that cohort.");
  }

  const serviceClient = createSupabaseServiceClient();
  const { data: cohortData, error: cohortError } = await serviceClient
    .from("cohorts")
    .select("*")
    .eq("id", normalizedCohortId)
    .maybeSingle();
  const cohort = (cohortData ?? null) as CohortRow | null;

  if (cohortError) {
    throw new Error(cohortError.message);
  }

  if (!cohort || !isSameDemoPartition(viewer, cohort)) {
    throw new Error("That cohort could not be found.");
  }

  const { data: existingAssessmentData, error: existingAssessmentError } = await serviceClient
    .from("assessments")
    .select("*")
    .eq("cohort_id", normalizedCohortId)
    .eq("date", normalizedDate)
    .eq("title", normalizedTitle)
    .maybeSingle();
  let assessment = (existingAssessmentData ?? null) as AssessmentRow | null;

  if (existingAssessmentError) {
    throw new Error(existingAssessmentError.message);
  }

  if (!assessment) {
    const assessmentId = createId("assessment");
    const { data: createdAssessmentData, error: createAssessmentError } = await serviceClient
      .from("assessments")
      .insert({
        id: assessmentId,
        cohort_id: normalizedCohortId,
        title: normalizedTitle,
        date: normalizedDate,
        sections: [
          { label: "RW", score: 800 },
          { label: "Math", score: 800 },
        ],
        demo: getDemoPartition(viewer),
      })
      .select("*")
      .maybeSingle();

    if (createAssessmentError) {
      throw new Error(createAssessmentError.message);
    }

    assessment = (createdAssessmentData ?? null) as AssessmentRow | null;
  }

  if (!assessment) {
    throw new Error("Unable to create assessment.");
  }

  const assessmentLabels = getAssessmentLabels(assessment);
  const rwLabel =
    assessmentLabels.find((label) => ["rw", "reading", "reading/writing"].includes(label.toLowerCase())) ??
    "RW";
  const mathLabel =
    assessmentLabels.find((label) => ["math", "mathematics"].includes(label.toLowerCase())) ??
    "Math";

  return persistAssessmentResult({
    viewer,
    assessmentId: assessment.id,
    studentId: normalizedStudentId,
    totalScore: Math.round(normalizedTotal),
    sectionScores: [
      { label: rwLabel, score: Math.round(normalizedRw) },
      { label: mathLabel, score: Math.round(normalizedMath) },
    ],
  });
}
