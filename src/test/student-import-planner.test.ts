import { describe, expect, it } from "vitest";
import {
  buildStudentImportPlan,
  type ExistingImportCohort,
  type ExistingImportEnrollment,
  type ExistingImportFamily,
  type ExistingImportStudent,
  type StudentImportPlannerInput,
} from "@/lib/student-import-planner";
import type { NormalizedStudentImportRow, StudentImportFieldKey } from "@/lib/student-import-schema";

function makeRow(overrides: Partial<NormalizedStudentImportRow> = {}): NormalizedStudentImportRow {
  const suppliedFields = Object.prototype.hasOwnProperty.call(overrides, "suppliedFields")
    ? overrides.suppliedFields ?? []
    : Object.keys(overrides).filter((key): key is StudentImportFieldKey => [
    "externalId", "fullName", "firstName", "lastName", "gradeLevel", "school", "targetTest", "focus",
    "studentEmail", "studentPhone", "parent1Name", "parent1Email", "parent1Phone", "parent2Name",
    "parent2Email", "parent2Phone", "familyNotes", "cohortId", "cohortName", "registeredAt",
  ].includes(key));

  return {
    rowNumber: 2,
    externalId: "",
    firstName: "Maya",
    lastName: "Chen",
    gradeLevel: "11",
    school: "Central High",
    targetTest: "SAT",
    focus: "Math",
    studentEmail: "",
    studentPhone: "",
    parent1Name: "",
    parent1Email: "",
    parent1Phone: "",
    parent2Name: "",
    parent2Email: "",
    parent2Phone: "",
    familyNotes: "",
    cohortId: "",
    cohortName: "",
    registeredAt: "",
    customFields: {},
    ...overrides,
    suppliedFields: suppliedFields.length > 0 || Object.prototype.hasOwnProperty.call(overrides, "suppliedFields")
      ? suppliedFields
      : ["firstName", "lastName", "gradeLevel", "school", "targetTest", "focus"],
  };
}

function makeStudent(overrides: Partial<ExistingImportStudent> = {}): ExistingImportStudent {
  return {
    id: "student-existing",
    family_id: "family-existing",
    first_name: "Maya",
    last_name: "Chen",
    email: null,
    phone: null,
    grade_level: "11",
    school: "Central High",
    target_test: "SAT",
    focus: "Math",
    external_id: null,
    custom_fields: {},
    demo: true,
    ...overrides,
  };
}

function makeFamily(overrides: Partial<ExistingImportFamily> = {}): ExistingImportFamily {
  return {
    id: "family-existing",
    family_name: "Chen family",
    guardian_names: [],
    email: "",
    phone: "",
    preferred_campus_id: "campus-1",
    notes: "",
    parent1_name: null,
    parent1_email: null,
    parent1_phone: null,
    parent2_name: null,
    parent2_email: null,
    parent2_phone: null,
    demo: true,
    ...overrides,
  };
}

function makeCohort(overrides: Partial<ExistingImportCohort> = {}): ExistingImportCohort {
  return { id: "cohort-1", name: "SAT Weekend", demo: true, ...overrides };
}

function makeEnrollment(overrides: Partial<ExistingImportEnrollment> = {}): ExistingImportEnrollment {
  return {
    id: "enrollment-existing",
    student_id: "student-existing",
    cohort_id: "cohort-1",
    status: "active",
    registered_at: "2026-01-01",
    demo: true,
    ...overrides,
  };
}

function makeInput(overrides: Partial<StudentImportPlannerInput> = {}): StudentImportPlannerInput {
  let nextId = 0;
  return {
    targetDemo: true,
    rows: [makeRow()],
    existingStudents: [],
    existingFamilies: [],
    existingEnrollments: [],
    cohorts: [],
    newFieldDefinitions: [],
    defaultCampusId: "campus-1",
    defaultRegisteredAt: "2026-07-09",
    createId: (prefix) => `${prefix}-${++nextId}`,
    ...overrides,
  };
}

