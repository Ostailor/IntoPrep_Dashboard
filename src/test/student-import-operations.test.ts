import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/domain";
import { buildEasternRecurringSessions } from "@/lib/eastern-recurring-sessions";
import {
  commitStudentSpreadsheetImport,
  createProductionStudentImportRepository,
  previewStudentSpreadsheetImport,
  StudentImportInputError,
  type StudentImportCommitPayload,
  type StudentImportFieldDefinitionRow,
  type StudentImportPartitionData,
  type StudentImportRepository,
} from "@/lib/student-import-operations";
import type { StudentImportMapping } from "@/lib/student-import-schema";
import {
  canRunStudentImports,
  resolveStudentImportTarget,
} from "@/lib/permissions";

vi.mock("server-only", () => ({}));

const xlsxFixtures = vi.hoisted(() => new Map<string, Array<{
  sheet: string;
  data: unknown[][];
}>>());

vi.mock("read-excel-file/node", async (importOriginal) => {
  const actual = await importOriginal<typeof import("read-excel-file/node")>();
  const readActual = actual.default as (input: Buffer) => Promise<Array<{
    sheet: string;
    data: unknown[][];
  }>>;

  return {
    ...actual,
    default: async (input: Buffer) => xlsxFixtures.get(input.toString("utf8"))
      ?? readActual(input),
  };
});

const serviceMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: serviceMocks.createClient,
}));

const demoAdmin = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Demo Admin",
  role: "admin",
  title: "Administrator",
  assignedCohortIds: [],
  demo: true,
} satisfies User;

const mainEngineer = {
  ...demoAdmin,
  id: "10000000-0000-4000-8000-000000000002",
  name: "Engineer",
  role: "engineer",
  demo: false,
} satisfies User;

const existingDemoFamily = {
  id: "family-maya",
  family_name: "Demo",
  guardian_names: [],
  email: "",
  phone: "",
  preferred_campus_id: "campus-default",
  notes: "",
  parent1_name: null,
  parent1_email: null,
  parent1_phone: null,
  parent2_name: null,
  parent2_email: null,
  parent2_phone: null,
  demo: true,
} satisfies StudentImportPartitionData["families"][number];

const existingDemoStudent = {
  id: "student-maya",
  family_id: existingDemoFamily.id,
  first_name: "Maya",
  last_name: "Demo",
  email: "maya@example.com",
  phone: null,
  grade_level: "",
  school: "",
  target_test: "",
  focus: "",
  external_id: null,
  custom_fields: {},
  demo: true,
} satisfies StudentImportPartitionData["students"][number];

const existingMwfCohort = {
  id: "cohort-mwf",
  name: "MWF",
  program_id: "program-sat",
  campus_id: "campus-default",
  term_id: "term-summer",
  capacity: 24,
  cadence: "MWF",
  cohort_mode: "In person",
  start_date: "2026-07-06",
  end_date: "2026-07-11",
  room_label: "201",
  is_archived: false,
  demo: true,
} satisfies StudentImportPartitionData["cohorts"][number];

const mappings = [
  { sourceHeader: "Student First Name", kind: "known", field: "firstName" },
  { sourceHeader: "Student Last Name", kind: "known", field: "lastName" },
  { sourceHeader: "Student Email", kind: "known", field: "studentEmail" },
  {
    sourceHeader: "Graduation Year",
    kind: "custom-new",
    key: "graduation_year",
    label: "Graduation Year",
    dataType: "number",
    sensitive: true,
  },
] satisfies StudentImportMapping[];

function makeFile(rows = ["Ada,Lovelace,ada@example.com,2028"]) {
  return Buffer.from([
    "Student First Name,Student Last Name,Student Email,Graduation Year",
    ...rows,
  ].join("\n"));
}

function makeRepository(options: {
  rpcError?: Error;
  fieldDefinitions?: StudentImportFieldDefinitionRow[];
  partition?: Partial<StudentImportPartitionData>;
} = {}) {
  const loadedPartitions: boolean[] = [];
  const committedPayloads: Parameters<StudentImportRepository["commitImport"]>[0][] = [];
  const insertedFailedRuns: Parameters<StudentImportRepository["insertFailedRun"]>[0][] = [];

  const repository: StudentImportRepository & {
    loadedPartitions: boolean[];
    committedPayloads: typeof committedPayloads;
    insertedFailedRuns: typeof insertedFailedRuns;
  } = {
    loadedPartitions,
    committedPayloads,
    insertedFailedRuns,
    async loadPartition(targetDemo) {
      loadedPartitions.push(targetDemo);
      return {
        families: [],
        students: [],
        enrollments: [],
        cohorts: [],
        programs: [{
          id: "program-sat",
          name: "SAT",
          track: "SAT",
          format: "Small group",
          is_archived: false,
          demo: targetDemo,
        }],
        campuses: [{
          id: "campus-default",
          name: "Main",
          location: "Westfield, NJ",
          modality: "In person",
          demo: targetDemo,
        }],
        terms: [{
          id: "term-summer",
          name: "Summer 2026",
          start_date: "2026-07-06",
          end_date: "2026-07-11",
          demo: targetDemo,
        }],
        sessions: [],
        assessments: [],
        results: [],
        fieldDefinitions: options.fieldDefinitions ?? [],
        defaultCampusId: "campus-default",
        ...options.partition,
      };
    },
    async commitImport(payload) {
      committedPayloads.push(payload);
      if (options.rpcError) {
        throw options.rpcError;
      }
      return {
        runId: "20000000-0000-4000-8000-000000000001",
        created: payload.importRun.createdCount,
        updated: payload.importRun.updatedCount,
        enrolled: payload.importRun.enrollmentCount,
        skipped: payload.importRun.skippedCount,
        cohorts: payload.importRun.cohortCount,
        sessions: payload.importRun.sessionCount,
        assessments: payload.importRun.assessmentCount,
        results: payload.importRun.resultCount,
      };
    },
    async insertFailedRun(run) {
      insertedFailedRuns.push(run);
    },
  };

  return repository;
}

function makeIds() {
  let sequence = 10;
  return () => `30000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`;
}

function setNormalizedOperationFixture(marker: string, sourceDates: string[] = ["2026-07-09"]) {
  xlsxFixtures.set(marker, [
    {
      sheet: "Student Information",
      data: [
        ["Student Name", "Student Email"],
        ["Maya Demo", "maya@example.com"],
      ],
    },
    {
      sheet: "Scores",
      data: [
        ["Student Name", "Cohort", "Class", "Room", "Test Name", "Test Date", "RW", "Math", "Total"],
        ...sourceDates.map((date) => [
          "Maya Demo", "MWF", "G4", "201", "HW1 – PSAT", date, 720, 760, 1480,
        ]),
      ],
    },
  ]);
}

function setWideOperationFixture(marker: string, total = 1480) {
  xlsxFixtures.set(marker, [{
    sheet: "Camp Scores",
    data: [
      ["SAT Summer Camp 2026"],
      ["Name", "Class", "Level", "Room", "HW1", null, null],
      [null, null, null, null, "PSAT", null, null],
      [null, null, null, null, "RW", "Math", "Total"],
      ["Maya Demo", "MWF", "G4", "201", 720, total - 720, total],
    ],
  }]);
}

