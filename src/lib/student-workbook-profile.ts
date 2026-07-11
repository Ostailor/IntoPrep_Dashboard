import type { StudentWorkbookSheet } from "@/lib/student-spreadsheet";

export type StudentWorkbookProfile = "simple" | "wide" | "normalized";

export interface WorkbookColumn {
  index: number;
  path: string[];
  sourceHeader: string;
}

export interface DetectedWorkbookTable {
  sheetName: string;
  headerRowNumbers: number[];
  dataStartRow: number;
  columns: WorkbookColumn[];
}

export interface DetectedStudentWorkbook {
  profile: StudentWorkbookProfile;
  directory: DetectedWorkbookTable;
  academic: DetectedWorkbookTable | null;
  sheetNames: string[];
}

const MAX_HEADER_SCAN_ROWS = 25;
const MAX_WIDE_HEADER_ROWS = 4;
const WIDE_CONTEXT_HEADERS = ["name", "class", "level", "room"] as const;
const SCORE_LEAF_HEADERS = new Set([
  "rw",
  "readingwriting",
  "m",
  "math",
  "mathematics",
  "total",
  "composite",
]);
const NAME_HEADERS = new Set(["name", "studentname", "firstname", "lastname"]);

function cellText(cell: StudentWorkbookSheet["rows"][number]["cells"][number]) {
  return String(cell ?? "").trim();
}

function normalizedHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function nonEmptyCellCount(row: StudentWorkbookSheet["rows"][number]) {
  return row.cells.reduce<number>((count, cell) => count + (cellText(cell) ? 1 : 0), 0);
}

