import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(),
  exportWorkbook: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getAuthenticatedViewerForRequest: mocks.getViewer,
}));
vi.mock("@/lib/student-workbook-export", async () => ({
  ...(await vi.importActual<typeof import("@/lib/student-workbook-export")>(
    "@/lib/student-workbook-export",
  )),
  exportStudentWorkbook: mocks.exportWorkbook,
}));

import { GET } from "@/app/api/students/export/route";
import { StudentWorkbookExportPermissionError } from "@/lib/student-workbook-export";

const viewer = {
  id: "admin-demo",
  name: "Demo Admin",
  role: "admin" as const,
  title: "Administrator",
  assignedCohortIds: [],
  demo: true,
};

describe("student workbook export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getViewer.mockResolvedValue({
      mode: "live",
      accountStatus: "active",
      mustChangePassword: false,
      user: viewer,
    });
    mocks.exportWorkbook.mockResolvedValue({
      filename: "intoprep-demo-export-2026-07-11.xlsx",
      bytes: Buffer.from("xlsx-bytes"),
      sheetNames: ["Student Information", "Scores"],
      rows: { students: [], scores: [] },
    });
  });

  it("returns an authenticated no-store XLSX attachment", async () => {
    const response = await GET(new Request(
      "http://localhost/api/students/export?scope=all&targetDemo=true",
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="intoprep-demo-export-2026-07-11.xlsx"',
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from("xlsx-bytes"));
    expect(mocks.exportWorkbook).toHaveBeenCalledWith({
      viewer,
      scope: "all",
      requestedTarget: true,
    });
  });

  it.each([
    ["students", undefined],
    ["scores", false],
    ["all", true],
  ] as const)("accepts the %s scope and a strict optional target", async (scope, targetDemo) => {
    const target = targetDemo === undefined ? "" : `&targetDemo=${targetDemo}`;
    const response = await GET(new Request(
      `http://localhost/api/students/export?scope=${scope}${target}`,
    ));

    expect(response.status).toBe(200);
    expect(mocks.exportWorkbook).toHaveBeenCalledWith({
      viewer,
      scope,
      requestedTarget: targetDemo,
    });
  });

  it.each([
    "http://localhost/api/students/export",
    "http://localhost/api/students/export?scope=directory",
    "http://localhost/api/students/export?scope=all&targetDemo=TRUE",
    "http://localhost/api/students/export?scope=all&targetDemo=1",
    "http://localhost/api/students/export?scope=all&targetDemo=",
    "http://localhost/api/students/export?scope=all&extra=true",
    "http://localhost/api/students/export?scope=all&scope=scores",
    "http://localhost/api/students/export?scope=all&targetDemo=true&targetDemo=false",
  ])("rejects invalid export query parameters: %s", async (url) => {
    const response = await GET(new Request(url));

    expect(response.status).toBe(400);
    expect(mocks.exportWorkbook).not.toHaveBeenCalled();
  });

  it("rejects missing, suspended, password-change, role-preview, and read-only viewers", async () => {
    const deniedViewers = [
      null,
      { mode: "live", accountStatus: "suspended", mustChangePassword: false, user: viewer },
      { mode: "live", accountStatus: "active", mustChangePassword: true, user: viewer },
      { mode: "live-role-preview", accountStatus: "active", mustChangePassword: false, user: viewer },
      { mode: "live", accountStatus: "active", mustChangePassword: false, user: { ...viewer, role: "ta" } },
    ];

    for (const deniedViewer of deniedViewers) {
      mocks.getViewer.mockResolvedValueOnce(deniedViewer);
      const response = await GET(new Request(
        "http://localhost/api/students/export?scope=all",
      ));
      expect(response.status).toBe(403);
    }
    expect(mocks.exportWorkbook).not.toHaveBeenCalled();
  });

  it("returns bounded permission and server errors", async () => {
    mocks.exportWorkbook.mockRejectedValueOnce(
      new StudentWorkbookExportPermissionError(
        "Engineers must choose Demo or Main before exporting students.",
      ),
    );
    let response = await GET(new Request(
      "http://localhost/api/students/export?scope=all",
    ));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Engineers must choose Demo or Main before exporting students.",
    });

    mocks.exportWorkbook.mockRejectedValueOnce(new Error("database detail"));
    response = await GET(new Request(
      "http://localhost/api/students/export?scope=all",
    ));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Student export failed." });
  });
});
