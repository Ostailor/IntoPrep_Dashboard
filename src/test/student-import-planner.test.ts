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

  it("does not rewrite family-derived fields when no family fields are supplied", () => {
    const plan = buildStudentImportPlan(makeInput({
      existingFamilies: [makeFamily({
        guardian_names: ["Stored Guardian Label"],
        parent1_name: "Parent Chen",
        parent1_email: "parent@example.com",
        email: "parent@example.com",
      })],
      existingStudents: [makeStudent({ external_id: "S-100" })],
      rows: [makeRow({ externalId: "S-100", suppliedFields: ["externalId"] })],
    }));

    expect(plan.rows[0]?.action).toBe("skip");
    expect(plan.families[0]?.guardian_names).toEqual(["Stored Guardian Label"]);
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

  it("blocks ambiguous parent-email-and-name matches before name-and-school matching", () => {
    const plan = buildStudentImportPlan(makeInput({
      existingFamilies: [
        makeFamily({ id: "family-a", parent1_email: "shared@example.com" }),
        makeFamily({ id: "family-b", parent1_email: "shared@example.com" }),
      ],
      existingStudents: [
        makeStudent({ id: "student-a", family_id: "family-a", school: "Central High" }),
        makeStudent({ id: "student-b", family_id: "family-b", school: "Other High" }),
      ],
      rows: [makeRow({ parent1Email: "shared@example.com", school: "Central High" })],
    }));

    expect(plan.rows[0]?.errors).toContain("Parent email and student name matches more than one demo student.");
    expect(plan.students).toHaveLength(0);
  });

  it("blocks ambiguous name-and-school matches", () => {
    const plan = buildStudentImportPlan(makeInput({
      existingStudents: [
        makeStudent({ id: "student-a" }),
        makeStudent({ id: "student-b" }),
      ],
      rows: [makeRow()],
    }));

    expect(plan.rows[0]?.errors).toContain("Student name and school matches more than one demo student.");
    expect(plan.students).toHaveLength(0);
  });

  it("updates external-id and email indexes for later rows", () => {
    const plan = buildStudentImportPlan(makeInput({
      existingFamilies: [makeFamily({ parent1_email: "parent@example.com", email: "parent@example.com" })],
      existingStudents: [makeStudent({ external_id: "S-OLD", email: "old@example.com" })],
      rows: [
        makeRow({
          externalId: "S-NEW",
          studentEmail: "new@example.com",
          parent1Email: "parent@example.com",
          suppliedFields: ["externalId", "studentEmail", "parent1Email"],
        }),
        makeRow({ rowNumber: 3, studentEmail: "new@example.com", suppliedFields: ["studentEmail"] }),
        makeRow({ rowNumber: 4, externalId: "S-NEW", suppliedFields: ["externalId"] }),
      ],
    }));

    expect(plan.rows.map((row) => row.studentId)).toEqual([
      "student-existing",
      "student-existing",
      "student-existing",
    ]);
    expect(plan.students).toHaveLength(1);
  });

  it("updates parent-email/name and name/school indexes for later rows", () => {
    const plan = buildStudentImportPlan(makeInput({
      existingFamilies: [makeFamily({ parent1_email: "old-parent@example.com", email: "old-parent@example.com" })],
      existingStudents: [makeStudent({ external_id: "S-100", first_name: "Old", last_name: "Name", school: "Old School" })],
      rows: [
        makeRow({
          externalId: "S-100",
          firstName: "New",
          lastName: "Name",
          school: "New School",
          parent1Email: "new-parent@example.com",
          suppliedFields: ["externalId", "fullName", "school", "parent1Email"],
        }),
        makeRow({
          rowNumber: 3,
          firstName: "New",
          lastName: "Name",
          school: "Unrelated School",
          parent1Email: "new-parent@example.com",
          suppliedFields: [],
        }),
        makeRow({ rowNumber: 4, firstName: "New", lastName: "Name", school: "New School", suppliedFields: [] }),
      ],
    }));

    expect(plan.rows.map((row) => row.studentId)).toEqual([
      "student-existing",
      "student-existing",
      "student-existing",
    ]);
    expect(plan.students).toHaveLength(1);
  });

  it("turns a dynamically introduced duplicate into an ambiguous index entry", () => {
    const plan = buildStudentImportPlan(makeInput({
      existingFamilies: [makeFamily()],
      existingStudents: [
        makeStudent({ id: "student-a", external_id: "S-A", email: "a@example.com" }),
        makeStudent({ id: "student-b", external_id: "S-B", email: "shared@example.com" }),
      ],
      rows: [
        makeRow({ externalId: "S-A", studentEmail: "shared@example.com", suppliedFields: ["externalId", "studentEmail"] }),
        makeRow({ rowNumber: 3, studentEmail: "shared@example.com", suppliedFields: ["studentEmail"] }),
      ],
    }));

    expect(plan.rows[1]?.errors).toContain("Student email matches more than one demo student.");
    expect(plan.rows[1]?.studentId).toBeNull();
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

  it("updates an unchanged existing student when the row adds an enrollment", () => {
    const plan = buildStudentImportPlan(makeInput({
      existingFamilies: [makeFamily()],
      existingStudents: [makeStudent({ external_id: "S-100" })],
      cohorts: [makeCohort()],
      rows: [makeRow({ externalId: "S-100", cohortId: "cohort-1", suppliedFields: ["externalId", "cohortId"] })],
    }));

    expect(plan.rows[0]?.action).toBe("update");
    expect(plan.enrollments).toHaveLength(1);
    expect(plan.summary).toMatchObject({ updates: 1, enrollments: 1, skips: 0 });
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

  it("marks a duplicate planned student that adds another cohort as a warning", () => {
    const row = makeRow({ externalId: "S-100", cohortId: "cohort-a" });
    const plan = buildStudentImportPlan(makeInput({
      cohorts: [makeCohort({ id: "cohort-a" }), makeCohort({ id: "cohort-b" })],
      rows: [row, { ...row, rowNumber: 3, cohortId: "cohort-b" }],
    }));

    expect(plan.rows.map((item) => item.action)).toEqual(["create", "warning"]);
    expect(plan.rows[1]?.warnings).toContain("Duplicate row merged into the earlier student record.");
    expect(plan.enrollments).toHaveLength(2);
    expect(plan.summary).toMatchObject({ creates: 1, updates: 0, enrollments: 2, skips: 0, warnings: 1 });
  });

  it("skips repeated unchanged existing students", () => {
    const row = makeRow({ externalId: "S-100", suppliedFields: ["externalId"] });
    const plan = buildStudentImportPlan(makeInput({
      existingFamilies: [makeFamily()],
      existingStudents: [makeStudent({ external_id: "S-100" })],
      rows: [row, { ...row, rowNumber: 3 }],
    }));

    expect(plan.rows.map((item) => item.action)).toEqual(["skip", "skip"]);
    expect(plan.summary).toMatchObject({ creates: 0, updates: 0, skips: 2 });
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
      existingFieldDefinitions: [
        { key: "replace", demo: true },
        { key: "added", demo: true },
      ],
    }));

    expect(plan.students[0]).toMatchObject({
      first_name: "New",
      last_name: "Name",
      school: "Central High",
      custom_fields: { keep: "yes", replace: "new", added: true },
    });
  });

  it("blocks stale custom keys without emitting row payloads", () => {
    const plan = buildStudentImportPlan(makeInput({
      rows: [makeRow({ customFields: { stale_key: "value" } })],
    }));

    expect(plan.rows[0]).toMatchObject({ action: "error", studentId: null, familyId: null });
    expect(plan.rows[0]?.errors).toContain('Custom field "stale_key" is not available in the demo import mapping.');
    expect(plan.families).toHaveLength(0);
    expect(plan.students).toHaveLength(0);
    expect(plan.enrollments).toHaveLength(0);
  });

  it("does not accept a custom definition from the opposite partition", () => {
    const plan = buildStudentImportPlan(makeInput({
      existingFieldDefinitions: [{ key: "main_only", demo: false }],
      rows: [makeRow({ customFields: { main_only: "private" } })],
    }));

    expect(plan.rows[0]?.errors).toContain('Custom field "main_only" is not available in the demo import mapping.');
    expect(plan.students).toHaveLength(0);
  });

  it("shares a family for different same-file students with the same parent email without mutating input", () => {
    const rows = [
      makeRow({ externalId: "S-100", parent1Email: "parent@example.com" }),
      makeRow({ rowNumber: 3, externalId: "S-200", firstName: "Rohan", parent1Email: "parent@example.com" }),
    ];
    const snapshot = structuredClone(rows);
    const plan = buildStudentImportPlan(makeInput({ rows }));

    expect(plan.students).toHaveLength(2);
    expect(plan.families).toHaveLength(1);
    expect(plan.students.map((student) => student.family_id)).toEqual([plan.families[0]?.id, plan.families[0]?.id]);
    expect(rows).toEqual(snapshot);
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
      createId: (prefix) => prefix === "field"
        ? "00000000-0000-4000-8000-000000000001"
        : `${prefix}-fixed-${++nextId}`,
    }));

    expect(plan.families[0]).toMatchObject({
      id: "family-fixed-1",
      family_name: "Chen family",
      preferred_campus_id: "campus-1",
      demo: true,
    });
    expect(plan.students[0]).toMatchObject({
      id: "student-fixed-2",
      family_id: "family-fixed-1",
      first_name: "Maya",
      custom_fields: { graduation_year: 2027 },
      demo: true,
    });
    expect(plan.enrollments[0]).toMatchObject({
      id: "enrollment-fixed-3",
      student_id: "student-fixed-2",
      cohort_id: "cohort-1",
      registered_at: "2026-07-09",
      demo: true,
    });
    expect(plan.newFieldDefinitions).toEqual([{
      id: "00000000-0000-4000-8000-000000000001",
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
