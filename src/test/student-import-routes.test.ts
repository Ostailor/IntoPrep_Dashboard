import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(),
  preview: vi.fn(),
  commit: vi.fn(),
}));

const xlsxFixtures = vi.hoisted(() => new Map<string, Array<{
  sheet: string;
  data: unknown[][];
}>>());

vi.mock("server-only", () => ({}));
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
vi.mock("@/lib/auth", () => ({
  getAuthenticatedViewerForRequest: mocks.getViewer,
}));
vi.mock("@/lib/student-import-operations", async () => ({
  ...(await vi.importActual<typeof import("@/lib/student-import-operations")>(
    "@/lib/student-import-operations",
  )),
  previewStudentSpreadsheetImport: mocks.preview,
  commitStudentSpreadsheetImport: mocks.commit,
}));

import { POST as previewPost } from "@/app/api/students/import/preview/route";
import { POST as commitPost } from "@/app/api/students/import/commit/route";
import {
  StudentImportInputError,
  StudentImportPermissionError,
} from "@/lib/student-import-operations";

const admin = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Admin",
  role: "admin" as const,
  title: "Administrator",
  assignedCohortIds: [],
  demo: true,
};

function makeRequest(
  path: "preview" | "commit",
  fields: Record<string, string> = {},
  options: {
    includeFile?: boolean;
    headers?: HeadersInit;
    file?: { contents: string; name: string; type: string };
  } = {},
) {
  const form = new FormData();
  if (options.includeFile !== false) {
    const file = options.file ?? {
      contents: "First Name,Last Name\nAda,Lovelace",
      name: "students.csv",
      type: "text/csv",
    };
    form.set("file", new File([file.contents], file.name, {
      type: file.type,
    }));
  }
  Object.entries(fields).forEach(([key, value]) => form.set(key, value));
  return new Request(`http://localhost/api/students/import/${path}`, {
    method: "POST",
    body: form,
    headers: options.headers,
  });
}

