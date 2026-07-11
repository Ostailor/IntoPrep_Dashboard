import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  STUDENT_IMPORT_MAX_ROWS,
  readStudentSpreadsheet,
} from "@/lib/student-spreadsheet";

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
});
