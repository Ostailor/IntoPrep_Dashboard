import { NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { canRunStudentImports } from "@/lib/permissions";
import {
  parseExcludedStudentImportRows,
  parseStudentImportMappings,
  previewStudentSpreadsheetImport,
  StudentImportInputError,
  StudentImportPermissionError,
} from "@/lib/student-import-operations";
import {
  readBoundedStudentImportFormData,
  STUDENT_IMPORT_MAX_MAPPING_PLAN_BYTES,
  STUDENT_IMPORT_MAX_SETUP_BYTES,
} from "@/lib/student-import-request";
import { STUDENT_IMPORT_MAX_BYTES, readStudentSpreadsheet } from "@/lib/student-spreadsheet";
import { detectStudentWorkbook } from "@/lib/student-workbook-profile";
import {
  parseStudentWorkbookMappings,
  parseStudentWorkbookSetup,
} from "@/lib/student-workbook-schema";

export async function POST(request: Request) {
  const viewer = await getAuthenticatedViewerForRequest();
  if (
    !viewer ||
    viewer.mode !== "live" ||
    viewer.accountStatus === "suspended" ||
    viewer.mustChangePassword === true ||
    !canRunStudentImports(viewer.user.role)
  ) {
    return NextResponse.json({ error: "You cannot import students." }, { status: 403 });
  }

  try {
    const form = await readBoundedStudentImportFormData(request);
    rejectClientDerivedPreviewFields(form);
    const file = getSpreadsheetFile(form);
    const bytes = Buffer.from(await file.arrayBuffer());
    const sheetName = getOptionalText(form, "sheetName", 200);
    const mappings = parseJsonField(form, "mappings", 100_000, parseStudentImportMappings);
    const mappingPlanText = getOptionalText(
      form,
      "mappingPlan",
      STUDENT_IMPORT_MAX_MAPPING_PLAN_BYTES,
    );
    let mappingPlan;
    if (mappingPlanText !== undefined) {
      let spreadsheet;
      try {
        spreadsheet = await readStudentSpreadsheet({ filename: file.name, bytes, sheetName });
      } catch (error) {
        throw new StudentImportInputError(
          error instanceof Error ? error.message : "The spreadsheet could not be read.",
        );
      }
      const detected = detectStudentWorkbook({
        sheets: spreadsheet.sheets,
        selectedSheet: spreadsheet.selectedSheet,
      });
      mappingPlan = parseJsonText(
        mappingPlanText,
        "mappingPlan",
        (value) => parseStudentWorkbookMappings(value, detected),
      );
    }
    const setup = parseJsonField(
      form,
      "setup",
      STUDENT_IMPORT_MAX_SETUP_BYTES,
      parseStudentWorkbookSetup,
    );
    const excludedRowNumbers = parseJsonField(
      form,
      "excludedRowNumbers",
      20_000,
      parseExcludedStudentImportRows,
    ) ?? [];
    const result = await previewStudentSpreadsheetImport({
      viewer: viewer.user,
      filename: file.name,
      bytes,
      sheetName,
      mappings,
      mappingPlan,
      setup,
      excludedRowNumbers,
      requestedTarget: parseTarget(form),
    });

    return NextResponse.json(result);
  } catch (error) {
    return studentImportErrorResponse(error, "Student import preview failed.");
  }
}

function getSpreadsheetFile(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new StudentImportInputError("Attach an .xlsx or .csv student spreadsheet.");
  }
  if (file.size > STUDENT_IMPORT_MAX_BYTES) {
    throw new StudentImportInputError("Spreadsheet files must be 4 MB or smaller.");
  }
  if (!file.name || file.name.length > 255) {
    throw new StudentImportInputError("The spreadsheet filename is invalid.");
  }
  return file;
}

function getOptionalText(form: FormData, key: string, maxLength: number) {
  const value = form.get(key);
  if (value === null || value === "") return undefined;
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > maxLength) {
    throw new StudentImportInputError(`Student import ${key} is invalid.`);
  }
  return value;
}

function parseJsonField<T>(
  form: FormData,
  key: string,
  maxLength: number,
  parse: (value: unknown) => T,
): T | undefined {
  const text = getOptionalText(form, key, maxLength);
  if (text === undefined) return undefined;
  return parseJsonText(text, key, parse);
}

function parseJsonText<T>(
  text: string,
  key: string,
  parse: (value: unknown) => T,
): T {
  try {
    return parse(JSON.parse(text));
  } catch (error) {
    if (error instanceof StudentImportInputError) throw error;
    throw new StudentImportInputError(`Student import ${key} is invalid.`);
  }
}

function rejectClientDerivedPreviewFields(form: FormData) {
  if (form.has("normalizedRows") || form.has("counts")) {
    throw new StudentImportInputError("Student import preview data must be rebuilt by the server.");
  }
}

function parseTarget(form: FormData) {
  const value = form.get("targetDemo");
  if (value === null || value === "") return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new StudentImportInputError("Student import target is invalid.");
}

function studentImportErrorResponse(error: unknown, fallback: string) {
  if (error instanceof StudentImportPermissionError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof StudentImportInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}
