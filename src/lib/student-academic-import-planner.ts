import { buildEasternRecurringSessions } from "@/lib/eastern-recurring-sessions";
import type { ProgramTrack } from "@/lib/domain";
import type {
  NormalizedAcademicRow,
  PlannedCampusInput,
  PlannedProgramInput,
  PlannedTermInput,
  StudentWorkbookSetup,
} from "@/lib/student-workbook-schema";

export interface ExistingAcademicStudent {
  id: string;
  first_name: string;
  last_name: string;
  demo: boolean;
}

export interface ExistingAcademicCohort {
  id: string;
  name: string;
  program_id: string;
  campus_id: string;
  term_id: string;
  capacity: number;
  cadence: string;
  cohort_mode: string;
  start_date: string | null;
  end_date: string | null;
  room_label: string;
  is_archived: boolean;
  demo: boolean;
}

export interface ExistingAcademicEnrollment {
  id: string;
  student_id: string;
  cohort_id: string;
  status: string;
  registered_at: string;
  demo: boolean;
}

export interface ExistingAcademicSession {
  id: string;
  cohort_id: string;
  title: string;
  start_at: string;
  end_at: string;
  mode: string;
  room_label: string;
  demo: boolean;
}

export interface ExistingAcademicAssessment {
  id: string;
  cohort_id: string;
  title: string;
  date: string;
  sections: unknown;
  demo: boolean;
}

export interface ExistingAcademicResult {
  id: string;
  assessment_id: string;
  student_id: string;
  total_score: number;
  section_scores: unknown;
  delta_from_previous: number;
  demo: boolean;
}

export interface AcademicProgram {
  id: string;
  name: string;
  track: string;
  format?: string;
  is_archived: boolean;
  demo: boolean;
}

export interface AcademicCampus {
  id: string;
  name: string;
  location?: string;
  modality: string;
  demo: boolean;
}

export interface AcademicTerm {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  demo: boolean;
}

export interface PlannedAcademicProgram {
  id: string;
  name: string;
  track: ProgramTrack;
  format: string;
  demo: boolean;
}

export interface PlannedAcademicCampus {
  id: string;
  name: string;
  location: string;
  modality: PlannedCampusInput["modality"];
  demo: boolean;
}

export interface PlannedAcademicTerm {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  demo: boolean;
}

export interface StudentAcademicImportPlannerInput {
  targetDemo: boolean;
  rows: readonly NormalizedAcademicRow[];
  setup: StudentWorkbookSetup;
  students: readonly ExistingAcademicStudent[];
  cohorts: readonly ExistingAcademicCohort[];
  enrollments: readonly ExistingAcademicEnrollment[];
  sessions: readonly ExistingAcademicSession[];
  assessments: readonly ExistingAcademicAssessment[];
  results: readonly ExistingAcademicResult[];
  programs: readonly AcademicProgram[];
  campuses: readonly AcademicCampus[];
  terms: readonly AcademicTerm[];
  createId: (prefix: string) => string;
}

export interface StudentAcademicImportPlan {
  rows: Array<{
    rowNumber: number;
    studentId: string | null;
    cohortId: string | null;
    actions: string[];
    scoreActions: Array<{
      assessmentTitle: string;
      assessmentDate: string;
      action: "Create assessment result." | "Update assessment result.";
    }>;
    warnings: string[];
    errors: string[];
  }>;
  requirements: {
    cohorts: string[];
    assessmentDates: Array<{ sourceClass: string; assessmentTitle: string }>;
  };
  programs: PlannedAcademicProgram[];
  campuses: PlannedAcademicCampus[];
  terms: PlannedAcademicTerm[];
  cohorts: Array<Record<string, unknown>>;
  sessions: Array<Record<string, unknown>>;
  enrollments: Array<Record<string, unknown>>;
  assessments: Array<Record<string, unknown>>;
  results: Array<Record<string, unknown>>;
  summary: {
    programs: number;
    campuses: number;
    terms: number;
    cohorts: number;
    sessions: number;
    enrollments: number;
    assessments: number;
    resultCreates: number;
    resultUpdates: number;
    errors: number;
  };
}

type PlanRow = StudentAcademicImportPlan["rows"][number];

interface CohortGroup {
  sourceClass: string;
  rows: number[];
  sessionTitle: string;
  roomLabel: string;
  cohortId: string | null;
  registrationDate: string | null;
}

