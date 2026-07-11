import "server-only";

import { randomUUID } from "node:crypto";
import type { User } from "@/lib/domain";
import { isLocalQaMode } from "@/lib/local-qa";
import { resolveStudentImportTarget } from "@/lib/permissions";
import {
  buildStudentAcademicImportPlan,
  type ExistingAcademicCohort,
  type StudentAcademicImportPlan,
} from "@/lib/student-academic-import-planner";
import {
  buildStudentImportPlan,
  type ExistingImportEnrollment,
  type ExistingImportFamily,
  type ExistingImportStudent,
  type NewImportFieldDefinition,
  type StudentImportPlan,
} from "@/lib/student-import-planner";
import {
  inferStudentWorkbookMappings,
  normalizeAcademicRows,
  parseStudentWorkbookMappings,
  parseStudentWorkbookSetup,
  type NormalizedAcademicRow,
  type StudentWorkbookMappingPlan,
  type StudentWorkbookSetup,
} from "@/lib/student-workbook-schema";
import {
  normalizeStudentImportHeader,
  normalizeStudentImportRow,
  suggestStudentImportMapping,
  validateStudentImportMappings,
  type StudentCustomFieldType,
  type StudentImportCell,
  type StudentImportFieldKey,
  type StudentImportMapping,
} from "@/lib/student-import-schema";
import { readStudentSpreadsheet, STUDENT_IMPORT_MAX_ROWS } from "@/lib/student-spreadsheet";
import { detectStudentWorkbook, type StudentWorkbookProfile } from "@/lib/student-workbook-profile";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { revalidatePortalLiveCache } from "@/lib/cache-invalidation";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

const KNOWN_FIELDS = new Set<StudentImportFieldKey>([
  "externalId", "fullName", "firstName", "lastName", "gradeLevel", "school",
  "targetTest", "focus", "studentEmail", "studentPhone", "parent1Name",
  "parent1Email", "parent1Phone", "parent2Name", "parent2Email", "parent2Phone",
  "familyNotes", "cohortId", "cohortName", "registeredAt",
]);
const CUSTOM_FIELD_TYPES = new Set<StudentCustomFieldType>(["text", "number", "date", "boolean"]);

export class StudentImportInputError extends Error {}
export class StudentImportPermissionError extends Error {}

export interface StudentImportFieldDefinitionRow {
  id: string;
  key: string;
  label: string;
  data_type: StudentCustomFieldType;
  header_aliases: string[];
  required: boolean;
  sensitive: boolean;
  sort_order: number;
  demo: boolean;
}

export interface StudentImportPartitionData {
  families: ExistingImportFamily[];
  students: ExistingImportStudent[];
  enrollments: ExistingImportEnrollment[];
  cohorts: ExistingAcademicCohort[];
  fieldDefinitions: StudentImportFieldDefinitionRow[];
  programs: Array<{ id: string; name: string; track: string; is_archived: boolean }>;
  campuses: Array<{ id: string; name: string; modality: string }>;
  terms: Array<{ id: string; name: string; start_date: string; end_date: string }>;
  sessions: Array<{
    id: string;
    cohort_id: string;
    title: string;
    start_at: string;
    end_at: string;
    mode: string;
    room_label: string;
    demo: boolean;
  }>;
  assessments: Array<{
    id: string;
    cohort_id: string;
    title: string;
    date: string;
    sections: Json;
    demo: boolean;
  }>;
  results: Array<{
    id: string;
    assessment_id: string;
    student_id: string;
    total_score: number;
    section_scores: Json;
    delta_from_previous: number;
    demo: boolean;
  }>;
  defaultCampusId: string;
}

export interface StudentImportRunPayload {
  filename: string;
  fileDigest: string;
  worksheet: string;
  mapping: StudentImportMapping[];
  workbookProfile: StudentWorkbookProfile;
  workbookMapping: StudentWorkbookMappingPlan;
  workbookSetup: StudentWorkbookSetup;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  enrollmentCount: number;
  skippedCount: number;
  warningCount: number;
  cohortCount: number;
  sessionCount: number;
  assessmentCount: number;
  resultCount: number;
}

export interface StudentImportCommitPayload {
  actor: { id: string | null; role: string; demo: boolean };
  targetDemo: boolean;
  fieldDefinitions: Array<Record<string, unknown>>;
  families: Array<Record<string, unknown>>;
  students: Array<Record<string, unknown>>;
  enrollments: Array<Record<string, unknown>>;
  cohorts: Array<Record<string, unknown>>;
  sessions: Array<Record<string, unknown>>;
  assessments: Array<Record<string, unknown>>;
  results: Array<Record<string, unknown>>;
  importRun: StudentImportRunPayload;
}

export interface StudentImportCommitResult {
  runId: string;
  created: number;
  updated: number;
  enrolled: number;
  skipped: number;
  cohorts: number;
  sessions: number;
  assessments: number;
  results: number;
}

export interface FailedStudentImportRun {
  filename: string;
  file_digest: string;
  worksheet: string;
  status: "failed";
  mapping: StudentImportMapping[];
  total_rows: number;
  created_count: number;
  updated_count: number;
  enrollment_count: number;
  skipped_count: number;
  warning_count: number;
  workbook_profile: StudentWorkbookProfile;
  workbook_mapping: StudentWorkbookMappingPlan;
  workbook_setup: StudentWorkbookSetup;
  cohort_count: number;
  session_count: number;
  assessment_count: number;
  result_count: number;
  error_samples: ["Student import failed."];
  demo: boolean;
  created_by: string | null;
}

export interface StudentImportRepository {
  loadPartition(targetDemo: boolean): Promise<StudentImportPartitionData>;
  commitImport(payload: StudentImportCommitPayload): Promise<StudentImportCommitResult>;
  insertFailedRun(run: FailedStudentImportRun): Promise<void>;
}

export interface StudentWorkbookExcludedRowReference {
  sheetName: string;
  rowNumber: number;
}

