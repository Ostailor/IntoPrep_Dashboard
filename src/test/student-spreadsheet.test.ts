import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

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

import {
  STUDENT_IMPORT_MAX_ROWS,
  readStudentSpreadsheet,
} from "@/lib/student-spreadsheet";
import { detectStudentWorkbook } from "@/lib/student-workbook-profile";

describe("student spreadsheet decoding", () => {
  it("decodes quoted CSV cells", async () => {
    const result = await readStudentSpreadsheet({
      filename: "students.csv",
      bytes: Buffer.from('Student Name,Family Notes\nMaya Demo,"Needs pacing, algebra"'),
    });

    expect(result.headers).toEqual(["Student Name", "Family Notes"]);
    expect(result.rows[0]?.cells[1]).toBe("Needs pacing, algebra");
  });

  it("preserves physical row numbers when blank CSV rows are skipped", async () => {
    const result = await readStudentSpreadsheet({
      filename: "students.csv",
      bytes: Buffer.from(
        'Student Name,Family Notes\nMaya Demo,"Needs\npacing"\n\nRohan Demo,Ready',
      ),
    });

    expect(result.rows.map((row) => row.rowNumber)).toEqual([2, 5]);
    expect(result.rows[0]?.cells[1]).toBe("Needs\npacing");
  });

  it("lists and reads a real XLSX worksheet", async () => {
    const bytes = await readFile("src/test/fixtures/student-import-demo.xlsx");
    const result = await readStudentSpreadsheet({
      filename: "student-import-demo.xlsx",
      bytes,
    });

    expect(result.sheetNames).toContain("Students");
    expect(result.selectedSheet).toBe("Students");
    expect(result.headers).toEqual([
      "Student Name",
      "Parent Email",
      "School",
      "Needs Bus",
    ]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.cells[0]).toBe("Maya Demo Import");
    expect(result.rows[1]?.cells[0]).toBe("Rohan Demo Import");
  });

  it("retains every worksheet matrix including its header row", async () => {
    const bytes = await readFile("src/test/fixtures/student-import-demo.xlsx");
    const result = await readStudentSpreadsheet({
      filename: "student-import-demo.xlsx",
      bytes,
    });

    expect(result.sheets.map((sheet) => sheet.name)).toEqual(result.sheetNames);
    expect(result.sheets[0]?.rows[0]?.cells[0]).toBe("Student Name");
    expect(result.sheets[0]?.rows.some((row) => row.cells.includes("Needs Bus"))).toBe(true);
  });

  it("decodes the sanitized merged-header workbook through the production XLSX reader", async () => {
    const bytes = await readFile("src/test/fixtures/adaptive-score-import.xlsx");
    const result = await readStudentSpreadsheet({
      filename: "adaptive-score-import.xlsx",
      bytes,
    });
    const detected = detectStudentWorkbook({
      sheets: result.sheets,
      selectedSheet: result.selectedSheet,
    });

    expect(result.sheetNames).toEqual(["Camp Scores"]);
    expect(result.sheets[0]?.rows[0]?.cells[0]).toBe("SAT Summer Camp 2026");
    expect(detected).toMatchObject({
      profile: "wide",
      directory: {
        sheetName: "Camp Scores",
        headerRowNumbers: [2, 3, 4],
        dataStartRow: 5,
      },
      academic: {
        sheetName: "Camp Scores",
        headerRowNumbers: [2, 3, 4],
        dataStartRow: 5,
      },
    });
    expect(detected.academic?.columns.map((column) => column.sourceHeader)).toEqual([
      "Name",
      "School",
      "Grade",
      "Class",
      "Level",
      "Room",
      "HW1 / PSAT / RW",
      "HW1 / PSAT / M",
      "HW1 / PSAT / Total",
      "HW1 / BB07 / RW",
      "HW1 / BB07 / M",
      "HW1 / BB07 / Total",
      "HW2 / BB08 / RW",
      "HW2 / BB08 / M",
      "HW2 / BB08 / Total",
      "HW3 / BB08 / RW",
      "HW3 / BB08 / M",
      "HW3 / BB08 / Total",
    ]);
  });

  it("rejects files larger than four megabytes", async () => {
    await expect(
      readStudentSpreadsheet({
        filename: "students.csv",
        bytes: Buffer.alloc(4 * 1024 * 1024 + 1),
      }),
    ).rejects.toThrow("Spreadsheet files must be 4 MB or smaller.");
  });

  it("rejects unsupported file extensions", async () => {
    await expect(
      readStudentSpreadsheet({
        filename: "students.xls",
        bytes: Buffer.from("Student Name\nMaya Demo"),
      }),
    ).rejects.toThrow("Upload an .xlsx or .csv student spreadsheet.");
  });

  it("rejects an unknown worksheet selection", async () => {
    const bytes = await readFile("src/test/fixtures/student-import-demo.xlsx");

    await expect(
      readStudentSpreadsheet({
        filename: "student-import-demo.xlsx",
        bytes,
        sheetName: "Missing Students",
      }),
    ).rejects.toThrow("Choose a worksheet from the uploaded workbook.");
  });

  it("rejects imports above the student row limit", async () => {
    const rows = Array.from(
      { length: STUDENT_IMPORT_MAX_ROWS + 1 },
      (_, index) => `Student ${index + 1}`,
    );

    await expect(
      readStudentSpreadsheet({
        filename: "students.csv",
        bytes: Buffer.from(["Student Name", ...rows].join("\n")),
      }),
    ).rejects.toThrow("Student imports are limited to 2,000 rows at a time.");
  });

  it("accepts a wide workbook with title headers and exactly 2,000 data rows", async () => {
    const marker = "wide-exact-row-limit";
    xlsxFixtures.set(marker, [{
      sheet: "Camp Scores",
      data: [
        ["SAT Summer Camp 2026"],
        ["Name", "Class", "Level", "Room", "HW1"],
        [null, null, null, null, "PSAT"],
        [null, null, null, null, "RW"],
        ...Array.from({ length: STUDENT_IMPORT_MAX_ROWS }, (_, index) => [
          `Student ${index + 1}`,
          "MWF",
          "G4",
          "201",
          720,
        ]),
      ],
    }]);

    const result = await readStudentSpreadsheet({
      filename: "wide.xlsx",
      bytes: Buffer.from(marker),
    });

    expect(result.sheets[0]?.rows.filter((row) => row.rowNumber >= 5)).toHaveLength(
      STUDENT_IMPORT_MAX_ROWS,
    );
  });

  it("rejects normalized score data above the row limit when another sheet is selected", async () => {
    const marker = "normalized-score-overflow";
    xlsxFixtures.set(marker, [
      {
        sheet: "Student Information",
        data: [
          ["Student Name", "Parent Email"],
          ["Maya Demo", "parent@example.com"],
        ],
      },
      {
        sheet: "Scores",
        data: [
          ["Student Name", "Class", "Assessment", "RW"],
          ...Array.from({ length: STUDENT_IMPORT_MAX_ROWS + 1 }, (_, index) => [
            `Student ${index + 1}`,
            "MWF",
            "HW1 – PSAT",
            720,
          ]),
        ],
      },
    ]);

    await expect(
      readStudentSpreadsheet({
        filename: "normalized.xlsx",
        bytes: Buffer.from(marker),
        sheetName: "Student Information",
      }),
    ).rejects.toThrow("Student imports are limited to 2,000 rows at a time.");
  });
});