function collapsePath(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = normalizedHeader(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function reconstructColumns(
  rows: StudentWorkbookSheet["rows"],
): WorkbookColumn[] {
  const width = Math.max(...rows.map((row) => row.cells.length), 0);
  const expandedRows = rows.map((row, rowIndex) => {
    let carried = "";
    const isGroupRow = rowIndex < rows.length - 1;
    return Array.from({ length: width }, (_, index) => {
      const value = cellText(row.cells[index] ?? null);
      if (value) carried = value;
      return value || (isGroupRow ? carried : "");
    });
  });

  return Array.from({ length: width }, (_, index) => {
    const path = collapsePath(expandedRows.map((row) => row[index] ?? ""));
    return {
      index,
      path,
      sourceHeader: path.join(" / "),
    };
  }).filter((column) => column.path.length > 0);
}

function oneRowTable(
  sheet: StudentWorkbookSheet,
  rowIndex: number,
): DetectedWorkbookTable {
  const row = sheet.rows[rowIndex]!;
  return {
    sheetName: sheet.name,
    headerRowNumbers: [row.rowNumber],
    dataStartRow: sheet.rows[rowIndex + 1]!.rowNumber,
    columns: reconstructColumns([row]),
  };
}

function pathContains(column: WorkbookColumn, expected: string) {
  return column.path.some((part) => normalizedHeader(part) === expected);
}

function isNameColumn(column: WorkbookColumn) {
  return column.path.some((part) => NAME_HEADERS.has(normalizedHeader(part)));
}

function isScoreLeaf(column: WorkbookColumn) {
  const leaf = column.path[column.path.length - 1];
  return leaf ? SCORE_LEAF_HEADERS.has(normalizedHeader(leaf)) : false;
}

function findWideTable(sheet: StudentWorkbookSheet): DetectedWorkbookTable | null {
  let best: { table: DetectedWorkbookTable; score: number } | null = null;
  const lastStart = Math.min(sheet.rows.length - 2, MAX_HEADER_SCAN_ROWS - 1);

  for (let start = 0; start <= lastStart; start += 1) {
    const firstRowValues = sheet.rows[start]!.cells.map((cell) => normalizedHeader(cellText(cell)));
    const firstRowContextCount = WIDE_CONTEXT_HEADERS.filter(
      (header) => firstRowValues.includes(header),
    ).length;
    if (firstRowContextCount < 2) continue;

    for (let depth = 2; depth <= MAX_WIDE_HEADER_ROWS; depth += 1) {
      const end = start + depth;
      if (end >= sheet.rows.length) break;

      const headerRows = sheet.rows.slice(start, end);
      const columns = reconstructColumns(headerRows);
      if (!WIDE_CONTEXT_HEADERS.every((header) => columns.some((column) => pathContains(column, header)))) {
        continue;
      }

      const scoreColumns = columns.filter(isScoreLeaf);
      if (scoreColumns.length === 0) continue;

      const table: DetectedWorkbookTable = {
        sheetName: sheet.name,
        headerRowNumbers: headerRows.map((row) => row.rowNumber),
        dataStartRow: sheet.rows[end]!.rowNumber,
        columns,
      };
      const score = scoreColumns.reduce<number>(
        (total, column) => total + column.path.length,
        0,
      );
      if (!best || score > best.score) best = { table, score };
    }
  }

  return best?.table ?? null;
}

function findNormalizedTable(
  sheet: StudentWorkbookSheet,
  kind: "directory" | "academic",
): DetectedWorkbookTable | null {
  const lastHeader = Math.min(sheet.rows.length - 2, MAX_HEADER_SCAN_ROWS - 1);
  for (let index = 0; index <= lastHeader; index += 1) {
    const columns = reconstructColumns([sheet.rows[index]!]);
    const hasName = columns.some(isNameColumn);
    const hasAcademicHeader = columns.some((column) => {
      const leaf = normalizedHeader(column.path[column.path.length - 1] ?? "");
      return SCORE_LEAF_HEADERS.has(leaf) || ["assessment", "test", "class"].includes(leaf);
    });
    if (hasName && (kind === "directory" || hasAcademicHeader)) {
      return oneRowTable(sheet, index);
    }
  }
  return null;
}

function findSimpleTable(sheet: StudentWorkbookSheet): DetectedWorkbookTable | null {
  const lastHeader = Math.min(sheet.rows.length - 2, MAX_HEADER_SCAN_ROWS - 1);
  for (let index = 0; index <= lastHeader; index += 1) {
    const row = sheet.rows[index]!;
    const columns = reconstructColumns([row]);
    if (nonEmptyCellCount(row) >= 2 || columns.some(isNameColumn)) {
      return oneRowTable(sheet, index);
    }
  }
  return null;
}

function detectionError(sheetName: string): never {
  throw new Error(`Could not detect a student table in worksheet "${sheetName}".`);
}

export function detectStudentWorkbook(input: {
  sheets: StudentWorkbookSheet[];
  selectedSheet?: string;
}): DetectedStudentWorkbook {
  const sheetNames = input.sheets.map((sheet) => sheet.name);
  const byNormalizedName = new Map(
    input.sheets.map((sheet) => [sheet.name.trim().toLowerCase(), sheet]),
  );
  const normalizedDirectory = byNormalizedName.get("student information");
  const normalizedAcademic = byNormalizedName.get("scores");

  if (normalizedDirectory && normalizedAcademic) {
    return {
      profile: "normalized",
      directory: findNormalizedTable(normalizedDirectory, "directory")
        ?? detectionError(normalizedDirectory.name),
      academic: findNormalizedTable(normalizedAcademic, "academic")
        ?? detectionError(normalizedAcademic.name),
      sheetNames,
    };
  }

  const selected = input.selectedSheet
    ? input.sheets.find((sheet) => sheet.name === input.selectedSheet)
    : input.sheets[0];
  if (!selected) {
    if (input.selectedSheet) throw new Error(`Worksheet "${input.selectedSheet}" was not found.`);
    throw new Error("The workbook does not contain a worksheet.");
  }

  const wide = findWideTable(selected);
  if (wide) {
    return {
      profile: "wide",
      directory: wide,
      academic: wide,
      sheetNames,
    };
  }

  const simple = findSimpleTable(selected) ?? detectionError(selected.name);
  return {
    profile: "simple",
    directory: simple,
    academic: null,
    sheetNames,
  };
}
