import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/domain";

const operationMocks = vi.hoisted(() => ({
  assertWritesAllowed: vi.fn(),
  createServiceClient: vi.fn(),
  finalizeSyncRun: vi.fn(),
  maybeSendSyncAlertEmail: vi.fn(),
  startSyncRun: vi.fn(),
  upsertSyncJob: vi.fn(),
}));

vi.mock("@/lib/supabase/config", () => ({ hasSupabaseServiceRole: () => true }));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: operationMocks.createServiceClient,
}));
vi.mock("@/lib/engineer-controls", () => ({
  assertWritesAllowed: operationMocks.assertWritesAllowed,
}));
vi.mock("@/lib/sync-jobs", () => ({
  finalizeSyncRun: operationMocks.finalizeSyncRun,
  maybeSendSyncAlertEmail: operationMocks.maybeSendSyncAlertEmail,
  startSyncRun: operationMocks.startSyncRun,
  upsertSyncJob: operationMocks.upsertSyncJob,
}));

import { importIntakeCsv } from "@/lib/intake-import";
import {
  getIntakeTemplateCsv,
  parseCsv,
  parseIntakeCsvRows,
} from "@/lib/intake-import-shared";

describe("intake csv parsing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    operationMocks.assertWritesAllowed.mockResolvedValue(undefined);
    operationMocks.startSyncRun.mockResolvedValue({ id: "sync-run" });
    operationMocks.upsertSyncJob.mockResolvedValue(undefined);
    operationMocks.finalizeSyncRun.mockResolvedValue(undefined);
    operationMocks.maybeSendSyncAlertEmail.mockResolvedValue(false);
  });
  it("parses quoted csv cells with commas intact", () => {
    const rows = parseCsv('A,B,C\n1,"two, still two",3\n');

    expect(rows).toEqual([
      ["A", "B", "C"],
      ["1", "two, still two", "3"],
    ]);
  });

  it("maps google forms style headers into normalized intake rows", () => {
    const rows = parseIntakeCsvRows(
      [
        "Timestamp,Guardian Name,Guardian Email,Student Name,Target Program,Stage,Cohort Name",
        "2026-03-14T08:00:00-04:00,Jordan Ellis,jordan@example.com,Mila Ellis,Digital SAT Score Guarantee,Registered,SAT Spring Elite M/W/F",
      ].join("\n"),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      guardianName: "Jordan Ellis",
      guardianEmail: "jordan@example.com",
      studentFirstName: "Mila",
      studentLastName: "Ellis",
      targetProgram: "Digital SAT Score Guarantee",
      stage: "registered",
      cohortName: "SAT Spring Elite M/W/F",
    });
    expect(rows[0]?.submittedAt).toBe("2026-03-14T12:00:00.000Z");
  });

  it("produces a template csv with the expected header row", () => {
    const template = getIntakeTemplateCsv();

    expect(template).toContain("Guardian Email");
    expect(template).toContain("Cohort Name");
    expect(template.trim().split("\n")).toHaveLength(2);
  });

  it.each([true, false])(
    "scopes intake Program and Campus reads to demo=%s",
    async (demo) => {
      const filters: Array<[string, string, unknown]> = [];
      const makeQuery = (table: string) => {
        const result = {
          data: table === "campuses"
            ? [{
                id: demo ? "campus-demo" : "campus-main",
                name: "Main",
                location: "Wayne",
                modality: "In person",
                demo,
              }]
            : [],
          error: null,
        };
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn((field: string, value: unknown) => {
            filters.push([table, field, value]);
            return query;
          }),
          upsert: vi.fn(() => query),
          single: vi.fn(async () => table === "intake_import_runs"
            ? {
                data: {
                  id: "import-run",
                  source: "Manual CSV",
                  filename: "intake.csv",
                  status: "completed",
                  started_at: "2026-07-11T12:00:00.000Z",
                  finished_at: "2026-07-11T12:00:01.000Z",
                  imported_count: 1,
                  lead_count: 1,
                  family_count: 1,
                  student_count: 1,
                  enrollment_count: 0,
                  error_count: 0,
                  summary: "Imported one row.",
                  error_samples: [],
                  created_by: "admin",
                  demo,
                },
                error: null,
              }
            : result),
          then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
        };
        return query;
      };
      operationMocks.createServiceClient.mockReturnValue({
        from: vi.fn((table: string) => makeQuery(table)),
      });
      const viewer: User = {
        id: demo ? "admin-demo" : "admin-main",
        name: demo ? "Demo Admin" : "Main Admin",
        role: "admin",
        title: "Administrator",
        assignedCohortIds: [],
        demo,
      };

      await importIntakeCsv({
        viewer,
        csvText: [
          "Guardian Name,Guardian Email,Student Name,Preferred Campus,Stage",
          "Jordan Lovelace,jordan@example.com,Ada Lovelace,Main,New",
        ].join("\n"),
        filename: "intake.csv",
        source: "Manual CSV",
      });

      expect(filters).toContainEqual(["programs", "demo", demo]);
      expect(filters).toContainEqual(["campuses", "demo", demo]);
    },
  );
});
