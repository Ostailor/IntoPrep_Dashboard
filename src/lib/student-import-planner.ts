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
type CohortResolution = { cohorts: ExistingImportCohort[]; error: string | null };
type StudentResolution = { student: StudentPayload | null; error: string | null };
type IdIndex = Map<string, Set<string>>;

interface StudentMatchIndexes {
  externalIds: IdIndex;
  emails: IdIndex;
  parentEmailNames: IdIndex;
  nameSchools: IdIndex;
}

interface CohortIndexes {
  ids: IdIndex;
  names: IdIndex;
  byId: Map<string, ExistingImportCohort>;
}

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
  const existingStudents = input.existingStudents
    .filter((student) => student.demo === input.targetDemo)
    .map(cloneStudent);
  const existingFamilies = input.existingFamilies
    .filter((family) => family.demo === input.targetDemo)
    .map(cloneFamily);
  const cohorts = input.cohorts.filter((cohort) => cohort.demo === input.targetDemo);
  const existingEnrollments = input.existingEnrollments.filter((enrollment) => enrollment.demo === input.targetDemo);
  const existingDefinitionKeys = new Set(
    (input.existingFieldDefinitions ?? [])
      .filter((definition) => definition.demo === input.targetDemo)
      .map((definition) => normalizeKey(definition.key)),
  );
  const confirmedNewDefinitions = uniqueByNormalizedKey(input.newFieldDefinitions);
  const allowedCustomFieldKeys = new Set([
    ...existingDefinitionKeys,
    ...confirmedNewDefinitions.map((definition) => normalizeKey(definition.key)),
  ]);

  const familyPayloads = new Map<string, FamilyPayload>();
  const studentPayloads = new Map<string, StudentPayload>();
  const enrollmentPayloads = new Map<string, Record<string, unknown>>();
  const plannedNewStudentIds = new Set<string>();
  const rows: StudentImportPlanRow[] = [];

  const familyById = new Map(existingFamilies.map((family) => [family.id, family]));
  const studentById = new Map(existingStudents.map((student) => [student.id, student]));
  const studentIdsByFamily = buildStudentIdsByFamily(existingStudents);
  const familyEmailIndex = buildFamilyEmailIndex(existingFamilies);
  const studentIndexes = buildStudentMatchIndexes(existingStudents, familyById);
  const cohortIndexes = buildCohortIndexes(cohorts);
  const enrollmentKeys = new Set(
    existingEnrollments.map((enrollment) => enrollmentKey(enrollment.student_id, enrollment.cohort_id)),
  );

  const newFieldDefinitions = confirmedNewDefinitions
    .filter((definition) => !existingDefinitionKeys.has(normalizeKey(definition.key)))
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

    const staleCustomKeys = Object.keys(row.customFields)
      .filter((key) => !allowedCustomFieldKeys.has(normalizeKey(key)));
    if (staleCustomKeys.length > 0) {
      planRow.errors.push(...staleCustomKeys.map(
        (key) => `Custom field "${key}" is not available in the ${partitionLabel} import mapping.`,
      ));
      rows.push(planRow);
      continue;
    }

    const studentResolution = resolveStudent(row, studentIndexes, studentById, partitionLabel);
    if (studentResolution.error) {
      planRow.errors.push(studentResolution.error);
      rows.push(planRow);
      continue;
    }

    const cohortResolution = resolveCohort(row, cohortIndexes, partitionLabel);
    if (cohortResolution.error) {
      planRow.errors.push(cohortResolution.error);
      rows.push(planRow);
      continue;
    }
    planRow.cohortId = cohortResolution.cohorts[0]?.id ?? null;

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
    if (matchedStudent) {
      family = familyById.get(matchedStudent.family_id) ?? null;
      if (!family) {
        planRow.errors.push(`Matched student does not have a ${partitionLabel} family in the preview data.`);
        rows.push(planRow);
        continue;
      }
    } else {
      const familyMatchIds = getIndexedIds(familyEmailIndex, row.parent1Email);
      if (familyMatchIds.size > 1) {
        planRow.errors.push(`Parent email matches more than one ${partitionLabel} family.`);
        rows.push(planRow);
        continue;
      }
      const matchedFamilyId = firstSetValue(familyMatchIds);
      family = matchedFamilyId ? familyById.get(matchedFamilyId) ?? null : null;
    }

    if (!family) {
      family = createFamilyPayload(row, input.createId("family"), input);
      familyById.set(family.id, family);
      addIndexValue(familyEmailIndex, familyParentEmail(family), family.id);
    }

    const familyBefore = family;
    const mergedFamily = mergeFamilyPayload(family, row, finalLastName);
    const familyChanged = !recordsEqual(familyBefore, mergedFamily);
    if (familyChanged) {
      replaceFamilyInIndexes({
        before: familyBefore,
        after: mergedFamily,
        familyById,
        familyEmailIndex,
        studentById,
        studentIdsByFamily,
        studentIndexes,
      });
    }
    familyPayloads.set(mergedFamily.id, mergedFamily);
    familyById.set(mergedFamily.id, mergedFamily);
    planRow.familyId = mergedFamily.id;

    let studentChanged = false;
    if (!matchedStudent) {
      const student = createStudentPayload(row, input.createId("student"), mergedFamily.id, input.targetDemo);
      studentPayloads.set(student.id, student);
      studentById.set(student.id, student);
      addStudentToFamily(studentIdsByFamily, student);
      addStudentToIndexes(studentIndexes, student, familyById);
      plannedNewStudentIds.add(student.id);
      planRow.studentId = student.id;
    } else {
      const studentBefore = matchedStudent;
      const mergedStudent = mergeStudentPayload(matchedStudent, row, mergedFamily.id);
      studentChanged = !recordsEqual(studentBefore, mergedStudent);
      if (studentChanged) {
        replaceStudentInIndexes({
          before: studentBefore,
          after: mergedStudent,
          studentById,
          studentIdsByFamily,
          studentIndexes,
          familyById,
        });
      }
      studentPayloads.set(mergedStudent.id, mergedStudent);
      studentById.set(mergedStudent.id, mergedStudent);
      planRow.studentId = mergedStudent.id;
    }

    let enrollmentAdded = false;
    if (planRow.studentId) {
      for (const cohort of cohortResolution.cohorts) {
        const key = enrollmentKey(planRow.studentId, cohort.id);
        if (!enrollmentKeys.has(key)) {
          enrollmentAdded = true;
          enrollmentKeys.add(key);
          enrollmentPayloads.set(key, {
            id: input.createId("enrollment"),
            student_id: planRow.studentId,
            cohort_id: cohort.id,
            status: "active",
            registered_at: row.registeredAt || input.defaultRegisteredAt,
            demo: input.targetDemo,
          });
        }
      }
    }

    if (!matchedStudent) {
      planRow.action = "create";
    } else if (plannedNewStudentIds.has(matchedStudent.id)) {
      planRow.action = familyChanged || studentChanged || enrollmentAdded ? "warning" : "skip";
      if (planRow.action === "warning") {
        planRow.warnings.push("Duplicate row merged into the earlier student record.");
      }
    } else {
      planRow.action = familyChanged || studentChanged || enrollmentAdded ? "update" : "skip";
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
  indexes: StudentMatchIndexes,
  students: Map<string, StudentPayload>,
  partitionLabel: string,
): StudentResolution {
  const lookups: Array<{
    index: IdIndex;
    key: string;
    label: string;
  }> = [
    {
      index: indexes.externalIds,
      key: normalizeKey(row.externalId),
      label: "External ID",
    },
    {
      index: indexes.emails,
      key: normalizeKey(row.studentEmail),
      label: "Student email",
    },
    {
      index: indexes.parentEmailNames,
      key: compositeKey(row.parent1Email, normalizedStudentName(row)),
      label: "Parent email and student name",
    },
    {
      index: indexes.nameSchools,
      key: compositeKey(normalizedStudentName(row), row.school),
      label: "Student name and school",
    },
  ];

  for (const lookup of lookups) {
    if (!lookup.key) {
      continue;
    }
    const matches = lookup.index.get(lookup.key) ?? new Set<string>();
    if (matches.size > 1) {
      return { student: null, error: `${lookup.label} matches more than one ${partitionLabel} student.` };
    }
    const studentId = firstSetValue(matches);
    if (studentId) {
      return { student: students.get(studentId) ?? null, error: null };
    }
  }

  return { student: null, error: null };
}