interface StudentImportBaseInput {
  viewer: Pick<User, "id" | "role" | "demo">;
  requestedTarget?: boolean;
  filename: string;
  bytes: Buffer;
  sheetName?: string;
  mappings?: StudentImportMapping[];
  mappingPlan?: StudentWorkbookMappingPlan;
  setup?: StudentWorkbookSetup;
  excludedRowNumbers?: number[];
  excludedRows?: StudentWorkbookExcludedRowReference[];
  repository?: StudentImportRepository;
  createUuid?: () => string;
  now?: () => Date;
}

export type PreviewStudentSpreadsheetImportInput = StudentImportBaseInput;

export interface CommitStudentSpreadsheetImportInput extends StudentImportBaseInput {
  expectedDigest: string;
  invalidateCache?: () => void;
  isLocalQa?: () => boolean;
}

export interface StudentImportPreviewRow {
  rowNumber: number;
  action: StudentImportPlan["rows"][number]["action"];
  firstName: string;
  lastName: string;
  studentEmail: string;
  studentId: string | null;
  familyId: string | null;
  cohortId: string | null;
  warnings: string[];
  errors: string[];
}

export interface StudentWorkbookSourceAssessmentDateSuggestion {
  sheetName: string;
  rowNumber: number;
  sourceClass: string;
  assessmentTitle: string;
  date: string;
}

export interface StudentWorkbookAcademicSourceRow {
  sheetName: string;
  rowNumber: number;
  studentName: string;
  cohortName: string;
  sessionTitle: string;
  roomLabel: string;
  scores: NormalizedAcademicRow["scores"];
  errors: string[];
}

export interface StudentWorkbookPreview {
  profile: StudentWorkbookProfile;
  targetDemo: boolean;
  digest: string;
  sheetNames: string[];
  selectedSheet: string;
  headers: string[];
  mappings: StudentImportMapping[];
  mappingPlan: StudentWorkbookMappingPlan;
  setup: StudentWorkbookSetup;
  rows: StudentImportPreviewRow[];
  summary: StudentImportPlan["summary"];
  definitions: StudentImportFieldDefinitionRow[];
  academic: StudentAcademicImportPlan;
  academicSourceRows: StudentWorkbookAcademicSourceRow[];
  sourceAssessmentDateSuggestions: StudentWorkbookSourceAssessmentDateSuggestion[];
  options: {
    programs: StudentImportPartitionData["programs"];
    campuses: StudentImportPartitionData["campuses"];
    terms: StudentImportPartitionData["terms"];
    cohorts: ExistingAcademicCohort[];
  };
  blocking: boolean;
}

export type StudentImportPreview = StudentWorkbookPreview;

interface PreparedStudentImport {
  preview: StudentImportPreview;
  plan: StudentImportPlan;
  partition: StudentImportPartitionData;
}

export function parseStudentImportMappings(value: unknown): StudentImportMapping[] | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (!Array.isArray(value) || value.length > 200) {
    throw new StudentImportInputError("Student import mappings are invalid.");
  }

  return value.map((entry) => {
    if (!isPlainRecord(entry) || typeof entry.sourceHeader !== "string" || entry.sourceHeader.length > 200) {
      throw new StudentImportInputError("Student import mappings are invalid.");
    }

    if (entry.kind === "ignore") {
      return { sourceHeader: entry.sourceHeader, kind: "ignore" };
    }
    if (entry.kind === "known" && typeof entry.field === "string" && KNOWN_FIELDS.has(entry.field as StudentImportFieldKey)) {
      return { sourceHeader: entry.sourceHeader, kind: "known", field: entry.field as StudentImportFieldKey };
    }
    if (entry.kind === "custom-existing" && isValidCustomKey(entry.key)) {
      return { sourceHeader: entry.sourceHeader, kind: "custom-existing", key: entry.key };
    }
    if (
      entry.kind === "custom-new" &&
      isValidCustomKey(entry.key) &&
      typeof entry.label === "string" &&
      entry.label.trim().length > 0 &&
      entry.label.length <= 120 &&
      typeof entry.dataType === "string" &&
      CUSTOM_FIELD_TYPES.has(entry.dataType as StudentCustomFieldType) &&
      entry.sensitive === true
    ) {
      return {
        sourceHeader: entry.sourceHeader,
        kind: "custom-new",
        key: entry.key,
        label: entry.label.trim(),
        dataType: entry.dataType as StudentCustomFieldType,
        sensitive: true,
      };
    }

    throw new StudentImportInputError("Student import mappings are invalid.");
  });
}

export function parseExcludedStudentImportRows(value: unknown): number[] {
  if (value === undefined || value === null || value === "") {
    return [];
  }
  if (!Array.isArray(value) || value.length > 2000) {
    throw new StudentImportInputError("Excluded student rows are invalid.");
  }
  const rows = value.map((rowNumber) => {
    if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > 1_000_000) {
      throw new StudentImportInputError("Excluded student rows are invalid.");
    }
    return rowNumber as number;
  });
  return [...new Set(rows)];
}

export function parseExcludedStudentWorkbookRows(
  value: unknown,
): StudentWorkbookExcludedRowReference[] {
  if (value === undefined || value === null || value === "") {
    return [];
  }
  if (!Array.isArray(value) || value.length > 4000) {
    throw new StudentImportInputError("Excluded workbook rows are invalid.");
  }

  const references = value.map((entry) => {
    if (
      !isPlainRecord(entry) ||
      Object.keys(entry).some((key) => key !== "sheetName" && key !== "rowNumber") ||
      typeof entry.sheetName !== "string" ||
      entry.sheetName.trim().length === 0 ||
      entry.sheetName.length > 200 ||
      !Number.isInteger(entry.rowNumber) ||
      (entry.rowNumber as number) < 2 ||
      (entry.rowNumber as number) > 1_000_000
    ) {
      throw new StudentImportInputError("Excluded workbook rows are invalid.");
    }
    return {
      sheetName: entry.sheetName,
      rowNumber: entry.rowNumber as number,
    };
  });
  return [...new Map(
    references.map((entry) => [`${entry.sheetName}\0${entry.rowNumber}`, entry]),
  ).values()];
}

