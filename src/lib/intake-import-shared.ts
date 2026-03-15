import type { Lead } from "@/lib/domain";

export interface ParsedCsvRow {
  submittedAt: string | null;
  guardianName: string;
  guardianEmail: string;
  guardianPhone: string;
  studentFirstName: string;
  studentLastName: string;
  studentName: string;
  gradeLevel: string;
  school: string;
  targetProgram: string;
  stage: Lead["stage"];
  preferredCampus: string;
  focus: string;
  notes: string;
  cohortId: string;
  cohortName: string;
}

const intakeHeaderAliases = {
  submittedAt: ["timestamp", "submitted at", "submission time", "created at"],
  guardianName: ["guardian name", "parent name", "parent guardian name", "parent/guardian name", "guardian"],
  guardianEmail: ["guardian email", "parent email", "email", "email address"],
  guardianPhone: ["guardian phone", "parent phone", "phone", "phone number", "mobile"],
  studentFirstName: ["student first name", "first name", "student first"],
  studentLastName: ["student last name", "last name", "student last"],
  studentName: ["student name", "full student name"],
  gradeLevel: ["grade level", "grade", "student grade"],
  school: ["school", "student school", "high school"],
  targetProgram: ["target program", "program", "prep program", "target track", "target test"],
  stage: ["stage", "status", "pipeline stage", "enrollment stage"],
  preferredCampus: ["preferred campus", "campus", "campus preference"],
  focus: ["focus", "student focus", "academic focus", "goals"],
  notes: ["notes", "family notes", "additional notes", "comments"],
  cohortId: ["cohort id"],
  cohortName: ["cohort", "cohort name"],
} as const;

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s/]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function escapeCsvCell(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }

  return value;
}

function resolveHeaderValue(row: Record<string, string>, aliases: readonly string[]) {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)];
    if (typeof value === "string" && value.trim().length > 0) {
      return normalizeText(value);
    }
  }

  return "";
}

function normalizeSubmittedAt(value: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeStage(value: string): Lead["stage"] {
  const normalized = normalizeHeader(value);

  if (normalized.includes("wait")) {
    return "waitlist";
  }

  if (
    normalized.includes("registered") ||
    normalized.includes("enrolled") ||
    normalized.includes("active")
  ) {
    return "registered";
  }

  if (
    normalized.includes("assessment") ||
    normalized.includes("placement") ||
    normalized.includes("test")
  ) {
    return "assessment";
  }

  return "inquiry";
}

function splitStudentName(firstName: string, lastName: string, fullName: string) {
  if (firstName && lastName) {
    return {
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
    };
  }

  const normalizedFullName = normalizeText(fullName);
  if (!normalizedFullName) {
    return {
      firstName: "",
      lastName: "",
      fullName: "",
    };
  }

  const [first, ...rest] = normalizedFullName.split(" ");
  return {
    firstName: first ?? "",
    lastName: rest.join(" "),
    fullName: normalizedFullName,
  };
}

export function getIntakeTemplateCsv() {
  const headers = [
    "Timestamp",
    "Guardian Name",
    "Guardian Email",
    "Guardian Phone",
    "Student First Name",
    "Student Last Name",
    "Grade Level",
    "School",
    "Target Program",
    "Stage",
    "Preferred Campus",
    "Focus",
    "Notes",
    "Cohort Name",
  ];

  const sampleRow = [
    "2026-03-14T08:00:00-04:00",
    "Jordan Ellis",
    "jordan.ellis@example.com",
    "(610) 555-0123",
    "Mila",
    "Ellis",
    "10",
    "Conestoga High School",
    "Digital SAT Score Guarantee",
    "registered",
    "Malvern Campus",
    "Needs more pacing support in math timing",
    "Completed Google Forms registration after placement call.",
    "SAT Spring Elite M/W/F",
  ];

  return `${headers.map(escapeCsvCell).join(",")}\n${sampleRow.map(escapeCsvCell).join(",")}\n`;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        currentCell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      currentRow.push(currentCell);
      if (currentRow.some((cell) => cell.trim().length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  if (currentRow.some((cell) => cell.trim().length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

export function parseIntakeCsvRows(csvText: string): ParsedCsvRow[] {
  const matrix = parseCsv(csvText);
  if (matrix.length < 2) {
    throw new Error("The CSV must include a header row and at least one data row.");
  }

  const [headerRow, ...valueRows] = matrix;
  const normalizedHeaders = headerRow.map((header) => normalizeHeader(header));

  return valueRows.map((cells) => {
    const row = Object.fromEntries(
      normalizedHeaders.map((header, index) => [header, cells[index] ?? ""]),
    );

    const student = splitStudentName(
      resolveHeaderValue(row, intakeHeaderAliases.studentFirstName),
      resolveHeaderValue(row, intakeHeaderAliases.studentLastName),
      resolveHeaderValue(row, intakeHeaderAliases.studentName),
    );

    return {
      submittedAt: normalizeSubmittedAt(resolveHeaderValue(row, intakeHeaderAliases.submittedAt)),
      guardianName: resolveHeaderValue(row, intakeHeaderAliases.guardianName),
      guardianEmail: normalizeEmail(resolveHeaderValue(row, intakeHeaderAliases.guardianEmail)),
      guardianPhone: resolveHeaderValue(row, intakeHeaderAliases.guardianPhone),
      studentFirstName: student.firstName,
      studentLastName: student.lastName,
      studentName: student.fullName,
      gradeLevel: resolveHeaderValue(row, intakeHeaderAliases.gradeLevel),
      school: resolveHeaderValue(row, intakeHeaderAliases.school),
      targetProgram: resolveHeaderValue(row, intakeHeaderAliases.targetProgram),
      stage: normalizeStage(resolveHeaderValue(row, intakeHeaderAliases.stage)),
      preferredCampus: resolveHeaderValue(row, intakeHeaderAliases.preferredCampus),
      focus: resolveHeaderValue(row, intakeHeaderAliases.focus),
      notes: resolveHeaderValue(row, intakeHeaderAliases.notes),
      cohortId: resolveHeaderValue(row, intakeHeaderAliases.cohortId),
      cohortName: resolveHeaderValue(row, intakeHeaderAliases.cohortName),
    };
  });
}
