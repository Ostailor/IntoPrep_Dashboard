import { describe, expect, it } from "vitest";
import type { StudentWorkbookSheet } from "@/lib/student-spreadsheet";
import { detectStudentWorkbook } from "@/lib/student-workbook-profile";

function workbookSheet(
  name: string,
  rows: Array<{ rowNumber: number; cells: StudentWorkbookSheet["rows"][number]["cells"] }>,
): StudentWorkbookSheet {
  return { name, rows };
}

describe("student workbook profile detection", () => {
  it("detects a simple one-row student table", () => {
    const simpleSheet = workbookSheet("Students", [
      { rowNumber: 1, cells: ["Student Name", "Parent Email", "School"] },
      { rowNumber: 2, cells: ["Maya Demo", "parent@example.com", "Central High"] },
    ]);

    expect(detectStudentWorkbook({ sheets: [simpleSheet], selectedSheet: "Students" })).toEqual({
      profile: "simple",
      directory: {
        sheetName: "Students",
        headerRowNumbers: [1],
        dataStartRow: 2,
        columns: [
          { index: 0, path: ["Student Name"], sourceHeader: "Student Name" },
          { index: 1, path: ["Parent Email"], sourceHeader: "Parent Email" },
          { index: 2, path: ["School"], sourceHeader: "School" },
        ],
      },
      academic: null,
      sheetNames: ["Students"],
    });
  });

  it("does not carry simple leaf headers into blank columns", () => {
    const simpleSheet = workbookSheet("Students", [
      { rowNumber: 1, cells: ["Student Name", null, "School"] },
      { rowNumber: 2, cells: ["Maya Demo", null, "Central High"] },
    ]);

    const detected = detectStudentWorkbook({ sheets: [simpleSheet] });

    expect(detected.directory.columns).toEqual([
      { index: 0, path: ["Student Name"], sourceHeader: "Student Name" },
      { index: 2, path: ["School"], sourceHeader: "School" },
    ]);
  });

  it("detects a wide workbook and reconstructs grouped score headers", () => {
    const wideSheet = workbookSheet("Camp Scores", [
      { rowNumber: 1, cells: ["SAT Summer Camp 2026"] },
      { rowNumber: 2, cells: ["Name", "Class", "Level", "Room", "HW1", null, null] },
      { rowNumber: 3, cells: [null, null, null, null, "PSAT", null, null] },
      { rowNumber: 4, cells: [null, null, null, null, "RW", "Math", "Total"] },
      { rowNumber: 5, cells: ["Maya Demo", "MWF", "G4", "201", 720, 760, 1480] },
    ]);

    const wide = detectStudentWorkbook({ sheets: [wideSheet], selectedSheet: "Camp Scores" });

    expect(wide).toMatchObject({
      profile: "wide",
      directory: { sheetName: "Camp Scores", headerRowNumbers: [2, 3, 4], dataStartRow: 5 },
      academic: { sheetName: "Camp Scores", headerRowNumbers: [2, 3, 4], dataStartRow: 5 },
    });
    expect(wide.academic?.columns.map((column) => column.sourceHeader)).toContain(
      "HW1 / PSAT / RW",
    );
  });

  it("detects normalized student-information and scores sheets", () => {
    const studentInformationSheet = workbookSheet("Student Information", [
      { rowNumber: 1, cells: ["Student Name", "Parent Email"] },
      { rowNumber: 2, cells: ["Maya Demo", "parent@example.com"] },
    ]);
    const scoresSheet = workbookSheet("Scores", [
      { rowNumber: 1, cells: ["Student Name", "Class", "Assessment", "RW", "Math", "Total"] },
      { rowNumber: 2, cells: ["Maya Demo", "MWF", "HW1 – PSAT", 720, 760, 1480] },
    ]);

    const detected = detectStudentWorkbook({
      sheets: [studentInformationSheet, scoresSheet],
      selectedSheet: "Student Information",
    });

    expect(detected.profile).toBe("normalized");
    expect(detected.directory).toMatchObject({ sheetName: "Student Information", dataStartRow: 2 });
    expect(detected.academic).toMatchObject({ sheetName: "Scores", dataStartRow: 2 });
  });

  it("finds a shifted wide header band after title rows and physical gaps", () => {
    const shiftedSheet = workbookSheet("Camp Scores", [
      { rowNumber: 3, cells: ["SAT Summer Camp 2026"] },
      { rowNumber: 7, cells: ["Prepared for administrators"] },
      { rowNumber: 10, cells: ["Name", "Class", "Level", "Room", "HW1", null, null] },
      { rowNumber: 11, cells: [null, null, null, null, "PSAT", null, null] },
      { rowNumber: 12, cells: [null, null, null, null, "RW", "Math", "Total"] },
      { rowNumber: 14, cells: ["Maya Demo", "MWF", "G4", "201", 720, 760, 1480] },
    ]);

    const detected = detectStudentWorkbook({ sheets: [shiftedSheet] });

    expect(detected.profile).toBe("wide");
    expect(detected.academic).toMatchObject({
      headerRowNumbers: [10, 11, 12],
      dataStartRow: 14,
    });
  });

  it("keeps duplicate leaf labels distinct by column index and group path", () => {
    const repeatedLeavesSheet = workbookSheet("Camp Scores", [
      {
        rowNumber: 1,
        cells: ["Name", "Class", "Level", "Room", "HW1", null, "HW2", null],
      },
      {
        rowNumber: 2,
        cells: [null, null, null, null, "PSAT", null, "PSAT", null],
      },
      {
        rowNumber: 3,
        cells: [null, null, null, null, "RW", "Math", "RW", "Math"],
      },
      {
        rowNumber: 4,
        cells: ["Maya Demo", "MWF", "G4", "201", 720, 760, 710, 750],
      },
    ]);

    const detected = detectStudentWorkbook({ sheets: [repeatedLeavesSheet] });
    const rwColumns = detected.academic?.columns.filter((column) => column.path.at(-1) === "RW");

    expect(rwColumns).toEqual([
      { index: 4, path: ["HW1", "PSAT", "RW"], sourceHeader: "HW1 / PSAT / RW" },
      { index: 6, path: ["HW2", "PSAT", "RW"], sourceHeader: "HW2 / PSAT / RW" },
    ]);
  });

  it("rejects a malformed sheet with a clear detection error", () => {
    const malformedSheet = workbookSheet("Mystery", [
      { rowNumber: 4, cells: ["Untitled student workbook"] },
    ]);

    expect(() => detectStudentWorkbook({ sheets: [malformedSheet] })).toThrow(
      'Could not detect a student table in worksheet "Mystery".',
    );
  });
});