describe("student spreadsheet import routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getViewer.mockResolvedValue({
      mode: "live",
      accountStatus: "active",
      mustChangePassword: false,
      user: admin,
    });
    mocks.preview.mockResolvedValue({ digest: "a".repeat(64) });
    mocks.commit.mockResolvedValue({ created: 1, updated: 0, enrolled: 0, skipped: 0 });
  });

  it("rejects missing, suspended, password-change, role-preview, and read-only viewers", async () => {
    const deniedViewers = [
      null,
      { mode: "live", accountStatus: "suspended", mustChangePassword: false, user: admin },
      { mode: "live", accountStatus: "active", mustChangePassword: true, user: admin },
      { mode: "live-role-preview", accountStatus: "active", mustChangePassword: false, user: admin },
      { mode: "live", accountStatus: "active", mustChangePassword: false, user: { ...admin, role: "ta" } },
    ];

    for (const viewer of deniedViewers) {
      mocks.getViewer.mockResolvedValueOnce(viewer);
      const response = await previewPost(makeRequest("preview"));
      expect(response.status).toBe(403);
    }
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("strictly parses preview multipart fields and forwards only validated values", async () => {
    const mappings = [
      { sourceHeader: "First Name", kind: "known", field: "firstName" },
      { sourceHeader: "Last Name", kind: "known", field: "lastName" },
    ];
    const mappingPlan = {
      profile: "simple",
      directory: { sheetName: "CSV", columns: mappings },
      academic: null,
    };
    const setup = {
      cohorts: [{ sourceClass: "MWF", selectedCohortId: "cohort-1", capacity: 24 }],
      assessmentDates: [{ sourceClass: "MWF", assessmentTitle: "HW1 – PSAT", date: "2026-07-10" }],
    };
    const response = await previewPost(makeRequest("preview", {
      mappings: JSON.stringify(mappings),
      mappingPlan: JSON.stringify(mappingPlan),
      setup: JSON.stringify(setup),
      excludedRowNumbers: JSON.stringify([3]),
      targetDemo: "true",
    }));

    expect(response.status).toBe(200);
    expect(mocks.preview).toHaveBeenCalledWith(expect.objectContaining({
      viewer: admin,
      filename: "students.csv",
      mappings,
      mappingPlan,
      setup,
      excludedRowNumbers: [3],
      requestedTarget: true,
    }));
    expect(mocks.preview.mock.calls[0]![0].bytes).toBeInstanceOf(Buffer);
  });

  it("strictly parses and forwards sheet-aware excluded rows", async () => {
    const excludedRows = [
      { sheetName: "Student Information", rowNumber: 2 },
      { sheetName: "Scores", rowNumber: 2 },
    ];
    const response = await previewPost(makeRequest("preview", {
      excludedRows: JSON.stringify(excludedRows),
    }));

    expect(response.status).toBe(200);
    expect(mocks.preview).toHaveBeenCalledWith(expect.objectContaining({ excludedRows }));
  });

  it.each([
    ["object", "{}"],
    ["extra keys", JSON.stringify([{ sheetName: "Scores", rowNumber: 2, rows: [3] }])],
    ["missing sheet", JSON.stringify([{ rowNumber: 2 }])],
    ["overlong sheet", JSON.stringify([{ sheetName: "x".repeat(201), rowNumber: 2 }])],
    ["non-integer row", JSON.stringify([{ sheetName: "Scores", rowNumber: 2.5 }])],
    ["excessive entries", JSON.stringify(Array.from(
      { length: 4001 },
      (_, index) => ({ sheetName: "Scores", rowNumber: index + 2 }),
    ))],
    ["oversized JSON", JSON.stringify({ padding: "x".repeat(100_000) })],
  ])("rejects invalid sheet-aware excluded rows: %s", async (_label, excludedRows) => {
    const response = await previewPost(makeRequest("preview", { excludedRows }));

    expect(response.status).toBe(400);
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it.each([
    ["mapping array", { mappingPlan: "[]" }],
    ["mapping object shape", { mappingPlan: JSON.stringify({ profile: "simple" }) }],
    ["excessive mapping entries", {
      mappingPlan: JSON.stringify({
        profile: "simple",
        directory: {
          sheetName: "CSV",
          columns: Array.from({ length: 401 }, (_, index) => ({
            sourceHeader: `Column ${index}`,
            kind: "ignore",
          })),
        },
        academic: null,
      }),
    }],
    ["setup array", { setup: "[]" }],
    ["setup object shape", { setup: JSON.stringify({ cohorts: [] }) }],
    ["excessive cohorts", {
      setup: JSON.stringify({
        cohorts: Array.from({ length: 101 }, () => ({ sourceClass: "MWF" })),
        assessmentDates: [],
      }),
    }],
    ["invalid setup date", {
      setup: JSON.stringify({
        cohorts: [],
        assessmentDates: [{ sourceClass: "MWF", assessmentTitle: "PSAT", date: "2026-02-30" }],
      }),
    }],
    ["negative capacity", {
      setup: JSON.stringify({ cohorts: [{ sourceClass: "MWF", capacity: -1 }], assessmentDates: [] }),
    }],
    ["non-integer capacity", {
      setup: JSON.stringify({ cohorts: [{ sourceClass: "MWF", capacity: 1.5 }], assessmentDates: [] }),
    }],
    ["overlong setup text", {
      setup: JSON.stringify({ cohorts: [{ sourceClass: "x".repeat(201) }], assessmentDates: [] }),
    }],
    ["oversized mapping JSON", { mappingPlan: JSON.stringify({ padding: "x".repeat(250_000) }) }],
    ["oversized setup JSON", { setup: JSON.stringify({ padding: "x".repeat(100_000) }) }],
  ])("rejects invalid structured preview %s", async (_label, fields) => {
    const response = await previewPost(makeRequest("preview", fields));

    expect(response.status).toBe(400);
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("rejects academic column indexes outside the detected workbook", async () => {
    const marker = "route-wide-column-index";
    xlsxFixtures.set(marker, [{
      sheet: "Camp Scores",
      data: [
        ["Name", "Class", "Level", "Room", "HW1", null, null],
        [null, null, null, null, "PSAT", null, null],
        [null, null, null, null, "RW", "Math", "Total"],
        ["Maya Demo", "MWF", "G4", "201", 720, 760, 1480],
      ],
    }]);
    const headers = [
      "Name", "Class", "Level", "Room",
      "HW1 / PSAT / RW", "HW1 / PSAT / Math", "HW1 / PSAT / Total",
    ];
    const response = await previewPost(makeRequest("preview", {
      mappingPlan: JSON.stringify({
        profile: "wide",
        directory: {
          sheetName: "Camp Scores",
          columns: headers.map((sourceHeader) => ({ sourceHeader, kind: "ignore" })),
        },
        academic: {
          sheetName: "Camp Scores",
          columns: headers.map((sourceHeader, columnIndex) => ({
            sourceHeader,
            columnIndex: columnIndex === 4 ? 99 : columnIndex,
            kind: "ignore",
          })),
        },
      }),
    }, {
      file: { contents: marker, name: "scores.xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    }));

    expect(response.status).toBe(400);
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("rejects client-supplied normalized rows and counts", async () => {
    const response = await previewPost(makeRequest("preview", {
      normalizedRows: JSON.stringify([{ studentName: "Injected Student" }]),
      counts: JSON.stringify({ creates: 500 }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("streams and reconstructs both request bodies instead of calling their formData methods", async () => {
    const previewRequest = makeRequest("preview");
    const previewFormData = vi.fn(previewRequest.formData.bind(previewRequest));
    Object.defineProperty(previewRequest, "formData", { value: previewFormData });
    const previewResponse = await previewPost(previewRequest);
    expect(previewResponse.status).toBe(200);
    expect(previewFormData).not.toHaveBeenCalled();

    const commitRequest = makeRequest("commit", {
      expectedDigest: "b".repeat(64),
      mappings: JSON.stringify([
        { sourceHeader: "First Name", kind: "known", field: "firstName" },
        { sourceHeader: "Last Name", kind: "known", field: "lastName" },
      ]),
    });
    const commitFormData = vi.fn(commitRequest.formData.bind(commitRequest));
    Object.defineProperty(commitRequest, "formData", { value: commitFormData });
    const commitResponse = await commitPost(commitRequest);
    expect(commitResponse.status).toBe(200);
    expect(commitFormData).not.toHaveBeenCalled();
  });

  it.each([
    ["missing file", makeRequest("preview", {}, { includeFile: false })],
    ["invalid mappings", makeRequest("preview", { mappings: "{}" })],
    ["invalid exclusions", makeRequest("preview", { excludedRowNumbers: "[2.5]" })],
    ["invalid target", makeRequest("preview", { targetDemo: "demo" })],
    ["oversized request", makeRequest("preview", {}, { headers: { "content-length": String(5 * 1024 * 1024 + 1) } })],
    ["oversized actual multipart body", makeRequest("preview", { ignored: "x".repeat(5 * 1024 * 1024) }, { headers: { "content-length": "2" } })],
    ["too many multipart fields", makeRequest("preview", Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`ignored${index}`, "x"])))],
  ])("returns 400 for %s", async (_label, request) => {
    const response = await previewPost(request);
    expect(response.status).toBe(400);
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed multipart syntax", async () => {
    const response = await previewPost(new Request("http://localhost/api/students/import/preview", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=missing" },
      body: "not-a-valid-multipart-body",
    }));

    expect(response.status).toBe(400);
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("requires a strict digest for commit and never trusts client counts or rows", async () => {
    const invalid = await commitPost(makeRequest("commit", { expectedDigest: "not-a-digest" }));
    expect(invalid.status).toBe(400);
    expect(mocks.commit).not.toHaveBeenCalled();

    const response = await commitPost(makeRequest("commit", {
      expectedDigest: "b".repeat(64),
      mappings: JSON.stringify([
        { sourceHeader: "First Name", kind: "known", field: "firstName" },
        { sourceHeader: "Last Name", kind: "known", field: "lastName" },
      ]),
      normalizedRows: JSON.stringify([{ studentEmail: "untrusted@example.com" }]),
      counts: JSON.stringify({ creates: 500 }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.commit).toHaveBeenCalledWith(expect.objectContaining({
      expectedDigest: "b".repeat(64),
    }));
    expect(mocks.commit.mock.calls[0]![0]).not.toHaveProperty("normalizedRows");
    expect(mocks.commit.mock.calls[0]![0]).not.toHaveProperty("counts");
  });

  it("strictly parses the reviewed workbook plan and setup before commit", async () => {
    const mappings = [
      { sourceHeader: "First Name", kind: "known", field: "firstName" },
      { sourceHeader: "Last Name", kind: "known", field: "lastName" },
    ];
    const mappingPlan = {
      profile: "simple",
      directory: { sheetName: "CSV", columns: mappings },
      academic: null,
    };
    const setup = { cohorts: [], assessmentDates: [] };
    const excludedRows = [{ sheetName: "CSV", rowNumber: 2 }];
    const response = await commitPost(makeRequest("commit", {
      expectedDigest: "b".repeat(64),
      sheetName: "CSV",
      mappings: JSON.stringify(mappings),
      mappingPlan: JSON.stringify(mappingPlan),
      setup: JSON.stringify(setup),
      excludedRows: JSON.stringify(excludedRows),
      targetDemo: "true",
      normalizedRows: JSON.stringify([{ studentEmail: "untrusted@example.com" }]),
      counts: JSON.stringify({ results: 500 }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.commit).toHaveBeenCalledWith(expect.objectContaining({
      viewer: admin,
      filename: "students.csv",
      sheetName: "CSV",
      mappings,
      mappingPlan,
      setup,
      excludedRows,
      requestedTarget: true,
      expectedDigest: "b".repeat(64),
    }));
    expect(mocks.commit.mock.calls[0]![0]).not.toHaveProperty("normalizedRows");
    expect(mocks.commit.mock.calls[0]![0]).not.toHaveProperty("counts");
  });

  it.each([
    ["mapping plan", { mappingPlan: "[]" }],
    ["setup", { setup: "[]" }],
    ["sheet-aware exclusions", { excludedRows: JSON.stringify([{ sheetName: "CSV", rowNumber: 2.5 }]) }],
  ])("rejects an invalid reviewed commit %s", async (_label, invalidFields) => {
    const response = await commitPost(makeRequest("commit", {
      expectedDigest: "b".repeat(64),
      mappings: JSON.stringify([
        { sourceHeader: "First Name", kind: "known", field: "firstName" },
        { sourceHeader: "Last Name", kind: "known", field: "lastName" },
      ]),
      ...invalidFields,
    }));

    expect(response.status).toBe(400);
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("maps permission, data, and unexpected operation errors to 403, 400, and 500", async () => {
    mocks.preview.mockRejectedValueOnce(new StudentImportPermissionError("You cannot import students."));
    const forbidden = await previewPost(makeRequest("preview"));
    expect(forbidden.status).toBe(403);

    mocks.preview.mockRejectedValueOnce(new StudentImportInputError("Bad workbook."));
    const invalid = await previewPost(makeRequest("preview"));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ error: "Bad workbook." });

    mocks.preview.mockRejectedValueOnce(new Error("database secret"));
    const failed = await previewPost(makeRequest("preview"));
    expect(failed.status).toBe(500);
    await expect(failed.json()).resolves.toEqual({ error: "Student import preview failed." });
  });
});
