import type { User, UserRole } from "@/lib/domain";
import { createXlsxWorkbook, type XlsxCell, type XlsxSheet } from "@/lib/xlsx-workbook";

export type StudentWorkbookExportScope = "students" | "scores" | "all";

type ExportCustomFieldValue = string | number | boolean;

export interface StudentWorkbookExportPartitionData {
  families: Array<{
    id: string;
    guardian_names: string[];
    parent1_name: string | null;
    parent1_email: string | null;
    parent1_phone: string | null;
    parent2_name: string | null;
    parent2_email: string | null;
    parent2_phone: string | null;
    email: string;
    phone: string;
    demo: boolean;
  }>;
  students: Array<{
    id: string;
    family_id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    grade_level: string;
    school: string;
    target_test: string;
    focus: string;
    custom_fields: unknown;
    demo: boolean;
  }>;
  fieldDefinitions: Array<{
    key: string;
    label: string;
    data_type: "text" | "number" | "date" | "boolean";
    sort_order: number;
    archived_at: string | null;
    demo: boolean;
  }>;
  enrollments: Array<{
    student_id: string;
    cohort_id: string;
    status: string;
    registered_at: string;
    demo: boolean;
  }>;
  cohorts: Array<{
    id: string;
    name: string;
    is_archived: boolean;
    demo: boolean;
  }>;
  sessions: Array<{
    cohort_id: string;
    title: string;
    start_at: string;
    room_label: string;
    demo: boolean;
  }>;
  assessments: Array<{
    id: string;
    cohort_id: string;
    title: string;
    date: string;
    demo: boolean;
  }>;
  results: Array<{
    assessment_id: string;
    student_id: string;
    total_score: number;
    section_scores: unknown;
    demo: boolean;
  }>;
}

export interface StudentWorkbookExportRepository {
  loadPartition(targetDemo: boolean): Promise<StudentWorkbookExportPartitionData>;
}

export interface StudentInformationExportRow {
  firstName: string;
  lastName: string;
  studentEmail: string;
  studentPhone: string;
  grade: string;
  school: string;
  targetTest: string;
  focus: string;
  parent1Name: string;
  parent1Email: string;
  parent1Phone: string;
  parent2Name: string;
  parent2Email: string;
  parent2Phone: string;
  cohorts: string;
  registrationDate: Date | null;
  customFields: Record<string, ExportCustomFieldValue>;
}

export interface ScoreExportRow {
  studentName: string;
  cohort: string;
  className: string;
  room: string;
  testName: string;
  testDate: Date;
  rw: number | null;
  math: number | null;
  total: number;
}

export interface StudentWorkbookExportResult {
  filename: string;
  bytes: Buffer;
  sheetNames: string[];
  rows: {
    students: StudentInformationExportRow[];
    scores: ScoreExportRow[];
  };
}

export class StudentWorkbookExportPermissionError extends Error {}

export function canExportStudentWorkbooks(role: UserRole) {
  return role === "engineer" || role === "admin" || role === "staff";
}

const STUDENT_HEADERS = [
  "First Name", "Last Name", "Student Email", "Student Phone",
  "Grade", "School", "Target Test", "Focus",
  "Parent 1 Name", "Parent 1 Email", "Parent 1 Phone",
  "Parent 2 Name", "Parent 2 Email", "Parent 2 Phone",
  "Cohorts", "Registration Date",
] as const;

const SCORE_HEADERS = [
  "Student Name", "Cohort", "Class", "Room", "Test Name",
  "Test Date", "RW", "Math", "Total",
] as const;