export async function previewStudentSpreadsheetImport(
  input: PreviewStudentSpreadsheetImportInput,
): Promise<StudentImportPreview> {
  return (await prepareStudentImport(input)).preview;
}

export async function commitStudentSpreadsheetImport(
  input: CommitStudentSpreadsheetImportInput,
): Promise<StudentImportCommitResult> {
  const targetDemo = resolveTarget(input.viewer, input.requestedTarget);
  if (!DIGEST_PATTERN.test(input.expectedDigest)) {
    throw new StudentImportInputError("The uploaded file changed after preview. Preview it again.");
  }

  const prepared = await prepareStudentImport(input, targetDemo);
  if (prepared.preview.digest !== input.expectedDigest) {
    throw new StudentImportInputError("The uploaded file changed after preview. Preview it again.");
  }
  if (
    prepared.preview.profile !== "simple" &&
    (!input.mappingPlan || !input.setup)
  ) {
    throw new StudentImportInputError(
      "Preview the workbook mapping and setup again before importing.",
    );
  }
  if (prepared.preview.blocking) {
    throw new StudentImportInputError("Fix or exclude every row with an error before importing.");
  }

  const localQa = (input.isLocalQa ?? isLocalQaMode)();
  const actorId = localQa && targetDemo && input.viewer.role === "admin" &&
      input.viewer.demo === true && input.viewer.id === "local-qa-admin"
    ? null
    : input.viewer.id;
  if (actorId !== null && !UUID_PATTERN.test(actorId)) {
    throw new StudentImportPermissionError("The authenticated import actor is invalid.");
  }

  const repository = input.repository ?? createProductionStudentImportRepository();
  const enrollments = mergePlannedEnrollments(
    prepared.plan.enrollments,
    prepared.preview.academic.enrollments,
  );
  const results = recalculateResultDeltas({
    plannedResults: prepared.preview.academic.results,
    plannedAssessments: prepared.preview.academic.assessments,
    existingResults: prepared.partition.results,
    existingAssessments: prepared.partition.assessments,
  });
  const importRun = makeImportRun({
    filename: input.filename,
    digest: prepared.preview.digest,
    worksheet: prepared.preview.selectedSheet,
    mappings: prepared.preview.mappings,
    workbookProfile: prepared.preview.profile,
    workbookMapping: prepared.preview.mappingPlan,
    workbookSetup: prepared.preview.setup,
    plan: prepared.plan,
    enrollmentCount: enrollments.length,
    academic: {
      cohorts: prepared.preview.academic.cohorts.length,
      sessions: prepared.preview.academic.sessions.length,
      assessments: prepared.preview.academic.assessments.length,
      results: results.length,
    },
  });
  const payload: StudentImportCommitPayload = {
    actor: {
      id: actorId,
      role: input.viewer.role,
      demo: Boolean(input.viewer.demo),
    },
    targetDemo,
    fieldDefinitions: prepared.plan.newFieldDefinitions,
    families: prepared.plan.families,
    students: prepared.plan.students,
    enrollments,
    cohorts: prepared.preview.academic.cohorts,
    sessions: prepared.preview.academic.sessions,
    assessments: prepared.preview.academic.assessments,
    results,
    importRun,
  };

  let result: StudentImportCommitResult;
  try {
    result = await repository.commitImport(payload);
  } catch {
    const failedRun: FailedStudentImportRun = {
      filename: boundedText(input.filename, 255, "student-import"),
      file_digest: prepared.preview.digest,
      worksheet: boundedText(prepared.preview.selectedSheet, 200, "Sheet"),
      status: "failed",
      mapping: prepared.preview.mappings,
      total_rows: importRun.totalRows,
      created_count: importRun.createdCount,
      updated_count: importRun.updatedCount,
      enrollment_count: importRun.enrollmentCount,
      skipped_count: importRun.skippedCount,
      warning_count: importRun.warningCount,
      workbook_profile: importRun.workbookProfile,
      workbook_mapping: importRun.workbookMapping,
      workbook_setup: importRun.workbookSetup,
      cohort_count: importRun.cohortCount,
      session_count: importRun.sessionCount,
      assessment_count: importRun.assessmentCount,
      result_count: importRun.resultCount,
      error_samples: ["Student import failed."],
      demo: targetDemo,
      created_by: actorId,
    };
    try {
      await repository.insertFailedRun(failedRun);
    } catch {
      // The original transaction failure remains the only client-facing error.
    }
    throw new Error("Student import failed.");
  }

  try {
    (input.invalidateCache ?? revalidatePortalLiveCache)();
  } catch {
    // The database commit succeeded; a cache refresh failure must not be reported as a rollback.
  }
  return result;
}

