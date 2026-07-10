import type {
  NormalizedStudentImportRow,
  StudentCustomFieldType,
  StudentImportFieldKey,
} from "@/lib/student-import-schema";

export type StudentImportRowAction = "create" | "update" | "skip" | "warning" | "error";

export interface StudentImportPlanRow {
  rowNumber: number;
  action: StudentImportRowAction;
  studentId: string | null;
  familyId: string | null;
  cohortId: string | null;
  warnings: string[];
  errors: string[];
}

export interface StudentImportPlan {
  targetDemo: boolean;
  rows: StudentImportPlanRow[];
  families: Array<Record<string, unknown>>;
  students: Array<Record<string, unknown>>;
  enrollments: Array<Record<string, unknown>>;
  newFieldDefinitions: Array<Record<string, unknown>>;
  summary: {
    creates: number;
    updates: number;
    enrollments: number;
    skips: number;
    warnings: number;
    errors: number;
  };
}

export interface ExistingImportStudent extends Record<string, unknown> {
  id: string;
  family_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  grade_level: string;
  school: string;
  target_test: string;
  focus: string;
  external_id: string | null;
  custom_fields: Record<string, string | number | boolean>;
  demo: boolean;
}

export interface ExistingImportFamily extends Record<string, unknown> {
  id: string;
  family_name: string;
  guardian_names: string[];
  email: string;
  phone: string;
  preferred_campus_id: string;
  notes: string;
  parent1_name: string | null;
  parent1_email: string | null;
  parent1_phone: string | null;
  parent2_name: string | null;
  parent2_email: string | null;
  parent2_phone: string | null;
  demo: boolean;
}

export interface ExistingImportCohort {
  id: string;
  name: string;
  demo: boolean;
}

export interface ExistingImportEnrollment {
  id: string;
  student_id: string;
  cohort_id: string;
  status: string;
  registered_at: string;
  demo: boolean;
}

export interface ExistingImportFieldDefinition {
  key: string;
  demo: boolean;
}

export interface NewImportFieldDefinition {
  key: string;
  label: string;
  dataType: StudentCustomFieldType;
  headerAliases?: string[];
  required?: boolean;
  sortOrder?: number;
}

export interface StudentImportPlannerInput {
  targetDemo: boolean;
  rows: NormalizedStudentImportRow[];
  existingStudents: ExistingImportStudent[];
  existingFamilies: ExistingImportFamily[];
  existingEnrollments: ExistingImportEnrollment[];
  cohorts: ExistingImportCohort[];
  existingFieldDefinitions?: ExistingImportFieldDefinition[];
  newFieldDefinitions: NewImportFieldDefinition[];
  defaultCampusId: string;
  defaultRegisteredAt: string;
  createId: (prefix: "field" | "family" | "student" | "enrollment") => string;
}

type StudentPayload = ExistingImportStudent;
type FamilyPayload = ExistingImportFamily;
type CohortResolution = { cohort: ExistingImportCohort | null; error: string | null };
type StudentResolution = { student: StudentPayload | null; error: string | null };

const STUDENT_FIELD_COLUMNS: Partial<Record<StudentImportFieldKey, keyof StudentPayload>> = {
  externalId: "external_id",
  firstName: "first_name",
  lastName: "last_name",
  gradeLevel: "grade_level",
  school: "school",
  targetTest: "target_test",
  focus: "focus",
  studentEmail: "email",
  studentPhone: "phone",
};

const FAMILY_FIELD_COLUMNS: Partial<Record<StudentImportFieldKey, keyof FamilyPayload>> = {
  parent1Name: "parent1_name",
  parent1Email: "parent1_email",
  parent1Phone: "parent1_phone",
  parent2Name: "parent2_name",
  parent2Email: "parent2_email",
  parent2Phone: "parent2_phone",
  familyNotes: "notes",
};