const EASTERN_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export async function exportStudentWorkbook({
  viewer,
  scope,
  requestedTarget,
  repository = createProductionStudentWorkbookExportRepository(),
}: {
  viewer: Pick<User, "role" | "demo">;
  scope: StudentWorkbookExportScope;
  requestedTarget?: boolean;
  repository?: StudentWorkbookExportRepository;
}): Promise<StudentWorkbookExportResult> {
  const targetDemo = resolveExportTarget(viewer, requestedTarget);
  const data = await repository.loadPartition(targetDemo);
  const fieldDefinitions = data.fieldDefinitions
    .filter((definition) => definition.demo === targetDemo && definition.archived_at === null)
    .sort((left, right) => left.sort_order - right.sort_order || left.key.localeCompare(right.key));
  const studentRows = scope === "scores" ? [] : projectStudentRows(data, targetDemo);
  const scoreRows = scope === "students" ? [] : projectScoreRows(data, targetDemo);
  const sheets: XlsxSheet[] = [];

  if (scope === "students" || scope === "all") {
    sheets.push({
      name: "Student Information",
      headers: [...STUDENT_HEADERS, ...fieldDefinitions.map((definition) => definition.label)],
      rows: studentRows.map((row) => studentRowCells(row, fieldDefinitions)),
    });
  }
  if (scope === "scores" || scope === "all") {
    sheets.push({
      name: "Scores",
      headers: [...SCORE_HEADERS],
      rows: scoreRows.map(scoreRowCells),
    });
  }

  const partition = targetDemo ? "demo" : "main";
  return {
    filename: `intoprep-${partition}-export-${easternDate(new Date())}.xlsx`,
    bytes: createXlsxWorkbook(sheets),
    sheetNames: sheets.map((sheet) => sheet.name),
    rows: { students: studentRows, scores: scoreRows },
  };
}

function resolveExportTarget(
  viewer: Pick<User, "role" | "demo">,
  requestedTarget: boolean | undefined,
) {
  if (!canExportStudentWorkbooks(viewer.role)) {
    throw new StudentWorkbookExportPermissionError("You cannot export students.");
  }
  if (viewer.role === "engineer") {
    if (typeof requestedTarget !== "boolean") {
      throw new StudentWorkbookExportPermissionError(
        "Engineers must choose Demo or Main before exporting students.",
      );
    }
    return requestedTarget;
  }
  if (typeof viewer.demo !== "boolean") {
    throw new StudentWorkbookExportPermissionError("The export account partition is missing.");
  }
  return viewer.demo;
}

function projectStudentRows(
  data: StudentWorkbookExportPartitionData,
  targetDemo: boolean,
): StudentInformationExportRow[] {
  const families = new Map(
    data.families.filter((family) => family.demo === targetDemo).map((family) => [family.id, family]),
  );
  const cohorts = new Map(
    data.cohorts
      .filter((cohort) => cohort.demo === targetDemo && !cohort.is_archived)
      .map((cohort) => [cohort.id, cohort]),
  );
  const enrollmentsByStudent = groupBy(
    data.enrollments.filter((enrollment) => enrollment.demo === targetDemo),
    (enrollment) => enrollment.student_id,
  );
  const fieldDefinitions = data.fieldDefinitions
    .filter((definition) => definition.demo === targetDemo && definition.archived_at === null)
    .sort((left, right) => left.sort_order - right.sort_order || left.key.localeCompare(right.key));

  return data.students
    .filter((student) => student.demo === targetDemo)
    .sort((left, right) =>
      left.last_name.localeCompare(right.last_name) ||
      left.first_name.localeCompare(right.first_name) ||
      left.id.localeCompare(right.id),
    )
    .map((student) => {
      const family = families.get(student.family_id);
      const activeEnrollments = (enrollmentsByStudent.get(student.id) ?? []).filter(
        (enrollment) => enrollment.status === "active" && cohorts.has(enrollment.cohort_id),
      );
      const cohortNames = [...new Set(activeEnrollments.map(
        (enrollment) => cohorts.get(enrollment.cohort_id)!.name.trim(),
      ).filter(Boolean))].sort((left, right) => left.localeCompare(right));
      const registrationDate = activeEnrollments
        .map((enrollment) => enrollment.registered_at)
        .filter(isValidDateTime)
        .sort()[0];
      const customFields = parseCustomFields(student.custom_fields);

      return {
        firstName: student.first_name,
        lastName: student.last_name,
        studentEmail: student.email ?? "",
        studentPhone: student.phone ?? "",
        grade: student.grade_level,
        school: student.school,
        targetTest: student.target_test,
        focus: student.focus,
        parent1Name: family?.parent1_name ?? family?.guardian_names[0] ?? "",
        parent1Email: family?.parent1_email ?? family?.email ?? "",
        parent1Phone: family?.parent1_phone ?? family?.phone ?? "",
        parent2Name: family?.parent2_name ?? family?.guardian_names[1] ?? "",
        parent2Email: family?.parent2_email ?? "",
        parent2Phone: family?.parent2_phone ?? "",
        cohorts: cohortNames.join("; "),
        registrationDate: registrationDate ? dateOnly(registrationDate.slice(0, 10)) : null,
        customFields: Object.fromEntries(fieldDefinitions.flatMap((definition) => {
          const value = customFields[definition.key];
          return value === undefined ? [] : [[definition.key, value]];
        })),
      };
    });
}