function resolveCohort(
  row: NormalizedStudentImportRow,
  indexes: CohortIndexes,
  partitionLabel: string,
): CohortResolution {
  if (normalizeKey(row.cohortId)) {
    const matches = indexes.ids.get(row.cohortId.trim()) ?? new Set<string>();
    if (matches.size > 1) {
      return { cohorts: [], error: `Cohort ID matches more than one ${partitionLabel} cohort.` };
    }
    const cohortId = firstSetValue(matches);
    if (!cohortId) {
      return { cohorts: [], error: `Cohort ID does not match a ${partitionLabel} cohort.` };
    }
    const cohort = indexes.byId.get(cohortId);
    return { cohorts: cohort ? [cohort] : [], error: null };
  }

  if (normalizeKey(row.cohortName)) {
    const cohortNames = uniqueNormalizedValues(row.cohortName.split(";"));
    const cohorts: ExistingImportCohort[] = [];
    for (const cohortName of cohortNames) {
      const matches = indexes.names.get(normalizeKey(cohortName)) ?? new Set<string>();
      if (matches.size > 1) {
        const detail = cohortNames.length > 1 ? ` "${cohortName}"` : "";
        return { cohorts: [], error: `Cohort name${detail} matches more than one ${partitionLabel} cohort.` };
      }
      const cohortId = firstSetValue(matches);
      if (!cohortId) {
        const detail = cohortNames.length > 1 ? ` "${cohortName}"` : "";
        return { cohorts: [], error: `Cohort name${detail} does not match a ${partitionLabel} cohort.` };
      }
      const cohort = indexes.byId.get(cohortId);
      if (cohort) {
        cohorts.push(cohort);
      }
    }
    return { cohorts, error: null };
  }

  return { cohorts: [], error: null };
}