async function prepareStudentImport(
  input: StudentImportBaseInput,
  resolvedTarget?: boolean,
): Promise<PreparedStudentImport> {
  const targetDemo = resolvedTarget ?? resolveTarget(input.viewer, input.requestedTarget);
  const excludedRowNumbers = parseExcludedStudentImportRows(input.excludedRowNumbers);
  const excludedRows = parseExcludedStudentWorkbookRows(input.excludedRows);
  let spreadsheet;
  try {
    spreadsheet = await readStudentSpreadsheet({
      filename: input.filename,
      bytes: input.bytes,
      sheetName: input.sheetName,
    });
  } catch (error) {
    throw new StudentImportInputError(error instanceof Error ? error.message : "The spreadsheet could not be read.");
  }

  let detected;
  try {
    detected = detectStudentWorkbook({
      sheets: spreadsheet.sheets,
      selectedSheet: spreadsheet.selectedSheet,
    });
  } catch (error) {
    throw new StudentImportInputError(error instanceof Error ? error.message : "The spreadsheet layout is invalid.");
  }

  const directoryRows = rowsForDetectedTable(spreadsheet.sheets, detected.directory);
  const academicRows = detected.academic
    ? rowsForDetectedTable(spreadsheet.sheets, detected.academic)
    : [];
  const excludedRowKeys = resolveExcludedWorkbookRows({
    profile: detected.profile,
    directory: { sheetName: detected.directory.sheetName, rows: directoryRows },
    academic: detected.academic
      ? { sheetName: detected.academic.sheetName, rows: academicRows }
      : null,
    excludedRowNumbers,
    excludedRows,
  });

  const suppliedMappings = input.mappings
    ? parseStudentImportMappings(input.mappings)!
    : null;
  let mappingPlan: StudentWorkbookMappingPlan;
  try {
    mappingPlan = input.mappingPlan
      ? parseStudentWorkbookMappings(input.mappingPlan, detected)
      : inferStudentWorkbookMappings(detected);
    if (suppliedMappings) {
      assertMappingHeaders(
        detected.directory.columns.map((column) => column.sourceHeader),
        suppliedMappings,
      );
      if (
        input.mappingPlan &&
        !sameStudentImportMappings(mappingPlan.directory.columns, suppliedMappings)
      ) {
        throw new StudentImportInputError(
          "Student workbook mappings changed. Preview the file again.",
        );
      }
      mappingPlan = {
        ...mappingPlan,
        directory: { ...mappingPlan.directory, columns: suppliedMappings },
      };
    }
  } catch (error) {
    throw new StudentImportInputError(error instanceof Error ? error.message : "Student workbook mappings are invalid.");
  }

  let setup: StudentWorkbookSetup;
  try {
    setup = parseStudentWorkbookSetup(input.setup ?? { cohorts: [], assessmentDates: [] });
  } catch (error) {
    throw new StudentImportInputError(error instanceof Error ? error.message : "Student workbook setup is invalid.");
  }

  const repository = input.repository ?? createProductionStudentImportRepository();
  const data = await repository.loadPartition(targetDemo);
  if (!input.mappingPlan && !suppliedMappings && detected.profile === "simple") {
    mappingPlan = {
      ...mappingPlan,
      directory: {
        ...mappingPlan.directory,
        columns: inferMappings(
          detected.directory.columns.map((column) => column.sourceHeader),
          directoryRows,
          data.fieldDefinitions,
        ),
      },
    };
  }
  const mappings = mappingPlan.directory.columns;
  try {
    validateStudentImportMappings(mappings);
  } catch (error) {
    throw new StudentImportInputError(error instanceof Error ? error.message : "Student import mappings are invalid.");
  }
  assertExistingCustomMappings(mappings, data.fieldDefinitions);

  const normalizedRows = directoryRows
    .filter((row) => !excludedRowKeys.has(rowReferenceKey(
      detected.directory.sheetName,
      row.rowNumber,
    )))
    .map((row) => normalizeMappedStudentRow(row, mappings, data.fieldDefinitions));
  const normalizedAcademicRows = mappingPlan.academic
    ? normalizeAcademicRows({
        rows: academicRows.filter((row) => !excludedRowKeys.has(rowReferenceKey(
          mappingPlan.academic!.sheetName,
          row.rowNumber,
        ))),
        mappings: mappingPlan.academic.columns,
      })
    : [];
  const createUuid = input.createUuid ?? randomUUID;
  const now = input.now ?? (() => new Date());
  const plan = buildStudentImportPlan({
    targetDemo,
    rows: detected.profile === "wide" ? [] : normalizedRows,
    existingStudents: data.students,
    existingFamilies: data.families,
    existingEnrollments: data.enrollments,
    cohorts: data.cohorts,
    existingFieldDefinitions: data.fieldDefinitions,
    newFieldDefinitions: toNewFieldDefinitions(mappings),
    defaultCampusId: data.defaultCampusId,
    defaultRegisteredAt: now().toISOString().slice(0, 10),
    createId: () => createUuid(),
  });
  const academic = buildStudentAcademicImportPlan({
    targetDemo,
    rows: normalizedAcademicRows,
    setup,
    students: data.students,
    cohorts: data.cohorts,
    enrollments: data.enrollments,
    sessions: data.sessions,
    assessments: data.assessments,
    results: data.results,
    programs: data.programs,
    campuses: data.campuses,
    terms: data.terms,
    createId: () => createUuid(),
  });
  const sourceAssessmentDateSuggestions = mappingPlan.academic
    ? collectSourceAssessmentDateSuggestions(
        mappingPlan.academic.sheetName,
        normalizedAcademicRows,
      )
    : [];
  const academicSourceRows = mappingPlan.academic
    ? buildAcademicSourceRows(mappingPlan.academic.sheetName, normalizedAcademicRows)
    : [];
  const normalizedByRow = new Map(normalizedRows.map((row) => [row.rowNumber, row]));
  const blocking = plan.rows.some((row) => row.errors.length > 0) ||
    academic.rows.some((row) => row.errors.length > 0) ||
    academic.requirements.cohorts.length > 0 ||
    academic.requirements.assessmentDates.length > 0;

  return {
    plan,
    partition: data,
    preview: {
      profile: detected.profile,
      targetDemo,
      digest: spreadsheet.digest,
      sheetNames: spreadsheet.sheetNames,
      selectedSheet: spreadsheet.selectedSheet,
      headers: detected.directory.columns.map((column) => column.sourceHeader),
      mappings,
      mappingPlan,
      setup,
      rows: plan.rows.map((row) => {
        const normalized = normalizedByRow.get(row.rowNumber)!;
        return {
          ...row,
          firstName: normalized.firstName,
          lastName: normalized.lastName,
          studentEmail: normalized.studentEmail,
        };
      }),
      summary: plan.summary,
      definitions: data.fieldDefinitions,
      academic,
      academicSourceRows,
      sourceAssessmentDateSuggestions,
      options: {
        programs: data.programs.filter((program) => !program.is_archived),
        campuses: data.campuses,
        terms: data.terms,
        cohorts: data.cohorts.filter(
          (cohort) => cohort.demo === targetDemo && !cohort.is_archived,
        ),
      },
      blocking,
    },
  };
}

