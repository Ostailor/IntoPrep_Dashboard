import type { ProgramTrack } from "@/lib/domain";

export type StudentImportFieldKey =
  | "externalId" | "fullName" | "firstName" | "lastName"
  | "gradeLevel" | "school" | "targetTest" | "focus"
  | "studentEmail" | "studentPhone"
  | "parent1Name" | "parent1Email" | "parent1Phone"
  | "parent2Name" | "parent2Email" | "parent2Phone"
  | "familyNotes" | "cohortId" | "cohortName" | "registeredAt";

export const STUDENT_IMPORT_FIELD_LABELS = {
  externalId: "External student ID",
  fullName: "Full student name",
  firstName: "First name",
  lastName: "Last name",
  gradeLevel: "Grade level",
  school: "School",
  targetTest: "Target test",
  focus: "Focus",
  studentEmail: "Student email",
  studentPhone: "Student phone",
  parent1Name: "Parent 1 name",
  parent1Email: "Parent 1 email",
  parent1Phone: "Parent 1 phone",
  parent2Name: "Parent 2 name",
  parent2Email: "Parent 2 email",
  parent2Phone: "Parent 2 phone",
  familyNotes: "Family notes",
  cohortId: "Cohort ID",
  cohortName: "Cohort name",
  registeredAt: "Registration date",
} as const satisfies Record<StudentImportFieldKey, string>;

export type StudentCustomFieldType = "text" | "number" | "date" | "boolean";
export type StudentImportCell = string | number | boolean | Date | null;

export type StudentImportMapping =
  | { sourceHeader: string; kind: "known"; field: StudentImportFieldKey }
  | { sourceHeader: string; kind: "custom-existing"; key: string }
  | { sourceHeader: string; kind: "custom-new"; key: string; label: string; dataType: StudentCustomFieldType; sensitive: true }
  | { sourceHeader: string; kind: "ignore" };

export interface NormalizedStudentImportRow {
  rowNumber: number;
  externalId: string;
  firstName: string;
  lastName: string;
  gradeLevel: string;
  school: string;
  targetTest: ProgramTrack;
  focus: string;
  studentEmail: string;
  studentPhone: string;
  parent1Name: string;
  parent1Email: string;
  parent1Phone: string;
  parent2Name: string;
  parent2Email: string;
  parent2Phone: string;
  familyNotes: string;
  cohortId: string;
  cohortName: string;
  registeredAt: string;
  customFields: Record<string, string | number | boolean>;
  suppliedFields: StudentImportFieldKey[];
}

export interface StudentImportSummaryCounts {
  creates: number;
  updates: number;
  enrollments: number;
  skips: number;
  warnings: number;
  errors: number;
}

export function formatStudentImportSummary(summary: StudentImportSummaryCounts): string {
  const parts = [
    formatCount(summary.creates, "create"),
    formatCount(summary.updates, "update"),
    formatCount(summary.enrollments, "enrollment"),
    `${summary.skips} skipped`,
    formatCount(summary.warnings, "warning"),
  ];

  if (summary.errors > 0) {
    parts.push(formatCount(summary.errors, "error"));
  }

  return `${parts.join(", ")}.`;
}

export function getStudentImportTargetLabel(targetDemo: boolean): string {
  return targetDemo ? "Demo data only" : "Main data";
}

const STUDENT_IMPORT_FIELD_ALIASES = {
  externalId: ["external id", "external student id", "student id", "student number"],
  fullName: ["full name", "student name", "student full name"],
  firstName: ["first name", "student first name", "firstname"],
  lastName: ["last name", "student last name", "lastname"],
  gradeLevel: ["gr", "grade", "grade level", "student grade"],
  school: ["school", "school name", "current school"],
  targetTest: ["target test", "test", "program", "program track", "track"],
  focus: ["focus", "academic focus", "student focus"],
  studentEmail: ["student email", "student email address", "email", "email address"],
  studentPhone: ["student phone", "student phone number", "phone", "phone number", "mobile"],
  parent1Name: ["parent 1 name", "parent name", "parent/guardian name", "parent guardian name", "guardian name", "primary guardian name"],
  parent1Email: ["parent 1 email", "parent email", "parent/guardian email", "parent guardian email", "guardian email", "primary guardian email", "family email"],
  parent1Phone: ["parent 1 phone", "parent phone", "parent/guardian phone", "parent guardian phone", "guardian phone", "primary guardian phone", "family phone"],
  parent2Name: ["parent 2 name", "second parent name", "secondary guardian name"],
  parent2Email: ["parent 2 email", "second parent email", "secondary guardian email"],
  parent2Phone: ["parent 2 phone", "second parent phone", "secondary guardian phone"],
  familyNotes: ["family notes", "family note", "notes"],
  cohortId: ["cohort id", "class id"],
  cohortName: ["cohort", "cohorts", "cohort name", "class", "class name"],
  registeredAt: ["registered at", "registration date", "date registered", "enrollment date"],
} satisfies Record<StudentImportFieldKey, readonly string[]>;

