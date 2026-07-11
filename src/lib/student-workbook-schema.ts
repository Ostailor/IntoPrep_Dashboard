import {
  findStudentImportField,
  suggestStudentImportMapping,
  type StudentCustomFieldType,
  type StudentImportCell,
  type StudentImportFieldKey,
  type StudentImportMapping,
} from "@/lib/student-import-schema";
import type { NumberedSpreadsheetRow } from "@/lib/student-spreadsheet";
import type {
  DetectedStudentWorkbook,
  WorkbookColumn,
} from "@/lib/student-workbook-profile";

export type ScoreComponent = "rw" | "math" | "total";

export type AcademicColumnMapping =
  | { sourceHeader: string; columnIndex: number; kind: "student-name" }
  | { sourceHeader: string; columnIndex: number; kind: "cohort" }
  | { sourceHeader: string; columnIndex: number; kind: "session-title" }
  | { sourceHeader: string; columnIndex: number; kind: "room" }
  | { sourceHeader: string; columnIndex: number; kind: "assessment-title" }
  | { sourceHeader: string; columnIndex: number; kind: "assessment-date" }
  | { sourceHeader: string; columnIndex: number; kind: "score"; assessmentTitle: string; component: ScoreComponent }
  | { sourceHeader: string; columnIndex: number; kind: "ignore" };

export interface StudentWorkbookMappingPlan {
  profile: "simple" | "wide" | "normalized";
  directory: { sheetName: string; columns: StudentImportMapping[] };
  academic: { sheetName: string; columns: AcademicColumnMapping[] } | null;
}

export interface StudentWorkbookSetup {
  cohorts: Array<{
    sourceClass: string;
    selectedCohortId?: string;
    programId?: string;
    campusId?: string;
    termId?: string;
    capacity?: number;
  }>;
  assessmentDates: Array<{ sourceClass: string; assessmentTitle: string; date: string }>;
}

export interface NormalizedAcademicRow {
  rowNumber: number;
  studentName: string;
  cohortName: string;
  sessionTitle: string;
  roomLabel: string;
  scores: Array<{
    assessmentTitle: string;
    assessmentDate: string;
    rw: number;
    math: number;
    total: number;
    warnings: string[];
  }>;
  errors: string[];
}

export interface NormalizedAcademicScorePreview {
  rowNumber: number;
  assessmentTitle: string;
  sourceAssessmentDate: string;
  rw: number | null;
  math: number | null;
  total: number | null;
  warnings: string[];
  errors: string[];
}

export const SAT_SCORE_PROFILE = {
  sectionMin: 200,
  sectionMax: 800,
  totalMin: 400,
  totalMax: 1600,
} as const;

export const SCORE_COMPONENT_ALIASES: Record<ScoreComponent, readonly string[]> = {
  rw: ["rw", "r&w", "reading writing", "reading/writing"],
  math: ["m", "math", "mathematics"],
  total: ["total", "composite"],
};

const MAX_COLUMNS = 400;
const MAX_TEXT_LENGTH = 200;
const MAX_COHORTS = 100;
const MAX_ASSESSMENT_DATES = 500;
const MAPPING_ERROR = "Student workbook mappings are invalid.";
const SETUP_ERROR = "Student workbook setup is invalid.";
const SCORE_COMPONENTS = new Set<ScoreComponent>(["rw", "math", "total"]);
const STUDENT_FIELDS = new Set<StudentImportFieldKey>([
  "externalId", "fullName", "firstName", "lastName", "gradeLevel", "school",
  "targetTest", "focus", "studentEmail", "studentPhone", "parent1Name",
  "parent1Email", "parent1Phone", "parent2Name", "parent2Email", "parent2Phone",
  "familyNotes", "cohortId", "cohortName", "registeredAt",
]);
const CUSTOM_FIELD_TYPES = new Set<StudentCustomFieldType>(["text", "number", "date", "boolean"]);

function normalizedAlias(value: string): string {
  return value.trim().toLowerCase().replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ");
}

function normalizedContextHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function scoreComponentFor(value: string): ScoreComponent | null {
  const normalized = normalizedAlias(value);
  return (Object.entries(SCORE_COMPONENT_ALIASES) as Array<[
    ScoreComponent,
    readonly string[],
  ]>).find(([, aliases]) => aliases.some(
    (alias) => normalizedAlias(alias) === normalized,
  ))?.[0] ?? null;
}