function buildAcademicSourceRows(
  sheetName: string,
  rows: readonly NormalizedAcademicRow[],
): StudentWorkbookAcademicSourceRow[] {
  return rows.slice(0, STUDENT_IMPORT_MAX_ROWS).map((row) => ({
    sheetName,
    rowNumber: row.rowNumber,
    studentName: row.studentName,
    cohortName: row.cohortName,
    sessionTitle: row.sessionTitle,
    roomLabel: row.roomLabel,
    scores: row.scores.map((score) => ({
      ...score,
      warnings: [...score.warnings],
    })),
    errors: [...row.errors],
  }));
}

function collectSourceAssessmentDateSuggestions(
  sheetName: string,
  rows: ReturnType<typeof normalizeAcademicRows>,
): StudentWorkbookSourceAssessmentDateSuggestion[] {
  const suggestions = new Map<string, StudentWorkbookSourceAssessmentDateSuggestion>();
  for (const row of rows) {
    for (const score of row.scores) {
      if (!score.assessmentDate) continue;
      const suggestion = {
        sheetName,
        rowNumber: row.rowNumber,
        sourceClass: row.cohortName,
        assessmentTitle: score.assessmentTitle,
        date: score.assessmentDate,
      };
      const key = [
        suggestion.sheetName,
        suggestion.rowNumber,
        suggestion.sourceClass,
        suggestion.assessmentTitle,
        suggestion.date,
      ].join("\0");
      suggestions.set(key, suggestion);
      if (suggestions.size >= STUDENT_IMPORT_MAX_ROWS) {
        return [...suggestions.values()];
      }
    }
  }
  return [...suggestions.values()];
}

function rowsForDetectedTable(
  sheets: Awaited<ReturnType<typeof readStudentSpreadsheet>>["sheets"],
  table: ReturnType<typeof detectStudentWorkbook>["directory"],
) {
  return sheets.find((sheet) => sheet.name === table.sheetName)?.rows.filter(
    (row) => row.rowNumber >= table.dataStartRow,
  ) ?? [];
}

function resolveExcludedWorkbookRows(input: {
  profile: StudentWorkbookProfile;
  directory: { sheetName: string; rows: Array<{ rowNumber: number }> };
  academic: { sheetName: string; rows: Array<{ rowNumber: number }> } | null;
  excludedRowNumbers: number[];
  excludedRows: StudentWorkbookExcludedRowReference[];
}) {
  if (input.profile === "normalized" && input.excludedRowNumbers.length > 0) {
    throw new StudentImportInputError("Use sheet-aware exclusions for normalized workbooks.");
  }
  if (input.excludedRowNumbers.length > 0 && input.excludedRows.length > 0) {
    throw new StudentImportInputError("Choose one student row exclusion format.");
  }

  const references = input.excludedRows.length > 0
    ? input.excludedRows
    : input.excludedRowNumbers.map((rowNumber) => ({
        sheetName: input.directory.sheetName,
        rowNumber,
      }));
  const detectedRows = new Set<string>();
  for (const table of [input.directory, input.academic].filter(
    (table): table is NonNullable<typeof table> => table !== null,
  )) {
    for (const row of table.rows) {
      detectedRows.add(rowReferenceKey(table.sheetName, row.rowNumber));
    }
  }
  const stale = references.find(
    (entry) => !detectedRows.has(rowReferenceKey(entry.sheetName, entry.rowNumber)),
  );
  if (stale) {
    throw new StudentImportInputError(
      input.excludedRows.length > 0
        ? "Excluded workbook rows changed. Preview the file again."
        : "Excluded rows changed. Preview the file again.",
    );
  }
  return new Set(references.map((entry) => rowReferenceKey(entry.sheetName, entry.rowNumber)));
}

function rowReferenceKey(sheetName: string, rowNumber: number) {
  return `${sheetName}\0${rowNumber}`;
}

function normalizeMappedStudentRow(
  row: { rowNumber: number; cells: StudentImportCell[] },
  mappings: StudentImportMapping[],
  definitions: StudentImportFieldDefinitionRow[],
) {
  const normalized = normalizeStudentImportRow({
    rowNumber: row.rowNumber,
    cells: row.cells,
    mappings,
  });
  const definitionTypes = new Map(definitions.map((definition) => [definition.key.toLowerCase(), definition.data_type]));

  for (const mapping of mappings) {
    if (mapping.kind !== "custom-existing" && mapping.kind !== "custom-new") continue;
    const value = normalized.customFields[mapping.key];
    if (value === undefined) continue;
    const dataType = mapping.kind === "custom-new"
      ? mapping.dataType
      : definitionTypes.get(mapping.key.toLowerCase());
    if (!dataType) continue;
    normalized.customFields[mapping.key] = coerceCustomFieldValue(value, dataType, row.rowNumber, mapping.sourceHeader);
  }

  return normalized;
}

function coerceCustomFieldValue(
  value: string | number | boolean,
  dataType: StudentCustomFieldType,
  rowNumber: number,
  label: string,
): string | number | boolean {
  if (dataType === "text") return String(value);
  if (dataType === "number") {
    const number = typeof value === "number" ? value : Number(typeof value === "string" ? value.trim() : Number.NaN);
    if (Number.isFinite(number)) return number;
  }
  if (dataType === "boolean") {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (["true", "yes", "1"].includes(value.trim().toLowerCase())) return true;
      if (["false", "no", "0"].includes(value.trim().toLowerCase())) return false;
    }
  }
  if (dataType === "date" && typeof value === "string") {
    const date = value.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) === date) {
      return date;
    }
  }
  throw new StudentImportInputError(`Row ${rowNumber}: ${label} must be a ${dataType}.`);
}

function resolveTarget(viewer: Pick<User, "role" | "demo">, requestedTarget: boolean | undefined) {
  try {
    return resolveStudentImportTarget(viewer, requestedTarget);
  } catch (error) {
    throw new StudentImportPermissionError(error instanceof Error ? error.message : "You cannot import students.");
  }
}