function uniqueNormalizedValues(values: string[]): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const trimmed = value.trim();
    const normalized = normalizeKey(trimmed);
    if (!normalized || seen.has(normalized)) {
      return [];
    }
    seen.add(normalized);
    return [trimmed];
  });
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
  if (row.suppliedFields.includes("parent1Name") || row.suppliedFields.includes("parent2Name")) {
    merged.guardian_names = [merged.parent1_name, merged.parent2_name].filter((name): name is string => Boolean(name));
  }
  if (row.suppliedFields.includes("parent1Email")) {
    merged.email = merged.parent1_email ?? "";
  }
  if (row.suppliedFields.includes("parent1Phone")) {
    merged.phone = merged.parent1_phone ?? "";
  }
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

function buildFamilyEmailIndex(families: FamilyPayload[]): IdIndex {
  const index: IdIndex = new Map();
  for (const family of families) {
    addIndexValue(index, familyParentEmail(family), family.id);
  }
  return index;
}

function buildStudentIdsByFamily(students: StudentPayload[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const student of students) {
    addStudentToFamily(index, student);
  }
  return index;
}

function addStudentToFamily(index: Map<string, Set<string>>, student: StudentPayload): void {
  addIndexValue(index, student.family_id, student.id);
}

function buildStudentMatchIndexes(
  students: StudentPayload[],
  families: Map<string, FamilyPayload>,
): StudentMatchIndexes {
  const indexes: StudentMatchIndexes = {
    externalIds: new Map(),
    emails: new Map(),
    parentEmailNames: new Map(),
    nameSchools: new Map(),
  };
  for (const student of students) {
    addStudentToIndexes(indexes, student, families);
  }
  return indexes;
}

function buildCohortIndexes(cohorts: ExistingImportCohort[]): CohortIndexes {
  const indexes: CohortIndexes = { ids: new Map(), names: new Map(), byId: new Map() };
  for (const cohort of cohorts) {
    indexes.byId.set(cohort.id, cohort);
    addIndexValue(indexes.ids, cohort.id.trim(), cohort.id);
    addIndexValue(indexes.names, normalizeKey(cohort.name), cohort.id);
  }
  return indexes;
}

function addStudentToIndexes(
  indexes: StudentMatchIndexes,
  student: StudentPayload,
  families: Map<string, FamilyPayload>,
): void {
  const family = families.get(student.family_id);
  addIndexValue(indexes.externalIds, normalizeKey(student.external_id), student.id);
  addIndexValue(indexes.emails, normalizeKey(student.email), student.id);
  addIndexValue(
    indexes.parentEmailNames,
    compositeKey(familyParentEmail(family), normalizedStudentName(student)),
    student.id,
  );
  addIndexValue(indexes.nameSchools, compositeKey(normalizedStudentName(student), student.school), student.id);
}