export function normalizeStudentImportHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/[^\w\s/]/g, "").replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ");
}

export function findStudentImportField(sourceHeader: string): StudentImportFieldKey | null {
  const normalizedHeader = normalizeStudentImportHeader(sourceHeader);
  return (Object.entries(STUDENT_IMPORT_FIELD_ALIASES) as Array<[
    StudentImportFieldKey,
    readonly string[],
  ]>).find(([, aliases]) => aliases.some(
    (alias) => normalizeStudentImportHeader(alias) === normalizedHeader,
  ))?.[0] ?? null;
}

export function suggestStudentImportMapping(sourceHeader: string): StudentImportMapping {
  const knownField = findStudentImportField(sourceHeader);

  if (knownField) {
    return { sourceHeader, kind: "known", field: knownField };
  }

  const label = sourceHeader.trim().replace(/\s+/g, " ") || "Custom field";
  const key = normalizeStudentImportHeader(label)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "custom_field";

  return {
    sourceHeader,
    kind: "custom-new",
    key,
    label,
    dataType: "text",
    sensitive: true,
  };
}

export function validateStudentImportMappings(mappings: readonly StudentImportMapping[]): void {
  const knownFields = new Set<StudentImportFieldKey>();
  const customFields = new Set<string>();

  for (const mapping of mappings) {
    if (mapping.kind === "known") {
      if (knownFields.has(mapping.field)) {
        throw new Error(`${formatFieldLabel(mapping.field)} is mapped more than once.`);
      }
      knownFields.add(mapping.field);
    }

    if (mapping.kind === "custom-existing" || mapping.kind === "custom-new") {
      if (customFields.has(mapping.key)) {
        throw new Error(`Custom field ${mapping.key} is mapped more than once.`);
      }
      customFields.add(mapping.key);
    }
  }

  if (knownFields.has("fullName") && (knownFields.has("firstName") || knownFields.has("lastName"))) {
    throw new Error("Full name cannot be mapped with separate first or last name columns.");
  }
}

export function normalizeStudentImportRow(input: {
  rowNumber: number;
  cells: readonly StudentImportCell[];
  mappings: readonly StudentImportMapping[];
}): NormalizedStudentImportRow {
  const row: NormalizedStudentImportRow = {
    rowNumber: input.rowNumber,
    externalId: "",
    firstName: "",
    lastName: "",
    gradeLevel: "",
    school: "",
    targetTest: "Support",
    focus: "",
    studentEmail: "",
    studentPhone: "",
    parent1Name: "",
    parent1Email: "",
    parent1Phone: "",
    parent2Name: "",
    parent2Email: "",
    parent2Phone: "",
    familyNotes: "",
    cohortId: "",
    cohortName: "",
    registeredAt: "",
    customFields: {},
    suppliedFields: [],
  };

  input.mappings.forEach((mapping, index) => {
    const cell = input.cells[index] ?? null;
    if (mapping.kind === "ignore" || isBlankCell(cell)) {
      return;
    }

    if (mapping.kind === "custom-existing" || mapping.kind === "custom-new") {
      row.customFields[mapping.key] = normalizeCustomCell(cell);
      return;
    }

    row.suppliedFields.push(mapping.field);
    const value = normalizeTextCell(cell);

    switch (mapping.field) {
      case "fullName": {
        const [firstName = "", ...lastNameParts] = value.split(" ");
        row.firstName = firstName;
        row.lastName = lastNameParts.join(" ");
        break;
      }
      case "targetTest":
        row.targetTest = normalizeProgramTrack(value);
        break;
      case "studentEmail":
      case "parent1Email":
      case "parent2Email":
        row[mapping.field] = value.toLowerCase();
        break;
      default:
        row[mapping.field] = value;
    }
  });

  return row;
}

function formatFieldLabel(field: StudentImportFieldKey): string {
  return STUDENT_IMPORT_FIELD_LABELS[field];
}

function formatCount(value: number, singular: string): string {
  return `${value} ${singular}${value === 1 ? "" : "s"}`;
}

function isBlankCell(cell: StudentImportCell): cell is null | string {
  return cell === null || (typeof cell === "string" && cell.trim() === "");
}

function normalizeTextCell(cell: Exclude<StudentImportCell, null>): string {
  if (cell instanceof Date) {
    return cell.toISOString();
  }
  return String(cell).trim().replace(/\s+/g, " ");
}

function normalizeCustomCell(cell: Exclude<StudentImportCell, null>): string | number | boolean {
  if (cell instanceof Date) {
    return cell.toISOString();
  }
  if (typeof cell === "string") {
    return cell.trim().replace(/\s+/g, " ");
  }
  return cell;
}

function normalizeProgramTrack(value: string): ProgramTrack {
  switch (value.toLowerCase()) {
    case "sat":
      return "SAT";
    case "act":
      return "ACT";
    case "admissions":
      return "Admissions";
    default:
      return "Support";
  }
}