function inferMappings(
  headers: string[],
  rows: Array<{ cells: StudentImportCell[] }>,
  definitions: StudentImportFieldDefinitionRow[],
): StudentImportMapping[] {
  return headers.map((header, index) => {
    const suggested = suggestStudentImportMapping(header);
    if (suggested.kind === "known") {
      return suggested;
    }
    const normalizedHeader = normalizeStudentImportHeader(header);
    const definition = definitions.find((candidate) =>
      [candidate.key, candidate.label, ...candidate.header_aliases]
        .some((alias) => normalizeStudentImportHeader(alias) === normalizedHeader),
    );
    if (definition) {
      return { sourceHeader: header, kind: "custom-existing", key: definition.key };
    }
    return {
      ...suggested,
      dataType: inferCustomFieldType(rows.map((row) => row.cells[index] ?? null)),
    };
  });
}

function inferCustomFieldType(cells: StudentImportCell[]): StudentCustomFieldType {
  const values = cells.filter((cell) => cell !== null && !(typeof cell === "string" && cell.trim() === ""));
  if (values.length > 0 && values.every((value) => typeof value === "boolean")) return "boolean";
  if (values.length > 0 && values.every((value) => typeof value === "number")) return "number";
  if (values.length > 0 && values.every((value) => value instanceof Date)) return "date";
  return "text";
}

function assertMappingHeaders(headers: string[], mappings: StudentImportMapping[]) {
  if (
    headers.length !== mappings.length ||
    mappings.some((mapping, index) => mapping.sourceHeader !== headers[index])
  ) {
    throw new StudentImportInputError("Spreadsheet headers changed. Preview the file again.");
  }
}

function assertExistingCustomMappings(
  mappings: StudentImportMapping[],
  definitions: StudentImportFieldDefinitionRow[],
) {
  const definitionKeys = new Set(definitions.map((definition) => definition.key.toLowerCase()));
  const collision = mappings.find((mapping) =>
    mapping.kind === "custom-new" && definitionKeys.has(mapping.key.toLowerCase()),
  );
  if (collision && collision.kind === "custom-new") {
    throw new StudentImportInputError(
      `Custom field ${collision.key} already exists. Map it as an existing field.`,
    );
  }
  const missing = mappings.find((mapping) =>
    mapping.kind === "custom-existing" && !definitionKeys.has(mapping.key.toLowerCase()),
  );
  if (missing && missing.kind === "custom-existing") {
    throw new StudentImportInputError(`Custom field ${missing.key} is no longer available. Preview the file again.`);
  }
}

function toNewFieldDefinitions(mappings: StudentImportMapping[]): NewImportFieldDefinition[] {
  return mappings.flatMap((mapping) => mapping.kind === "custom-new" ? [{
    key: mapping.key,
    label: mapping.label,
    dataType: mapping.dataType,
    headerAliases: [mapping.sourceHeader],
    required: false,
    sortOrder: 0,
  }] : []);
}

function sameStudentImportMappings(
  left: StudentImportMapping[],
  right: StudentImportMapping[],
) {
  return left.length === right.length && left.every(
    (mapping, index) => {
      const candidate = right[index];
      if (
        !candidate ||
        mapping.sourceHeader !== candidate.sourceHeader ||
        mapping.kind !== candidate.kind
      ) return false;
      if (mapping.kind === "ignore" || candidate.kind === "ignore") return true;
      if (mapping.kind === "known" && candidate.kind === "known") {
        return mapping.field === candidate.field;
      }
      if (mapping.kind === "custom-existing" && candidate.kind === "custom-existing") {
        return mapping.key === candidate.key;
      }
      return mapping.kind === "custom-new" && candidate.kind === "custom-new" &&
        mapping.key === candidate.key &&
        mapping.label === candidate.label &&
        mapping.dataType === candidate.dataType &&
        mapping.sensitive === candidate.sensitive;
    },
  );
}

function mergePlannedEnrollments(
  directory: Array<Record<string, unknown>>,
  academic: Array<Record<string, unknown>>,
) {
  const enrollments = new Map<string, Record<string, unknown>>();
  for (const enrollment of [...directory, ...academic]) {
    const studentId = academicPlanString(enrollment, "student_id");
    const cohortId = academicPlanString(enrollment, "cohort_id");
    const key = `${studentId}\0${cohortId}`;
    if (!enrollments.has(key)) enrollments.set(key, enrollment);
  }
  return [...enrollments.values()];
}