function academicContextKind(
  column: WorkbookColumn,
  detected: DetectedStudentWorkbook,
): Exclude<AcademicColumnMapping["kind"], "score" | "ignore"> | null {
  const leaf = normalizedContextHeader(column.path.at(-1) ?? column.sourceHeader);
  if (["name", "studentname", "fullname", "studentfullname"].includes(leaf)) {
    return "student-name";
  }
  if (leaf === "cohort" || leaf === "cohortname") return "cohort";
  if (leaf === "class") {
    const hasExplicitCohort = detected.profile === "normalized" && detected.academic?.columns.some(
      (candidate) => ["cohort", "cohortname"].includes(
        normalizedContextHeader(candidate.path.at(-1) ?? candidate.sourceHeader),
      ),
    );
    return hasExplicitCohort ? "session-title" : "cohort";
  }
  if (["level", "session", "sessiontitle", "classname"].includes(leaf)) {
    return "session-title";
  }
  if (["room", "roomlabel", "classroom"].includes(leaf)) return "room";
  if (["assessment", "assessmentname", "assessmenttitle", "testname"].includes(leaf)) {
    return "assessment-title";
  }
  if (["assessmentdate", "testdate"].includes(leaf)) return "assessment-date";
  return null;
}

function assessmentTitleFor(
  column: WorkbookColumn,
  detected: DetectedStudentWorkbook,
): string {
  if (detected.profile === "normalized") return "";
  const labels = column.path.slice(0, -1).map((value) => value.trim()).filter(Boolean);
  return labels.slice(-2).join(" – ");
}

function inferAcademicMappings(detected: DetectedStudentWorkbook): AcademicColumnMapping[] | null {
  if (!detected.academic) return null;

  return detected.academic.columns.map((column): AcademicColumnMapping => {
    const base = { sourceHeader: column.sourceHeader, columnIndex: column.index };
    const contextKind = academicContextKind(column, detected);
    if (contextKind) return { ...base, kind: contextKind };

    const leaf = column.path.at(-1) ?? column.sourceHeader;
    const component = scoreComponentFor(leaf);
    if (component) {
      return {
        ...base,
        kind: "score",
        assessmentTitle: assessmentTitleFor(column, detected),
        component,
      };
    }
    return { ...base, kind: "ignore" };
  });
}

export function inferStudentWorkbookMappings(
  detected: DetectedStudentWorkbook,
): StudentWorkbookMappingPlan {
  const academicColumns = inferAcademicMappings(detected);
  const directoryColumns = detected.directory.columns.map((column, index): StudentImportMapping => {
    if (detected.profile !== "wide" || !academicColumns) {
      return suggestStudentImportMapping(column.sourceHeader);
    }

    const academic = academicColumns[index];
    if (academic?.kind === "student-name") {
      return { sourceHeader: column.sourceHeader, kind: "known", field: "fullName" };
    }
    if (academic?.kind === "cohort") {
      const field = findStudentImportField(column.sourceHeader);
      return field
        ? { sourceHeader: column.sourceHeader, kind: "known", field }
        : { sourceHeader: column.sourceHeader, kind: "ignore" };
    }
    if (academic && academic.kind !== "ignore") {
      return { sourceHeader: column.sourceHeader, kind: "ignore" };
    }
    if (column.path.length > 1) {
      return { sourceHeader: column.sourceHeader, kind: "ignore" };
    }
    return suggestStudentImportMapping(column.sourceHeader);
  });

  return {
    profile: detected.profile,
    directory: {
      sheetName: detected.directory.sheetName,
      columns: directoryColumns,
    },
    academic: detected.academic && academicColumns
      ? { sheetName: detected.academic.sheetName, columns: academicColumns }
      : null,
  };
}

