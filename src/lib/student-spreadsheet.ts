import "server-only";

import { createHash } from "node:crypto";
import readXlsxFile from "read-excel-file/node";
import { parseCsv } from "@/lib/intake-import-shared";
import type { StudentImportCell } from "@/lib/student-import-schema";

export const STUDENT_IMPORT_MAX_BYTES = 4 * 1024 * 1024;
export const STUDENT_IMPORT_MAX_ROWS = 2000;

export interface StudentSpreadsheetReadResult {
  sheetNames: string[];
  selectedSheet: string;
  headers: string[];
  rows: Array<{ rowNumber: number; cells: StudentImportCell[] }>;
  digest: string;
}

interface NumberedSpreadsheetRow {
  rowNumber: number;
  cells: StudentImportCell[];
}

function rowHasContent(row: readonly StudentImportCell[]) {
  return row.some((cell) => cell !== null && String(cell).trim() !== "");
}

function toStudentImportCells(cells: readonly unknown[]): StudentImportCell[] {
  return cells.map((cell) => {
    if (
      cell === null ||
      typeof cell === "string" ||
      typeof cell === "number" ||
      typeof cell === "boolean" ||
      cell instanceof Date
    ) {
      return cell;
    }

    return String(cell);
  });
}

function getCsvPhysicalRowNumbers(text: string) {
  const rowNumbers: number[] = [];
  let record = "";
  let inQuotes = false;
  let currentLine = 1;
  let recordStartLine = 1;

  const captureRecord = () => {
    if (parseCsv(record).length > 0) {
      rowNumbers.push(recordStartLine);
    }
    record = "";
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    const next = text[index + 1];

    if (char === '"') {
      record += char;
      if (inQuotes && next === '"') {
        record += next;
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "\n" || char === "\r") {
      const isCrLf = char === "\r" && next === "\n";
      if (inQuotes) {
        record += isCrLf ? "\r\n" : char;
      } else {
        captureRecord();
      }
      if (isCrLf) {
        index += 1;
      }
      currentLine += 1;
      if (!inQuotes) {
        recordStartLine = currentLine;
      }
      continue;
    }

    record += char;
  }

  captureRecord();
  return rowNumbers;
}

export async function readStudentSpreadsheet(input: {
  filename: string;
  bytes: Buffer;
  sheetName?: string;
}): Promise<StudentSpreadsheetReadResult> {
  if (input.bytes.byteLength > STUDENT_IMPORT_MAX_BYTES) {
    throw new Error("Spreadsheet files must be 4 MB or smaller.");
  }

  const lowerName = input.filename.toLowerCase();
  const isCsv = lowerName.endsWith(".csv");
  const isXlsx = lowerName.endsWith(".xlsx");
  if (!isCsv && !isXlsx) {
    throw new Error("Upload an .xlsx or .csv student spreadsheet.");
  }

  let sheetNames: string[];
  let selectedSheet: string;
  let numberedRows: NumberedSpreadsheetRow[];

  if (isCsv) {
    const text = input.bytes.toString("utf8");
    const matrix = parseCsv(text);
    const physicalRowNumbers = getCsvPhysicalRowNumbers(text);
    sheetNames = ["CSV"];
    selectedSheet = input.sheetName ?? "CSV";
    numberedRows = matrix.map((cells, index) => ({
      rowNumber: physicalRowNumbers[index] ?? index + 1,
      cells,
    }));
  } else {
    const sheets = await readXlsxFile(input.bytes);
    sheetNames = sheets.map((sheet) => sheet.sheet);
    selectedSheet = input.sheetName ?? sheetNames[0] ?? "";
    const matrix = sheets.find((sheet) => sheet.sheet === selectedSheet)?.data ?? [];
    numberedRows = matrix.map((cells, index) => ({
      rowNumber: index + 1,
      cells: toStudentImportCells(cells),
    }));
  }

  if (!selectedSheet || !sheetNames.includes(selectedSheet)) {
    throw new Error("Choose a worksheet from the uploaded workbook.");
  }

  const nonEmptyRows = numberedRows.filter((row) => rowHasContent(row.cells));
  if (nonEmptyRows.length < 2) {
    throw new Error("The spreadsheet must contain headers and at least one student row.");
  }

  const headers = nonEmptyRows[0]!.cells.map((cell) => String(cell ?? "").trim());
  const rows = nonEmptyRows.slice(1);
  if (rows.length > STUDENT_IMPORT_MAX_ROWS) {
    throw new Error("Student imports are limited to 2,000 rows at a time.");
  }

  return {
    sheetNames,
    selectedSheet,
    headers,
    rows,
    digest: createHash("sha256").update(input.bytes).digest("hex"),
  };
}