export function buildStudentImportPlan(input: StudentImportPlannerInput): StudentImportPlan {
  const partitionLabel = input.targetDemo ? "demo" : "main";
  const existingStudents = input.existingStudents.filter((student) => student.demo === input.targetDemo);
  const existingFamilies = input.existingFamilies.filter((family) => family.demo === input.targetDemo);
  const cohorts = input.cohorts.filter((cohort) => cohort.demo === input.targetDemo);
  const existingEnrollments = input.existingEnrollments.filter((enrollment) => enrollment.demo === input.targetDemo);
  const existingDefinitions = new Set(
    (input.existingFieldDefinitions ?? [])
      .filter((definition) => definition.demo === input.targetDemo)
      .map((definition) => normalizeKey(definition.key)),
  );

  const familyPayloads = new Map<string, FamilyPayload>();
  const studentPayloads = new Map<string, StudentPayload>();
  const enrollmentPayloads = new Map<string, Record<string, unknown>>();
  const plannedNewStudentIds = new Set<string>();
  const rows: StudentImportPlanRow[] = [];

  const familyById = new Map(existingFamilies.map((family) => [family.id, family]));
  const enrollmentKeys = new Set(
    existingEnrollments.map((enrollment) => enrollmentKey(enrollment.student_id, enrollment.cohort_id)),
  );

  const newFieldDefinitions = uniqueByNormalizedKey(input.newFieldDefinitions)
    .filter((definition) => !existingDefinitions.has(normalizeKey(definition.key)))
    .map((definition) => ({
      id: input.createId("field"),
      key: definition.key,
      label: definition.label,
      data_type: definition.dataType,
      header_aliases: definition.headerAliases ?? [],
      required: definition.required ?? false,
      sensitive: true,
      sort_order: definition.sortOrder ?? 0,
      demo: input.targetDemo,
    }));

  for (const row of input.rows) {
    const planRow: StudentImportPlanRow = {
      rowNumber: row.rowNumber,
      action: "error",
      studentId: null,
      familyId: null,
      cohortId: null,
      warnings: [],
      errors: [],
    };

    const availableFamilies = mergeRecordsById(existingFamilies, familyPayloads);
    const availableStudents = mergeRecordsById(existingStudents, studentPayloads);
    const studentResolution = resolveStudent(
      row,
      availableStudents,
      new Map(availableFamilies.map((family) => [family.id, family])),
      partitionLabel,
    );
    if (studentResolution.error) {
      planRow.errors.push(studentResolution.error);
      rows.push(planRow);
      continue;
    }

    const cohortResolution = resolveCohort(row, cohorts, partitionLabel);
    if (cohortResolution.error) {
      planRow.errors.push(cohortResolution.error);
      rows.push(planRow);
      continue;
    }
    planRow.cohortId = cohortResolution.cohort?.id ?? null;

    const matchedStudent = studentResolution.student;
    const finalFirstName = valueAfterMerge(matchedStudent?.first_name ?? "", row, "firstName");
    const finalLastName = valueAfterMerge(matchedStudent?.last_name ?? "", row, "lastName");
    if (!normalizeKey(finalFirstName)) {
      planRow.errors.push(`First name is required for a ${matchedStudent ? "matched" : "new"} student.`);
    }
    if (!normalizeKey(finalLastName)) {
      planRow.errors.push(`Last name is required for a ${matchedStudent ? "matched" : "new"} student.`);
    }
    if (planRow.errors.length > 0) {
      rows.push(planRow);
      continue;
    }

    let family: FamilyPayload | null = null;
    let familyWasPlanned = false;
    if (matchedStudent) {
      family = familyById.get(matchedStudent.family_id) ?? familyPayloads.get(matchedStudent.family_id) ?? null;
      if (!family) {
        planRow.errors.push(`Matched student does not have a ${partitionLabel} family in the preview data.`);
        rows.push(planRow);
        continue;
      }
      familyWasPlanned = familyPayloads.has(family.id);
    } else {
      const familyMatches = findFamiliesByParentEmail(row.parent1Email, availableFamilies);
      if (familyMatches.length > 1) {
        planRow.errors.push(`Parent email matches more than one ${partitionLabel} family.`);
        rows.push(planRow);
        continue;
      }
      family = familyMatches[0] ?? null;
      familyWasPlanned = family ? familyPayloads.has(family.id) : false;
    }

    if (!family) {
      family = createFamilyPayload(row, input.createId("family"), input);
    }

    const familyBefore = JSON.stringify(familyPayloads.get(family.id) ?? family);
    const mergedFamily = mergeFamilyPayload(family, row, finalLastName);
    familyPayloads.set(mergedFamily.id, mergedFamily);
    familyById.set(mergedFamily.id, mergedFamily);
    planRow.familyId = mergedFamily.id;

    if (!matchedStudent) {
      const student = createStudentPayload(row, input.createId("student"), mergedFamily.id, input.targetDemo);
      studentPayloads.set(student.id, student);
      plannedNewStudentIds.add(student.id);
      planRow.studentId = student.id;
      planRow.action = "create";
    } else {
      const studentBefore = JSON.stringify(studentPayloads.get(matchedStudent.id) ?? matchedStudent);
      const mergedStudent = mergeStudentPayload(matchedStudent, row, mergedFamily.id);
      studentPayloads.set(mergedStudent.id, mergedStudent);
      planRow.studentId = mergedStudent.id;

      if (plannedNewStudentIds.has(mergedStudent.id)) {
        const familyChanged = familyBefore !== JSON.stringify(mergedFamily);
        const studentChanged = studentBefore !== JSON.stringify(mergedStudent);
        planRow.action = familyWasPlanned && !familyChanged && !studentChanged ? "skip" : "warning";
        if (planRow.action === "warning") {
          planRow.warnings.push("Duplicate row merged into the earlier student record.");
        }
      } else {
        planRow.action = "update";
      }
    }

    if (cohortResolution.cohort && planRow.studentId) {
      const key = enrollmentKey(planRow.studentId, cohortResolution.cohort.id);
      if (!enrollmentKeys.has(key)) {
        enrollmentKeys.add(key);
        enrollmentPayloads.set(key, {
          id: input.createId("enrollment"),
          student_id: planRow.studentId,
          cohort_id: cohortResolution.cohort.id,
          status: "active",
          registered_at: row.registeredAt || input.defaultRegisteredAt,
          demo: input.targetDemo,
        });
      }
    }

    rows.push(planRow);
  }

  const summary = {
    creates: rows.filter((row) => row.action === "create").length,
    updates: rows.filter((row) => row.action === "update").length,
    enrollments: enrollmentPayloads.size,
    skips: rows.filter((row) => row.action === "skip").length,
    warnings: rows.filter((row) => row.warnings.length > 0).length,
    errors: rows.filter((row) => row.errors.length > 0).length,
  };

  return {
    targetDemo: input.targetDemo,
    rows,
    families: [...familyPayloads.values()],
    students: [...studentPayloads.values()],
    enrollments: [...enrollmentPayloads.values()],
    newFieldDefinitions,
    summary,
  };
}