export function normalizeScoreGroup(input: {
  rw: unknown;
  math: unknown;
  total: unknown;
}): { rw: number; math: number; total: number; warnings: string[] } {
  const rw = requiredScore(input.rw, "RW", SAT_SCORE_PROFILE.sectionMin, SAT_SCORE_PROFILE.sectionMax);
  const math = requiredScore(input.math, "Math", SAT_SCORE_PROFILE.sectionMin, SAT_SCORE_PROFILE.sectionMax);
  const providedTotal = optionalScore(
    input.total,
    "Total",
    SAT_SCORE_PROFILE.totalMin,
    SAT_SCORE_PROFILE.totalMax,
  );

  if (providedTotal === null) {
    return {
      rw,
      math,
      total: rw + math,
      warnings: ["Total calculated from RW + Math."],
    };
  }
  if (providedTotal !== rw + math) {
    throw new Error("Total must equal RW + Math.");
  }
  return { rw, math, total: providedTotal, warnings: [] };
}

function optionalScore(value: unknown, label: string, min: number, max: number): number | null {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
    return null;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`${label} must be a number.`);
  if (!Number.isInteger(numeric)) throw new Error(`${label} must be a whole number.`);
  if (numeric < min || numeric > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }
  return numeric;
}

function requiredScore(value: unknown, label: string, min: number, max: number): number {
  const score = optionalScore(value, label, min, max);
  if (score === null) throw new Error(`${label} is required.`);
  return score;
}

function cellText(cell: StudentImportCell | undefined): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString();
  return String(cell).trim().replace(/\s+/g, " ");
}

export function normalizeAcademicRows(input: {
  rows: readonly NumberedSpreadsheetRow[];
  mappings: readonly AcademicColumnMapping[];
}): NormalizedAcademicRow[] {
  return input.rows.map((sourceRow) => normalizeAcademicSourceRow(sourceRow, input.mappings).row);
}

export function normalizeAcademicScorePreviews(input: {
  rows: readonly NumberedSpreadsheetRow[];
  mappings: readonly AcademicColumnMapping[];
}): NormalizedAcademicScorePreview[] {
  return input.rows.flatMap(
    (sourceRow) => normalizeAcademicSourceRow(sourceRow, input.mappings).scorePreviews,
  );
}

