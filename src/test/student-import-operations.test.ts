import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/domain";
import {
  commitStudentSpreadsheetImport,
  createProductionStudentImportRepository,
  previewStudentSpreadsheetImport,
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
        programs: [{ id: "program-sat", name: "SAT", track: "SAT", is_archived: false }],
        campuses: [{ id: "campus-default", name: "Main", modality: "In person" }],
        terms: [{ id: "term-summer", name: "Summer 2026", start_date: "2026-07-06", end_date: "2026-07-11" }],
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
    expect(preview.sheetNames).toEqual(["Student Information", "Scores"]);
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

  it("applies the target partition to every scoped query and paginates global references", async () => {
    const calls: Array<[string, string, unknown]> = [];
    const makeQuery = (table: string) => {
      const result = table === "campuses"
        ? { data: [{ id: "campus-default", name: "Main", modality: "In person" }], error: null }
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
      "sessions", "assessments", "assessment_results",
    ]) {
      expect(calls).toContainEqual([table, "demo", true]);
      expect(calls).toContainEqual([table, "range", [0, 999]]);
    }
    for (const table of ["programs", "campuses", "terms"]) {
      expect(calls).toContainEqual([table, "range", [0, 999]]);
      expect(calls).not.toContainEqual([table, "demo", true]);
    }
  });

  it("calls the production RPC once with the exact trusted payload and validates its result", async () => {
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
      importRun: {
        filename: "students.csv",
        fileDigest: "a".repeat(64),
        worksheet: "CSV",
        mapping: mappings,
        totalRows: 3,
        createdCount: 1,
        updatedCount: 2,
        enrollmentCount: 3,
        skippedCount: 4,
        warningCount: 0,
      },
    };

    await expect(repository.commitImport(payload)).resolves.toMatchObject({ created: 1, updated: 2 });
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
});
