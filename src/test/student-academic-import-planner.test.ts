import { describe, expect, it } from "vitest";
import { buildEasternRecurringSessions } from "@/lib/eastern-recurring-sessions";
import {
  buildStudentAcademicImportPlan,
  type StudentAcademicImportPlannerInput,
} from "@/lib/student-academic-import-planner";
import type {
  NormalizedAcademicRow,
  StudentWorkbookSetup,
} from "@/lib/student-workbook-schema";

const satProgram = { id: "program-sat", name: "SAT", track: "SAT", is_archived: false };
const campus = { id: "campus-main", name: "Main", modality: "In person" };
const summerTerm = {
  id: "term-summer",
  name: "Summer 2026",
  start_date: "2026-07-07",
  end_date: "2026-07-11",
};

const validMwfRow = {
  rowNumber: 2,
  studentName: "  Ada   Lovelace ",
  cohortName: "MWF",
  sessionTitle: "G4",
  roomLabel: "Room 201",
  scores: [{
    assessmentTitle: "HW1 – PSAT",
    assessmentDate: "",
    rw: 720,
    math: 760,
    total: 1480,
    warnings: [],
  }],
  errors: [],
} satisfies NormalizedAcademicRow;

const validTthsRow = {
  rowNumber: 3,
  studentName: "Grace Hopper",
  cohortName: "TTHS",
  sessionTitle: "G4",
  roomLabel: "Room 201",
  scores: [{
    assessmentTitle: "HW1 – PSAT",
    assessmentDate: "",
    rw: 700,
    math: 750,
    total: 1450,
    warnings: [],
  }],
  errors: [],
} satisfies NormalizedAcademicRow;

const demoStudents = [
  { id: "student-ada", first_name: "Ada", last_name: "Lovelace", demo: true },
  { id: "student-grace", first_name: "Grace", last_name: "Hopper", demo: true },
];

const setup = {
  cohorts: [
    {
      sourceClass: "MWF",
      programId: satProgram.id,
      campusId: campus.id,
      termId: summerTerm.id,
      capacity: 24,
    },
    {
      sourceClass: "TTHS",
      programId: satProgram.id,
      campusId: campus.id,
      termId: summerTerm.id,
      capacity: 24,
    },
  ],
  assessmentDates: [
    { sourceClass: "MWF", assessmentTitle: "HW1 – PSAT", date: "2026-07-10" },
    { sourceClass: "TTHS", assessmentTitle: "HW1 – PSAT", date: "2026-07-11" },
  ],
} satisfies StudentWorkbookSetup;