function recalculateResultDeltas(input: {
  plannedResults: Array<Record<string, unknown>>;
  plannedAssessments: Array<Record<string, unknown>>;
  existingResults: StudentImportPartitionData["results"];
  existingAssessments: StudentImportPartitionData["assessments"];
}): Array<Record<string, unknown>> {
  if (input.plannedResults.length > 2_000) {
    throw new StudentImportInputError("An import cannot plan more than 2,000 results.");
  }

  const assessmentsById = new Map(input.existingAssessments.map((assessment) => [
    assessment.id,
    {
      id: assessment.id,
      cohortId: assessment.cohort_id,
      date: assessment.date,
    },
  ]));
  for (const assessment of input.plannedAssessments) {
    const id = academicPlanString(assessment, "id");
    assessmentsById.set(id, {
      id,
      cohortId: academicPlanString(assessment, "cohort_id"),
      date: academicPlanString(assessment, "date"),
    });
  }

  const planned = input.plannedResults.map((result, index) => {
    const totalScore = result.total_score;
    if (!Number.isInteger(totalScore)) {
      throw new StudentImportInputError("The rebuilt academic import plan is invalid.");
    }
    return {
      payload: result,
      assessmentId: academicPlanString(result, "assessment_id"),
      studentId: academicPlanString(result, "student_id"),
      totalScore: totalScore as number,
      index,
    };
  });
  const effectiveResults = new Map<string, {
    assessmentId: string;
    studentId: string;
    totalScore: number;
  }>();
  for (const result of input.existingResults) {
    effectiveResults.set(`${result.student_id}\0${result.assessment_id}`, {
      assessmentId: result.assessment_id,
      studentId: result.student_id,
      totalScore: result.total_score,
    });
  }
  for (const result of planned) {
    effectiveResults.set(`${result.studentId}\0${result.assessmentId}`, result);
  }

  const resultHistory = new Map<string, Array<{
    assessmentId: string;
    date: string;
    totalScore: number;
  }>>();
  for (const result of effectiveResults.values()) {
    const assessment = assessmentsById.get(result.assessmentId);
    if (!assessment) {
      throw new StudentImportInputError("The rebuilt academic import plan is invalid.");
    }
    const key = `${result.studentId}\0${assessment.cohortId}`;
    const history = resultHistory.get(key) ?? [];
    history.push({
      assessmentId: assessment.id,
      date: assessment.date,
      totalScore: result.totalScore,
    });
    resultHistory.set(key, history);
  }
  for (const history of resultHistory.values()) {
    history.sort((left, right) =>
      left.date.localeCompare(right.date) || left.assessmentId.localeCompare(right.assessmentId));
  }

  const targetsByHistory = new Map<string, Array<typeof planned[number] & { date: string }>>();
  for (const result of planned) {
    const assessment = assessmentsById.get(result.assessmentId);
    if (!assessment) {
      throw new StudentImportInputError("The rebuilt academic import plan is invalid.");
    }
    const key = `${result.studentId}\0${assessment.cohortId}`;
    const targets = targetsByHistory.get(key) ?? [];
    targets.push({ ...result, date: assessment.date });
    targetsByHistory.set(key, targets);
  }

  const deltas = new Array<number>(planned.length);
  for (const [key, targets] of targetsByHistory) {
    const history = resultHistory.get(key) ?? [];
    targets.sort((left, right) =>
      left.date.localeCompare(right.date) || left.assessmentId.localeCompare(right.assessmentId));
    let historyIndex = 0;
    let previousTotal = 0;
    for (const target of targets) {
      while (
        historyIndex < history.length &&
        history[historyIndex].date.localeCompare(target.date) < 0
      ) {
        previousTotal = history[historyIndex].totalScore;
        historyIndex += 1;
      }
      deltas[target.index] = target.totalScore - previousTotal;
    }
  }

  return planned.map((result) => {
    return {
      ...result.payload,
      delta_from_previous: deltas[result.index],
    };
  });
}

function academicPlanString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new StudentImportInputError("The rebuilt academic import plan is invalid.");
  }
  return value;
}

function makeImportRun(input: {
  filename: string;
  digest: string;
  worksheet: string;
  mappings: StudentImportMapping[];
  workbookProfile: StudentWorkbookProfile;
  workbookMapping: StudentWorkbookMappingPlan;
  workbookSetup: StudentWorkbookSetup;
  plan: StudentImportPlan;
  enrollmentCount: number;
  academic: {
    cohorts: number;
    sessions: number;
    assessments: number;
    results: number;
  };
}): StudentImportRunPayload {
  return {
    filename: boundedText(input.filename, 255, "student-import"),
    fileDigest: input.digest,
    worksheet: boundedText(input.worksheet, 200, "Sheet"),
    mapping: input.mappings,
    workbookProfile: input.workbookProfile,
    workbookMapping: input.workbookMapping,
    workbookSetup: input.workbookSetup,
    totalRows: input.plan.rows.length,
    createdCount: input.plan.summary.creates,
    updatedCount: input.plan.summary.updates,
    enrollmentCount: input.enrollmentCount,
    skippedCount: input.plan.summary.skips,
    warningCount: input.plan.summary.warnings,
    cohortCount: input.academic.cohorts,
    sessionCount: input.academic.sessions,
    assessmentCount: input.academic.assessments,
    resultCount: input.academic.results,
  };
}

type FamilyRow = Database["public"]["Tables"]["families"]["Row"];
type StudentRow = Database["public"]["Tables"]["students"]["Row"];
type EnrollmentRow = Database["public"]["Tables"]["enrollments"]["Row"];
type CohortRow = Database["public"]["Tables"]["cohorts"]["Row"];
type ProgramRow = Pick<Database["public"]["Tables"]["programs"]["Row"], "id" | "name" | "track" | "is_archived">;
type CampusRow = Pick<Database["public"]["Tables"]["campuses"]["Row"], "id" | "name" | "modality">;
type TermRow = Database["public"]["Tables"]["terms"]["Row"];
type SessionRow = Database["public"]["Tables"]["sessions"]["Row"];
type AssessmentRow = Database["public"]["Tables"]["assessments"]["Row"];
type ResultRow = Pick<
  Database["public"]["Tables"]["assessment_results"]["Row"],
  "id" | "assessment_id" | "student_id" | "total_score" | "section_scores" |
  "delta_from_previous" | "demo"
>;