function normalizeAcademicSourceRow(
  sourceRow: NumberedSpreadsheetRow,
  mappings: readonly AcademicColumnMapping[],
): { row: NormalizedAcademicRow; scorePreviews: NormalizedAcademicScorePreview[] } {
    const row: NormalizedAcademicRow = {
      rowNumber: sourceRow.rowNumber,
      studentName: "",
      cohortName: "",
      sessionTitle: "",
      roomLabel: "",
      scores: [],
      errors: [],
    };
    const scorePreviews: NormalizedAcademicScorePreview[] = [];
    const scoreGroups = new Map<string, Partial<Record<ScoreComponent, unknown>>>();
    let rowAssessmentTitle = "";
    let rowAssessmentDate = "";
    let hasAssessmentTitleMapping = false;
    let hasAssessmentDateMapping = false;
    let invalidAssessmentTitle = false;
    let invalidAssessmentDate = false;

    let assessmentTitleError = "";
    let assessmentDateError = "";

    for (const mapping of mappings) {
      const cell = sourceRow.cells[mapping.columnIndex];
      if (mapping.kind === "ignore") continue;
      if (mapping.kind === "score") {
        const group = scoreGroups.get(mapping.assessmentTitle) ?? {};
        group[mapping.component] = cell;
        scoreGroups.set(mapping.assessmentTitle, group);
        continue;
      }

      if (mapping.kind === "assessment-date") {
        hasAssessmentDateMapping = true;
        const date = normalizeSourceDate(cell);
        if (date === null) {
          invalidAssessmentDate = true;
          assessmentDateError = `${mapping.sourceHeader} must be a valid date.`;
          row.errors.push(assessmentDateError);
        } else {
          rowAssessmentDate = date;
        }
        continue;
      }

      const value = cellText(cell);
      if (value.length > MAX_TEXT_LENGTH) {
        const error = `${mapping.sourceHeader} must be ${MAX_TEXT_LENGTH} characters or fewer.`;
        if (mapping.kind === "assessment-title") {
          invalidAssessmentTitle = true;
          assessmentTitleError = error;
        }
        row.errors.push(error);
        continue;
      }
      if (mapping.kind === "student-name") row.studentName = value;
      if (mapping.kind === "cohort") row.cohortName = value;
      if (mapping.kind === "session-title") row.sessionTitle = value;
      if (mapping.kind === "room") row.roomLabel = value;
      if (mapping.kind === "assessment-title") {
        hasAssessmentTitleMapping = true;
        rowAssessmentTitle = value;
      }
    }

    for (const [assessmentTitle, group] of scoreGroups) {
      if ([group.rw, group.math, group.total].every(
        (value) => value === null || value === undefined || (typeof value === "string" && value.trim() === ""),
      )) {
        continue;
      }
      const usesRowAssessment = assessmentTitle === "";
      const resolvedTitle = usesRowAssessment ? rowAssessmentTitle : assessmentTitle;
      const preview = previewScoreGroup({
        rowNumber: sourceRow.rowNumber,
        assessmentTitle: resolvedTitle,
        sourceAssessmentDate: usesRowAssessment ? rowAssessmentDate : "",
        group,
      });
      if (usesRowAssessment && !resolvedTitle) {
        const error = assessmentTitleError || "Test Name is required.";
        if (!invalidAssessmentTitle) row.errors.push(error);
        preview.errors.push(error);
        scorePreviews.push(preview);
        continue;
      }
      if (usesRowAssessment && !hasAssessmentTitleMapping) {
        const error = "Test Name is required.";
        row.errors.push(error);
        preview.errors.push(error);
        scorePreviews.push(preview);
        continue;
      }
      if (usesRowAssessment && !hasAssessmentDateMapping) {
        const error = "Test Date is required.";
        row.errors.push(error);
        preview.errors.push(error);
        scorePreviews.push(preview);
        continue;
      }
      if (usesRowAssessment && (invalidAssessmentTitle || invalidAssessmentDate)) {
        const error = assessmentTitleError || assessmentDateError;
        if (error && !preview.errors.includes(error)) preview.errors.push(error);
        scorePreviews.push(preview);
        continue;
      }
      try {
        const score = {
          assessmentTitle: resolvedTitle,
          assessmentDate: usesRowAssessment ? rowAssessmentDate : "",
          ...normalizeScoreGroup({
            rw: group.rw,
            math: group.math,
            total: group.total,
          }),
        };
        row.scores.push(score);
        scorePreviews.push({
          ...preview,
          rw: score.rw,
          math: score.math,
          total: score.total,
          warnings: [...score.warnings],
        });
      } catch (error) {
        const message = `${resolvedTitle}: ${error instanceof Error ? error.message : "Invalid scores."}`;
        row.errors.push(message);
        preview.errors.push(message);
        scorePreviews.push(preview);
      }
    }
    return { row, scorePreviews };
}

function previewScoreGroup(input: {
  rowNumber: number;
  assessmentTitle: string;
  sourceAssessmentDate: string;
  group: Partial<Record<ScoreComponent, unknown>>;
}): NormalizedAcademicScorePreview {
  const rw = previewScoreValue(input.group.rw, "RW", SAT_SCORE_PROFILE.sectionMin, SAT_SCORE_PROFILE.sectionMax);
  const math = previewScoreValue(input.group.math, "Math", SAT_SCORE_PROFILE.sectionMin, SAT_SCORE_PROFILE.sectionMax);
  const providedTotal = previewScoreValue(input.group.total, "Total", SAT_SCORE_PROFILE.totalMin, SAT_SCORE_PROFILE.totalMax);
  const totalMissing = input.group.total === null || input.group.total === undefined ||
    (typeof input.group.total === "string" && input.group.total.trim() === "");
  return {
    rowNumber: input.rowNumber,
    assessmentTitle: input.assessmentTitle,
    sourceAssessmentDate: input.sourceAssessmentDate,
    rw,
    math,
    total: totalMissing && rw !== null && math !== null ? rw + math : providedTotal,
    warnings: [],
    errors: [],
  };
}