function makeIds() {
  const counters = new Map<string, number>();
  return (prefix: string) => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}-${next}`;
  };
}

function build(overrides: Partial<StudentAcademicImportPlannerInput> = {}) {
  return buildStudentAcademicImportPlan({
    targetDemo: true,
    rows: [validMwfRow, validTthsRow],
    setup,
    students: demoStudents,
    cohorts: [],
    enrollments: [],
    sessions: [],
    assessments: [],
    results: [],
    programs: [satProgram],
    campuses: [campus],
    terms: [summerTerm],
    createId: makeIds(),
    ...overrides,
  });
}

const existingMwfCohort = {
  id: "cohort-mwf",
  name: "MWF",
  program_id: satProgram.id,
  campus_id: campus.id,
  term_id: summerTerm.id,
  capacity: 24,
  cadence: "MWF",
  cohort_mode: "In person",
  start_date: summerTerm.start_date,
  end_date: summerTerm.end_date,
  room_label: "Room 201",
  is_archived: false,
  demo: true,
};

describe("buildStudentAcademicImportPlan", () => {
  it("plans cohorts, Eastern sessions, enrollments, assessments, and results", () => {
    const plan = build();

    expect(plan.cohorts.map((row) => row.name)).toEqual(["MWF", "TTHS"]);
    expect(plan.cohorts[0]).toMatchObject({
      program_id: satProgram.id,
      campus_id: campus.id,
      term_id: summerTerm.id,
      capacity: 24,
      cadence: "MWF",
      cohort_mode: "In person",
      start_date: summerTerm.start_date,
      end_date: summerTerm.end_date,
      room_label: "Room 201",
      demo: true,
    });
    expect(plan.sessions.every((row) => row.title === "G4")).toBe(true);
    expect(plan.sessions.every((row) => row.room_label === "Room 201")).toBe(true);
    expect(plan.assessments).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "HW1 – PSAT", date: "2026-07-10", demo: true }),
    ]));
    expect(plan.results[0]).toMatchObject({
      id: "assessment-1:student-ada",
      total_score: 1480,
      section_scores: [{ label: "RW", score: 720 }, { label: "Math", score: 760 }],
      delta_from_previous: 0,
      demo: true,
    });
    expect(plan.enrollments).toHaveLength(2);
    expect(plan.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowNumber: 2, studentId: "student-ada", cohortId: "cohort-1", errors: [] }),
      expect.objectContaining({ rowNumber: 3, studentId: "student-grace", cohortId: "cohort-2", errors: [] }),
    ]));
    expect(plan.requirements).toEqual({ cohorts: [], assessmentDates: [] });
    expect(plan.summary).toMatchObject({
      cohorts: 2,
      sessions: 5,
      enrollments: 2,
      assessments: 2,
      resultCreates: 2,
      resultUpdates: 0,
      errors: 0,
    });
  });

  it("blocks zero exact normalized student-name matches, including opposite-partition names", () => {
    const plan = build({
      rows: [validMwfRow],
      students: [{ id: "main-ada", first_name: "Ada", last_name: "Lovelace", demo: false }],
    });

    expect(plan.rows[0]).toMatchObject({ studentId: null, cohortId: "cohort-1" });
    expect(plan.rows[0].errors).toContain('No Demo student exactly matches "Ada Lovelace".');
    expect(plan.enrollments).toEqual([]);
    expect(plan.results).toEqual([]);
    expect(plan.summary.errors).toBe(1);
  });

  it("blocks two exact normalized student-name matches", () => {
    const plan = build({
      rows: [validMwfRow],
      students: [
        ...demoStudents,
        { id: "student-ada-2", first_name: " ADA ", last_name: " LOVELACE ", demo: true },
      ],
    });

    expect(plan.rows[0].studentId).toBeNull();
    expect(plan.rows[0].errors).toContain(
      'More than one Demo student exactly matches "Ada Lovelace". Disambiguate the directory data.',
    );
    expect(plan.results).toEqual([]);
  });

  it("plans one missing active enrollment and reactivates an existing inactive row", () => {
    const missing = build({
      rows: [validMwfRow],
      cohorts: [existingMwfCohort],
      setup: { cohorts: [], assessmentDates: setup.assessmentDates },
    });
    expect(missing.enrollments).toEqual([
      expect.objectContaining({
        student_id: "student-ada",
        cohort_id: existingMwfCohort.id,
        status: "active",
        registered_at: summerTerm.start_date,
        demo: true,
      }),
    ]);

    const inactive = build({
      rows: [validMwfRow],
      cohorts: [existingMwfCohort],
      setup: { cohorts: [], assessmentDates: setup.assessmentDates },
      enrollments: [{
        id: "enrollment-old",
        student_id: "student-ada",
        cohort_id: existingMwfCohort.id,
        status: "inactive",
        registered_at: "2026-01-02",
        demo: true,
      }],
    });
    expect(inactive.enrollments).toEqual([
      expect.objectContaining({ id: "enrollment-old", status: "active", registered_at: "2026-01-02" }),
    ]);
  });

  it("requires missing cohort metadata once per normalized source Class", () => {
    const plan = build({
      rows: [validMwfRow, { ...validMwfRow, rowNumber: 4, studentName: "Grace Hopper", cohortName: " mwf " }],
      setup: { cohorts: [], assessmentDates: [] },
    });

    expect(plan.requirements.cohorts).toEqual(["MWF"]);
    expect(plan.cohorts).toEqual([]);
    expect(plan.rows.every((row) => row.errors.includes('Cohort setup is required for source Class "MWF".'))).toBe(true);
  });

  it("requires selectedCohortId when multiple active target cohorts match", () => {
    const other = { ...existingMwfCohort, id: "cohort-mwf-2" };
    const ambiguous = build({
      rows: [{
        ...validMwfRow,
        scores: [],
        errors: ["HW1 – PSAT: RW must be a number."],
      }],
      cohorts: [existingMwfCohort, other],
      setup: { cohorts: [], assessmentDates: setup.assessmentDates },
    });
    expect(ambiguous.rows[0].errors).toContain(
      'More than one Demo cohort matches source Class "MWF". Choose selectedCohortId.',
    );
    expect(ambiguous.requirements.cohorts).toEqual(["MWF"]);

    const selected = build({
      rows: [validMwfRow],
      cohorts: [existingMwfCohort, other],
      setup: {
        cohorts: [{ sourceClass: "MWF", selectedCohortId: other.id }],
        assessmentDates: setup.assessmentDates,
      },
    });
    expect(selected.rows[0]).toMatchObject({ cohortId: other.id, errors: [] });
    expect(selected.cohorts).toEqual([]);
  });

  it("keeps create and update actions attached to their own score groups", () => {
    const existingAssessment = {
      id: "assessment-existing",
      cohort_id: existingMwfCohort.id,
      title: "HW1 – PSAT",
      date: "2026-07-10",
      sections: [],
      demo: true,
    };
    const plan = build({
      rows: [{
        ...validMwfRow,
        scores: [
          validMwfRow.scores[0],
          { ...validMwfRow.scores[0], assessmentTitle: "HW2 – SAT", total: 1490, math: 770 },
        ],
      }],
      cohorts: [existingMwfCohort],
      setup: {
        cohorts: [],
        assessmentDates: [
          { sourceClass: "MWF", assessmentTitle: "HW1 – PSAT", date: "2026-07-10" },
          { sourceClass: "MWF", assessmentTitle: "HW2 – SAT", date: "2026-07-11" },
        ],
      },
      assessments: [existingAssessment],
      results: [{
        id: "result-existing",
        assessment_id: existingAssessment.id,
        student_id: "student-ada",
        total_score: 1400,
        section_scores: [],
        delta_from_previous: 0,
        demo: true,
      }],
    });

    expect(plan.rows[0].scoreActions).toEqual([
      { assessmentTitle: "HW1 – PSAT", assessmentDate: "2026-07-10", action: "Update assessment result." },
      { assessmentTitle: "HW2 – SAT", assessmentDate: "2026-07-11", action: "Create assessment result." },
    ]);
  });

  it("keeps assessment-date requirements distinct by source Class and title", () => {
    const plan = build({
      setup: { cohorts: setup.cohorts, assessmentDates: [] },
    });

    expect(plan.requirements.assessmentDates).toEqual([
      { sourceClass: "MWF", assessmentTitle: "HW1 – PSAT" },
      { sourceClass: "TTHS", assessmentTitle: "HW1 – PSAT" },
    ]);
    expect(plan.assessments).toEqual([]);
    expect(plan.results).toEqual([]);
  });

  it("uses the reviewed setup date instead of a differing source-row suggestion", () => {
    const suggestedDateRow = {
      ...validMwfRow,
      scores: [{ ...validMwfRow.scores[0], assessmentDate: "2026-07-09" }],
    } satisfies NormalizedAcademicRow;
    const plan = build({ rows: [suggestedDateRow] });

    expect(plan.requirements.assessmentDates).toEqual([]);
    expect(plan.assessments).toEqual([
      expect.objectContaining({ title: "HW1 – PSAT", date: "2026-07-10" }),
    ]);
    expect(plan.results).toEqual([
      expect.objectContaining({ assessment_id: "assessment-1" }),
    ]);
  });

  it("groups conflicting source-row dates under one reviewed setup date", () => {
    const rows = [
      {
        ...validMwfRow,
        scores: [{ ...validMwfRow.scores[0], assessmentDate: "2026-07-09" }],
      },
      {
        ...validMwfRow,
        rowNumber: 4,
        studentName: "Grace Hopper",
        scores: [{ ...validMwfRow.scores[0], assessmentDate: "2026-07-11" }],
      },
    ] satisfies NormalizedAcademicRow[];
    const plan = build({ rows });

    expect(plan.assessments).toEqual([
      expect.objectContaining({ date: "2026-07-10" }),
    ]);
    expect(plan.results).toHaveLength(2);
    expect(new Set(plan.results.map((result) => result.assessment_id))).toEqual(
      new Set(["assessment-1"]),
    );
  });

  it("deduplicates conflicting source-row dates into one unresolved setup requirement", () => {
    const rows = [
      {
        ...validMwfRow,
        scores: [{ ...validMwfRow.scores[0], assessmentDate: "2026-07-09" }],
      },
      {
        ...validMwfRow,
        rowNumber: 4,
        studentName: "Grace Hopper",
        scores: [{ ...validMwfRow.scores[0], assessmentDate: "2026-07-11" }],
      },
    ] satisfies NormalizedAcademicRow[];
    const plan = build({
      rows,
      setup: { cohorts: [setup.cohorts[0]], assessmentDates: [] },
    });

    expect(plan.requirements.assessmentDates).toEqual([
      { sourceClass: "MWF", assessmentTitle: "HW1 – PSAT" },
    ]);
    expect(plan.assessments).toEqual([]);
    expect(plan.results).toEqual([]);
  });

  it("blocks a complete import before generated sessions exceed 1,000", () => {
    const longTerm = {
      id: "term-long",
      name: "Long term",
      start_date: "2026-01-01",
      end_date: "2028-03-01",
    };
    const sessionsPerCohort = buildEasternRecurringSessions({
      cadence: "MWF",
      startDate: longTerm.start_date,
      endDate: longTerm.end_date,
    }).length;
    expect(sessionsPerCohort).toBeLessThanOrEqual(366);
    expect(sessionsPerCohort * 3).toBeGreaterThan(1_000);

    const sourceClasses = ["Cohort A", "Cohort B", "Cohort C"];
    const plan = build({
      rows: sourceClasses.map((cohortName, index) => ({
        ...validMwfRow,
        rowNumber: index + 2,
        studentName: index === 1 ? "Grace Hopper" : "Ada Lovelace",
        cohortName,
        scores: [],
      })),
      setup: { cohorts: [], assessmentDates: [] },
      cohorts: sourceClasses.map((name, index) => ({
        ...existingMwfCohort,
        id: `cohort-long-${index}`,
        name,
        term_id: longTerm.id,
        start_date: longTerm.start_date,
        end_date: longTerm.end_date,
      })),
      terms: [longTerm],
    });

    expect(plan.summary.sessions).toBe(sessionsPerCohort * 2);
    expect(plan.summary.sessions).toBeLessThanOrEqual(1_000);
    expect(plan.rows[2].errors).toContain("An import cannot plan more than 1,000 sessions.");
  });

  it("blocks the affected cohort when Level or Room values conflict", () => {
    const conflict = {
      ...validMwfRow,
      rowNumber: 4,
      studentName: "Grace Hopper",
      sessionTitle: "G5",
      roomLabel: "Room 202",
    } satisfies NormalizedAcademicRow;
    const plan = build({ rows: [validMwfRow, conflict] });

    expect(plan.cohorts).toEqual([]);
    expect(plan.sessions).toEqual([]);
    expect(plan.rows.every((row) => row.errors.includes(
      'Source Class "MWF" has conflicting Level or Room values.',
    ))).toBe(true);
  });

  it("blocks a cohort when any source row omits Level or Room", () => {
    const missingContext = {
      ...validMwfRow,
      rowNumber: 4,
      studentName: "Grace Hopper",
      sessionTitle: "",
    } satisfies NormalizedAcademicRow;
    const plan = build({ rows: [validMwfRow, missingContext] });

    expect(plan.cohorts).toEqual([]);
    expect(plan.sessions).toEqual([]);
    expect(plan.rows.every((row) => row.errors.includes(
      'Source Class "MWF" has conflicting Level or Room values.',
    ))).toBe(true);
  });

  it("reuses existing sessions, assessments, active enrollments, and updates one result payload", () => {
    const existingSessions = buildEasternRecurringSessions({
      cadence: "MWF",
      startDate: summerTerm.start_date,
      endDate: summerTerm.end_date,
    }).map((session, index) => ({
      id: `session-existing-${index}`,
      cohort_id: existingMwfCohort.id,
      title: "G4",
      start_at: session.startAt,
      end_at: session.endAt,
      mode: "In person",
      room_label: "Room 201",
      demo: true,
    }));
    const existingAssessment = {
      id: "assessment-existing",
      cohort_id: existingMwfCohort.id,
      title: "HW1 – PSAT",
      date: "2026-07-10",
      sections: [{ label: "RW", score: 800 }, { label: "Math", score: 800 }],
      demo: true,
    };
    const plan = build({
      rows: [validMwfRow, { ...validMwfRow, rowNumber: 4 }],
      cohorts: [existingMwfCohort],
      setup: { cohorts: [], assessmentDates: setup.assessmentDates },
      enrollments: [{
        id: "enrollment-existing",
        student_id: "student-ada",
        cohort_id: existingMwfCohort.id,
        status: "active",
        registered_at: "2026-01-01",
        demo: true,
      }],
      sessions: existingSessions,
      assessments: [existingAssessment],
      results: [{
        id: "result-existing",
        assessment_id: existingAssessment.id,
        student_id: "student-ada",
        total_score: 1400,
        section_scores: [{ label: "RW", score: 700 }, { label: "Math", score: 700 }],
        delta_from_previous: 20,
        demo: true,
      }],
    });

    expect(plan.cohorts).toEqual([]);
    expect(plan.sessions).toEqual([]);
    expect(plan.enrollments).toEqual([]);
    expect(plan.assessments).toEqual([]);
    expect(plan.results).toEqual([
      expect.objectContaining({ id: "result-existing", total_score: 1480 }),
    ]);
    expect(plan.summary).toMatchObject({ resultCreates: 0, resultUpdates: 1, errors: 0 });
  });

  it("filters every partitioned lookup by demo before matching or reusing", () => {
    const recurrences = buildEasternRecurringSessions({
      cadence: "MWF",
      startDate: summerTerm.start_date,
      endDate: summerTerm.end_date,
    });
    const targetAssessment = {
      id: "assessment-target",
      cohort_id: existingMwfCohort.id,
      title: "HW1 – PSAT",
      date: "2026-07-10",
      sections: [],
      demo: true,
    };
    const plan = build({
      rows: [validMwfRow],
      setup: { cohorts: [], assessmentDates: setup.assessmentDates },
      students: [demoStudents[0], { ...demoStudents[0], id: "student-main", demo: false }],
      cohorts: [existingMwfCohort, { ...existingMwfCohort, id: "cohort-main", demo: false }],
      enrollments: [{
        id: "enrollment-main",
        student_id: "student-ada",
        cohort_id: existingMwfCohort.id,
        status: "active",
        registered_at: "2026-01-01",
        demo: false,
      }],
      sessions: recurrences.map((session, index) => ({
        id: `session-main-${index}`,
        cohort_id: existingMwfCohort.id,
        title: "G4",
        start_at: session.startAt,
        end_at: session.endAt,
        mode: "In person",
        room_label: "Room 201",
        demo: false,
      })),
      assessments: [
        targetAssessment,
        { ...targetAssessment, id: "assessment-main", demo: false },
      ],
      results: [{
        id: "result-main",
        assessment_id: targetAssessment.id,
        student_id: "student-ada",
        total_score: 1480,
        section_scores: [],
        delta_from_previous: 0,
        demo: false,
      }],
    });

    expect(plan.rows[0]).toMatchObject({ studentId: "student-ada", cohortId: existingMwfCohort.id, errors: [] });
    expect(plan.enrollments).toHaveLength(1);
    expect(plan.sessions).toHaveLength(recurrences.length);
    expect(plan.assessments).toEqual([]);
    expect(plan.results).toEqual([
      expect.objectContaining({ id: "assessment-target:student-ada" }),
    ]);
  });
});