function removeStudentFromIndexes(
  indexes: StudentMatchIndexes,
  student: StudentPayload,
  families: Map<string, FamilyPayload>,
): void {
  const family = families.get(student.family_id);
  removeIndexValue(indexes.externalIds, normalizeKey(student.external_id), student.id);
  removeIndexValue(indexes.emails, normalizeKey(student.email), student.id);
  removeIndexValue(
    indexes.parentEmailNames,
    compositeKey(familyParentEmail(family), normalizedStudentName(student)),
    student.id,
  );
  removeIndexValue(indexes.nameSchools, compositeKey(normalizedStudentName(student), student.school), student.id);
}

function replaceFamilyInIndexes(input: {
  before: FamilyPayload;
  after: FamilyPayload;
  familyById: Map<string, FamilyPayload>;
  familyEmailIndex: IdIndex;
  studentById: Map<string, StudentPayload>;
  studentIdsByFamily: Map<string, Set<string>>;
  studentIndexes: StudentMatchIndexes;
}): void {
  const affectedStudentIds = input.studentIdsByFamily.get(input.before.id) ?? new Set<string>();
  for (const studentId of affectedStudentIds) {
    const student = input.studentById.get(studentId);
    if (student) {
      removeStudentFromIndexes(input.studentIndexes, student, input.familyById);
    }
  }

  removeIndexValue(input.familyEmailIndex, familyParentEmail(input.before), input.before.id);
  input.familyById.set(input.after.id, input.after);
  addIndexValue(input.familyEmailIndex, familyParentEmail(input.after), input.after.id);

  for (const studentId of affectedStudentIds) {
    const student = input.studentById.get(studentId);
    if (student) {
      addStudentToIndexes(input.studentIndexes, student, input.familyById);
    }
  }
}

function replaceStudentInIndexes(input: {
  before: StudentPayload;
  after: StudentPayload;
  studentById: Map<string, StudentPayload>;
  studentIdsByFamily: Map<string, Set<string>>;
  studentIndexes: StudentMatchIndexes;
  familyById: Map<string, FamilyPayload>;
}): void {
  removeStudentFromIndexes(input.studentIndexes, input.before, input.familyById);
  if (input.before.family_id !== input.after.family_id) {
    removeIndexValue(input.studentIdsByFamily, input.before.family_id, input.before.id);
    addStudentToFamily(input.studentIdsByFamily, input.after);
  }
  input.studentById.set(input.after.id, input.after);
  addStudentToIndexes(input.studentIndexes, input.after, input.familyById);
}

function addIndexValue(index: IdIndex, rawKey: string, id: string): void {
  if (!rawKey) {
    return;
  }
  const values = index.get(rawKey) ?? new Set<string>();
  values.add(id);
  index.set(rawKey, values);
}

function removeIndexValue(index: IdIndex, rawKey: string, id: string): void {
  if (!rawKey) {
    return;
  }
  const values = index.get(rawKey);
  values?.delete(id);
  if (values?.size === 0) {
    index.delete(rawKey);
  }
}

function getIndexedIds(index: IdIndex, rawKey: string): Set<string> {
  const key = normalizeKey(rawKey);
  return key ? index.get(key) ?? new Set<string>() : new Set<string>();
}

function firstSetValue(values: Set<string>): string | null {
  return values.values().next().value ?? null;
}

function familyParentEmail(family: FamilyPayload | undefined): string {
  return normalizeKey(family?.parent1_email || family?.email);
}

function compositeKey(first: unknown, second: unknown): string {
  const normalizedFirst = normalizeKey(first);
  const normalizedSecond = normalizeKey(second);
  return normalizedFirst && normalizedSecond ? `${normalizedFirst}\u0000${normalizedSecond}` : "";
}

function cloneStudent(student: ExistingImportStudent): StudentPayload {
  return { ...student, custom_fields: { ...student.custom_fields } };
}

function cloneFamily(family: ExistingImportFamily): FamilyPayload {
  return { ...family, guardian_names: [...family.guardian_names] };
}

function recordsEqual(left: object, right: object): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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