describe("student import planner", () => {
  it("never matches a student from the opposite partition", () => {
    const plan = buildStudentImportPlan(makeInput({
      targetDemo: true,
      existingStudents: [makeStudent({ id: "main-student", demo: false, email: "same@example.com" })],
      rows: [makeRow({ studentEmail: "same@example.com" })],
    }));

    expect(plan.rows[0]?.action).toBe("create");
    expect(plan.students[0]?.id).not.toBe("main-student");
  });

  it("matches by external id before email", () => {
    const plan = buildStudentImportPlan(makeInput({
      existingFamilies: [makeFamily()],
      existingStudents: [
        makeStudent({ id: "by-external", external_id: "S-100", email: "old@example.com" }),
        makeStudent({ id: "by-email", external_id: "S-200", email: "new@example.com" }),
      ],
      rows: [makeRow({ externalId: "S-100", studentEmail: "new@example.com" })],
    }));

    expect(plan.rows[0]).toMatchObject({ action: "update", studentId: "by-external" });
  });

  it("blocks an ambiguous cohort name", () => {
    const plan = buildStudentImportPlan(makeInput({
      cohorts: [makeCohort({ id: "a" }), makeCohort({ id: "b" })],
      rows: [makeRow({ cohortName: "SAT Weekend" })],
    }));

    expect(plan.rows[0]?.errors).toContain("Cohort name matches more than one demo cohort.");
    expect(plan.enrollments).toHaveLength(0);
  });

  it("preserves stored values when update cells are blank", () => {
    const plan = buildStudentImportPlan(makeInput({
      existingFamilies: [makeFamily()],
      existingStudents: [makeStudent({ id: "existing", external_id: "S-100", school: "Existing School" })],
      rows: [makeRow({ externalId: "S-100", school: "", suppliedFields: [] })],
    }));

    expect(plan.students[0]?.school).toBe("Existing School");
  });

  it("never falls through an ambiguous higher-priority match", () => {
    const plan = buildStudentImportPlan(makeInput({
      existingStudents: [
        makeStudent({ id: "first", external_id: "S-100", email: "unique@example.com" }),
        makeStudent({ id: "second", external_id: "s-100", email: "other@example.com" }),
      ],
      rows: [makeRow({ externalId: "S-100", studentEmail: "unique@example.com" })],
    }));

    expect(plan.rows[0]).toMatchObject({ action: "error", studentId: null });
    expect(plan.rows[0]?.errors).toContain("External ID matches more than one demo student.");
    expect(plan.students).toHaveLength(0);
  });

  it("collapses duplicate students and families from the same file", () => {
    const row = makeRow({ externalId: "S-100", parent1Email: "parent@example.com" });
    const plan = buildStudentImportPlan(makeInput({
      rows: [row, { ...row, rowNumber: 3 }],
    }));

    expect(plan.students).toHaveLength(1);
    expect(plan.families).toHaveLength(1);
    expect(plan.rows.map((item) => item.action)).toEqual(["create", "skip"]);
    expect(plan.summary).toMatchObject({ creates: 1, updates: 0, skips: 1 });
  });

  it("rejects a cohort id that exists only in the opposite partition", () => {
    const plan = buildStudentImportPlan(makeInput({
      cohorts: [makeCohort({ id: "main-cohort", demo: false })],
      rows: [makeRow({ cohortId: "main-cohort" })],
    }));

    expect(plan.rows[0]?.errors).toContain("Cohort ID does not match a demo cohort.");
    expect(plan.enrollments).toHaveLength(0);
  });

  it("does not recreate an existing enrollment", () => {
    const plan = buildStudentImportPlan(makeInput({
      existingFamilies: [makeFamily()],
      existingStudents: [makeStudent({ external_id: "S-100" })],
      existingEnrollments: [makeEnrollment()],
      cohorts: [makeCohort()],
      rows: [makeRow({ externalId: "S-100", cohortId: "cohort-1" })],
    }));

    expect(plan.enrollments).toHaveLength(0);
    expect(plan.summary.enrollments).toBe(0);
  });

  it("deduplicates repeated enrollment requests within one file", () => {
    const row = makeRow({ externalId: "S-100", cohortName: "SAT Weekend" });
    const plan = buildStudentImportPlan(makeInput({
      cohorts: [makeCohort()],
      rows: [row, { ...row, rowNumber: 3 }],
    }));

    expect(plan.enrollments).toHaveLength(1);
    expect(plan.summary.enrollments).toBe(1);
  });

  it("updates both names for fullName and merges only supplied custom keys", () => {
    const plan = buildStudentImportPlan(makeInput({
      existingFamilies: [makeFamily()],
      existingStudents: [makeStudent({
        external_id: "S-100",
        first_name: "Old",
        last_name: "Name",
        custom_fields: { keep: "yes", replace: "old" },
      })],
      rows: [makeRow({
        externalId: "S-100",
        firstName: "New",
        lastName: "Name",
        school: "",
        customFields: { replace: "new", added: true },
        suppliedFields: ["externalId", "fullName"],
      })],
    }));

    expect(plan.students[0]).toMatchObject({
      first_name: "New",
      last_name: "Name",
      school: "Central High",
      custom_fields: { keep: "yes", replace: "new", added: true },
    });
  });

  it("reports missing required names without creating payloads", () => {
    const plan = buildStudentImportPlan(makeInput({
      rows: [makeRow({ firstName: "", lastName: "", suppliedFields: [] })],
    }));

    expect(plan.rows[0]?.errors).toEqual([
      "First name is required for a new student.",
      "Last name is required for a new student.",
    ]);
    expect(plan.students).toHaveLength(0);
    expect(plan.summary.errors).toBe(1);
  });

  it("uses injected ids, emits DB-shaped payloads and summarizes included rows", () => {
    let nextId = 0;
    const plan = buildStudentImportPlan(makeInput({
      cohorts: [makeCohort()],
      rows: [makeRow({ cohortId: "cohort-1", customFields: { graduation_year: 2027 } })],
      newFieldDefinitions: [{
        key: "graduation_year",
        label: "Graduation Year",
        dataType: "number",
        headerAliases: ["Grad Year"],
        required: false,
        sortOrder: 2,
      }],
      createId: (prefix) => `${prefix}-fixed-${++nextId}`,
    }));

    expect(plan.families[0]).toMatchObject({
      id: "family-fixed-2",
      family_name: "Chen family",
      preferred_campus_id: "campus-1",
      demo: true,
    });
    expect(plan.students[0]).toMatchObject({
      id: "student-fixed-3",
      family_id: "family-fixed-2",
      first_name: "Maya",
      custom_fields: { graduation_year: 2027 },
      demo: true,
    });
    expect(plan.enrollments[0]).toMatchObject({
      id: "enrollment-fixed-4",
      student_id: "student-fixed-3",
      cohort_id: "cohort-1",
      registered_at: "2026-07-09",
      demo: true,
    });
    expect(plan.newFieldDefinitions).toEqual([{
      id: "field-fixed-1",
      key: "graduation_year",
      label: "Graduation Year",
      data_type: "number",
      header_aliases: ["Grad Year"],
      required: false,
      sensitive: true,
      sort_order: 2,
      demo: true,
    }]);
    expect(plan.summary).toEqual({ creates: 1, updates: 0, enrollments: 1, skips: 0, warnings: 0, errors: 0 });
  });
});
