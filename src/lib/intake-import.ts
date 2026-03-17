import { createHash, randomUUID } from "node:crypto";
import type {
  ImportRun,
  Lead,
  ProgramTrack,
  User,
} from "@/lib/domain";
import { canRunIntakeImports } from "@/lib/permissions";
import { assertWritesAllowed } from "@/lib/engineer-controls";
import {
  finalizeSyncRun,
  maybeSendSyncAlertEmail,
  startSyncRun,
  upsertSyncJob,
} from "@/lib/sync-jobs";
import type { Database } from "@/lib/supabase/database.types";
import { hasSupabaseServiceRole } from "@/lib/supabase/config";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type FamilyRow = Database["public"]["Tables"]["families"]["Row"];
type StudentRow = Database["public"]["Tables"]["students"]["Row"];
type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type EnrollmentRow = Database["public"]["Tables"]["enrollments"]["Row"];
type CohortRow = Database["public"]["Tables"]["cohorts"]["Row"];
type ProgramRow = Database["public"]["Tables"]["programs"]["Row"];
type CampusRow = Database["public"]["Tables"]["campuses"]["Row"];
type ImportRunRow = Database["public"]["Tables"]["intake_import_runs"]["Row"];

interface ParsedCsvRow {
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

export interface IntakeImportResponse {
  run: ImportRun;
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

function normalizeFingerprint(value: string) {
  return normalizeHeader(value).replace(/\s+/g, " ").trim();
}

function makeId(prefix: string, ...parts: string[]) {
  const hash = createHash("sha1")
    .update(parts.map((part) => part.trim().toLowerCase()).join("|"))
    .digest("hex")
    .slice(0, 18);
  return `${prefix}-${hash}`;
}

function escapeCsvCell(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }

  return value;
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

function inferTrack(value: string): ProgramTrack {
  const normalized = normalizeHeader(value);

  if (normalized.includes("act")) {
    return "ACT";
  }

  if (normalized.includes("admission") || normalized.includes("essay")) {
    return "Admissions";
  }

  if (normalized.includes("sat") || normalized.includes("dsat")) {
    return "SAT";
  }

  return "Support";
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

function matchCampusId(value: string, campuses: CampusRow[]) {
  const normalized = normalizeFingerprint(value);
  if (!normalized) {
    return null;
  }

  return (
    campuses.find(
      (campus) =>
        normalizeFingerprint(campus.id) === normalized ||
        normalizeFingerprint(campus.name) === normalized,
    )?.id ?? null
  );
}

function resolveCohortId(
  row: ParsedCsvRow,
  cohorts: CohortRow[],
  programs: ProgramRow[],
  campuses: CampusRow[],
) {
  const normalizedCohortId = normalizeFingerprint(row.cohortId);
  if (normalizedCohortId) {
    const exact = cohorts.find((cohort) => normalizeFingerprint(cohort.id) === normalizedCohortId);
    if (exact) {
      return exact.id;
    }
  }

  const normalizedCohortName = normalizeFingerprint(row.cohortName);
  if (normalizedCohortName) {
    const exact = cohorts.find(
      (cohort) => normalizeFingerprint(cohort.name) === normalizedCohortName,
    );
    if (exact) {
      return exact.id;
    }
  }

  const preferredCampusId = matchCampusId(row.preferredCampus, campuses);
  const normalizedProgram = normalizeFingerprint(row.targetProgram);
  const exactProgram = programs.find(
    (program) =>
      normalizeFingerprint(program.id) === normalizedProgram ||
      normalizeFingerprint(program.name) === normalizedProgram,
  );

  const byProgram = exactProgram
    ? cohorts.filter((cohort) => cohort.program_id === exactProgram.id)
    : [];

  if (byProgram.length === 1) {
    return byProgram[0]?.id ?? null;
  }

  const track = inferTrack(row.targetProgram);
  const byTrack = cohorts.filter((cohort) => {
    const program = programs.find((candidate) => candidate.id === cohort.program_id);
    return program ? inferTrack(program.track) === track : false;
  });

  const campusScoped = preferredCampusId
    ? byTrack.filter((cohort) => cohort.campus_id === preferredCampusId)
    : byTrack;

  return campusScoped.length === 1 ? campusScoped[0]?.id ?? null : null;
}

function summarizeImport(run: Pick<ImportRun, "importedCount" | "leadCount" | "familyCount" | "studentCount" | "enrollmentCount" | "errorCount" | "filename">) {
  const base = `Imported ${run.importedCount} row${run.importedCount === 1 ? "" : "s"} from ${run.filename}.`;
  const details = `${run.leadCount} lead${run.leadCount === 1 ? "" : "s"}, ${run.familyCount} famil${run.familyCount === 1 ? "y" : "ies"}, ${run.studentCount} student${run.studentCount === 1 ? "" : "s"}, ${run.enrollmentCount} enrollment${run.enrollmentCount === 1 ? "" : "s"}.`;

  if (run.errorCount > 0) {
    return `${base} ${details} ${run.errorCount} row${run.errorCount === 1 ? "" : "s"} need review.`;
  }

  return `${base} ${details}`;
}

function normalizeImportRun(row: ImportRunRow): ImportRun {
  const status =
    row.status === "completed" || row.status === "partial" || row.status === "failed"
      ? row.status
      : "failed";
  const source =
    row.source === "Google Forms CSV" || row.source === "Manual CSV"
      ? row.source
      : "Manual CSV";
  const errorSamples = Array.isArray(row.error_samples)
    ? row.error_samples.filter((entry): entry is string => typeof entry === "string")
    : [];

  return {
    id: row.id,
    source,
    filename: row.filename,
    status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    importedCount: row.imported_count,
    leadCount: row.lead_count,
    familyCount: row.family_count,
    studentCount: row.student_count,
    enrollmentCount: row.enrollment_count,
    errorCount: row.error_count,
    summary: row.summary,
    errorSamples,
  };
}

async function applyCohortEnrollmentDeltas(
  cohortRows: CohortRow[],
  enrollmentDeltas: Map<string, number>,
) {
  if (enrollmentDeltas.size === 0) {
    return;
  }

  const serviceClient = createSupabaseServiceClient();
  const updates = await Promise.all(
    Array.from(enrollmentDeltas.entries()).map(async ([cohortId, delta]) => {
      const cohort = cohortRows.find((candidate) => candidate.id === cohortId);
      if (!cohort || delta === 0) {
        return { error: null };
      }

      return serviceClient
        .from("cohorts")
        .update({ enrolled: Math.max(0, cohort.enrolled + delta) })
        .eq("id", cohortId);
    }),
  );

  const failedUpdate = updates.find((result) => result.error);
  if (failedUpdate?.error) {
    throw new Error(`Failed to refresh cohort capacity counts: ${failedUpdate.error.message}`);
  }
}

export async function importIntakeCsv({
  viewer,
  csvText,
  filename,
  source = "Google Forms CSV",
  cadenceLabel = "Manual CSV + hourly sync",
}: {
  viewer: User;
  csvText: string;
  filename: string;
  source?: ImportRun["source"];
  cadenceLabel?: string;
}): Promise<IntakeImportResponse> {
  if (!hasSupabaseServiceRole()) {
    throw new Error("Supabase service-role access is required for imports.");
  }

  if (!canRunIntakeImports(viewer.role)) {
    throw new Error("Only engineer, admin, and staff users can run intake imports.");
  }

  await assertWritesAllowed("integration_writes");

  const serviceClient = createSupabaseServiceClient();
  const runId = `import-${randomUUID()}`;
  const startedAt = new Date().toISOString();
  const syncRun = await startSyncRun({
    jobId: "sync-forms",
    initiatedBy: source === "Manual CSV" ? "manual" : "linked",
    summary: `Started intake import from ${filename}.`,
  });
  if (!syncRun) {
    throw new Error("That intake sync is already running.");
  }

  try {
    const parsedRows = parseIntakeCsvRows(csvText);
    const validRows = parsedRows.filter((row) =>
      [row.guardianName, row.guardianEmail, row.studentName || `${row.studentFirstName} ${row.studentLastName}`]
        .some((value) => value.trim().length > 0),
    );

    if (validRows.length === 0) {
      throw new Error("The CSV did not contain any usable intake rows.");
    }

    const [
      familiesResult,
      studentsResult,
      leadsResult,
      enrollmentsResult,
      cohortsResult,
      programsResult,
      campusesResult,
    ] = await Promise.all([
      serviceClient.from("families").select("*"),
      serviceClient.from("students").select("*"),
      serviceClient.from("leads").select("*"),
      serviceClient.from("enrollments").select("*"),
      serviceClient.from("cohorts").select("*"),
      serviceClient.from("programs").select("*"),
      serviceClient.from("campuses").select("*"),
    ]);

    const existingFamilies = (familiesResult.data ?? []) as FamilyRow[];
    const existingStudents = (studentsResult.data ?? []) as StudentRow[];
    const existingLeads = (leadsResult.data ?? []) as LeadRow[];
    const existingEnrollments = (enrollmentsResult.data ?? []) as EnrollmentRow[];
    const existingCohorts = (cohortsResult.data ?? []) as CohortRow[];
    const existingPrograms = (programsResult.data ?? []) as ProgramRow[];
    const existingCampuses = (campusesResult.data ?? []) as CampusRow[];

    const familyByEmail = new Map(
      existingFamilies.map((family) => [normalizeEmail(family.email), family]),
    );
    const studentByFamilyAndName = new Map(
      existingStudents.map((student) => [
        `${student.family_id}|${normalizeFingerprint(`${student.first_name} ${student.last_name}`)}`,
        student,
      ]),
    );
    const leadByFingerprint = new Map(
      existingLeads.map((lead) => [
        normalizeFingerprint(`${lead.student_name}|${lead.guardian_name}|${lead.target_program}`),
        lead,
      ]),
    );
    const enrollmentByStudentAndCohort = new Map(
      existingEnrollments.map((enrollment) => [
        `${enrollment.student_id}|${enrollment.cohort_id}`,
        enrollment,
      ]),
    );

    const familyUpserts = new Map<string, Database["public"]["Tables"]["families"]["Insert"]>();
    const studentUpserts = new Map<string, Database["public"]["Tables"]["students"]["Insert"]>();
    const leadUpserts = new Map<string, Database["public"]["Tables"]["leads"]["Insert"]>();
    const enrollmentUpserts = new Map<string, Database["public"]["Tables"]["enrollments"]["Insert"]>();
    const enrollmentDeltas = new Map<string, number>();
    const errors: string[] = [];

    validRows.forEach((row, index) => {
      if (!row.guardianName) {
        errors.push(`Row ${index + 2}: guardian name is required.`);
        return;
      }

      if (!row.guardianEmail) {
        errors.push(`Row ${index + 2}: guardian email is required.`);
        return;
      }

      const studentName = row.studentName || normalizeText(`${row.studentFirstName} ${row.studentLastName}`);
      if (!studentName) {
        errors.push(`Row ${index + 2}: student name is required.`);
        return;
      }

      const targetProgram = row.targetProgram || "IntoPrep Intake";
      const familyName = row.studentLastName || row.guardianName.split(" ").slice(-1)[0] || "Household";
      const existingFamily = familyByEmail.get(row.guardianEmail);
      const familyId = existingFamily?.id ?? makeId("family", row.guardianEmail);
      const preferredCampusId = matchCampusId(row.preferredCampus, existingCampuses) ?? existingFamily?.preferred_campus_id ?? "campus-online";
      const familyNotes = [existingFamily?.notes ?? "", row.notes]
        .map((value) => normalizeText(value))
        .filter(Boolean)
        .join(" ");

      familyUpserts.set(familyId, {
        id: familyId,
        family_name: familyName,
        guardian_names: Array.from(new Set([...(existingFamily?.guardian_names ?? []), row.guardianName])),
        email: row.guardianEmail,
        phone: row.guardianPhone || existingFamily?.phone || "Not provided",
        preferred_campus_id: preferredCampusId,
        notes: familyNotes,
      });
      familyByEmail.set(row.guardianEmail, {
        id: familyId,
        family_name: familyName,
        guardian_names: [row.guardianName],
        email: row.guardianEmail,
        phone: row.guardianPhone || "Not provided",
        preferred_campus_id: preferredCampusId,
        notes: familyNotes,
      });

      const normalizedStudentName = normalizeFingerprint(studentName);
      const existingStudent = studentByFamilyAndName.get(`${familyId}|${normalizedStudentName}`);
      const studentId =
        existingStudent?.id ?? makeId("student", familyId, row.studentFirstName, row.studentLastName || studentName);
      const track = inferTrack(targetProgram);

      studentUpserts.set(studentId, {
        id: studentId,
        family_id: familyId,
        first_name: row.studentFirstName || studentName.split(" ")[0] || "Student",
        last_name: row.studentLastName || studentName.split(" ").slice(1).join(" ") || "Unknown",
        grade_level: row.gradeLevel || existingStudent?.grade_level || "Unknown",
        school: row.school || existingStudent?.school || "Not provided",
        target_test: track,
        focus: row.focus || existingStudent?.focus || "Needs placement review",
      });
      studentByFamilyAndName.set(`${familyId}|${normalizedStudentName}`, {
        id: studentId,
        family_id: familyId,
        first_name: row.studentFirstName || studentName.split(" ")[0] || "Student",
        last_name: row.studentLastName || studentName.split(" ").slice(1).join(" ") || "Unknown",
        grade_level: row.gradeLevel || existingStudent?.grade_level || "Unknown",
        school: row.school || existingStudent?.school || "Not provided",
        target_test: track,
        focus: row.focus || existingStudent?.focus || "Needs placement review",
      });

      const leadFingerprint = normalizeFingerprint(`${studentName}|${row.guardianName}|${targetProgram}`);
      const existingLead = leadByFingerprint.get(leadFingerprint);
      const leadId = existingLead?.id ?? makeId("lead", row.guardianEmail, studentName, targetProgram);
      const submittedAt = row.submittedAt ?? startedAt;

      leadUpserts.set(leadId, {
        id: leadId,
        student_name: studentName,
        guardian_name: row.guardianName,
        target_program: targetProgram,
        stage: row.stage,
        submitted_at: submittedAt,
        owner_id: existingLead?.owner_id ?? null,
        follow_up_due_at: existingLead?.follow_up_due_at ?? null,
        notes: existingLead?.notes ?? null,
      });
      leadByFingerprint.set(leadFingerprint, {
        id: leadId,
        student_name: studentName,
        guardian_name: row.guardianName,
        target_program: targetProgram,
        stage: row.stage,
        submitted_at: submittedAt,
        owner_id: existingLead?.owner_id ?? null,
        follow_up_due_at: existingLead?.follow_up_due_at ?? null,
        notes: existingLead?.notes ?? null,
      });

      if (row.stage === "registered" || row.stage === "waitlist") {
        const cohortId = resolveCohortId(row, existingCohorts, existingPrograms, existingCampuses);
        if (!cohortId) {
          errors.push(
            `Row ${index + 2}: could not resolve a cohort for ${studentName}; lead was imported without enrollment.`,
          );
          return;
        }

        const enrollmentKey = `${studentId}|${cohortId}`;
        const existingEnrollment = enrollmentByStudentAndCohort.get(enrollmentKey);
        const enrollmentId = existingEnrollment?.id ?? makeId("enroll", studentId, cohortId);
        const nextEnrollmentStatus = row.stage === "waitlist" ? "waitlist" : "active";

        enrollmentUpserts.set(enrollmentId, {
          id: enrollmentId,
          student_id: studentId,
          cohort_id: cohortId,
          status: nextEnrollmentStatus,
          registered_at: submittedAt.slice(0, 10),
        });
        enrollmentByStudentAndCohort.set(enrollmentKey, {
          id: enrollmentId,
          student_id: studentId,
          cohort_id: cohortId,
          status: nextEnrollmentStatus,
          registered_at: submittedAt.slice(0, 10),
        });

        const previousStatus = existingEnrollment?.status ?? null;
        if (previousStatus !== nextEnrollmentStatus) {
          const nextDelta =
            (previousStatus === "active" ? -1 : 0) +
            (nextEnrollmentStatus === "active" ? 1 : 0);
          enrollmentDeltas.set(cohortId, (enrollmentDeltas.get(cohortId) ?? 0) + nextDelta);
        }
      }
    });

    if (familyUpserts.size > 0) {
      const { error } = await serviceClient
        .from("families")
        .upsert(Array.from(familyUpserts.values()));
      if (error) {
        throw new Error(`Family import failed: ${error.message}`);
      }
    }

    if (studentUpserts.size > 0) {
      const { error } = await serviceClient
        .from("students")
        .upsert(Array.from(studentUpserts.values()));
      if (error) {
        throw new Error(`Student import failed: ${error.message}`);
      }
    }

    if (leadUpserts.size > 0) {
      const { error } = await serviceClient
        .from("leads")
        .upsert(Array.from(leadUpserts.values()));
      if (error) {
        throw new Error(`Lead import failed: ${error.message}`);
      }
    }

    if (enrollmentUpserts.size > 0) {
      const { error } = await serviceClient
        .from("enrollments")
        .upsert(Array.from(enrollmentUpserts.values()));
      if (error) {
        throw new Error(`Enrollment import failed: ${error.message}`);
      }
    }

    await applyCohortEnrollmentDeltas(existingCohorts, enrollmentDeltas);

    const finishedAt = new Date().toISOString();
    const importedCount = validRows.length;
    const leadCount = leadUpserts.size;
    const familyCount = familyUpserts.size;
    const studentCount = studentUpserts.size;
    const enrollmentCount = enrollmentUpserts.size;
    const errorCount = errors.length;
    const status: ImportRun["status"] =
      importedCount === 0 ? "failed" : errorCount > 0 ? "partial" : "completed";

    const summary = summarizeImport({
      filename,
      importedCount,
      leadCount,
      familyCount,
      studentCount,
      enrollmentCount,
      errorCount,
    });

    const importRunInsert: Database["public"]["Tables"]["intake_import_runs"]["Insert"] = {
      id: runId,
      source,
      filename,
      status,
      started_at: startedAt,
      finished_at: finishedAt,
      imported_count: importedCount,
      lead_count: leadCount,
      family_count: familyCount,
      student_count: studentCount,
      enrollment_count: enrollmentCount,
      error_count: errorCount,
      summary,
      error_samples: errors.slice(0, 5),
      created_by: viewer.id,
    };

    const { error: importRunError, data: importRunData } = await serviceClient
      .from("intake_import_runs")
      .upsert(importRunInsert)
      .select()
      .single();

    if (importRunError || !importRunData) {
      throw new Error(importRunError?.message ?? "Import run logging failed.");
    }

    const syncStatus =
      status === "completed" ? "healthy" : status === "partial" ? "warning" : "error";
    await upsertSyncJob({
      id: "sync-forms",
      label: "Google Forms registration import",
      cadence: cadenceLabel,
      status: syncStatus,
      lastRunAt: finishedAt,
      summary,
    });
    const notificationSent =
      syncStatus === "warning" || syncStatus === "error"
        ? await maybeSendSyncAlertEmail({
            label: "Google Forms registration import",
            status: syncStatus,
            summary,
            detailLines: errors.length > 0 ? errors.slice(0, 5) : [summary],
          })
        : false;
    await finalizeSyncRun({
      run: syncRun,
      status: syncStatus,
      summary,
      metadata: {
        filename,
        importedCount,
        leadCount,
        familyCount,
        studentCount,
        enrollmentCount,
        errorCount,
        errorSamples: errors.slice(0, 5),
      },
      notificationSent,
    });

    return {
      run: normalizeImportRun(importRunData as ImportRunRow),
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Intake import failed.";

    await serviceClient.from("intake_import_runs").upsert({
      id: runId,
      source,
      filename,
      status: "failed",
      started_at: startedAt,
      finished_at: finishedAt,
      imported_count: 0,
      lead_count: 0,
      family_count: 0,
      student_count: 0,
      enrollment_count: 0,
      error_count: 1,
      summary: message,
      error_samples: [message],
      created_by: viewer.id,
    });

    await upsertSyncJob({
      id: "sync-forms",
      label: "Google Forms registration import",
      cadence: cadenceLabel,
      status: "error",
      lastRunAt: finishedAt,
      summary: message,
    });
    const notificationSent = await maybeSendSyncAlertEmail({
      label: "Google Forms registration import",
      status: "error",
      summary: message,
      detailLines: [message],
    });
    await finalizeSyncRun({
      run: syncRun,
      status: "error",
      summary: message,
      metadata: {
        filename,
        importedCount: 0,
        leadCount: 0,
        familyCount: 0,
        studentCount: 0,
        enrollmentCount: 0,
        errorCount: 1,
        errorSamples: [message],
      },
      notificationSent,
    });

    throw error;
  }
}