type CatalogIssue =
  | { kind: "duplicate"; name: string }
  | { kind: "conflict"; name: string };

interface CatalogResolution<T> {
  value: T | null;
  issue: CatalogIssue | null;
}

const MAX_IMPORT_SESSIONS = 1_000;
const ASSESSMENT_SECTIONS = [
  { label: "RW", score: 800 },
  { label: "Math", score: 800 },
];

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function display(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function sourceCohortLabel(sourceClass: string): string {
  return `Source cohort (Excel Class) "${display(sourceClass)}"`;
}

function inTargetPartition(record: { demo: boolean }, targetDemo: boolean): boolean {
  return record.demo === targetDemo;
}

function addUnique(values: string[], value: string) {
  if (!values.includes(value)) values.push(value);
}

function addRowError(row: PlanRow, error: string) {
  addUnique(row.errors, error);
}

function addGroupError(group: CohortGroup, rows: PlanRow[], error: string) {
  for (const index of group.rows) addRowError(rows[index], error);
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leapYear ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function daysSinceUnixEpoch(year: number, month: number, day: number): number {
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const adjustedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * adjustedMonth + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

function timestampMicros(value: string): bigint | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === "Z" ? 0 : Number(match[10]);
  const offsetMinute = match[8] === "Z" ? 0 : Number(match[11]);
  if (year < 1 || month < 1 || month > 12 ||
      day < 1 || day > daysInMonth(year, month) ||
      hour > 23 || minute > 59 || second > 59 ||
      offsetHour > 23 || offsetMinute > 59) {
    return null;
  }

  const fractionalMicros = BigInt((match[7] ?? "").padEnd(6, "0") || "0");
  const localSeconds = BigInt(daysSinceUnixEpoch(year, month, day)) * BigInt(86_400) +
    BigInt(hour * 3_600 + minute * 60 + second);
  const offsetDirection = match[9] === "-" ? -1 : 1;
  const offsetSeconds = BigInt(offsetDirection * (offsetHour * 3_600 + offsetMinute * 60));
  return (localSeconds - offsetSeconds) * BigInt(1_000_000) + fractionalMicros;
}

function sameTimestampInstant(left: string, right: string): boolean {
  const leftInstant = timestampMicros(left);
  const rightInstant = timestampMicros(right);
  return leftInstant !== null && rightInstant !== null && leftInstant === rightInstant;
}

function sameSession(
  existing: ExistingAcademicSession,
  desired: { cohortId: string; title: string; startAt: string; endAt: string; roomLabel: string },
): boolean {
  return existing.cohort_id === desired.cohortId &&
    normalized(existing.title) === normalized(desired.title) &&
    sameTimestampInstant(existing.start_at, desired.startAt) &&
    sameTimestampInstant(existing.end_at, desired.endAt) &&
    normalized(existing.room_label) === normalized(desired.roomLabel);
}

function setupForClass(setup: StudentWorkbookSetup, sourceClass: string) {
  return setup.cohorts.filter(
    (entry) => normalized(entry.sourceClass) === normalized(sourceClass),
  );
}

function referencedDraftKeys(
  setup: StudentWorkbookSetup,
  sourceClasses: ReadonlySet<string>,
  field: "programDraftKey" | "campusDraftKey" | "termDraftKey",
): Set<string> {
  return new Set(setup.cohorts
    .filter((entry) => !entry.selectedCohortId && sourceClasses.has(normalized(entry.sourceClass)))
    .map((entry) => entry[field])
    .filter((key): key is string => Boolean(key)));
}

function ambiguousSetupClasses(
  setup: StudentWorkbookSetup,
  sourceClasses: ReadonlySet<string>,
): Set<string> {
  const counts = new Map<string, number>();
  for (const entry of setup.cohorts) {
    const sourceClass = normalized(entry.sourceClass);
    if (!sourceClasses.has(sourceClass)) continue;
    counts.set(sourceClass, (counts.get(sourceClass) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([sourceClass]) => sourceClass));
}

function duplicateDraftNames<T extends { key: string; name: string }>(
  drafts: readonly T[],
): Map<string, string> {
  const names = new Map<string, T[]>();
  for (const draft of drafts) {
    const key = normalized(draft.name);
    names.set(key, [...(names.get(key) ?? []), draft]);
  }
  const duplicates = new Map<string, string>();
  for (const matching of names.values()) {
    if (matching.length < 2) continue;
    const canonicalName = display(matching[0].name);
    matching.forEach((draft) => duplicates.set(draft.key, canonicalName));
  }
  return duplicates;
}

function programMaterialMatches(existing: AcademicProgram, draft: PlannedProgramInput): boolean {
  return !existing.is_archived && existing.track === draft.track &&
    normalized(existing.format ?? "") === normalized(draft.format);
}

function campusMaterialMatches(existing: AcademicCampus, draft: PlannedCampusInput): boolean {
  return existing.modality === draft.modality &&
    normalized(existing.location ?? "") === normalized(draft.location);
}

function termMaterialMatches(existing: AcademicTerm, draft: PlannedTermInput): boolean {
  return existing.start_date === draft.startDate && existing.end_date === draft.endDate;
}

function resolveProgramDrafts(input: {
  drafts: readonly PlannedProgramInput[];
  referencedKeys: ReadonlySet<string>;
  existing: readonly AcademicProgram[];
  targetDemo: boolean;
  createId: (prefix: string) => string;
  output: PlannedAcademicProgram[];
}): Map<string, CatalogResolution<AcademicProgram | PlannedAcademicProgram>> {
  const drafts = input.drafts.filter((draft) => input.referencedKeys.has(draft.key));
  const duplicates = duplicateDraftNames(drafts);
  const resolutions = new Map<string, CatalogResolution<AcademicProgram | PlannedAcademicProgram>>();
  for (const draft of drafts) {
    const duplicateName = duplicates.get(draft.key);
    if (duplicateName) {
      resolutions.set(draft.key, {
        value: null,
        issue: { kind: "duplicate", name: duplicateName },
      });
      continue;
    }
    const matching = input.existing.filter((record) =>
      normalized(record.name) === normalized(draft.name),
    );
    if (matching.length === 1 && programMaterialMatches(matching[0], draft)) {
      resolutions.set(draft.key, { value: matching[0], issue: null });
      continue;
    }
    if (matching.length > 0) {
      resolutions.set(draft.key, {
        value: null,
        issue: { kind: "conflict", name: display(draft.name) },
      });
      continue;
    }
    const planned: PlannedAcademicProgram = {
      id: input.createId("program"),
      name: display(draft.name),
      track: draft.track,
      format: display(draft.format),
      demo: input.targetDemo,
    };
    input.output.push(planned);
    resolutions.set(draft.key, { value: planned, issue: null });
  }
  return resolutions;
}

function resolveCampusDrafts(input: {
  drafts: readonly PlannedCampusInput[];
  referencedKeys: ReadonlySet<string>;
  existing: readonly AcademicCampus[];
  targetDemo: boolean;
  createId: (prefix: string) => string;
  output: PlannedAcademicCampus[];
}): Map<string, CatalogResolution<AcademicCampus | PlannedAcademicCampus>> {
  const drafts = input.drafts.filter((draft) => input.referencedKeys.has(draft.key));
  const duplicates = duplicateDraftNames(drafts);
  const resolutions = new Map<string, CatalogResolution<AcademicCampus | PlannedAcademicCampus>>();
  for (const draft of drafts) {
    const duplicateName = duplicates.get(draft.key);
    if (duplicateName) {
      resolutions.set(draft.key, {
        value: null,
        issue: { kind: "duplicate", name: duplicateName },
      });
      continue;
    }
    const matching = input.existing.filter((record) =>
      normalized(record.name) === normalized(draft.name),
    );
    if (matching.length === 1 && campusMaterialMatches(matching[0], draft)) {
      resolutions.set(draft.key, { value: matching[0], issue: null });
      continue;
    }
    if (matching.length > 0) {
      resolutions.set(draft.key, {
        value: null,
        issue: { kind: "conflict", name: display(draft.name) },
      });
      continue;
    }
    const planned: PlannedAcademicCampus = {
      id: input.createId("campus"),
      name: display(draft.name),
      location: display(draft.location),
      modality: draft.modality,
      demo: input.targetDemo,
    };
    input.output.push(planned);
    resolutions.set(draft.key, { value: planned, issue: null });
  }
  return resolutions;
}

function resolveTermDrafts(input: {
  drafts: readonly PlannedTermInput[];
  referencedKeys: ReadonlySet<string>;
  existing: readonly AcademicTerm[];
  targetDemo: boolean;
  createId: (prefix: string) => string;
  output: PlannedAcademicTerm[];
}): Map<string, CatalogResolution<AcademicTerm | PlannedAcademicTerm>> {
  const drafts = input.drafts.filter((draft) => input.referencedKeys.has(draft.key));
  const duplicates = duplicateDraftNames(drafts);
  const resolutions = new Map<string, CatalogResolution<AcademicTerm | PlannedAcademicTerm>>();
  for (const draft of drafts) {
    const duplicateName = duplicates.get(draft.key);
    if (duplicateName) {
      resolutions.set(draft.key, {
        value: null,
        issue: { kind: "duplicate", name: duplicateName },
      });
      continue;
    }
    const matching = input.existing.filter((record) =>
      normalized(record.name) === normalized(draft.name),
    );
    if (matching.length === 1 && termMaterialMatches(matching[0], draft)) {
      resolutions.set(draft.key, { value: matching[0], issue: null });
      continue;
    }
    if (matching.length > 0) {
      resolutions.set(draft.key, {
        value: null,
        issue: { kind: "conflict", name: display(draft.name) },
      });
      continue;
    }
    const planned: PlannedAcademicTerm = {
      id: input.createId("term"),
      name: display(draft.name),
      start_date: draft.startDate,
      end_date: draft.endDate,
      demo: input.targetDemo,
    };
    input.output.push(planned);
    resolutions.set(draft.key, { value: planned, issue: null });
  }
  return resolutions;
}

function catalogIssueError(
  noun: "Program" | "Campus" | "Term",
  issue: CatalogIssue,
  sourceClass: string,
  targetLabel: string,
): string {
  if (issue.kind === "duplicate") {
    return `More than one planned ${noun} uses the name "${issue.name}" for ${sourceCohortLabel(sourceClass)}. Reuse one draft.`;
  }
  return `${noun} draft "${issue.name}" conflicts with an existing ${targetLabel} ${noun} with the same name for ${sourceCohortLabel(sourceClass)}.`;
}

function resolveCatalogReference<T extends { id: string }>(input: {
  noun: "Program" | "Campus" | "Term";
  existingId?: string;
  draftKey?: string;
  existing: readonly T[];
  drafts: ReadonlyMap<string, CatalogResolution<T>>;
  sourceClass: string;
  targetLabel: string;
}): { value: T | null; error: string | null } {
  if (input.existingId) {
    return {
      value: input.existing.find((record) => record.id === input.existingId) ?? null,
      error: null,
    };
  }
  if (!input.draftKey) return { value: null, error: null };
  const resolution = input.drafts.get(input.draftKey);
  if (!resolution) {
    return {
      value: null,
      error: `${input.noun} draft key "${input.draftKey}" is unavailable for ${sourceCohortLabel(input.sourceClass)}.`,
    };
  }
  return {
    value: resolution.value,
    error: resolution.issue
      ? catalogIssueError(
          input.noun,
          resolution.issue,
          input.sourceClass,
          input.targetLabel,
        )
      : null,
  };
}

function dateForScore(input: {
  setup: StudentWorkbookSetup;
  sourceClass: string;
  assessmentTitle: string;
}): { date: string | null; error: string | null } {
  const matchingDates = input.setup.assessmentDates
    .filter((entry) =>
      normalized(entry.sourceClass) === normalized(input.sourceClass) &&
      normalized(entry.assessmentTitle) === normalized(input.assessmentTitle),
    )
    .map((entry) => entry.date);
  if (matchingDates.some((date) => !validIsoDate(date))) {
    return {
      date: null,
      error: `Assessment date for "${display(input.assessmentTitle)}" is invalid.`,
    };
  }
  const dates = [...new Set(matchingDates)];
  if (dates.length === 0) return { date: null, error: null };
  if (dates.length > 1) {
    return {
      date: null,
      error: `Assessment dates conflict for ${sourceCohortLabel(input.sourceClass)} and "${display(input.assessmentTitle)}".`,
    };
  }
  return { date: dates[0], error: null };
}

export function buildStudentAcademicImportPlan(
  input: StudentAcademicImportPlannerInput,
): StudentAcademicImportPlan {
  const rows: PlanRow[] = input.rows.map((row) => ({
    rowNumber: row.rowNumber,
    studentId: null,
    cohortId: null,
    actions: [],
    scoreActions: [],
    warnings: row.scores.flatMap((score) => score.warnings),
    errors: [...row.errors],
  }));
  const targetLabel = input.targetDemo ? "Demo" : "Main";
  const students = input.students.filter((row) => row.demo === input.targetDemo);
  const cohorts = input.cohorts.filter(
    (row) => row.demo === input.targetDemo && !row.is_archived,
  );
  const enrollments = input.enrollments.filter((row) => row.demo === input.targetDemo);
  const sessions = input.sessions.filter((row) => row.demo === input.targetDemo);
  const assessments = input.assessments.filter((row) => row.demo === input.targetDemo);
  const results = input.results.filter((row) => row.demo === input.targetDemo);
  const programs = input.programs.filter((row) => inTargetPartition(row, input.targetDemo));
  const campuses = input.campuses.filter((row) => inTargetPartition(row, input.targetDemo));
  const terms = input.terms.filter((row) => inTargetPartition(row, input.targetDemo));
  const outputPrograms: PlannedAcademicProgram[] = [];
  const outputCampuses: PlannedAcademicCampus[] = [];
  const outputTerms: PlannedAcademicTerm[] = [];
  const outputCohorts: Array<Record<string, unknown>> = [];
  const outputSessions: Array<Record<string, unknown>> = [];
  const outputEnrollments: Array<Record<string, unknown>> = [];
  const outputAssessments: Array<Record<string, unknown>> = [];
  const outputResults: Array<Record<string, unknown>> = [];
  const requirements: StudentAcademicImportPlan["requirements"] = {
    cohorts: [],
    assessmentDates: [],
  };
  const catalog = input.setup.catalog ?? { programs: [], campuses: [], terms: [] };
  const sourceClasses = new Set(input.rows.map((row) => normalized(row.cohortName)));
  const ambiguousSetups = ambiguousSetupClasses(input.setup, sourceClasses);
  const resolvableSourceClasses = new Set(
    [...sourceClasses].filter((sourceClass) => !ambiguousSetups.has(sourceClass)),
  );
  const programDrafts = resolveProgramDrafts({
    drafts: catalog.programs,
    referencedKeys: referencedDraftKeys(input.setup, resolvableSourceClasses, "programDraftKey"),
    existing: programs,
    targetDemo: input.targetDemo,
    createId: input.createId,
    output: outputPrograms,
  });
  const campusDrafts = resolveCampusDrafts({
    drafts: catalog.campuses,
    referencedKeys: referencedDraftKeys(input.setup, resolvableSourceClasses, "campusDraftKey"),
    existing: campuses,
    targetDemo: input.targetDemo,
    createId: input.createId,
    output: outputCampuses,
  });
  const termDrafts = resolveTermDrafts({
    drafts: catalog.terms,
    referencedKeys: referencedDraftKeys(input.setup, resolvableSourceClasses, "termDraftKey"),
    existing: terms,
    targetDemo: input.targetDemo,
    createId: input.createId,
    output: outputTerms,
  });

  const groupsByName = new Map<string, CohortGroup>();
  input.rows.forEach((row, index) => {
    const key = normalized(row.cohortName);
    if (!key) {
      addRowError(rows[index], "Source cohort (Excel Class) is required for academic import.");
      return;
    }
    const group = groupsByName.get(key) ?? {
      sourceClass: row.cohortName,
      rows: [],
      sessionTitle: "",
      roomLabel: "",
      cohortId: null,
      registrationDate: null,
    };
    group.rows.push(index);
    groupsByName.set(key, group);
  });

  let generatedSessionCount = 0;
  for (const group of groupsByName.values()) {
    if (ambiguousSetups.has(normalized(group.sourceClass))) {
      addUnique(requirements.cohorts, group.sourceClass);
      addGroupError(
        group,
        rows,
        `More than one setup entry matches ${sourceCohortLabel(group.sourceClass)}. Keep one cohort setup.`,
      );
      continue;
    }
    const titles = [...new Map(group.rows
      .map((index) => input.rows[index].sessionTitle)
      .map((value) => [normalized(value), value])).values()];
    const rooms = [...new Map(group.rows
      .map((index) => input.rows[index].roomLabel)
      .map((value) => [normalized(value), value])).values()];
    if (
      titles.length !== 1 || !normalized(titles[0]) ||
      rooms.length !== 1 || !normalized(rooms[0])
    ) {
      addGroupError(
        group,
        rows,
        `${sourceCohortLabel(group.sourceClass)} has conflicting Level or Room values.`,
      );
      continue;
    }
    group.sessionTitle = titles[0];
    group.roomLabel = rooms[0];

    const classSetup = setupForClass(input.setup, group.sourceClass);
    const selectedId = classSetup.map((entry) => entry.selectedCohortId).find(Boolean);
    const matchingCohorts = cohorts.filter(
      (cohort) => normalized(cohort.name) === normalized(group.sourceClass),
    );
    let resolvedCohort: ExistingAcademicCohort | null = null;
    let newCohort: Record<string, unknown> | null = null;
    let term: AcademicTerm | PlannedAcademicTerm | null = null;

    if (selectedId) {
      resolvedCohort = matchingCohorts.find((cohort) => cohort.id === selectedId) ?? null;
      if (!resolvedCohort) {
        addGroupError(
          group,
          rows,
          `selectedCohortId does not identify an active ${targetLabel} cohort for ${sourceCohortLabel(group.sourceClass)}.`,
        );
        continue;
      }
    } else if (matchingCohorts.length > 1) {
      addUnique(requirements.cohorts, group.sourceClass);
      addGroupError(
        group,
        rows,
        `More than one ${targetLabel} cohort matches ${sourceCohortLabel(group.sourceClass)}. Choose selectedCohortId.`,
      );
      continue;
    } else if (matchingCohorts.length === 1) {
      resolvedCohort = matchingCohorts[0];
    }

    if (resolvedCohort) {
      const program = programs.find(
        (candidate) => candidate.id === resolvedCohort!.program_id,
      );
      const campus = campuses.find(
        (candidate) => candidate.id === resolvedCohort!.campus_id,
      );
      term = terms.find((candidate) => candidate.id === resolvedCohort!.term_id) ?? null;
      if (!program || !campus || !term) {
        addGroupError(
          group,
          rows,
          `The selected cohort catalog is unavailable for ${sourceCohortLabel(group.sourceClass)}.`,
        );
        continue;
      }
      group.cohortId = resolvedCohort.id;
    } else {
      const completeSetup = classSetup.find((entry) =>
        (entry.programId || entry.programDraftKey) &&
        (entry.campusId || entry.campusDraftKey) &&
        (entry.termId || entry.termDraftKey) &&
        entry.capacity,
      );
      if (!completeSetup) {
        addUnique(requirements.cohorts, group.sourceClass);
        addGroupError(
          group,
          rows,
          `Cohort setup is required for ${sourceCohortLabel(group.sourceClass)}.`,
        );
        continue;
      }
      const programResolution = resolveCatalogReference({
        noun: "Program",
        existingId: completeSetup.programId,
        draftKey: completeSetup.programDraftKey,
        existing: programs.filter((program) => !program.is_archived),
        drafts: programDrafts,
        sourceClass: group.sourceClass,
        targetLabel,
      });
      const campusResolution = resolveCatalogReference({
        noun: "Campus",
        existingId: completeSetup.campusId,
        draftKey: completeSetup.campusDraftKey,
        existing: campuses,
        drafts: campusDrafts,
        sourceClass: group.sourceClass,
        targetLabel,
      });
      const termResolution = resolveCatalogReference({
        noun: "Term",
        existingId: completeSetup.termId,
        draftKey: completeSetup.termDraftKey,
        existing: terms,
        drafts: termDrafts,
        sourceClass: group.sourceClass,
        targetLabel,
      });
      const catalogError = programResolution.error ?? campusResolution.error ?? termResolution.error;
      if (catalogError) {
        addUnique(requirements.cohorts, group.sourceClass);
        addGroupError(group, rows, catalogError);
        continue;
      }
      const program = programResolution.value;
      const selectedCampus = campusResolution.value;
      term = termResolution.value;
      if (!program || !selectedCampus || !term) {
        addUnique(requirements.cohorts, group.sourceClass);
        addGroupError(
          group,
          rows,
          `Cohort setup references unavailable metadata for ${sourceCohortLabel(group.sourceClass)}.`,
        );
        continue;
      }
      group.cohortId = input.createId("cohort");
      newCohort = {
        id: group.cohortId,
        name: group.sourceClass,
        program_id: program.id,
        campus_id: selectedCampus.id,
        term_id: term.id,
        capacity: completeSetup.capacity,
        cadence: group.sourceClass.trim().toUpperCase(),
        cohort_mode: "In person",
        start_date: term.start_date,
        end_date: term.end_date,
        room_label: group.roomLabel,
        is_archived: false,
        demo: input.targetDemo,
      };
    }

    const startDate = resolvedCohort?.start_date || term.start_date;
    const endDate = resolvedCohort?.end_date || term.end_date;
    let recurrences;
    try {
      recurrences = buildEasternRecurringSessions({
        cadence: resolvedCohort?.cadence ?? group.sourceClass,
        startDate,
        endDate,
      });
    } catch (error) {
      addGroupError(
        group,
        rows,
        error instanceof Error ? error.message : "Recurring sessions could not be planned.",
      );
      group.cohortId = null;
      continue;
    }
    if (generatedSessionCount + recurrences.length > MAX_IMPORT_SESSIONS) {
      addGroupError(group, rows, `An import cannot plan more than ${MAX_IMPORT_SESSIONS.toLocaleString("en-US")} sessions.`);
      group.cohortId = null;
      continue;
    }
    generatedSessionCount += recurrences.length;
    group.registrationDate = startDate;
    if (newCohort) outputCohorts.push(newCohort);

    for (const recurrence of recurrences) {
      const desired = {
        cohortId: group.cohortId,
        title: group.sessionTitle,
        startAt: recurrence.startAt,
        endAt: recurrence.endAt,
        roomLabel: group.roomLabel,
      };
      if (sessions.some((session) => sameSession(session, desired))) continue;
      outputSessions.push({
        id: input.createId("session"),
        cohort_id: group.cohortId,
        title: group.sessionTitle,
        start_at: recurrence.startAt,
        end_at: recurrence.endAt,
        mode: "In person",
        room_label: group.roomLabel,
        demo: input.targetDemo,
      });
    }
  }

  const requirementKeys = new Set<string>();
  input.rows.forEach((row) => {
    for (const score of row.scores) {
      const resolution = dateForScore({
        setup: input.setup,
        sourceClass: row.cohortName,
        assessmentTitle: score.assessmentTitle,
      });
      if (resolution.date || resolution.error) continue;
      const key = `${normalized(row.cohortName)}\0${normalized(score.assessmentTitle)}`;
      if (requirementKeys.has(key)) continue;
      requirementKeys.add(key);
      requirements.assessmentDates.push({
        sourceClass: groupsByName.get(normalized(row.cohortName))?.sourceClass ?? row.cohortName,
        assessmentTitle: score.assessmentTitle,
      });
    }
  });

  const plannedEnrollments = new Map<string, Record<string, unknown>>();
  const plannedAssessments = new Map<string, { id: string }>();
  const plannedResults = new Map<string, Record<string, unknown>>();
  const resultUpdateKeys = new Set<string>();

  input.rows.forEach((academicRow, index) => {
    const planRow = rows[index];
    const group = groupsByName.get(normalized(academicRow.cohortName));
    planRow.cohortId = group?.cohortId ?? null;
    if (planRow.errors.length > 0 || !group?.cohortId || !group.registrationDate) return;

    const sourceStudentName = display(academicRow.studentName);
    if (!normalized(sourceStudentName)) {
      addRowError(planRow, "Student Name is required for academic import.");
      return;
    }
    const matchingStudents = students.filter(
      (student) => normalized(`${student.first_name} ${student.last_name}`) === normalized(sourceStudentName),
    );
    if (matchingStudents.length === 0) {
      addRowError(planRow, `No ${targetLabel} student exactly matches "${sourceStudentName}".`);
      return;
    }
    if (matchingStudents.length > 1) {
      addRowError(
        planRow,
        `More than one ${targetLabel} student exactly matches "${sourceStudentName}". Disambiguate the directory data.`,
      );
      return;
    }
    const student = matchingStudents[0];
    planRow.studentId = student.id;

    const enrollmentKey = `${student.id}\0${group.cohortId}`;
    const existingEnrollments = enrollments.filter(
      (enrollment) => enrollment.student_id === student.id && enrollment.cohort_id === group.cohortId,
    );
    if (existingEnrollments.length > 1) {
      addRowError(planRow, "More than one enrollment matches this student and cohort.");
      return;
    }
    const existingEnrollment = existingEnrollments[0];
    if (!existingEnrollment || normalized(existingEnrollment.status) !== "active") {
      if (!plannedEnrollments.has(enrollmentKey)) {
        const payload = existingEnrollment
          ? { ...existingEnrollment, status: "active", demo: input.targetDemo }
          : {
              id: input.createId("enrollment"),
              student_id: student.id,
              cohort_id: group.cohortId,
              status: "active",
              registered_at: group.registrationDate,
              demo: input.targetDemo,
            };
        plannedEnrollments.set(enrollmentKey, payload);
        outputEnrollments.push(payload);
      }
      addUnique(planRow.actions, "Activate cohort enrollment.");
    } else {
      addUnique(planRow.actions, "Reuse active cohort enrollment.");
    }

    for (const score of academicRow.scores) {
      const dateResolution = dateForScore({
        setup: input.setup,
        sourceClass: academicRow.cohortName,
        assessmentTitle: score.assessmentTitle,
      });
      if (dateResolution.error) {
        addRowError(planRow, dateResolution.error);
        continue;
      }
      if (!dateResolution.date) {
        addRowError(
          planRow,
          `Assessment date is required for ${sourceCohortLabel(group.sourceClass)} and "${display(score.assessmentTitle)}".`,
        );
        continue;
      }

      const assessmentKey = `${group.cohortId}\0${normalized(score.assessmentTitle)}\0${dateResolution.date}`;
      let assessment = plannedAssessments.get(assessmentKey);
      if (!assessment) {
        const matchingAssessments = assessments.filter((candidate) =>
          candidate.cohort_id === group.cohortId &&
          normalized(candidate.title) === normalized(score.assessmentTitle) &&
          candidate.date === dateResolution.date,
        );
        if (matchingAssessments.length > 1) {
          addRowError(planRow, "More than one assessment matches this cohort, title, and date.");
          continue;
        }
        if (matchingAssessments.length === 1) {
          assessment = { id: matchingAssessments[0].id };
        } else {
          const id = input.createId("assessment");
          const payload = {
            id,
            cohort_id: group.cohortId,
            title: score.assessmentTitle,
            date: dateResolution.date,
            sections: ASSESSMENT_SECTIONS.map((section) => ({ ...section })),
            demo: input.targetDemo,
          };
          assessment = { id };
          outputAssessments.push(payload);
        }
        plannedAssessments.set(assessmentKey, assessment);
      }

      const resultKey = `${assessment.id}\0${student.id}`;
      const resultPayload = {
        id: `${assessment.id}:${student.id}`,
        assessment_id: assessment.id,
        student_id: student.id,
        total_score: score.total,
        section_scores: [
          { label: "RW", score: score.rw },
          { label: "Math", score: score.math },
        ],
        delta_from_previous: 0,
        demo: input.targetDemo,
      };
      const priorPlannedResult = plannedResults.get(resultKey);
      if (priorPlannedResult) {
        if (
          priorPlannedResult.total_score !== resultPayload.total_score ||
          JSON.stringify(priorPlannedResult.section_scores) !== JSON.stringify(resultPayload.section_scores)
        ) {
          addRowError(planRow, "The workbook contains conflicting scores for this student and assessment.");
        }
        continue;
      }
      const matchingResults = results.filter(
        (candidate) => candidate.assessment_id === assessment.id && candidate.student_id === student.id,
      );
      if (matchingResults.length > 1) {
        addRowError(planRow, "More than one result matches this student and assessment.");
        continue;
      }
      if (matchingResults.length === 1) {
        resultPayload.id = matchingResults[0].id;
        resultUpdateKeys.add(resultKey);
        addUnique(planRow.actions, "Update assessment result.");
        planRow.scoreActions.push({
          assessmentTitle: score.assessmentTitle,
          assessmentDate: dateResolution.date,
          action: "Update assessment result.",
        });
      } else {
        addUnique(planRow.actions, "Create assessment result.");
        planRow.scoreActions.push({
          assessmentTitle: score.assessmentTitle,
          assessmentDate: dateResolution.date,
          action: "Create assessment result.",
        });
      }
      plannedResults.set(resultKey, resultPayload);
      outputResults.push(resultPayload);
    }
  });

  return {
    rows,
    requirements,
    programs: outputPrograms,
    campuses: outputCampuses,
    terms: outputTerms,
    cohorts: outputCohorts,
    sessions: outputSessions,
    enrollments: outputEnrollments,
    assessments: outputAssessments,
    results: outputResults,
    summary: {
      programs: outputPrograms.length,
      campuses: outputCampuses.length,
      terms: outputTerms.length,
      cohorts: outputCohorts.length,
      sessions: outputSessions.length,
      enrollments: outputEnrollments.length,
      assessments: outputAssessments.length,
      resultCreates: outputResults.length - resultUpdateKeys.size,
      resultUpdates: resultUpdateKeys.size,
      errors: rows.filter((row) => row.errors.length > 0).length,
    },
  };
}