function projectScoreRows(
  data: StudentWorkbookExportPartitionData,
  targetDemo: boolean,
): ScoreExportRow[] {
  const students = new Map(
    data.students.filter((student) => student.demo === targetDemo).map((student) => [student.id, student]),
  );
  const cohorts = new Map(
    data.cohorts
      .filter((cohort) => cohort.demo === targetDemo && !cohort.is_archived)
      .map((cohort) => [cohort.id, cohort]),
  );
  const assessments = new Map(
    data.assessments
      .filter((assessment) => assessment.demo === targetDemo && cohorts.has(assessment.cohort_id))
      .map((assessment) => [assessment.id, assessment]),
  );
  const sessionsByCohort = groupBy(
    data.sessions.filter((session) => session.demo === targetDemo && cohorts.has(session.cohort_id)),
    (session) => session.cohort_id,
  );

  return data.results
    .filter((result) => result.demo === targetDemo)
    .flatMap((result): ScoreExportRow[] => {
      const student = students.get(result.student_id);
      const assessment = assessments.get(result.assessment_id);
      if (!student || !assessment || !isIsoDate(assessment.date)) return [];
      const cohort = cohorts.get(assessment.cohort_id);
      if (!cohort) return [];
      const context = resolveSessionContext(
        sessionsByCohort.get(assessment.cohort_id) ?? [],
        assessment.date,
      );
      const sectionScores = parseSectionScores(result.section_scores);

      return [{
        studentName: `${student.first_name} ${student.last_name}`.trim(),
        cohort: cohort.name,
        className: context?.className ?? "",
        room: context?.room ?? "",
        testName: assessment.title,
        testDate: dateOnly(assessment.date),
        rw: findSectionScore(sectionScores, "rw"),
        math: findSectionScore(sectionScores, "math"),
        total: result.total_score,
      }];
    })
    .sort((left, right) =>
      left.testDate.getTime() - right.testDate.getTime() ||
      left.studentName.localeCompare(right.studentName) ||
      left.cohort.localeCompare(right.cohort) ||
      left.testName.localeCompare(right.testName),
    );
}

function studentRowCells(
  row: StudentInformationExportRow,
  fieldDefinitions: StudentWorkbookExportPartitionData["fieldDefinitions"],
): XlsxCell[] {
  return [
    row.firstName, row.lastName, row.studentEmail, row.studentPhone,
    row.grade, row.school, row.targetTest, row.focus,
    row.parent1Name, row.parent1Email, row.parent1Phone,
    row.parent2Name, row.parent2Email, row.parent2Phone,
    row.cohorts, row.registrationDate,
    ...fieldDefinitions.map((definition) => row.customFields[definition.key] ?? null),
  ];
}

function scoreRowCells(row: ScoreExportRow): XlsxCell[] {
  return [
    row.studentName, row.cohort, row.className, row.room, row.testName,
    row.testDate, row.rw, row.math, row.total,
  ];
}

function resolveSessionContext(
  sessions: StudentWorkbookExportPartitionData["sessions"],
  assessmentDate: string,
) {
  const dateContexts = uniqueContexts(sessions.filter(
    (session) => sessionDateInEastern(session.start_at) === assessmentDate,
  ));
  if (dateContexts.length === 1) return dateContexts[0];

  const cohortContexts = uniqueContexts(sessions);
  return cohortContexts.length === 1 ? cohortContexts[0] : null;
}

function uniqueContexts(sessions: StudentWorkbookExportPartitionData["sessions"]) {
  const contexts = new Map<string, { className: string; room: string }>();
  for (const session of sessions) {
    const context = { className: session.title.trim(), room: session.room_label.trim() };
    contexts.set(`${context.className}\u0000${context.room}`, context);
  }
  return [...contexts.values()];
}