function resolveStudent(
  row: NormalizedStudentImportRow,
  students: StudentPayload[],
  families: Map<string, FamilyPayload>,
  partitionLabel: string,
): StudentResolution {
  const matchers: Array<{
    value: string;
    label: string;
    matches: (student: StudentPayload) => boolean;
  }> = [
    {
      value: row.externalId,
      label: "External ID",
      matches: (student) => normalizeKey(student.external_id) === normalizeKey(row.externalId),
    },
    {
      value: row.studentEmail,
      label: "Student email",
      matches: (student) => normalizeKey(student.email) === normalizeKey(row.studentEmail),
    },
    {
      value: row.parent1Email && normalizedStudentName(row),
      label: "Parent email and student name",
      matches: (student) => {
        const family = families.get(student.family_id);
        return normalizeKey(family?.parent1_email || family?.email) === normalizeKey(row.parent1Email)
          && normalizedStudentName(student) === normalizedStudentName(row);
      },
    },
    {
      value: normalizedStudentName(row) && row.school,
      label: "Student name and school",
      matches: (student) => normalizedStudentName(student) === normalizedStudentName(row)
        && normalizeKey(student.school) === normalizeKey(row.school),
    },
  ];

  for (const matcher of matchers) {
    if (!normalizeKey(matcher.value)) {
      continue;
    }
    const matches = students.filter(matcher.matches);
    if (matches.length > 1) {
      return { student: null, error: `${matcher.label} matches more than one ${partitionLabel} student.` };
    }
    if (matches.length === 1) {
      return { student: matches[0]!, error: null };
    }
  }

  return { student: null, error: null };
}

function resolveCohort(
  row: NormalizedStudentImportRow,
  cohorts: ExistingImportCohort[],
  partitionLabel: string,
): CohortResolution {
  if (normalizeKey(row.cohortId)) {
    const matches = cohorts.filter((cohort) => cohort.id.trim() === row.cohortId.trim());
    if (matches.length > 1) {
      return { cohort: null, error: `Cohort ID matches more than one ${partitionLabel} cohort.` };
    }
    if (matches.length === 0) {
      return { cohort: null, error: `Cohort ID does not match a ${partitionLabel} cohort.` };
    }
    return { cohort: matches[0]!, error: null };
  }

  if (normalizeKey(row.cohortName)) {
    const matches = cohorts.filter((cohort) => normalizeKey(cohort.name) === normalizeKey(row.cohortName));
    if (matches.length > 1) {
      return { cohort: null, error: `Cohort name matches more than one ${partitionLabel} cohort.` };
    }
    if (matches.length === 0) {
      return { cohort: null, error: `Cohort name does not match a ${partitionLabel} cohort.` };
    }
    return { cohort: matches[0]!, error: null };
  }

  return { cohort: null, error: null };
}

function createFamilyPayload(
  row: NormalizedStudentImportRow,
  id: string,
  input: StudentImportPlannerInput,
): FamilyPayload {
  const guardianNames = [row.parent1Name, row.parent2Name].filter(Boolean);
  return {
    id,
    family_name: `${row.lastName} family`,
    guardian_names: guardianNames,
    email: row.parent1Email,
    phone: row.parent1Phone,
    preferred_campus_id: input.defaultCampusId,
    notes: row.familyNotes,
    parent1_name: row.parent1Name || null,
    parent1_email: row.parent1Email || null,
    parent1_phone: row.parent1Phone || null,
    parent2_name: row.parent2Name || null,
    parent2_email: row.parent2Email || null,
    parent2_phone: row.parent2Phone || null,
    demo: input.targetDemo,
  };
}