function makeCommitInput(repository: StudentImportRepository, overrides: Record<string, unknown> = {}) {
  return {
    viewer: demoAdmin,
    filename: "students.csv",
    bytes: makeFile(),
    mappings,
    expectedDigest: "",
    repository,
    createUuid: makeIds(),
    now: () => new Date("2026-07-09T12:00:00.000Z"),
    invalidateCache: vi.fn(),
    isLocalQa: () => false,
    ...overrides,
  };
}

describe("student import permissions", () => {
  it("allows only engineer, admin, and staff imports", () => {
    expect(canRunStudentImports("engineer")).toBe(true);
    expect(canRunStudentImports("admin")).toBe(true);
    expect(canRunStudentImports("staff")).toBe(true);
    expect(canRunStudentImports("ta")).toBe(false);
    expect(canRunStudentImports("instructor")).toBe(false);
  });

  it("derives an admin target from the profile and ignores a client override", () => {
    expect(resolveStudentImportTarget({ role: "admin", demo: true }, false)).toBe(true);
    expect(resolveStudentImportTarget({ role: "staff", demo: false }, true)).toBe(false);
  });

  it("requires an explicit engineer target", () => {
    expect(() =>
      resolveStudentImportTarget({ role: "engineer", demo: false }, undefined),
    ).toThrow("Engineers must choose Demo or Main before previewing an import.");
    expect(resolveStudentImportTarget(mainEngineer, true)).toBe(true);
    expect(resolveStudentImportTarget(mainEngineer, false)).toBe(false);
  });

  it("rejects a role that cannot import students", () => {
    expect(() => resolveStudentImportTarget({ role: "ta", demo: true }, undefined)).toThrow(
      "You cannot import students.",
    );
  });

  it("rejects an absent or nonboolean admin partition claim", () => {
    expect(() => resolveStudentImportTarget({ role: "admin" }, undefined)).toThrow(
      "The import account partition is missing.",
    );
    expect(() => resolveStudentImportTarget(
      { role: "admin", demo: "true" as never },
      undefined,
    )).toThrow("The import account partition is missing.");
  });
});