function sessionDateInEastern(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? easternDate(date) : null;
}

function easternDate(date: Date) {
  const parts = EASTERN_DATE_FORMATTER.formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function dateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return dateOnly(value).toISOString().slice(0, 10) === value;
}

function isValidDateTime(value: string) {
  return Number.isFinite(new Date(value).getTime());
}

function parseCustomFields(value: unknown): Record<string, ExportCustomFieldValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(
    (entry): entry is [string, ExportCustomFieldValue] =>
      typeof entry[1] === "string" ||
      typeof entry[1] === "number" && Number.isFinite(entry[1]) ||
      typeof entry[1] === "boolean",
  ));
}

function parseSectionScores(value: unknown): Array<{ label: string; score: number }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const label = "label" in entry ? entry.label : undefined;
    const score = "score" in entry ? entry.score : undefined;
    return typeof label === "string" && typeof score === "number" && Number.isFinite(score)
      ? [{ label, score }]
      : [];
  });
}

function findSectionScore(
  scores: Array<{ label: string; score: number }>,
  component: "rw" | "math",
) {
  const aliases = component === "rw"
    ? new Set(["rw", "readingwriting"])
    : new Set(["m", "math", "mathematics"]);
  return scores.find((score) => aliases.has(normalizeSectionLabel(score.label)))?.score ?? null;
}

function normalizeSectionLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const value = key(row);
    grouped.set(value, [...(grouped.get(value) ?? []), row]);
  }
  return grouped;
}

export function createProductionStudentWorkbookExportRepository(): StudentWorkbookExportRepository {
  return {
    async loadPartition(targetDemo) {
      const { createSupabaseServiceClient } = await import("@/lib/supabase/service");
      const serviceClient = createSupabaseServiceClient();
      const [families, students, fieldDefinitions, enrollments, cohorts, sessions, assessments, results] =
        await Promise.all([
          loadAllPages((from, to) => serviceClient.from("families")
            .select("id,guardian_names,parent1_name,parent1_email,parent1_phone,parent2_name,parent2_email,parent2_phone,email,phone,demo")
            .eq("demo", targetDemo).order("id", { ascending: true }).range(from, to)),
          loadAllPages((from, to) => serviceClient.from("students")
            .select("id,family_id,first_name,last_name,email,phone,grade_level,school,target_test,focus,custom_fields,demo")
            .eq("demo", targetDemo).order("id", { ascending: true }).range(from, to)),
          loadAllPages((from, to) => serviceClient.from("student_field_definitions")
            .select("key,label,data_type,sort_order,archived_at,demo")
            .eq("demo", targetDemo).is("archived_at", null)
            .order("sort_order", { ascending: true }).order("key", { ascending: true }).range(from, to)),
          loadAllPages((from, to) => serviceClient.from("enrollments")
            .select("student_id,cohort_id,status,registered_at,demo")
            .eq("demo", targetDemo).order("id", { ascending: true }).range(from, to)),
          loadAllPages((from, to) => serviceClient.from("cohorts")
            .select("id,name,is_archived,demo")
            .eq("demo", targetDemo).eq("is_archived", false)
            .order("id", { ascending: true }).range(from, to)),
          loadAllPages((from, to) => serviceClient.from("sessions")
            .select("cohort_id,title,start_at,room_label,demo")
            .eq("demo", targetDemo).order("id", { ascending: true }).range(from, to)),
          loadAllPages((from, to) => serviceClient.from("assessments")
            .select("id,cohort_id,title,date,demo")
            .eq("demo", targetDemo).order("id", { ascending: true }).range(from, to)),
          loadAllPages((from, to) => serviceClient.from("assessment_results")
            .select("assessment_id,student_id,total_score,section_scores,demo")
            .eq("demo", targetDemo).order("id", { ascending: true }).range(from, to)),
        ]);

      return { families, students, fieldDefinitions, enrollments, cohorts, sessions, assessments, results };
    },
  };
}

async function loadAllPages<T>(
  getPage: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
) {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const result = await getPage(from, from + pageSize - 1);
    if (result.error) throw new Error(result.error.message);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