function createStudentPayload(
  row: NormalizedStudentImportRow,
  id: string,
  familyId: string,
  demo: boolean,
): StudentPayload {
  return {
    id,
    family_id: familyId,
    first_name: row.firstName,
    last_name: row.lastName,
    email: row.studentEmail || null,
    phone: row.studentPhone || null,
    grade_level: row.gradeLevel,
    school: row.school,
    target_test: row.targetTest,
    focus: row.focus,
    external_id: row.externalId || null,
    custom_fields: { ...row.customFields },
    demo,
  };
}

function mergeStudentPayload(
  student: StudentPayload,
  row: NormalizedStudentImportRow,
  familyId: string,
): StudentPayload {
  const merged: StudentPayload = {
    ...student,
    family_id: familyId,
    custom_fields: { ...student.custom_fields, ...row.customFields },
  };

  for (const field of row.suppliedFields) {
    if (field === "fullName") {
      merged.first_name = row.firstName;
      merged.last_name = row.lastName;
      continue;
    }
    const column = STUDENT_FIELD_COLUMNS[field];
    if (column) {
      setPayloadValue(merged, column, studentImportFieldValue(row, field));
    }
  }

  return merged;
}

function mergeFamilyPayload(family: FamilyPayload, row: NormalizedStudentImportRow, lastName: string): FamilyPayload {
  const merged: FamilyPayload = { ...family };
  for (const field of row.suppliedFields) {
    const column = FAMILY_FIELD_COLUMNS[field];
    if (column) {
      setPayloadValue(merged, column, studentImportFieldValue(row, field));
    }
  }

  if (row.suppliedFields.includes("lastName") || row.suppliedFields.includes("fullName")) {
    merged.family_name = `${lastName} family`;
  }
  merged.guardian_names = [merged.parent1_name, merged.parent2_name].filter((name): name is string => Boolean(name));
  merged.email = merged.parent1_email ?? "";
  merged.phone = merged.parent1_phone ?? "";
  return merged;
}

function valueAfterMerge(current: string, row: NormalizedStudentImportRow, field: "firstName" | "lastName"): string {
  return row.suppliedFields.includes(field) || row.suppliedFields.includes("fullName") ? row[field] : current || row[field];
}

function studentImportFieldValue(row: NormalizedStudentImportRow, field: StudentImportFieldKey): string {
  switch (field) {
    case "externalId": return row.externalId;
    case "firstName": return row.firstName;
    case "lastName": return row.lastName;
    case "gradeLevel": return row.gradeLevel;
    case "school": return row.school;
    case "targetTest": return row.targetTest;
    case "focus": return row.focus;
    case "studentEmail": return row.studentEmail;
    case "studentPhone": return row.studentPhone;
    case "parent1Name": return row.parent1Name;
    case "parent1Email": return row.parent1Email;
    case "parent1Phone": return row.parent1Phone;
    case "parent2Name": return row.parent2Name;
    case "parent2Email": return row.parent2Email;
    case "parent2Phone": return row.parent2Phone;
    case "familyNotes": return row.familyNotes;
    case "cohortId": return row.cohortId;
    case "cohortName": return row.cohortName;
    case "registeredAt": return row.registeredAt;
    case "fullName": return `${row.firstName} ${row.lastName}`.trim();
  }
}

function setPayloadValue<T extends object, K extends keyof T>(record: T, key: K, value: string): void {
  record[key] = value as T[K];
}

function findFamiliesByParentEmail(email: string, families: FamilyPayload[]): FamilyPayload[] {
  const key = normalizeKey(email);
  if (!key) {
    return [];
  }
  return families.filter((family) => normalizeKey(family.parent1_email || family.email) === key);
}

function mergeRecordsById<T extends { id: string }>(existing: T[], planned: Map<string, T>): T[] {
  const records = new Map(existing.map((record) => [record.id, record]));
  for (const record of planned.values()) {
    records.set(record.id, record);
  }
  return [...records.values()];
}

function uniqueByNormalizedKey<T extends { key: string }>(values: T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeKey(value.key);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizedStudentName(student: Pick<StudentPayload, "first_name" | "last_name"> | NormalizedStudentImportRow): string {
  const firstName = "first_name" in student ? student.first_name : student.firstName;
  const lastName = "last_name" in student ? student.last_name : student.lastName;
  return normalizeKey(`${firstName} ${lastName}`);
}

function normalizeKey(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function enrollmentKey(studentId: string, cohortId: string): string {
  return `${studentId}\u0000${cohortId}`;
}