export function createProductionStudentImportRepository(): StudentImportRepository {
  const serviceClient = createSupabaseServiceClient();

  return {
    async loadPartition(targetDemo) {
      const [
        families,
        students,
        enrollments,
        cohorts,
        definitions,
        programs,
        campuses,
        terms,
        sessions,
        assessments,
        results,
      ] = await Promise.all([
        loadAllPages<FamilyRow>((from, to) => serviceClient.from("families").select("*").eq("demo", targetDemo).order("id", { ascending: true }).range(from, to)),
        loadAllPages<StudentRow>((from, to) => serviceClient.from("students").select("*").eq("demo", targetDemo).order("id", { ascending: true }).range(from, to)),
        loadAllPages<EnrollmentRow>((from, to) => serviceClient.from("enrollments").select("*").eq("demo", targetDemo).order("id", { ascending: true }).range(from, to)),
        loadAllPages<CohortRow>((from, to) => serviceClient.from("cohorts").select("*").eq("demo", targetDemo).order("id", { ascending: true }).range(from, to)),
        loadAllPages<StudentImportFieldDefinitionRow>((from, to) => serviceClient.from("student_field_definitions").select("id,key,label,data_type,header_aliases,required,sensitive,sort_order,demo").eq("demo", targetDemo).is("archived_at", null).order("sort_order", { ascending: true }).order("key", { ascending: true }).range(from, to)),
        loadAllPages<ProgramRow>((from, to) => serviceClient.from("programs").select("id,name,track,is_archived").order("name", { ascending: true }).range(from, to)),
        loadAllPages<CampusRow>((from, to) => serviceClient.from("campuses").select("id,name,modality").order("name", { ascending: true }).range(from, to)),
        loadAllPages<TermRow>((from, to) => serviceClient.from("terms").select("id,name,start_date,end_date").order("start_date", { ascending: true }).range(from, to)),
        loadAllPages<SessionRow>((from, to) => serviceClient.from("sessions").select("id,cohort_id,title,start_at,end_at,mode,room_label,demo").eq("demo", targetDemo).order("id", { ascending: true }).range(from, to)),
        loadAllPages<AssessmentRow>((from, to) => serviceClient.from("assessments").select("id,cohort_id,title,date,sections,demo").eq("demo", targetDemo).order("id", { ascending: true }).range(from, to)),
        loadAllPages<ResultRow>((from, to) => serviceClient.from("assessment_results").select("id,assessment_id,student_id,total_score,section_scores,delta_from_previous,demo").eq("demo", targetDemo).order("id", { ascending: true }).range(from, to)),
      ]);
      if (campuses.length === 0) {
        throw new StudentImportInputError("Create a campus before importing students.");
      }

      return {
        families: families as ExistingImportFamily[],
        students: students.map((student) => ({
          ...student,
          custom_fields: isPlainRecord(student.custom_fields)
            ? student.custom_fields as Record<string, string | number | boolean>
            : {},
        })) as ExistingImportStudent[],
        enrollments: enrollments as ExistingImportEnrollment[],
        cohorts,
        fieldDefinitions: definitions,
        programs,
        campuses,
        terms,
        sessions,
        assessments,
        results,
        defaultCampusId: campuses[0].id,
      };
    },
    async commitImport(payload) {
      const baseArgs = {
        p_actor_id: payload.actor.id,
        p_actor_role: payload.actor.role,
        p_actor_demo: payload.actor.demo,
        p_target_demo: payload.targetDemo,
        p_field_definitions: payload.fieldDefinitions as Json,
        p_families: payload.families as Json,
        p_students: payload.students as Json,
        p_enrollments: payload.enrollments as Json,
      };
      const hasAcademicPlan = payload.cohorts.length > 0 ||
        payload.sessions.length > 0 ||
        payload.assessments.length > 0 ||
        payload.results.length > 0;
      const useLegacyRpc = payload.importRun.workbookProfile === "simple" && !hasAcademicPlan;
      const rpcResult = useLegacyRpc
        ? await serviceClient.rpc("commit_student_spreadsheet_import", {
            ...baseArgs,
            p_import_run: payload.importRun as unknown as Json,
          })
        : await serviceClient.rpc("commit_student_workbook_import", {
            ...baseArgs,
            p_cohorts: payload.cohorts as Json,
            p_sessions: payload.sessions as Json,
            p_assessments: payload.assessments as Json,
            p_results: payload.results as Json,
            p_import_run: {
              ...payload.importRun,
              profile: payload.importRun.workbookProfile,
            } as unknown as Json,
          });
      const { data, error } = rpcResult;
      if (error) {
        throw new Error(error.message);
      }
      if (useLegacyRpc) {
        if (!isDirectoryCommitResult(data) || !directoryResultMatchesRun(data, payload.importRun)) {
          throw new Error("The student import returned an invalid result.");
        }
        return {
          ...data,
          cohorts: 0,
          sessions: 0,
          assessments: 0,
          results: 0,
        };
      }
      if (
        !isCommitResult(data) ||
        !directoryResultMatchesRun(data, payload.importRun) ||
        data.cohorts !== payload.importRun.cohortCount ||
        data.sessions !== payload.importRun.sessionCount ||
        data.assessments !== payload.importRun.assessmentCount ||
        data.results !== payload.importRun.resultCount
      ) {
        throw new Error("The student import returned an invalid result.");
      }
      return data;
    },
    async insertFailedRun(run) {
      const { error } = await serviceClient.from("student_import_runs").insert({
        ...run,
        mapping: run.mapping as Json,
        workbook_mapping: run.workbook_mapping as unknown as Json,
        workbook_setup: run.workbook_setup as unknown as Json,
        error_samples: run.error_samples as Json,
      });
      if (error) {
        throw new Error(error.message);
      }
    },
  };
}

async function loadAllPages<T>(
  getPage: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
) {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await getPage(from, from + pageSize - 1);
    if (result.error) {
      throw new Error(result.error.message);
    }
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < pageSize) {
      return rows;
    }
  }
}

function isDirectoryCommitResult(
  value: unknown,
): value is Omit<StudentImportCommitResult, "cohorts" | "sessions" | "assessments" | "results"> {
  return isPlainRecord(value) &&
    typeof value.runId === "string" && UUID_PATTERN.test(value.runId) &&
    isNonnegativeInteger(value.created) &&
    isNonnegativeInteger(value.updated) &&
    isNonnegativeInteger(value.enrolled) &&
    isNonnegativeInteger(value.skipped);
}

function isCommitResult(value: unknown): value is StudentImportCommitResult {
  if (!isDirectoryCommitResult(value)) return false;
  const academicCounts = value as unknown as Record<string, unknown>;
  return isNonnegativeInteger(academicCounts.cohorts) &&
    isNonnegativeInteger(academicCounts.sessions) &&
    isNonnegativeInteger(academicCounts.assessments) &&
    isNonnegativeInteger(academicCounts.results);
}

function isNonnegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function directoryResultMatchesRun(
  result: Omit<StudentImportCommitResult, "cohorts" | "sessions" | "assessments" | "results">,
  run: StudentImportRunPayload,
) {
  return result.created === run.createdCount &&
    result.updated === run.updatedCount &&
    result.enrolled === run.enrollmentCount &&
    result.skipped === run.skippedCount;
}

function isValidCustomKey(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedText(value: string, length: number, fallback: string) {
  const normalized = value.trim();
  return (normalized || fallback).slice(0, length);
}