function previewScoreValue(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number | null {
  try {
    return optionalScore(value, label, min, max);
  } catch {
    return null;
  }
}

export function parseStudentWorkbookMappings(
  value: unknown,
  detected: DetectedStudentWorkbook,
): StudentWorkbookMappingPlan {
  try {
    if (!isPlainRecord(value) || !hasOnlyKeys(value, ["profile", "directory", "academic"])) failMapping();
    if (value.profile !== detected.profile) failMapping();
    if (!isPlainRecord(value.directory) || !hasOnlyKeys(value.directory, ["sheetName", "columns"])) failMapping();
    if (value.directory.sheetName !== detected.directory.sheetName) failMapping();
    if (!Array.isArray(value.directory.columns) || value.directory.columns.length > MAX_COLUMNS) failMapping();
    if (value.directory.columns.length !== detected.directory.columns.length) failMapping();

    const directory = value.directory.columns.map((entry, index) => {
      const parsed = parseDirectoryMapping(entry);
      if (parsed.sourceHeader !== detected.directory.columns[index]?.sourceHeader) failMapping();
      return parsed;
    });

    let academic: StudentWorkbookMappingPlan["academic"] = null;
    if (detected.academic === null) {
      if (value.academic !== null) failMapping();
    } else {
      if (!isPlainRecord(value.academic) || !hasOnlyKeys(value.academic, ["sheetName", "columns"])) failMapping();
      if (value.academic.sheetName !== detected.academic.sheetName) failMapping();
      if (!Array.isArray(value.academic.columns) || value.academic.columns.length > MAX_COLUMNS) failMapping();
      if (value.academic.columns.length !== detected.academic.columns.length) failMapping();
      const seenIndexes = new Set<number>();
      const seenScores = new Set<string>();
      const seenSingletonKinds = new Set<"assessment-title" | "assessment-date">();
      const columns = value.academic.columns.map((entry) => {
        const parsed = parseAcademicMapping(entry);
        if (seenIndexes.has(parsed.columnIndex)) failMapping();
        seenIndexes.add(parsed.columnIndex);
        const detectedColumn = detected.academic!.columns.find(
          (column) => column.index === parsed.columnIndex,
        );
        if (!detectedColumn || detectedColumn.sourceHeader !== parsed.sourceHeader) failMapping();
        if (parsed.kind === "score") {
          const key = `${parsed.assessmentTitle}\0${parsed.component}`;
          if (seenScores.has(key)) failMapping();
          seenScores.add(key);
        }
        if (parsed.kind === "assessment-title" || parsed.kind === "assessment-date") {
          if (seenSingletonKinds.has(parsed.kind)) failMapping();
          seenSingletonKinds.add(parsed.kind);
        }
        return parsed;
      });
      const scoreColumns = columns.filter(
        (mapping): mapping is Extract<AcademicColumnMapping, { kind: "score" }> => mapping.kind === "score",
      );
      if (detected.profile === "normalized" && scoreColumns.length > 0) {
        if (!seenSingletonKinds.has("assessment-title") || !seenSingletonKinds.has("assessment-date")) failMapping();
        if (scoreColumns.some((mapping) => mapping.assessmentTitle !== "")) failMapping();
      }
      if (detected.profile === "wide" && scoreColumns.some((mapping) => !mapping.assessmentTitle)) failMapping();
      academic = { sheetName: detected.academic.sheetName, columns };
    }

    return {
      profile: detected.profile,
      directory: { sheetName: detected.directory.sheetName, columns: directory },
      academic,
    };
  } catch {
    throw new Error(MAPPING_ERROR);
  }
}

function parseDirectoryMapping(value: unknown): StudentImportMapping {
  if (!isPlainRecord(value) || !boundedText(value.sourceHeader)) failMapping();
  if (value.kind === "ignore" && hasOnlyKeys(value, ["sourceHeader", "kind"])) {
    return { sourceHeader: value.sourceHeader, kind: "ignore" };
  }
  if (
    value.kind === "known" &&
    hasOnlyKeys(value, ["sourceHeader", "kind", "field"]) &&
    typeof value.field === "string" &&
    STUDENT_FIELDS.has(value.field as StudentImportFieldKey)
  ) {
    return { sourceHeader: value.sourceHeader, kind: "known", field: value.field as StudentImportFieldKey };
  }
  if (
    value.kind === "custom-existing" &&
    hasOnlyKeys(value, ["sourceHeader", "kind", "key"]) &&
    validCustomKey(value.key)
  ) {
    return { sourceHeader: value.sourceHeader, kind: "custom-existing", key: value.key };
  }
  if (
    value.kind === "custom-new" &&
    hasOnlyKeys(value, ["sourceHeader", "kind", "key", "label", "dataType", "sensitive"]) &&
    validCustomKey(value.key) && boundedText(value.label) &&
    typeof value.dataType === "string" && CUSTOM_FIELD_TYPES.has(value.dataType as StudentCustomFieldType) &&
    value.sensitive === true
  ) {
    return {
      sourceHeader: value.sourceHeader,
      kind: "custom-new",
      key: value.key,
      label: value.label.trim(),
      dataType: value.dataType as StudentCustomFieldType,
      sensitive: true,
    };
  }
  failMapping();
}

function parseAcademicMapping(value: unknown): AcademicColumnMapping {
  if (
    !isPlainRecord(value) || !boundedText(value.sourceHeader) ||
    !Number.isInteger(value.columnIndex) || (value.columnIndex as number) < 0
  ) failMapping();
  const base = { sourceHeader: value.sourceHeader, columnIndex: value.columnIndex as number };
  if (
    [
      "student-name", "cohort", "session-title", "room",
      "assessment-title", "assessment-date", "ignore",
    ].includes(String(value.kind)) &&
    hasOnlyKeys(value, ["sourceHeader", "columnIndex", "kind"])
  ) {
    return { ...base, kind: value.kind } as AcademicColumnMapping;
  }
  if (
    value.kind === "score" &&
    hasOnlyKeys(value, ["sourceHeader", "columnIndex", "kind", "assessmentTitle", "component"]) &&
    typeof value.assessmentTitle === "string" && value.assessmentTitle.length <= MAX_TEXT_LENGTH &&
    typeof value.component === "string" && SCORE_COMPONENTS.has(value.component as ScoreComponent)
  ) {
    return {
      ...base,
      kind: "score",
      assessmentTitle: value.assessmentTitle.trim(),
      component: value.component as ScoreComponent,
    };
  }
  failMapping();
}

function normalizeSourceDate(cell: StudentImportCell | undefined): string | null {
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return null;
    return cell.toISOString().slice(0, 10);
  }
  if (typeof cell !== "string") return null;
  const value = cell.trim();
  return validIsoDate(value) ? value : null;
}

