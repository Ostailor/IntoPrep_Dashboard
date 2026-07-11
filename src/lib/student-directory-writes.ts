import "server-only";

import { randomBytes } from "node:crypto";
import type { ProgramTrack, StudentFieldDefinition, User } from "@/lib/domain";
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

export const STUDENT_DIRECTORY_REQUEST_LIMITS = {
  contentLength: 256_000,
  customFieldCount: 50,
  customFieldKeyLength: 64,
  customFieldTextLength: 4_000,
  externalIdLength: 120,
} as const;

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

export function resolveStudentDirectoryWritePartition(viewer: User) {
  assertStudentDirectoryEditor(viewer);
  return getDemoPartition(viewer);
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

export function validateStudentDirectoryRequestPayload({
  externalId,
  customFields,
}: {
  externalId?: unknown;
  customFields?: unknown;
}) {
  if (externalId !== undefined && externalId !== null && typeof externalId !== "string") {
    throw new Error("External ID must be text.");
  }

  if (
    typeof externalId === "string" &&
    externalId.length > STUDENT_DIRECTORY_REQUEST_LIMITS.externalIdLength
  ) {
    throw new Error(
      `External ID must be ${STUDENT_DIRECTORY_REQUEST_LIMITS.externalIdLength} characters or fewer.`,
    );
  }

  if (customFields === undefined) {
    return;
  }

  if (!customFields || typeof customFields !== "object" || Array.isArray(customFields)) {
    throw new Error("Additional student information must be a JSON object of simple values.");
  }

  const entries = Object.entries(customFields);
  if (entries.length > STUDENT_DIRECTORY_REQUEST_LIMITS.customFieldCount) {
    throw new Error(
      `Additional student information is limited to ${STUDENT_DIRECTORY_REQUEST_LIMITS.customFieldCount} fields.`,
    );
  }

  entries.forEach(([key, value]) => {
    if (key.length > STUDENT_DIRECTORY_REQUEST_LIMITS.customFieldKeyLength) {
      throw new Error(
        `Custom field keys must be ${STUDENT_DIRECTORY_REQUEST_LIMITS.customFieldKeyLength} characters or fewer.`,
      );
    }

    if (
      value !== null &&
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      throw new Error("Additional student information must be a JSON object of simple values.");
    }

    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error("Additional student information numbers must be finite.");
    }

    if (
      typeof value === "string" &&
      value.length > STUDENT_DIRECTORY_REQUEST_LIMITS.customFieldTextLength
    ) {
      throw new Error(
        `Custom field text must be ${STUDENT_DIRECTORY_REQUEST_LIMITS.customFieldTextLength} characters or fewer.`,
      );
    }
  });
}

export function resolveStudentExternalId(existing: string | null, submitted: unknown) {
  validateStudentDirectoryRequestPayload({ externalId: submitted });

  if (submitted === undefined) {
    return existing;
  }

  if (submitted === null) {
    return null;
  }

  return optionalText(submitted) || null;
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

function parseStoredStudentCustomFields(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string | number | boolean] =>
        typeof entry[1] === "string" ||
        typeof entry[1] === "number" ||
        typeof entry[1] === "boolean",
    ),
  );
}

function assertCustomFieldValue(
  definition: StudentFieldDefinition,
  value: unknown,
): asserts value is string | number | boolean {
  const invalid = (() => {
    switch (definition.dataType) {
      case "number":
        return typeof value !== "number" || !Number.isFinite(value);
      case "boolean":
        return typeof value !== "boolean";
      case "date":
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          return true;
        }

        const [year, month, day] = value.split("-").map(Number);
        const parsedDate = new Date(`${value}T00:00:00.000Z`);
        return (
          Number.isNaN(parsedDate.getTime()) ||
          parsedDate.getUTCFullYear() !== year ||
          parsedDate.getUTCMonth() + 1 !== month ||
          parsedDate.getUTCDate() !== day
        );
      case "text":
        return typeof value !== "string";
    }
  })();

  if (invalid) {
    const article = definition.dataType === "number" ? "a" : "a valid";
    throw new Error(`${definition.label} must be ${article} ${definition.dataType}.`);
  }
}