describe("student import preview and commit operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("infers mappings and reads only the authenticated target partition", async () => {
    const repository = makeRepository();

    const preview = await previewStudentSpreadsheetImport({
      viewer: demoAdmin,
      requestedTarget: false,
      filename: "students.csv",
      bytes: makeFile(),
      repository,
      createUuid: makeIds(),
      now: () => new Date("2026-07-09T12:00:00.000Z"),
    });

    expect(repository.loadedPartitions).toEqual([true]);
    expect(preview.targetDemo).toBe(true);
    expect(preview.profile).toBe("simple");
    expect(preview.mappingPlan).toMatchObject({
      profile: "simple",
      directory: { sheetName: "CSV" },
      academic: null,
    });
    expect(preview.sheetNames).toEqual(["CSV"]);
    expect(preview.headers).toEqual(mappings.map((mapping) => mapping.sourceHeader));
    expect(preview.mappings.map((mapping) => mapping.kind)).toEqual([
      "known",
      "known",
      "known",
      "custom-new",
    ]);
    expect(preview.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.summary).toMatchObject({ creates: 1, errors: 0 });
    expect(preview.rows[0]).toMatchObject({
      rowNumber: 2,
      action: "create",
      firstName: "Ada",
      lastName: "Lovelace",
    });
  });

  it("previews wide workbook requirements without treating score rows as new students", async () => {
    const marker = "wide-operation-preview";
    xlsxFixtures.set(marker, [{
      sheet: "Camp Scores",
      data: [
        ["SAT Summer Camp 2026"],
        ["Name", "Class", "Level", "Room", "HW1", null, null],
        [null, null, null, null, "PSAT", null, null],
        [null, null, null, null, "RW", "Math", "Total"],
        ["Maya Demo", "MWF", "G4", "201", 720, 760, 1480],
        ["Rohan Demo", "TTHS", "G5", "202", 710, 750, 1460],
        ["Invalid Demo", "MWF", "G4", "201", "bad", 750, 1470],
      ],
    }]);
    const repository = makeRepository();

    const preview = await previewStudentSpreadsheetImport({
      viewer: demoAdmin,
      filename: "camp-scores.xlsx",
      bytes: Buffer.from(marker),
      repository,
      createUuid: makeIds(),
    });

    expect(preview).toMatchObject({
      profile: "wide",
      targetDemo: true,
      mappingPlan: expect.any(Object),
      setup: { cohorts: [], assessmentDates: [] },
      blocking: true,
      academic: {
        requirements: {
          cohorts: ["MWF", "TTHS"],
          assessmentDates: expect.arrayContaining([
            { sourceClass: "MWF", assessmentTitle: "HW1 – PSAT" },
          ]),
        },
      },
    });
    expect(preview.summary.creates).toBe(0);
    expect(preview.sourceAssessmentDateSuggestions).toEqual([]);
    expect(preview.academicSourceRows).toEqual([
      {
        sheetName: "Camp Scores",
        rowNumber: 5,
        studentName: "Maya Demo",
        cohortName: "MWF",
        sessionTitle: "G4",
        roomLabel: "201",
        assessmentTitle: "HW1 – PSAT",
        sourceAssessmentDate: "",
        rw: 720,
        math: 760,
        total: 1480,
        action: "Blocked",
        warnings: [],
        errors: ['Cohort setup is required for Source cohort (Excel Class) "MWF".'],
      },
      expect.objectContaining({
        sheetName: "Camp Scores",
        rowNumber: 6,
        studentName: "Rohan Demo",
        cohortName: "TTHS",
        assessmentTitle: "HW1 – PSAT",
        rw: 710,
        math: 750,
        total: 1460,
      }),
      expect.objectContaining({
        sheetName: "Camp Scores",
        rowNumber: 7,
        studentName: "Invalid Demo",
        assessmentTitle: "HW1 – PSAT",
        rw: null,
        math: 750,
        total: 1470,
        action: "Blocked",
        errors: [
          "HW1 – PSAT: RW must be a number.",
          'Cohort setup is required for Source cohort (Excel Class) "MWF".',
        ],
      }),
    ]);
  });

  it("previews the sanitized merged-header fixture with valid totals and isolated blockers", async () => {
    const bytes = await readFile("src/test/fixtures/adaptive-score-import.xlsx");
    const fixtureStudents = [
      { ...existingDemoStudent, id: "student-maya-fixture", first_name: "Maya", last_name: "Fixture Demo" },
      { ...existingDemoStudent, id: "student-rohan-fixture", first_name: "Rohan", last_name: "Fixture Demo" },
      { ...existingDemoStudent, id: "student-total-mismatch", first_name: "Total", last_name: "Mismatch Demo" },
      { ...existingDemoStudent, id: "student-text-score", first_name: "Text", last_name: "Score Demo" },
      { ...existingDemoStudent, id: "student-jordan-a", first_name: "Jordan", last_name: "Ambiguous Demo" },
      { ...existingDemoStudent, id: "student-jordan-b", first_name: "Jordan", last_name: "Ambiguous Demo" },
    ];
    const tthsCohort = {
      ...existingMwfCohort,
      id: "cohort-tths",
      name: "TTHS",
      cadence: "TTHS",
      room_label: "202",
    };
    const assessmentTitles = [
      "HW1 – PSAT",
      "HW1 – BB07",
      "HW2 – BB08",
      "HW3 – BB09",
    ];
    const setup = {
      cohorts: [],
      assessmentDates: ["MWF", "TTHS"].flatMap((sourceClass) =>
        assessmentTitles.map((assessmentTitle, index) => ({
          sourceClass,
          assessmentTitle,
          date: `2026-07-${String(10 + index).padStart(2, "0")}`,
        })),
      ),
    };

    const preview = await previewStudentSpreadsheetImport({
      viewer: demoAdmin,
      filename: "adaptive-score-import.xlsx",
      bytes,
      setup,
      repository: makeRepository({
        partition: {
          families: [existingDemoFamily],
          students: fixtureStudents,
          cohorts: [existingMwfCohort, tthsCohort],
        },
      }),
      createUuid: makeIds(),
    });

    expect(preview).toMatchObject({
      profile: "wide",
      targetDemo: true,
      sheetNames: ["Camp Scores"],
      selectedSheet: "Camp Scores",
      blocking: true,
      academic: {
        requirements: { cohorts: [], assessmentDates: [] },
        summary: {
          resultCreates: 8,
          resultUpdates: 0,
          errors: 4,
        },
      },
    });
    expect(preview.mappingPlan.academic?.columns.filter((column) =>
      column.kind === "score",
    ).map((column) => column.assessmentTitle)).toEqual([
      "HW1 – PSAT", "HW1 – PSAT", "HW1 – PSAT",
      "HW1 – BB07", "HW1 – BB07", "HW1 – BB07",
      "HW2 – BB08", "HW2 – BB08", "HW2 – BB08",
      "HW3 – BB09", "HW3 – BB09", "HW3 – BB09",
    ]);
    expect(preview.mappingPlan.directory.columns).toEqual(expect.arrayContaining([
      { sourceHeader: "PW", kind: "ignore" },
      { sourceHeader: "Student / E-Mail", kind: "known", field: "studentEmail" },
      { sourceHeader: "Parent / E-Mail 1", kind: "known", field: "parent1Email" },
      { sourceHeader: "Resource / Link", kind: "ignore" },
    ]));
    expect(preview.academicSourceRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rowNumber: 5,
        studentName: "Maya Fixture Demo",
        assessmentTitle: "HW1 – PSAT",
        rw: 620,
        math: 680,
        total: 1300,
        action: "Create assessment result.",
        warnings: ["Total calculated from RW + Math."],
        errors: [],
      }),
      expect.objectContaining({
        rowNumber: 6,
        studentName: "Rohan Fixture Demo",
        assessmentTitle: "HW1 – PSAT",
        total: 1250,
        action: "Create assessment result.",
        warnings: [],
        errors: [],
      }),
      expect.objectContaining({
        rowNumber: 7,
        studentName: "Total Mismatch Demo",
        action: "Blocked",
        errors: ["HW1 – PSAT: Total must equal RW + Math."],
      }),
      expect.objectContaining({
        rowNumber: 8,
        studentName: "Text Score Demo",
        action: "Blocked",
        errors: ["HW1 – PSAT: RW must be a number."],
      }),
      expect.objectContaining({
        rowNumber: 9,
        studentName: "Missing Student Demo",
        action: "Blocked",
        errors: ['No Demo student exactly matches "Missing Student Demo".'],
      }),
      expect.objectContaining({
        rowNumber: 10,
        studentName: "Jordan Ambiguous Demo",
        action: "Blocked",
        errors: [
          'More than one Demo student exactly matches "Jordan Ambiguous Demo". Disambiguate the directory data.',
        ],
      }),
    ]));
  });

  it("previews normalized directory and score sheets from one workbook digest", async () => {
    const marker = "normalized-operation-preview";
    xlsxFixtures.set(marker, [
      {
        sheet: "Student Information",
        data: [
          ["Student Name", "Student Email"],
          ["Maya Demo", "maya@example.com"],
        ],
      },
      {
        sheet: "Scores",
        data: [
          ["Student Name", "Cohort", "Class", "Room", "Test Name", "Test Date", "RW", "Math", "Total"],
          ["Maya Demo", "MWF", "G4", "201", "HW1 – PSAT", "2026-07-10", 720, 760, 1480],
        ],
      },
    ]);
    const repository = makeRepository();

    const preview = await previewStudentSpreadsheetImport({
      viewer: demoAdmin,
      filename: "normalized.xlsx",
      bytes: Buffer.from(marker),
      repository,
      createUuid: makeIds(),
    });

    expect(preview.profile).toBe("normalized");
    expect(preview.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.mappingPlan.directory.sheetName).toBe("Student Information");
    expect(preview.mappingPlan.academic?.sheetName).toBe("Scores");
    expect(preview.rows.map((row) => row.rowNumber)).toEqual([2]);
    expect(preview.academic.rows.map((row) => row.rowNumber)).toEqual([2]);
    expect(preview.academicSourceRows).toEqual([
      expect.objectContaining({
        sheetName: "Scores",
        rowNumber: 2,
        studentName: "Maya Demo",
        cohortName: "MWF",
        sessionTitle: "G4",
        roomLabel: "201",
        assessmentTitle: "HW1 – PSAT",
        sourceAssessmentDate: "2026-07-10",
        rw: 720,
        math: 760,
        total: 1480,
      }),
    ]);
    expect(preview.sheetNames).toEqual(["Student Information", "Scores"]);
  });

  it("reuses an existing custom field when replaying a normalized export", async () => {
    const marker = "normalized-existing-custom-field";
    xlsxFixtures.set(marker, [
      {
        sheet: "Student Information",
        data: [
          ["Student Name", "Graduation Year"],
          ["Maya Demo", 2028],
        ],
      },
      {
        sheet: "Scores",
        data: [
          ["Student Name", "Cohort", "Class", "Room", "Test Name", "Test Date", "RW", "Math", "Total"],
          ["Maya Demo", "MWF", "G4", "201", "HW1 – PSAT", "2026-07-10", 720, 760, 1480],
        ],
      },
    ]);
    const repository = makeRepository({
      fieldDefinitions: [{
        id: "40000000-0000-4000-8000-000000000002",
        key: "graduation_year",
        label: "Graduation Year",
        data_type: "number",
        header_aliases: ["Grad year"],
        required: false,
        sensitive: true,
        sort_order: 10,
        demo: true,
      }],
    });

    const preview = await previewStudentSpreadsheetImport({
      viewer: demoAdmin,
      filename: "normalized.xlsx",
      bytes: Buffer.from(marker),
      repository,
      createUuid: makeIds(),
    });

    expect(preview.mappingPlan.directory.columns[1]).toEqual({
      sourceHeader: "Graduation Year",
      kind: "custom-existing",
      key: "graduation_year",
    });
  });

  it("maps the normalized Cohorts export column back to cohort placement", async () => {
    const marker = "normalized-cohorts-column";
    xlsxFixtures.set(marker, [
      {
        sheet: "Student Information",
        data: [
          ["Student Name", "Cohorts"],
          ["Maya Demo", "MWF"],
        ],
      },
      {
        sheet: "Scores",
        data: [
          ["Student Name", "Cohort", "Class", "Room", "Test Name", "Test Date", "RW", "Math", "Total"],
          ["Maya Demo", "MWF", "G4", "201", "HW1 – PSAT", "2026-07-10", 720, 760, 1480],
        ],
      },
    ]);

    const preview = await previewStudentSpreadsheetImport({
      viewer: demoAdmin,
      filename: "normalized.xlsx",
      bytes: Buffer.from(marker),
      repository: makeRepository(),
      createUuid: makeIds(),
    });

    expect(preview.mappingPlan.directory.columns[1]).toEqual({
      sourceHeader: "Cohorts",
      kind: "known",
      field: "cohortName",
    });
  });

  it("exposes conflicting normalized source dates as suggestions while setup stays authoritative", async () => {
    const marker = "normalized-source-date-suggestions";
    setNormalizedOperationFixture(marker, ["2026-07-09", "2026-07-08"]);
    const setup = {
      cohorts: [],
      assessmentDates: [{
        sourceClass: "MWF",
        assessmentTitle: "HW1 – PSAT",
        date: "2026-07-10",
      }],
    };
    const preview = await previewStudentSpreadsheetImport({
      viewer: demoAdmin,
      filename: "normalized.xlsx",
      bytes: Buffer.from(marker),
      setup,
      repository: makeRepository({
        partition: {
          families: [existingDemoFamily],
          students: [existingDemoStudent],
          cohorts: [existingMwfCohort],
        },
      }),
      createUuid: makeIds(),
    });

    expect(preview.sourceAssessmentDateSuggestions).toEqual([
      {
        sheetName: "Scores",
        rowNumber: 2,
        sourceClass: "MWF",
        assessmentTitle: "HW1 – PSAT",
        date: "2026-07-09",
      },
      {
        sheetName: "Scores",
        rowNumber: 3,
        sourceClass: "MWF",
        assessmentTitle: "HW1 – PSAT",
        date: "2026-07-08",
      },
    ]);
    expect(preview.setup).toEqual({
      catalog: { programs: [], campuses: [], terms: [] },
      ...setup,
    });
    expect(preview.academic.assessments).toEqual([
      expect.objectContaining({ title: "HW1 – PSAT", date: "2026-07-10" }),
    ]);
    expect(preview.academic.assessments).not.toEqual([
      expect.objectContaining({ date: "2026-07-09" }),
    ]);
  });

  it("builds academic reuse and result updates from the one target partition snapshot", async () => {
    const marker = "normalized-full-partition-snapshot";
    setNormalizedOperationFixture(marker);
    const sessions = buildEasternRecurringSessions({
      cadence: "MWF",
      startDate: existingMwfCohort.start_date!,
      endDate: existingMwfCohort.end_date!,
    }).map((session, index) => ({
      id: `session-existing-${index}`,
      cohort_id: existingMwfCohort.id,
      title: "G4",
      start_at: session.startAt,
      end_at: session.endAt,
      mode: "In person",
      room_label: "201",
      demo: true,
    }));
    const assessment = {
      id: "assessment-existing",
      cohort_id: existingMwfCohort.id,
      title: "HW1 – PSAT",
      date: "2026-07-10",
      sections: [{ label: "RW", score: 800 }, { label: "Math", score: 800 }],
      demo: true,
    };
    const enrollment = {
      id: "enrollment-existing",
      student_id: existingDemoStudent.id,
      cohort_id: existingMwfCohort.id,
      status: "active",
      registered_at: "2026-07-06",
      demo: true,
    };
    const result = {
      id: "result-existing",
      assessment_id: assessment.id,
      student_id: existingDemoStudent.id,
      total_score: 1400,
      section_scores: [{ label: "RW", score: 700 }, { label: "Math", score: 700 }],
      delta_from_previous: 20,
      demo: true,
    };
    const repository = makeRepository({
      partition: {
        families: [existingDemoFamily],
        students: [
          existingDemoStudent,
          { ...existingDemoStudent, id: "student-main", demo: false },
        ],
        cohorts: [
          existingMwfCohort,
          { ...existingMwfCohort, id: "cohort-main", demo: false },
        ],
        enrollments: [enrollment, { ...enrollment, id: "enrollment-main", demo: false }],
        sessions: [
          ...sessions,
          ...sessions.map((session) => ({ ...session, id: `${session.id}-main`, demo: false })),
        ],
        assessments: [assessment, { ...assessment, id: "assessment-main", demo: false }],
        results: [result, { ...result, id: "result-main", demo: false }],
      },
    });

    const preview = await previewStudentSpreadsheetImport({
      viewer: demoAdmin,
      filename: "normalized.xlsx",
      bytes: Buffer.from(marker),
      setup: {
        cohorts: [],
        assessmentDates: [{
          sourceClass: "MWF",
          assessmentTitle: "HW1 – PSAT",
          date: "2026-07-10",
        }],
      },
      repository,
      createUuid: makeIds(),
    });

    expect(repository.loadedPartitions).toEqual([true]);
    expect(preview.options.cohorts.map((cohort) => cohort.id)).toEqual([existingMwfCohort.id]);
    expect(preview.academic).toMatchObject({
      cohorts: [],
      sessions: [],
      enrollments: [],
      assessments: [],
      results: [expect.objectContaining({ id: result.id, total_score: 1480 })],
      summary: {
        cohorts: 0,
        sessions: 0,
        enrollments: 0,
        assessments: 0,
        resultCreates: 0,
        resultUpdates: 1,
        errors: 0,
      },
    });
    expect(preview.academic.rows[0]).toMatchObject({
      studentId: existingDemoStudent.id,
      cohortId: existingMwfCohort.id,
      actions: ["Reuse active cohort enrollment.", "Update assessment result."],
      errors: [],
    });
    expect(preview.academicSourceRows[0]).toMatchObject({
      assessmentTitle: "HW1 – PSAT",
      action: "Update assessment result.",
    });
  });

  it.each([
    {
      label: "score row",
      excludedRows: [{ sheetName: "Scores", rowNumber: 2 }],
      directoryRows: [2],
      academicRows: [],
    },
    {
      label: "directory row",
      excludedRows: [{ sheetName: "Student Information", rowNumber: 2 }],
      directoryRows: [],
      academicRows: [2],
    },
  ])("excludes only the normalized $label selected by its sheet reference", async ({
    label,
    excludedRows,
    directoryRows,
    academicRows,
  }) => {
    const marker = `normalized-sheet-exclusion-${label}`;
    xlsxFixtures.set(marker, [
      {
        sheet: "Student Information",
        data: [
          ["Student Name", "Student Email"],
          ["Maya Demo", "maya@example.com"],
        ],
      },
      {
        sheet: "Scores",
        data: [
          ["Student Name", "Cohort", "Class", "Room", "Test Name", "Test Date", "RW", "Math", "Total"],
          ["Maya Demo", "MWF", "G4", "201", "HW1 – PSAT", "2026-07-10", 720, 760, 1480],
        ],
      },
    ]);

    const preview = await previewStudentSpreadsheetImport({
      viewer: demoAdmin,
      filename: "normalized.xlsx",
      bytes: Buffer.from(marker),
      excludedRows,
      repository: makeRepository(),
      createUuid: makeIds(),
    });

    expect(preview.rows.map((row) => row.rowNumber)).toEqual(directoryRows);
    expect(preview.academic.rows.map((row) => row.rowNumber)).toEqual(academicRows);
  });

  it("rejects stale or unknown sheet-aware exclusions before loading partition data", async () => {
    const marker = "normalized-unknown-sheet-exclusion";
    xlsxFixtures.set(marker, [
      {
        sheet: "Student Information",
        data: [["Student Name", "Student Email"], ["Maya Demo", "maya@example.com"]],
      },
      {
        sheet: "Scores",
        data: [
          ["Student Name", "Cohort", "Class", "Room", "Test Name", "Test Date", "RW", "Math", "Total"],
          ["Maya Demo", "MWF", "G4", "201", "HW1 – PSAT", "2026-07-10", 720, 760, 1480],
        ],
      },
    ]);
    const repository = makeRepository();

    await expect(previewStudentSpreadsheetImport({
      viewer: demoAdmin,
      filename: "normalized.xlsx",
      bytes: Buffer.from(marker),
      excludedRows: [{ sheetName: "Missing", rowNumber: 2 }],
      repository,
      createUuid: makeIds(),
    })).rejects.toThrow("Excluded workbook rows changed. Preview the file again.");
    await expect(previewStudentSpreadsheetImport({
      viewer: demoAdmin,
      filename: "normalized.xlsx",
      bytes: Buffer.from(marker),
      excludedRows: [{ sheetName: "Scores", rowNumber: 99 }],
      repository,
      createUuid: makeIds(),
    })).rejects.toThrow("Excluded workbook rows changed. Preview the file again.");

    expect(repository.loadedPartitions).toEqual([]);
  });

  it("requires normalized imports to use sheet-aware exclusions", async () => {
    const marker = "normalized-legacy-exclusion";
    xlsxFixtures.set(marker, [
      {
        sheet: "Student Information",
        data: [["Student Name", "Student Email"], ["Maya Demo", "maya@example.com"]],
      },
      {
        sheet: "Scores",
        data: [
          ["Student Name", "Cohort", "Class", "Room", "Test Name", "Test Date", "RW", "Math", "Total"],
          ["Maya Demo", "MWF", "G4", "201", "HW1 – PSAT", "2026-07-10", 720, 760, 1480],
        ],
      },
    ]);

    await expect(previewStudentSpreadsheetImport({
      viewer: demoAdmin,
      filename: "normalized.xlsx",
      bytes: Buffer.from(marker),
      excludedRowNumbers: [2],
      repository: makeRepository(),
      createUuid: makeIds(),
    })).rejects.toThrow("Use sheet-aware exclusions for normalized workbooks.");
  });

  it("rejects stale source-header mappings before querying directory data", async () => {
    const repository = makeRepository();

    await expect(previewStudentSpreadsheetImport({
      viewer: demoAdmin,
      filename: "students.csv",
      bytes: makeFile(),
      mappings: [{ ...mappings[0], sourceHeader: "Wrong Header" }, ...mappings.slice(1)],
      repository,
      createUuid: makeIds(),
    })).rejects.toThrow("Spreadsheet headers changed. Preview the file again.");

    expect(repository.loadedPartitions).toEqual([]);
  });

  it("reparses the file and rejects a stale digest before calling the RPC", async () => {
    const repository = makeRepository();

    await expect(commitStudentSpreadsheetImport(makeCommitInput(repository, {
      expectedDigest: "0".repeat(64),
    }))).rejects.toThrow("The uploaded file changed after preview. Preview it again.");

    expect(repository.committedPayloads).toHaveLength(0);
    expect(repository.insertedFailedRuns).toHaveLength(0);
  });

  it("rebuilds a reviewed wide workbook plan and commits every academic collection", async () => {
    const marker = "wide-operation-commit";
    setWideOperationFixture(marker);
    const previousAssessment = {
      id: "assessment-previous",
      cohort_id: existingMwfCohort.id,
      title: "Diagnostic",
      date: "2026-07-01",
      sections: [{ label: "RW", score: 800 }, { label: "Math", score: 800 }],
      demo: true,
    };
    const repository = makeRepository({
      partition: {
        families: [existingDemoFamily],
        students: [existingDemoStudent],
        cohorts: [existingMwfCohort],
        assessments: [previousAssessment],
        results: [{
          id: "result-previous",
          assessment_id: previousAssessment.id,
          student_id: existingDemoStudent.id,
          total_score: 1400,
          section_scores: [{ label: "RW", score: 700 }, { label: "Math", score: 700 }],
          delta_from_previous: 1400,
          demo: true,
        }],
      },
    });
    const setup = {
      cohorts: [],
      assessmentDates: [{
        sourceClass: "MWF",
        assessmentTitle: "HW1 – PSAT",
        date: "2026-07-10",
      }],
    };
    const preview = await previewStudentSpreadsheetImport({
      viewer: demoAdmin,
      filename: "scores.xlsx",
      bytes: Buffer.from(marker),
      setup,
      repository,
      createUuid: makeIds(),
    });

    await commitStudentSpreadsheetImport(makeCommitInput(repository, {
      filename: "scores.xlsx",
      bytes: Buffer.from(marker),
      mappings: undefined,
      mappingPlan: preview.mappingPlan,
      setup,
      expectedDigest: preview.digest,
      createUuid: makeIds(),
    }));

    expect(repository.committedPayloads).toHaveLength(1);
    expect(repository.committedPayloads[0]).toMatchObject({
      targetDemo: true,
      cohorts: [],
      sessions: expect.any(Array),
      enrollments: expect.any(Array),
      assessments: [expect.objectContaining({
        cohort_id: existingMwfCohort.id,
        title: "HW1 – PSAT",
        date: "2026-07-10",
      })],
      results: [expect.objectContaining({
        student_id: existingDemoStudent.id,
        total_score: 1480,
        delta_from_previous: 80,
      })],
      importRun: expect.objectContaining({
        workbookProfile: "wide",
        workbookMapping: preview.mappingPlan,
        workbookSetup: { catalog: { programs: [], campuses: [], terms: [] }, ...setup },
        assessmentCount: 1,
        resultCount: 1,
      }),
    });
  });

  it("requires the reviewed mapping plan for an academic workbook commit", async () => {
    const marker = "wide-operation-missing-reviewed-mapping";
    setWideOperationFixture(marker);
    const repository = makeRepository({
      partition: {
        families: [existingDemoFamily],
        students: [existingDemoStudent],
        cohorts: [existingMwfCohort],
      },
    });
    const setup = {
      cohorts: [],
      assessmentDates: [{
        sourceClass: "MWF",
        assessmentTitle: "HW1 – PSAT",
        date: "2026-07-10",
      }],
    };
    const preview = await previewStudentSpreadsheetImport({
      viewer: demoAdmin,
      filename: "scores.xlsx",
      bytes: Buffer.from(marker),
      setup,
      repository,
      createUuid: makeIds(),
    });

    await expect(commitStudentSpreadsheetImport(makeCommitInput(repository, {
      filename: "scores.xlsx",
      bytes: Buffer.from(marker),
      mappings: undefined,
      mappingPlan: undefined,
      setup,
      expectedDigest: preview.digest,
      createUuid: makeIds(),
    }))).rejects.toThrow("Preview the workbook mapping and setup again before importing.");

    expect(repository.committedPayloads).toHaveLength(0);
  });

  it("round-trips multiple exported cohorts and deduplicates the academic enrollment", async () => {
    const marker = "normalized-operation-duplicate-enrollment";
    xlsxFixtures.set(marker, [
      {
        sheet: "Student Information",
        data: [
          ["Student Name", "Student Email", "Cohorts"],
          ["Maya Demo", "maya@example.com", "MWF; TTHS"],
        ],
      },
      {
        sheet: "Scores",
        data: [
          ["Student Name", "Cohort", "Class", "Room", "Test Name", "Test Date", "RW", "Math", "Total"],
          ["Maya Demo", "MWF", "G4", "201", "HW1 – PSAT", "2026-07-10", 720, 760, 1480],
        ],
      },
    ]);
    const repository = makeRepository({
      partition: {
        families: [existingDemoFamily],
        students: [existingDemoStudent],
        cohorts: [
          existingMwfCohort,
          { ...existingMwfCohort, id: "cohort-tths", name: "TTHS", cadence: "TTHS" },
        ],
      },
    });
    const setup = {
      cohorts: [],
      assessmentDates: [{
        sourceClass: "MWF",
        assessmentTitle: "HW1 – PSAT",
        date: "2026-07-10",
      }],
    };
    const preview = await previewStudentSpreadsheetImport({
      viewer: demoAdmin,
      filename: "normalized.xlsx",
      bytes: Buffer.from(marker),
      setup,
      repository,
      createUuid: makeIds(),
    });

    await commitStudentSpreadsheetImport(makeCommitInput(repository, {
      filename: "normalized.xlsx",
      bytes: Buffer.from(marker),
      mappings: undefined,
      mappingPlan: preview.mappingPlan,
      setup,
      expectedDigest: preview.digest,
      createUuid: makeIds(),
    }));

    expect(repository.committedPayloads[0]?.enrollments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        student_id: existingDemoStudent.id,
        cohort_id: existingMwfCohort.id,
      }),
      expect.objectContaining({
        student_id: existingDemoStudent.id,
        cohort_id: "cohort-tths",
      }),
    ]));
    expect(repository.committedPayloads[0]?.enrollments).toHaveLength(2);
    expect(repository.committedPayloads[0]?.importRun.enrollmentCount).toBe(2);
  });

  it.each([
    {
      label: "mapping",
      mutate: (preview: Awaited<ReturnType<typeof previewStudentSpreadsheetImport>>) => ({
        mappingPlan: {
          ...preview.mappingPlan,
          directory: {
            ...preview.mappingPlan.directory,
            columns: preview.mappingPlan.directory.columns.map((column, index) =>
              index === 0 ? { ...column, sourceHeader: "Changed Name" } : column),
          },
        },
      }),
    },
    {
      label: "setup date",
      mutate: () => ({ setup: { cohorts: [], assessmentDates: [] } }),
    },
    {
      label: "directory mapping assignment",
      mutate: (preview: Awaited<ReturnType<typeof previewStudentSpreadsheetImport>>) => ({
        mappings: preview.mappings.map((mapping, index) =>
          index === 0
            ? { sourceHeader: mapping.sourceHeader, kind: "known", field: "lastName" }
            : mapping),
      }),
    },
    {
      label: "cohort selection",
      mutate: () => ({
        setup: {
          cohorts: [{ sourceClass: "MWF", selectedCohortId: "missing-cohort" }],
          assessmentDates: [{
            sourceClass: "MWF",
            assessmentTitle: "HW1 – PSAT",
            date: "2026-07-10",
          }],
        },
      }),
    },
  ])("blocks a changed reviewed wide $label before repository commit", async ({ label, mutate }) => {
    const marker = `wide-stale-${label}`;
    setWideOperationFixture(marker);
    const repository = makeRepository({
      partition: {
        families: [existingDemoFamily],
        students: [existingDemoStudent],
        cohorts: [existingMwfCohort],
      },
    });
    const setup = {
      cohorts: [],
      assessmentDates: [{
        sourceClass: "MWF",
        assessmentTitle: "HW1 – PSAT",
        date: "2026-07-10",
      }],
    };
    const preview = await previewStudentSpreadsheetImport({
      viewer: demoAdmin,
      filename: "scores.xlsx",
      bytes: Buffer.from(marker),
      setup,
      repository,
      createUuid: makeIds(),
    });

    await expect(commitStudentSpreadsheetImport(makeCommitInput(repository, {
      filename: "scores.xlsx",
      bytes: Buffer.from(marker),
      mappings: undefined,
      mappingPlan: preview.mappingPlan,
      setup,
      expectedDigest: preview.digest,
      createUuid: makeIds(),
      ...mutate(preview),
    }))).rejects.toBeInstanceOf(StudentImportInputError);

    expect(repository.committedPayloads).toHaveLength(0);
  });

  it("blocks a changed assessment snapshot before repository commit", async () => {
    const marker = "wide-stale-assessment-snapshot";
    setWideOperationFixture(marker);
    const setup = {
      cohorts: [],
      assessmentDates: [{
        sourceClass: "MWF",
        assessmentTitle: "HW1 – PSAT",
        date: "2026-07-10",
      }],
    };
    const initialRepository = makeRepository({
      partition: {
        families: [existingDemoFamily],
        students: [existingDemoStudent],
        cohorts: [existingMwfCohort],
      },
    });
    const preview = await previewStudentSpreadsheetImport({
      viewer: demoAdmin,
      filename: "scores.xlsx",
      bytes: Buffer.from(marker),
      setup,
      repository: initialRepository,
      createUuid: makeIds(),
    });
    const duplicate = (id: string) => ({
      id,
      cohort_id: existingMwfCohort.id,
      title: "HW1 – PSAT",
      date: "2026-07-10",
      sections: [{ label: "RW", score: 800 }, { label: "Math", score: 800 }],
      demo: true,
    });
    const changedRepository = makeRepository({
      partition: {
        families: [existingDemoFamily],
        students: [existingDemoStudent],
        cohorts: [existingMwfCohort],
        assessments: [duplicate("assessment-one"), duplicate("assessment-two")],
      },
    });

    await expect(commitStudentSpreadsheetImport(makeCommitInput(changedRepository, {
      filename: "scores.xlsx",
      bytes: Buffer.from(marker),
      mappings: undefined,
      mappingPlan: preview.mappingPlan,
      setup,
      expectedDigest: preview.digest,
      createUuid: makeIds(),
    }))).rejects.toBeInstanceOf(StudentImportInputError);

    expect(changedRepository.committedPayloads).toHaveLength(0);
  });

  it("excludes blocking rows, rebuilds trusted counts, and calls the RPC once", async () => {
    const repository = makeRepository();
    const bytes = makeFile([
      "Ada,Lovelace,ada@example.com,2028",
      "Missing,,missing@example.com,2029",
    ]);
    const preview = await previewStudentSpreadsheetImport({
      viewer: demoAdmin,
      filename: "students.csv",
      bytes,
      mappings,
      excludedRowNumbers: [3],
      repository,
      createUuid: makeIds(),
      now: () => new Date("2026-07-09T12:00:00.000Z"),
    });
    const invalidateCache = vi.fn();

    const result = await commitStudentSpreadsheetImport(makeCommitInput(repository, {
      bytes,
      expectedDigest: preview.digest,
      excludedRowNumbers: [3],
      createUuid: makeIds(),
      invalidateCache,
    }));

    expect(result).toMatchObject({ created: 1, updated: 0, enrolled: 0, skipped: 0 });
    expect(repository.committedPayloads).toHaveLength(1);
    expect(repository.committedPayloads[0]).toMatchObject({
      actor: {
        id: demoAdmin.id,
        role: "admin",
        demo: true,
      },
      targetDemo: true,
      importRun: {
        totalRows: 1,
        createdCount: 1,
        updatedCount: 0,
        enrollmentCount: 0,
        skippedCount: 0,
        warningCount: 0,
        mapping: mappings,
      },
    });
    expect(repository.committedPayloads[0]!.students).toHaveLength(1);
    expect(repository.committedPayloads[0]!.students[0]).toMatchObject({
      custom_fields: { graduation_year: 2028 },
    });
    expect(invalidateCache).toHaveBeenCalledTimes(1);
  });

  it("does not allow an included error row to reach the RPC", async () => {
    const repository = makeRepository();
    const bytes = makeFile(["Missing,,missing@example.com,2029"]);
    const digest = (await previewStudentSpreadsheetImport({
      viewer: demoAdmin,
      filename: "students.csv",
      bytes,
      mappings,
      repository,
      createUuid: makeIds(),
    })).digest;

    await expect(commitStudentSpreadsheetImport(makeCommitInput(repository, {
      bytes,
      expectedDigest: digest,
    }))).rejects.toThrow("Fix or exclude every row with an error before importing.");

    expect(repository.committedPayloads).toHaveLength(0);
  });

  it("records one bounded, sanitized failed run after an RPC rollback", async () => {
    const repository = makeRepository({
      rpcError: new Error("SQL failed for secret-student@example.com at row value <script>"),
    });
    const digest = (await previewStudentSpreadsheetImport({
      viewer: demoAdmin,
      filename: "students.csv",
      bytes: makeFile(),
      mappings,
      repository,
      createUuid: makeIds(),
    })).digest;

    await expect(commitStudentSpreadsheetImport(makeCommitInput(repository, {
      filename: "x".repeat(600) + ".csv",
      expectedDigest: digest,
    }))).rejects.toThrow("Student import failed.");

    expect(repository.committedPayloads).toHaveLength(1);
    expect(repository.insertedFailedRuns).toHaveLength(1);
    expect(repository.insertedFailedRuns[0]).toMatchObject({
      demo: true,
      status: "failed",
      error_samples: ["Student import failed."],
    });
    expect(repository.insertedFailedRuns[0]!.filename.length).toBeLessThanOrEqual(255);
    expect(JSON.stringify(repository.insertedFailedRuns[0])).not.toContain("secret-student");
    expect(JSON.stringify(repository.insertedFailedRuns[0])).not.toContain("<script>");
  });

  it("records structured wide metadata without raw scores after an RPC rollback", async () => {
    const marker = "wide-operation-failed-audit";
    setWideOperationFixture(marker, 1481);
    const repository = makeRepository({
      rpcError: new Error("forced rollback for score 1481"),
      partition: {
        families: [existingDemoFamily],
        students: [existingDemoStudent],
        cohorts: [existingMwfCohort],
      },
    });
    const setup = {
      cohorts: [],
      assessmentDates: [{
        sourceClass: "MWF",
        assessmentTitle: "HW1 – PSAT",
        date: "2026-07-10",
      }],
    };
    const preview = await previewStudentSpreadsheetImport({
      viewer: demoAdmin,
      filename: "scores.xlsx",
      bytes: Buffer.from(marker),
      setup,
      repository,
      createUuid: makeIds(),
    });

    await expect(commitStudentSpreadsheetImport(makeCommitInput(repository, {
      filename: "scores.xlsx",
      bytes: Buffer.from(marker),
      mappings: undefined,
      mappingPlan: preview.mappingPlan,
      setup,
      expectedDigest: preview.digest,
      createUuid: makeIds(),
    }))).rejects.toThrow("Student import failed.");

    expect(repository.committedPayloads[0]?.results).toEqual([
      expect.objectContaining({ total_score: 1481, delta_from_previous: 1481 }),
    ]);
    expect(repository.insertedFailedRuns).toHaveLength(1);
    expect(repository.insertedFailedRuns[0]).toMatchObject({
      workbook_profile: "wide",
      workbook_mapping: preview.mappingPlan,
      workbook_setup: setup,
      cohort_count: 0,
      assessment_count: 1,
      result_count: 1,
      error_samples: ["Student import failed."],
    });
    expect(JSON.stringify(repository.insertedFailedRuns[0])).not.toContain("1481");
  });

  it("returns the committed result when cache invalidation fails without writing a failed run", async () => {
    const repository = makeRepository();
    const preview = await previewStudentSpreadsheetImport({
      viewer: demoAdmin,
      filename: "students.csv",
      bytes: makeFile(),
      mappings,
      repository,
      createUuid: makeIds(),
    });

    await expect(commitStudentSpreadsheetImport(makeCommitInput(repository, {
      expectedDigest: preview.digest,
      invalidateCache: () => {
        throw new Error("cache unavailable");
      },
    }))).resolves.toMatchObject({ created: 1 });

    expect(repository.committedPayloads).toHaveLength(1);
    expect(repository.insertedFailedRuns).toHaveLength(0);
  });

  it("rejects a custom-new mapping that collides with an active stored definition", async () => {
    const repository = makeRepository({
      fieldDefinitions: [{
        id: "40000000-0000-4000-8000-000000000001",
        key: "graduation_year",
        label: "Graduation year",
        data_type: "number",
        header_aliases: ["Grad year"],
        required: false,
        sensitive: true,
        sort_order: 10,
        demo: true,
      }],
    });

    await expect(previewStudentSpreadsheetImport({
      viewer: demoAdmin,
      filename: "students.csv",
      bytes: makeFile(),
      mappings: mappings.map((mapping) => mapping.kind === "custom-new"
        ? { ...mapping, dataType: "text" }
        : mapping),
      repository,
      createUuid: makeIds(),
    })).rejects.toThrow(
      "Custom field graduation_year already exists. Map it as an existing field.",
    );
  });

  it("uses a null actor only for the actual local-QA demo admin", async () => {
    const repository = makeRepository();
    const localQaViewer = { ...demoAdmin, id: "local-qa-admin" };
    const preview = await previewStudentSpreadsheetImport({
      viewer: localQaViewer,
      filename: "students.csv",
      bytes: makeFile(),
      mappings,
      repository,
      createUuid: makeIds(),
    });

    await commitStudentSpreadsheetImport(makeCommitInput(repository, {
      viewer: localQaViewer,
      expectedDigest: preview.digest,
      isLocalQa: () => true,
    }));

    expect(repository.committedPayloads.at(-1)?.actor.id).toBeNull();
  });

  it("requires a persisted UUID actor outside the local-QA exception", async () => {
    const repository = makeRepository();
    const invalidViewer = { ...demoAdmin, id: "local-qa-admin" };
    const preview = await previewStudentSpreadsheetImport({
      viewer: invalidViewer,
      filename: "students.csv",
      bytes: makeFile(),
      mappings,
      repository,
      createUuid: makeIds(),
    });

    await expect(commitStudentSpreadsheetImport(makeCommitInput(repository, {
      viewer: invalidViewer,
      expectedDigest: preview.digest,
      isLocalQa: () => false,
    }))).rejects.toThrow("The authenticated import actor is invalid.");
    expect(repository.committedPayloads).toHaveLength(0);
  });

  it("applies the target partition and pagination to every import query", async () => {
    const calls: Array<[string, string, unknown]> = [];
    const makeQuery = (table: string) => {
      const result = table === "campuses"
        ? { data: [{
            id: "campus-default",
            name: "Main",
            location: "Westfield, NJ",
            modality: "In person",
            demo: true,
          }], error: null }
        : { data: [], error: null };
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((field: string, value: unknown) => {
          calls.push([table, field, value]);
          return query;
        }),
        is: vi.fn(() => query),
        order: vi.fn(() => query),
        range: vi.fn((from: number, to: number) => {
          calls.push([table, "range", [from, to]]);
          return query;
        }),
        limit: vi.fn(() => query),
        maybeSingle: vi.fn(async () => result),
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      };
      return query;
    };
    serviceMocks.createClient.mockReturnValue({
      from: vi.fn((table: string) => makeQuery(table)),
    });

    const repository = createProductionStudentImportRepository();
    await repository.loadPartition(true);

    for (const table of [
      "families", "students", "enrollments", "cohorts", "student_field_definitions",
      "programs", "campuses", "terms", "sessions", "assessments", "assessment_results",
    ]) {
      expect(calls).toContainEqual([table, "demo", true]);
      expect(calls).toContainEqual([table, "range", [0, 999]]);
    }
  });

  it("keeps simple imports on the legacy RPC and adapts them to the stable result shape", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { runId: "50000000-0000-4000-8000-000000000001", created: 1, updated: 2, enrolled: 3, skipped: 4 },
      error: null,
    });
    serviceMocks.createClient.mockReturnValue({ rpc });
    const repository = createProductionStudentImportRepository();
    const payload: StudentImportCommitPayload = {
      actor: { id: demoAdmin.id, role: "admin", demo: true },
      targetDemo: true,
      fieldDefinitions: [{ id: "field" }],
      families: [{ id: "family" }],
      students: [{ id: "student" }],
      enrollments: [{ id: "enrollment" }],
      cohorts: [],
      sessions: [],
      assessments: [],
      results: [],
      importRun: {
        filename: "students.csv",
        fileDigest: "a".repeat(64),
        worksheet: "CSV",
        mapping: mappings,
        workbookProfile: "simple",
        workbookMapping: {
          profile: "simple",
          directory: { sheetName: "CSV", columns: mappings },
          academic: null,
        },
        workbookSetup: { cohorts: [], assessmentDates: [] },
        totalRows: 3,
        createdCount: 1,
        updatedCount: 2,
        enrollmentCount: 3,
        skippedCount: 4,
        warningCount: 0,
        cohortCount: 0,
        sessionCount: 0,
        assessmentCount: 0,
        resultCount: 0,
      },
    };

    await expect(repository.commitImport(payload)).resolves.toEqual({
      runId: "50000000-0000-4000-8000-000000000001",
      created: 1,
      updated: 2,
      enrolled: 3,
      skipped: 4,
      cohorts: 0,
      sessions: 0,
      assessments: 0,
      results: 0,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("commit_student_spreadsheet_import", {
      p_actor_id: demoAdmin.id,
      p_actor_role: "admin",
      p_actor_demo: true,
      p_target_demo: true,
      p_field_definitions: payload.fieldDefinitions,
      p_families: payload.families,
      p_students: payload.students,
      p_enrollments: payload.enrollments,
      p_import_run: payload.importRun,
    });

    rpc.mockResolvedValueOnce({ data: { runId: "bad", created: "1" }, error: null });
    await expect(repository.commitImport(payload)).rejects.toThrow(
      "The student import returned an invalid result.",
    );
  });

  it("dispatches wide plans through the exact workbook RPC and validates academic counts", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        runId: "50000000-0000-4000-8000-000000000001",
        created: 0,
        updated: 0,
        enrolled: 1,
        skipped: 0,
        cohorts: 1,
        sessions: 2,
        assessments: 1,
        results: 1,
      },
      error: null,
    });
    serviceMocks.createClient.mockReturnValue({ rpc });
    const repository = createProductionStudentImportRepository();
    const payload: StudentImportCommitPayload = {
      actor: { id: demoAdmin.id, role: "admin", demo: true },
      targetDemo: true,
      fieldDefinitions: [],
      families: [],
      students: [],
      enrollments: [{ id: "enrollment" }],
      cohorts: [{ id: "cohort" }],
      sessions: [{ id: "session-1" }, { id: "session-2" }],
      assessments: [{ id: "assessment" }],
      results: [{ id: "result", delta_from_previous: 1480 }],
      importRun: {
        filename: "scores.xlsx",
        fileDigest: "a".repeat(64),
        worksheet: "Camp Scores",
        mapping: [],
        workbookProfile: "wide",
        workbookMapping: {
          profile: "wide",
          directory: { sheetName: "Camp Scores", columns: [] },
          academic: { sheetName: "Camp Scores", columns: [] },
        },
        workbookSetup: { cohorts: [], assessmentDates: [] },
        totalRows: 0,
        createdCount: 0,
        updatedCount: 0,
        enrollmentCount: 1,
        skippedCount: 0,
        warningCount: 0,
        cohortCount: 1,
        sessionCount: 2,
        assessmentCount: 1,
        resultCount: 1,
      },
    };

    await expect(repository.commitImport(payload)).resolves.toMatchObject({ results: 1 });
    expect(rpc).toHaveBeenCalledWith("commit_student_workbook_import", {
      p_actor_id: demoAdmin.id,
      p_actor_role: "admin",
      p_actor_demo: true,
      p_target_demo: true,
      p_field_definitions: payload.fieldDefinitions,
      p_families: payload.families,
      p_students: payload.students,
      p_enrollments: payload.enrollments,
      p_cohorts: payload.cohorts,
      p_sessions: payload.sessions,
      p_assessments: payload.assessments,
      p_results: payload.results,
      p_import_run: {
        ...payload.importRun,
        profile: "wide",
      },
    });

    rpc.mockResolvedValueOnce({
      data: {
        runId: "bad",
        created: 0,
        updated: 0,
        enrolled: 0,
        skipped: 0,
        cohorts: 1,
        sessions: 2,
        assessments: 1,
        results: "1",
      },
      error: null,
    });
    await expect(repository.commitImport(payload)).rejects.toThrow(
      "The student import returned an invalid result.",
    );
  });
});