export function parseStudentWorkbookSetup(value: unknown): StudentWorkbookSetup {
  try {
    if (!isPlainRecord(value) || !hasOnlyKeys(value, ["cohorts", "assessmentDates"])) failSetup();
    if (!Array.isArray(value.cohorts) || value.cohorts.length > MAX_COHORTS) failSetup();
    if (!Array.isArray(value.assessmentDates) || value.assessmentDates.length > MAX_ASSESSMENT_DATES) failSetup();

    const cohorts = value.cohorts.map((entry) => {
      const keys = ["sourceClass", "selectedCohortId", "programId", "campusId", "termId", "capacity"];
      if (!isPlainRecord(entry) || !hasOnlyKeys(entry, keys) || !boundedText(entry.sourceClass)) failSetup();
      const parsed: StudentWorkbookSetup["cohorts"][number] = { sourceClass: entry.sourceClass.trim() };
      for (const key of ["selectedCohortId", "programId", "campusId", "termId"] as const) {
        if (entry[key] !== undefined) {
          if (!boundedText(entry[key])) failSetup();
          parsed[key] = entry[key].trim();
        }
      }
      if (entry.capacity !== undefined) {
        if (!Number.isInteger(entry.capacity) || (entry.capacity as number) <= 0) failSetup();
        parsed.capacity = entry.capacity as number;
      }
      return parsed;
    });

    const assessmentDates = value.assessmentDates.map((entry) => {
      if (
        !isPlainRecord(entry) ||
        !hasOnlyKeys(entry, ["sourceClass", "assessmentTitle", "date"]) ||
        !boundedText(entry.sourceClass) || !boundedText(entry.assessmentTitle) ||
        typeof entry.date !== "string" || !validIsoDate(entry.date)
      ) failSetup();
      return {
        sourceClass: entry.sourceClass.trim(),
        assessmentTitle: entry.assessmentTitle.trim(),
        date: entry.date,
      };
    });
    return { cohorts, assessmentDates };
  } catch {
    throw new Error(SETUP_ERROR);
  }
}

function validIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function boundedText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= MAX_TEXT_LENGTH;
}

function validCustomKey(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function failMapping(): never {
  throw new Error(MAPPING_ERROR);
}

function failSetup(): never {
  throw new Error(SETUP_ERROR);
}