export function mergeValidatedStudentCustomFields({
  existing,
  submitted,
  definitions,
}: {
  existing: unknown;
  submitted: unknown;
  definitions: StudentFieldDefinition[];
}) {
  const merged = parseStoredStudentCustomFields(existing);

  validateStudentDirectoryRequestPayload({ customFields: submitted });

  if (submitted === undefined) {
    return merged;
  }

  if (!submitted || typeof submitted !== "object" || Array.isArray(submitted)) {
    throw new Error("Additional student information must be a JSON object.");
  }

  const definitionByKey = new Map(definitions.map((definition) => [definition.key, definition]));
  Object.entries(submitted).forEach(([key, value]) => {
    const definition = definitionByKey.get(key);

    if (!definition) {
      throw new Error(`Custom field ${key} is not available in this student directory.`);
    }

    if (value === null) {
      if (definition.required) {
        throw new Error(`${definition.label} is required.`);
      }

      delete merged[key];
      return;
    }

    assertCustomFieldValue(definition, value);
    merged[key] = value;
  });

  definitions.forEach((definition) => {
    const value = merged[definition.key];
    if (definition.required && (value === undefined || value === "")) {
      throw new Error(`${definition.label} is required.`);
    }
  });

  return merged;
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

async function getDefaultCampusId(demo: boolean) {
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("campuses")
    .select("*")
    .eq("demo", demo)
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
  parent1Name,
  parent1Email,
  parent1Phone,
  parent2Name,
  parent2Email,
  parent2Phone,
  studentEmail,
  studentPhone,
  externalId,
  customFields,
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
  parent1Name?: unknown;
  parent1Email?: unknown;
  parent1Phone?: unknown;
  parent2Name?: unknown;
  parent2Email?: unknown;
  parent2Phone?: unknown;
  studentEmail?: unknown;
  studentPhone?: unknown;
  externalId?: unknown;
  customFields?: unknown;
  guardianName: unknown;
  familyEmail: unknown;
  familyPhone: unknown;
  familyNotes?: unknown;
}) {
  ensureServiceRole();
  const demo = resolveStudentDirectoryWritePartition(viewer);
  await assertWritesAllowed("operational_writes");
  validateStudentDirectoryRequestPayload({ externalId, customFields });

  const normalizedStudent = {
    firstName: requiredText(firstName, "First name"),
    lastName: requiredText(lastName, "Last name"),
    gradeLevel: requiredText(gradeLevel, "Grade"),
    school: requiredText(school, "School"),
    targetTest: normalizeTrack(targetTest),
    focus: requiredText(focus, "Focus"),
  };
  const normalizedFamily = {
    parent1Name: requiredText(parent1Name ?? guardianName, "Parent 1 name"),
    parent1Email: requiredText(parent1Email ?? familyEmail, "Parent 1 email"),
    parent1Phone: requiredText(parent1Phone ?? familyPhone, "Parent 1 phone"),
    parent2Name: optionalText(parent2Name),
    parent2Email: optionalText(parent2Email),
    parent2Phone: optionalText(parent2Phone),
    studentEmail: optionalText(studentEmail),
    studentPhone: optionalText(studentPhone),
    notes: optionalText(familyNotes),
  };
  const guardianNames = [normalizedFamily.parent1Name, normalizedFamily.parent2Name].filter(Boolean);
  const serviceClient = createSupabaseServiceClient();
  const { data: definitionData, error: definitionError } = await serviceClient
    .from("student_field_definitions")
    .select("*")
    .eq("demo", demo)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });

  if (definitionError) {
    throw new Error(definitionError.message);
  }

  const definitions = ((definitionData ?? []) as Database["public"]["Tables"]["student_field_definitions"]["Row"][])
    .map((definition) => ({
      id: definition.id,
      key: definition.key,
      label: definition.label,
      dataType: definition.data_type,
      headerAliases: definition.header_aliases,
      required: definition.required,
      sensitive: definition.sensitive,
      sortOrder: definition.sort_order,
      demo: definition.demo,
    } satisfies StudentFieldDefinition));
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

  const mergedCustomFields = mergeValidatedStudentCustomFields({
    existing: existingStudent?.custom_fields,
    submitted: customFields,
    definitions,
  });

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
    const defaultCampusId = await getDefaultCampusId(demo);
    const { error: familyInsertError } = await serviceClient.from("families").insert({
      id: familyId,
      family_name: `${normalizedStudent.lastName} family`,
      guardian_names: guardianNames,
      parent1_name: normalizedFamily.parent1Name,
      parent1_email: normalizedFamily.parent1Email,
      parent1_phone: normalizedFamily.parent1Phone,
      parent2_name: normalizedFamily.parent2Name || null,
      parent2_email: normalizedFamily.parent2Email || null,
      parent2_phone: normalizedFamily.parent2Phone || null,
      email: normalizedFamily.parent1Email,
      phone: normalizedFamily.parent1Phone,
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
        guardian_names: guardianNames,
        parent1_name: normalizedFamily.parent1Name,
        parent1_email: normalizedFamily.parent1Email,
        parent1_phone: normalizedFamily.parent1Phone,
        parent2_name: normalizedFamily.parent2Name || null,
        parent2_email: normalizedFamily.parent2Email || null,
        parent2_phone: normalizedFamily.parent2Phone || null,
        email: normalizedFamily.parent1Email,
        phone: normalizedFamily.parent1Phone,
        notes: normalizedFamily.notes,
      })
      .eq("id", familyId)
      .eq("demo", demo);

    if (familyUpdateError) {
      throw new Error(familyUpdateError.message);
    }
  }

  const studentPayload = {
    family_id: familyId,
    first_name: normalizedStudent.firstName,
    last_name: normalizedStudent.lastName,
    email: normalizedFamily.studentEmail || null,
    phone: normalizedFamily.studentPhone || null,
    grade_level: normalizedStudent.gradeLevel,
    school: normalizedStudent.school,
    target_test: normalizedStudent.targetTest,
    focus: normalizedStudent.focus,
    external_id: resolveStudentExternalId(existingStudent?.external_id ?? null, externalId),
    custom_fields: mergedCustomFields,
    demo,
  };

  const studentWrite = existingStudent
    ? await serviceClient
        .from("students")
        .update(studentPayload)
        .eq("id", resolvedStudentId)
        .eq("demo", demo)
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
  notes,
}: {
  viewer: User;
  studentId: unknown;
  cohortId: unknown;
  testTitle: unknown;
  testDate: unknown;
  rwScore: unknown;
  mathScore: unknown;
  totalScore: unknown;
  notes?: unknown;
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
    notes,
  });
}
