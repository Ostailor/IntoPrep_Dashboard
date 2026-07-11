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

const satProgram = {
  id: "program-sat",
  name: "SAT",
  track: "SAT",
  format: "Small group",
  is_archived: false,
  demo: true,
};
const campus = {
  id: "campus-main",
  name: "Main",
  location: "Westfield, NJ",
  modality: "In person",
  demo: true,
};
const summerTerm = {
  id: "term-summer",
  name: "Summer 2026",
  start_date: "2026-07-07",
  end_date: "2026-07-11",
  demo: true,
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
  it("excludes stale unreferenced catalog drafts from an existing-cohort commit plan", () => {
    const plan = build({
      rows: [validMwfRow],
      setup: {
        catalog: {
          programs: [{ key: "stale-program", name: "Stale Program", track: "SAT", format: "Small group" }],
          campuses: [{ key: "stale-campus", name: "Stale Campus", location: "Westfield, NJ", modality: "In person" }],
          terms: [{ key: "stale-term", name: "Stale Term", startDate: "2026-07-07", endDate: "2026-07-11" }],
        },
        cohorts: [{
          sourceClass: "MWF",
          selectedCohortId: existingMwfCohort.id,
          programDraftKey: "stale-program",
          campusDraftKey: "stale-campus",
          termDraftKey: "stale-term",
          capacity: 24,
        }],
        assessmentDates: [setup.assessmentDates[0]],
      },
      cohorts: [existingMwfCohort],
    });

    expect(plan.programs).toEqual([]);
    expect(plan.campuses).toEqual([]);
    expect(plan.terms).toEqual([]);
    expect(plan.summary).toMatchObject({ programs: 0, campuses: 0, terms: 0 });
    expect(plan.rows[0].errors).toEqual([]);
  });

  it("drops stale catalog drafts when an exact cohort appears before the next preview", () => {
    const plan = build({
      rows: [validMwfRow],
      setup: {
        catalog: {
          programs: [{ key: "stale-program", name: "Stale Program", track: "SAT", format: "Small group" }],
          campuses: [{ key: "stale-campus", name: "Stale Campus", location: "Westfield, NJ", modality: "In person" }],
          terms: [{ key: "stale-term", name: "Stale Term", startDate: "2026-07-07", endDate: "2026-07-11" }],
        },
        cohorts: [{
          sourceClass: "MWF",
          programDraftKey: "stale-program",
          campusDraftKey: "stale-campus",
          termDraftKey: "stale-term",
          capacity: 24,
        }],
        assessmentDates: [setup.assessmentDates[0]],
      },
      cohorts: [existingMwfCohort],
    });

    expect(plan.programs).toEqual([]);
    expect(plan.campuses).toEqual([]);
    expect(plan.terms).toEqual([]);
    expect(plan.cohorts).toEqual([]);
    expect(plan.summary).toMatchObject({ programs: 0, campuses: 0, terms: 0, cohorts: 0 });
    expect(plan.rows[0]).toMatchObject({ cohortId: existingMwfCohort.id, errors: [] });
  });

  it("plans each shared catalog draft once and uses only server-generated IDs", () => {
    const catalogSetup = {
      catalog: {
        programs: [{ key: "review-program", name: "Summer SAT", track: "SAT", format: "Small group" }],
        campuses: [{
          key: "review-campus",
          name: "Westfield",
          location: "Westfield, NJ",
          modality: "In person",
        }],
        terms: [{
          key: "review-term",
          name: "Summer 2026",
          startDate: "2026-07-07",
          endDate: "2026-07-11",
        }],
      },
      cohorts: ["MWF", "TTHS"].map((sourceClass) => ({
        sourceClass,
        programDraftKey: "review-program",
        campusDraftKey: "review-campus",
        termDraftKey: "review-term",
        capacity: 24,
      })),
      assessmentDates: setup.assessmentDates,
    } satisfies StudentWorkbookSetup;

    const plan = build({
      setup: catalogSetup,
      programs: [],
      campuses: [],
      terms: [],
    });

    expect(plan.programs).toEqual([expect.objectContaining({
      id: expect.stringMatching(/^program-/),
      name: "Summer SAT",
      track: "SAT",
      format: "Small group",
      demo: true,
    })]);
    expect(plan.campuses).toEqual([expect.objectContaining({
      id: expect.stringMatching(/^campus-/),
      name: "Westfield",
      location: "Westfield, NJ",
      modality: "In person",
      demo: true,
    })]);
    expect(plan.terms).toEqual([expect.objectContaining({
      id: expect.stringMatching(/^term-/),
      name: "Summer 2026",
      start_date: "2026-07-07",
      end_date: "2026-07-11",
      demo: true,
    })]);
    expect(plan.cohorts).toHaveLength(2);
    expect(plan.cohorts.every((cohort) => cohort.program_id === plan.programs[0].id)).toBe(true);
    expect(plan.cohorts.every((cohort) => cohort.campus_id === plan.campuses[0].id)).toBe(true);
    expect(plan.cohorts.every((cohort) => cohort.term_id === plan.terms[0].id)).toBe(true);
    expect(plan.programs[0].id).not.toBe("review-program");
    expect(plan.summary).toMatchObject({ programs: 1, campuses: 1, terms: 1, errors: 0 });
  });

  it("reuses exact-name catalog records only when every material field matches", () => {
    const existingProgram = { ...satProgram, id: "program-existing", name: "Summer SAT" };
    const existingCampus = { ...campus, id: "campus-existing", name: "Westfield" };
    const existingTerm = { ...summerTerm, id: "term-existing" };
    const plan = build({
      rows: [validMwfRow],
      setup: {
        catalog: {
          programs: [{ key: "program-draft", name: "  summer   sat ", track: "SAT", format: "Small group" }],
          campuses: [{
            key: "campus-draft",
            name: " westfield ",
            location: "Westfield, NJ",
            modality: "In person",
          }],
          terms: [{
            key: "term-draft",
            name: " SUMMER 2026 ",
            startDate: summerTerm.start_date,
            endDate: summerTerm.end_date,
          }],
        },
        cohorts: [{
          sourceClass: "MWF",
          programDraftKey: "program-draft",
          campusDraftKey: "campus-draft",
          termDraftKey: "term-draft",
          capacity: 24,
        }],
        assessmentDates: [setup.assessmentDates[0]],
      },
      programs: [existingProgram],
      campuses: [existingCampus],
      terms: [existingTerm],
    });

    expect(plan.programs).toEqual([]);
    expect(plan.campuses).toEqual([]);
    expect(plan.terms).toEqual([]);
    expect(plan.cohorts[0]).toMatchObject({
      program_id: existingProgram.id,
      campus_id: existingCampus.id,
      term_id: existingTerm.id,
    });
    expect(plan.rows[0].errors).toEqual([]);
  });

  it("blocks an exact-name draft whose material fields conflict", () => {
    const plan = build({
      rows: [validMwfRow],
      setup: {
        catalog: {
          programs: [{ key: "program-draft", name: "SAT", track: "SAT", format: "One-to-one" }],
          campuses: [],
          terms: [],
        },
        cohorts: [{
          sourceClass: "MWF",
          programDraftKey: "program-draft",
          campusId: campus.id,
          termId: summerTerm.id,
          capacity: 24,
        }],
        assessmentDates: [setup.assessmentDates[0]],
      },
    });

    expect(plan.programs).toEqual([]);
    expect(plan.cohorts).toEqual([]);
    expect(plan.requirements.cohorts).toEqual(["MWF"]);
    expect(plan.rows[0].errors).toContain(
      'Program draft "SAT" conflicts with an existing Demo Program with the same name for Source cohort (Excel Class) "MWF".',
    );
  });

  it("blocks duplicate normalized planned names and dangling draft keys", () => {
    const duplicate = build({
      setup: {
        catalog: {
          programs: [
            { key: "program-one", name: "Summer SAT", track: "SAT", format: "Small group" },
            { key: "program-two", name: " summer   sat ", track: "SAT", format: "Small group" },
          ],
          campuses: [],
          terms: [],
        },
        cohorts: [
          {
            sourceClass: "MWF",
            programDraftKey: "program-one",
            campusId: campus.id,
            termId: summerTerm.id,
            capacity: 24,
          },
          {
            sourceClass: "TTHS",
            programDraftKey: "program-two",
            campusId: campus.id,
            termId: summerTerm.id,
            capacity: 24,
          },
        ],
        assessmentDates: setup.assessmentDates,
      },
    });
    expect(duplicate.programs).toEqual([]);
    expect(duplicate.rows.every((row) => row.errors.some((error) =>
      error.includes('More than one planned Program uses the name "Summer SAT"'),
    ))).toBe(true);

    const dangling = build({
      rows: [validMwfRow],
      setup: {
        catalog: { programs: [], campuses: [], terms: [] },
        cohorts: [{
          sourceClass: "MWF",
          programDraftKey: "missing-program",
          campusId: campus.id,
          termId: summerTerm.id,
          capacity: 24,
        }],
        assessmentDates: [setup.assessmentDates[0]],
      },
    });
    expect(dangling.rows[0].errors).toContain(
      'Program draft key "missing-program" is unavailable for Source cohort (Excel Class) "MWF".',
    );
    expect(dangling.cohorts).toEqual([]);
  });

  it("blocks duplicate setup entries before resolving their distinct drafts", () => {
    const plan = build({
      rows: [validMwfRow],
      setup: {
        catalog: {
          programs: [
            { key: "program-one", name: "Summer SAT", track: "SAT", format: "Small group" },
            { key: "program-two", name: "Advanced SAT", track: "SAT", format: "Small group" },
          ],
          campuses: [],
          terms: [],
        },
        cohorts: [
          {
            sourceClass: "MWF",
            programDraftKey: "program-one",
            campusId: campus.id,
            termId: summerTerm.id,
            capacity: 24,
          },
          {
            sourceClass: " mwf ",
            programDraftKey: "program-two",
            campusId: campus.id,
            termId: summerTerm.id,
            capacity: 24,
          },
        ],
        assessmentDates: [setup.assessmentDates[0]],
      },
    });

    expect(plan.programs).toEqual([]);
    expect(plan.cohorts).toEqual([]);
    expect(plan.requirements.cohorts).toEqual(["MWF"]);
    expect(plan.rows[0].errors).toContain(
      'More than one setup entry matches Source cohort (Excel Class) "MWF". Keep one cohort setup.',
    );
  });

  it("never resolves catalog records from the opposite partition", () => {
    const mainProgram = { ...satProgram, id: "program-main", name: "Summer SAT", demo: false };
    const mainCampus = { ...campus, id: "campus-main-only", name: "Westfield", demo: false };
    const mainTerm = { ...summerTerm, id: "term-main", demo: false };
    const planned = build({
      rows: [validMwfRow],
      setup: {
        catalog: {
          programs: [{ key: "program-draft", name: "Summer SAT", track: "SAT", format: "Small group" }],
          campuses: [{
            key: "campus-draft",
            name: "Westfield",
            location: "Westfield, NJ",
            modality: "In person",
          }],
          terms: [{
            key: "term-draft",
            name: "Summer 2026",
            startDate: summerTerm.start_date,
            endDate: summerTerm.end_date,
          }],
        },
        cohorts: [{
          sourceClass: "MWF",
          programDraftKey: "program-draft",
          campusDraftKey: "campus-draft",
          termDraftKey: "term-draft",
          capacity: 24,
        }],
        assessmentDates: [setup.assessmentDates[0]],
      },
      programs: [mainProgram],
      campuses: [mainCampus],
      terms: [mainTerm],
    });
    expect(planned.programs[0].id).not.toBe(mainProgram.id);
    expect(planned.campuses[0].id).not.toBe(mainCampus.id);
    expect(planned.terms[0].id).not.toBe(mainTerm.id);
    expect(planned.cohorts[0]).toMatchObject({
      program_id: planned.programs[0].id,
      campus_id: planned.campuses[0].id,
      term_id: planned.terms[0].id,
    });

    const explicit = build({
      rows: [validMwfRow],
      setup: {
        catalog: { programs: [], campuses: [], terms: [] },
        cohorts: [{
          sourceClass: "MWF",
          programId: mainProgram.id,
          campusId: mainCampus.id,
          termId: mainTerm.id,
          capacity: 24,
        }],
        assessmentDates: [setup.assessmentDates[0]],
      },
      programs: [mainProgram],
      campuses: [mainCampus],
      terms: [mainTerm],
    });
    expect(explicit.cohorts).toEqual([]);
    expect(explicit.rows[0].errors).toContain(
      'Cohort setup references unavailable metadata for Source cohort (Excel Class) "MWF".',
    );

    const existingCohortWithMainCatalog = build({
      rows: [{ ...validMwfRow, scores: [] }],
      setup: { catalog: { programs: [], campuses: [], terms: [] }, cohorts: [], assessmentDates: [] },
      cohorts: [{
        ...existingMwfCohort,
        program_id: mainProgram.id,
        campus_id: mainCampus.id,
      }],
      programs: [mainProgram],
      campuses: [mainCampus],
      terms: [summerTerm],
    });
    expect(existingCohortWithMainCatalog.rows[0]).toMatchObject({ cohortId: null });
    expect(existingCohortWithMainCatalog.rows[0].errors).toContain(
      'The selected cohort catalog is unavailable for Source cohort (Excel Class) "MWF".',
    );
  });

  it("fails closed when an existing catalog record has no partition marker", () => {
    const runtimeProgramWithoutDemo = { ...satProgram } as Partial<typeof satProgram>;
    delete runtimeProgramWithoutDemo.demo;
    const plan = build({
      rows: [{ ...validMwfRow, scores: [] }],
      setup: {
        catalog: { programs: [], campuses: [], terms: [] },
        cohorts: [{
          sourceClass: "MWF",
          programId: runtimeProgramWithoutDemo.id,
          campusId: campus.id,
          termId: summerTerm.id,
          capacity: 24,
        }],
        assessmentDates: [],
      },
      programs: [runtimeProgramWithoutDemo as unknown as typeof satProgram],
    });

    expect(plan.cohorts).toEqual([]);
    expect(plan.rows[0].errors).toContain(
      'Cohort setup references unavailable metadata for Source cohort (Excel Class) "MWF".',
    );
  });

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

  it("requires missing cohort metadata once per normalized source cohort", () => {
    const plan = build({
      rows: [validMwfRow, { ...validMwfRow, rowNumber: 4, studentName: "Grace Hopper", cohortName: " mwf " }],
      setup: { cohorts: [], assessmentDates: [] },
    });

    expect(plan.requirements.cohorts).toEqual(["MWF"]);
    expect(plan.cohorts).toEqual([]);
    expect(plan.rows.every((row) => row.errors.includes(
      'Cohort setup is required for Source cohort (Excel Class) "MWF".',
    ))).toBe(true);
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
      'More than one Demo cohort matches Source cohort (Excel Class) "MWF". Choose selectedCohortId.',
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

  it("keeps assessment-date requirements distinct by source cohort and title", () => {
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
      demo: true,
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
      'Source cohort (Excel Class) "MWF" has conflicting Level or Room values.',
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
      'Source cohort (Excel Class) "MWF" has conflicting Level or Room values.',
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

  it("reuses sessions when Supabase serializes the same timestamps with UTC offsets", () => {
    const existingSessions = buildEasternRecurringSessions({
      cadence: "MWF",
      startDate: summerTerm.start_date,
      endDate: summerTerm.end_date,
    }).map((session, index) => ({
      id: `session-existing-${index}`,
      cohort_id: existingMwfCohort.id,
      title: "G4",
      start_at: index === 0
        ? session.startAt.replace(".000Z", "+00:00")
        : session.startAt.replace("T12:00:00.000Z", "T08:00:00-04:00"),
      end_at: index === 0
        ? session.endAt.replace(".000Z", "+00:00")
        : session.endAt.replace("T19:30:00.000Z", "T15:30:00-04:00"),
      mode: "In person",
      room_label: "Room 201",
      demo: true,
    }));

    const plan = build({
      rows: [{ ...validMwfRow, scores: [] }],
      cohorts: [existingMwfCohort],
      setup: { cohorts: [], assessmentDates: [] },
      sessions: existingSessions,
    });

    expect(plan.sessions).toEqual([]);
  });

  it("does not reuse invalid calendar, time, leap-second, or offset timestamps", () => {
    const cohort = {
      ...existingMwfCohort,
      start_date: "2026-03-02",
      end_date: "2026-03-02",
    };
    const [recurrence] = buildEasternRecurringSessions({
      cadence: "MWF",
      startDate: cohort.start_date,
      endDate: cohort.end_date,
    });
    const plan = build({
      rows: [{ ...validMwfRow, scores: [] }],
      cohorts: [cohort],
      setup: { cohorts: [], assessmentDates: [] },
      sessions: [
        ["calendar", recurrence.startAt.replace("2026-03-02", "2026-02-30")],
        ["hour", recurrence.startAt.replace("T13:00:00", "T24:00:00")],
        ["leap-second", recurrence.startAt.replace("T13:00:00", "T13:00:60")],
        ["offset", recurrence.startAt.replace("Z", "+24:00")],
      ].map(([id, startAt]) => ({
        id: `session-invalid-${id}`,
        cohort_id: cohort.id,
        title: "G4",
        start_at: startAt,
        end_at: recurrence.endAt,
        mode: "In person",
        room_label: "Room 201",
        demo: true,
      })),
    });

    expect(plan.sessions).toEqual([
      expect.objectContaining({ start_at: recurrence.startAt, end_at: recurrence.endAt }),
    ]);
  });

  it("does not reuse a session that differs below JavaScript millisecond precision", () => {
    const cohort = {
      ...existingMwfCohort,
      start_date: "2026-07-08",
      end_date: "2026-07-08",
    };
    const [recurrence] = buildEasternRecurringSessions({
      cadence: "MWF",
      startDate: cohort.start_date,
      endDate: cohort.end_date,
    });
    const plan = build({
      rows: [{ ...validMwfRow, scores: [] }],
      cohorts: [cohort],
      setup: { cohorts: [], assessmentDates: [] },
      sessions: [{
        id: "session-one-microsecond-later",
        cohort_id: cohort.id,
        title: "G4",
        start_at: recurrence.startAt.replace(".000Z", ".000001Z"),
        end_at: recurrence.endAt,
        mode: "In person",
        room_label: "Room 201",
        demo: true,
      }],
    });

    expect(plan.sessions).toEqual([
      expect.objectContaining({ start_at: recurrence.startAt, end_at: recurrence.endAt }),
    ]);
  });

  it("does not reuse a session whose timestamps represent distinct instants", () => {
    const [firstRecurrence] = buildEasternRecurringSessions({
      cadence: "MWF",
      startDate: summerTerm.start_date,
      endDate: summerTerm.end_date,
    });
    const shiftedStart = new Date(Date.parse(firstRecurrence.startAt) + 60_000).toISOString();
    const plan = build({
      rows: [{ ...validMwfRow, scores: [] }],
      cohorts: [existingMwfCohort],
      setup: { cohorts: [], assessmentDates: [] },
      sessions: [{
        id: "session-existing",
        cohort_id: existingMwfCohort.id,
        title: "G4",
        start_at: shiftedStart,
        end_at: firstRecurrence.endAt,
        mode: "In person",
        room_label: "Room 201",
        demo: true,
      }],
    });

    expect(plan.sessions).toHaveLength(2);
    expect(plan.sessions).toContainEqual(expect.objectContaining({
      start_at: firstRecurrence.startAt,
      end_at: firstRecurrence.endAt,
    }));
  });

  it("reuses all 72 existing Task 11 sessions across the MWF and TTHS cohorts", () => {
    const task11Term = {
      ...summerTerm,
      id: "term-task-11",
      name: "QA Summer 2026",
      start_date: "2026-07-07",
      end_date: "2026-08-20",
    };
    const mwfCohort = {
      ...existingMwfCohort,
      term_id: task11Term.id,
      start_date: "2026-05-11",
      end_date: "2026-09-07",
    };
    const tthsCohort = {
      ...existingMwfCohort,
      id: "cohort-tths",
      name: "TTHS",
      term_id: task11Term.id,
      cadence: "TTHS",
      start_date: task11Term.start_date,
      end_date: task11Term.end_date,
      room_label: "Room 202",
    };
    const mwfSessions = buildEasternRecurringSessions({
      cadence: mwfCohort.cadence,
      startDate: mwfCohort.start_date,
      endDate: mwfCohort.end_date,
    });
    const tthsSessions = buildEasternRecurringSessions({
      cadence: tthsCohort.cadence,
      startDate: tthsCohort.start_date,
      endDate: tthsCohort.end_date,
    });
    expect(mwfSessions).toHaveLength(52);
    expect(tthsSessions).toHaveLength(20);

    const existingSessions = [
      ...mwfSessions.map((session, index) => ({
        id: `session-mwf-${index}`,
        cohort_id: mwfCohort.id,
        title: "G4",
        start_at: session.startAt.replace(".000Z", "+00:00"),
        end_at: session.endAt.replace(".000Z", "+00:00"),
        mode: "In person",
        room_label: "Room 201",
        demo: true,
      })),
      ...tthsSessions.map((session, index) => ({
        id: `session-tths-${index}`,
        cohort_id: tthsCohort.id,
        title: "G5",
        start_at: session.startAt.replace(".000Z", "+00:00"),
        end_at: session.endAt.replace(".000Z", "+00:00"),
        mode: "In person",
        room_label: "Room 202",
        demo: true,
      })),
    ];
    const plan = build({
      rows: [
        { ...validMwfRow, scores: [] },
        { ...validTthsRow, scores: [], sessionTitle: "G5", roomLabel: "Room 202" },
      ],
      cohorts: [mwfCohort, tthsCohort],
      setup: { cohorts: [], assessmentDates: [] },
      enrollments: [
        {
          id: "enrollment-mwf",
          student_id: "student-ada",
          cohort_id: mwfCohort.id,
          status: "active",
          registered_at: mwfCohort.start_date,
          demo: true,
        },
        {
          id: "enrollment-tths",
          student_id: "student-grace",
          cohort_id: tthsCohort.id,
          status: "active",
          registered_at: tthsCohort.start_date,
          demo: true,
        },
      ],
      sessions: existingSessions,
      terms: [task11Term],
    });

    expect(existingSessions).toHaveLength(72);
    expect(plan.cohorts).toEqual([]);
    expect(plan.sessions).toEqual([]);
    expect(plan.enrollments).toEqual([]);
    expect(plan.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowNumber: 2, cohortId: mwfCohort.id, errors: [] }),
      expect.objectContaining({ rowNumber: 3, cohortId: tthsCohort.id, errors: [] }),
    ]));
    expect(plan.summary).toMatchObject({
      cohorts: 0,
      sessions: 0,
      enrollments: 0,
      assessments: 0,
      resultCreates: 0,
      resultUpdates: 0,
      errors: 0,
    });
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
