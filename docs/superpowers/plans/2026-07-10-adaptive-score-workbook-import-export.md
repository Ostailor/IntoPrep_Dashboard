# Adaptive Score Workbook Import and Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import screenshot-style student/score workbooks into partition-safe cohorts, classes, enrollments, assessments, and results, then export the directory and scores as separate sheets or one combined workbook.

**Architecture:** Extend the current server-reparsed student import pipeline with workbook profile detection, a separate academic mapping/normalization layer, and a pure academic planner. Keep the existing simple importer intact, commit expanded work through a new service-only `SECURITY INVOKER` RPC that calls the proven directory RPC inside the same transaction, and generate normalized `.xlsx` exports with a small internal OpenXML writer so no production dependency is added.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Supabase/Postgres, `read-excel-file` 9.2.0, Node buffers, `@oai/artifact-tool` for test-fixture authoring and visual workbook verification, Playwright/Chrome browser access for E2E verification.

## Global Constraints

- Preserve exact spreadsheet `Class` values as cohort names; do not invent abbreviations.
- Excel `Level` is the website class/session title; Excel `Room` is the classroom.
- Supported cadences are MWF (Monday/Wednesday/Friday) and TTHS (Tuesday/Thursday/Saturday), 8:00 AM-3:30 PM in `America/New_York`.
- Assessment dates are required once per distinct cohort and combined test title.
- Scores remain in `assessments` and `assessment_results`, never `students.custom_fields`.
- Match score rows by exact normalized student name; zero or multiple matches block the row.
- Blank Total is `RW + Math`; a supplied Total that differs blocks commit.
- A commit is atomic across directory, cohort, session, enrollment, assessment, result, and audit writes.
- Demo and main are separate tenant partitions. The spreadsheet cannot select the partition; authenticated role rules do.
- Engineers retain cross-partition troubleshooting access but must explicitly select Demo or Main for every preview, commit, and export.
- Test uploads use only demo data. Main data is read-only and must have identical counts/fingerprints before and after E2E testing.
- Keep the current simple `.xlsx`/`.csv` student import working.
- Do not add a production dependency. Use the bundled spreadsheet runtime only for fixture creation/visual QA, not application runtime.
- Do not change QuickBooks code or its intentionally untouched legacy test expectation.
- Use additive Supabase migrations; never reset, truncate, reseed, or broadly delete production.
- Work with the existing dirty tree; stage and commit only files belonging to the current task.

## Baseline Evidence

- On 2026-07-10, focused import verification passed: 4 files and 51 tests.
- Live project `uhtcbipwivvocbndxjqi` had zero session/cohort, assessment/cohort, result/assessment, and result/student demo mismatches.
- Live natural-key preflight had zero duplicate cohort, session, and assessment groups.
- Current Supabase documentation still recommends `SECURITY INVOKER`, explicit function privilege revocation, RLS on exposed tables, and service keys only on trusted server paths.

## File Structure

### Create

- `src/lib/student-workbook-profile.ts` — detects simple, wide, and normalized workbook layouts and reconstructs header paths.
- `src/lib/student-workbook-schema.ts` — academic/context mappings, score aliases, setup payloads, score normalization, and strict request parsing helpers.
- `src/lib/eastern-recurring-sessions.ts` — deterministic Eastern-Time MWF/TTHS recurrence generation.
- `src/lib/student-academic-import-planner.ts` — exact-name matching plus cohort/session/enrollment/assessment/result planning.
- `src/lib/xlsx-workbook.ts` — minimal dependency-free OpenXML/ZIP workbook writer.
- `src/lib/student-workbook-export.ts` — partition-scoped export projection and workbook construction.
- `src/components/portal/student-import-academic-setup.tsx` — missing-cohort and cohort/test-date inputs.
- `src/components/portal/student-import-preview-tabs.tsx` — directory, cohort/class, enrollment, and score preview sections.
- `src/components/portal/student-workbook-export-actions.tsx` — three export actions and engineer target selection.
- `src/app/api/students/export/route.ts` — authenticated `.xlsx` download endpoint.
- `src/test/student-workbook-profile.test.ts` — profile/header reconstruction tests.
- `src/test/student-workbook-schema.test.ts` — score mapping/normalization tests.
- `src/test/eastern-recurring-sessions.test.ts` — recurrence and DST tests.
- `src/test/student-academic-import-planner.test.ts` — academic planning/idempotency tests.
- `src/test/xlsx-workbook.test.ts` — two-sheet writer compatibility tests.
- `src/test/student-workbook-export.test.ts` — export projection/partition tests.
- `src/test/fixtures/adaptive-score-import.xlsx` — sanitized merged-header fixture created with `@oai/artifact-tool`.
- The exact migration path printed by `npm run db:new -- adaptive_student_score_workbook_import` — additive keys, audit columns, relationships, and workbook RPC. Do not invent its timestamp.

### Modify

- `src/lib/student-spreadsheet.ts` — retain all worksheet matrices instead of discarding pre-header rows.
- `src/lib/student-import-schema.ts` — expose reusable student alias lookup without changing simple mappings.
- `src/lib/student-import-operations.ts` — profile-aware preview/commit orchestration and expanded repository data.
- `src/lib/student-import-request.ts` — bounded structured mapping/setup multipart fields.
- `src/lib/student-import-planner.ts` — no score logic; only small compatibility changes if structured mapping types require them.
- `src/app/api/students/import/preview/route.ts` — parse structured mapping/setup values.
- `src/app/api/students/import/commit/route.ts` — require the reviewed mapping/setup snapshot.
- `src/components/portal/student-import-panel.tsx` — orchestrate profile-specific mapping/setup/preview without absorbing all new markup.
- `src/components/portal/student-cohort-assignment-panel.tsx` — display import and export actions together.
- `src/lib/supabase/database.types.ts` — new import-run fields and workbook RPC signature.
- `src/test/student-spreadsheet.test.ts` — raw-sheet and actual wide-fixture coverage.
- `src/test/student-import-schema.test.ts` — alias-registry regression coverage.
- `src/test/student-import-operations.test.ts` — profile-aware planning, reparse, and transaction payload tests.
- `src/test/student-import-routes.test.ts` — strict multipart validation for mapping/setup snapshots.
- `src/test/student-import-planner.test.ts` — simple-import regression coverage only.
- `docs/HANDOFF.md` — new workbook workflow, export actions, and E2E cleanup procedure.

---

### Task 1: Preserve Raw Workbook Structure and Detect Profiles

**Files:**
- Create: `src/lib/student-workbook-profile.ts`
- Create: `src/test/student-workbook-profile.test.ts`
- Modify: `src/lib/student-spreadsheet.ts`
- Modify: `src/test/student-spreadsheet.test.ts`

**Interfaces:**
- Produces: `StudentWorkbookSheet`, `NumberedSpreadsheetRow`, `DetectedStudentWorkbook`, and `detectStudentWorkbook()`.
- Consumed by: Tasks 2, 4, and 10.

- [ ] **Step 1: Add failing raw-sheet regression tests**

Add a test proving the decoder retains title/header rows and all worksheet names:

```ts
const result = await readStudentSpreadsheet({
  filename: "adaptive-score-import.xlsx",
  bytes: await readFile(fixturePath),
});

expect(result.sheetNames).toContain("Camp Scores");
expect(result.sheets[0]?.rows[0]?.cells[0]).toBe("SAT Summer Camp 2026");
expect(result.sheets[0]?.rows.some((row) => row.cells.includes("HW1"))).toBe(true);
```

- [ ] **Step 2: Run the decoder test and verify the expected failure**

Run: `npm run test -- src/test/student-spreadsheet.test.ts`

Expected: FAIL because `StudentSpreadsheetReadResult` does not expose `sheets` and currently treats the first non-empty row as the only header.

- [ ] **Step 3: Refactor the decoder without changing file limits**

Export these structures from `src/lib/student-spreadsheet.ts`:

```ts
export interface NumberedSpreadsheetRow {
  rowNumber: number;
  cells: StudentImportCell[];
}

export interface StudentWorkbookSheet {
  name: string;
  rows: NumberedSpreadsheetRow[];
}

export interface StudentSpreadsheetReadResult {
  sheetNames: string[];
  selectedSheet: string;
  sheets: StudentWorkbookSheet[];
  digest: string;
}
```

Keep the 4 MB and 2,000 data-row bounds. CSV becomes one `CSV` sheet. XLSX keeps every non-empty worksheet matrix with physical row numbers. Move simple first-row splitting into profile detection so title rows are not discarded.

- [ ] **Step 4: Add failing profile-detection tests**

Cover all three profiles with in-memory matrices:

```ts
expect(detectStudentWorkbook({ sheets: [simpleSheet], selectedSheet: "Students" }).profile)
  .toBe("simple");

const wide = detectStudentWorkbook({ sheets: [wideSheet], selectedSheet: "Camp Scores" });
expect(wide).toMatchObject({
  profile: "wide",
  directory: { sheetName: "Camp Scores", dataStartRow: 5 },
  academic: { sheetName: "Camp Scores", dataStartRow: 5 },
});
expect(wide.academic?.columns.map((column) => column.sourceHeader)).toContain(
  "HW1 / PSAT / RW",
);

expect(detectStudentWorkbook({
  sheets: [studentInformationSheet, scoresSheet],
  selectedSheet: "Student Information",
}).profile).toBe("normalized");
```

Also test a shifted title/header band, duplicate leaf labels under different groups, and a malformed sheet that produces a clear detection error.

- [ ] **Step 5: Run profile tests and verify failure**

Run: `npm run test -- src/test/student-workbook-profile.test.ts`

Expected: FAIL because the detector does not exist.

- [ ] **Step 6: Implement deterministic profile and header-band detection**

Use these public types:

```ts
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

export function detectStudentWorkbook(input: {
  sheets: StudentWorkbookSheet[];
  selectedSheet?: string;
}): DetectedStudentWorkbook;
```

Detection order is normalized two-sheet names, wide header-band scoring, then simple one-row headers. Wide scoring requires Name, Class, Level, Room, and at least one RW/Math/Total leaf. Reconstruct paths by carrying merged group labels only across blank cells until another non-empty group label at that level; collapse duplicates and blank path elements. Include column index in validation even when display paths repeat.

- [ ] **Step 7: Run Task 1 tests**

Run: `npm run test -- src/test/student-spreadsheet.test.ts src/test/student-workbook-profile.test.ts`

Expected: PASS with the existing simple workbook tests unchanged and new wide/normalized cases green.

- [ ] **Step 8: Commit Task 1**

```bash
git add src/lib/student-spreadsheet.ts src/lib/student-workbook-profile.ts src/test/student-spreadsheet.test.ts src/test/student-workbook-profile.test.ts
git commit -m "Preserve workbook structure before deciding how to import it" -m "Keep raw worksheet rows and reconstruct profile-specific headers without weakening existing upload limits.

Constraint: Wide administrator workbooks contain title and merged header rows
Confidence: high
Scope-risk: moderate
Tested: student spreadsheet and workbook profile Vitest suites"
```

### Task 2: Normalize Academic Mappings and Score Groups

**Files:**
- Create: `src/lib/student-workbook-schema.ts`
- Create: `src/test/student-workbook-schema.test.ts`
- Modify: `src/lib/student-import-schema.ts`
- Modify: `src/test/student-import-schema.test.ts`

**Interfaces:**
- Consumes: `DetectedStudentWorkbook` and `WorkbookColumn` from Task 1.
- Produces: `StudentWorkbookMappingPlan`, `StudentWorkbookSetup`, `NormalizedAcademicRow`, `inferStudentWorkbookMappings()`, `normalizeAcademicRows()`, `parseStudentWorkbookMappings()`, and `parseStudentWorkbookSetup()`.
- Consumed by: Tasks 3, 4, and 7.

- [ ] **Step 1: Write failing mapping and score tests**

Cover fixed context columns, combined assessment names, aliases, ignored diagnostic columns, calculation, mismatch, and invalid text:

```ts
const mappings = inferStudentWorkbookMappings(detectedWideWorkbook);
expect(mappings.academic?.columns).toEqual(expect.arrayContaining([
  expect.objectContaining({ kind: "student-name" }),
  expect.objectContaining({ kind: "cohort", sourceHeader: "Class" }),
  expect.objectContaining({ kind: "session-title", sourceHeader: "Level" }),
  expect.objectContaining({ kind: "room", sourceHeader: "Room" }),
  expect.objectContaining({
    kind: "score",
    assessmentTitle: "HW1 – PSAT",
    component: "rw",
  }),
]));

expect(normalizeScoreGroup({ rw: 720, math: 760, total: null }))
  .toEqual({ rw: 720, math: 760, total: 1480, warnings: ["Total calculated from RW + Math."] });

expect(() => normalizeScoreGroup({ rw: 720, math: 760, total: 1490 }))
  .toThrow("Total must equal RW + Math.");
```

Test aliases `RW`, `R&W`, `Reading/Writing`, `M`, `Math`, `Mathematics`, `Total`, and `Composite`. Test `UNMATCHED`, NaN, section scores outside 200-800, and totals outside 400-1600 as errors.

- [ ] **Step 2: Run mapping tests and verify failure**

Run: `npm run test -- src/test/student-workbook-schema.test.ts`

Expected: FAIL because academic mapping types and normalization do not exist.

- [ ] **Step 3: Expose the existing student alias lookup**

Refactor `src/lib/student-import-schema.ts` so the alias registry remains the single source for student fields:

```ts
export function findStudentImportField(sourceHeader: string): StudentImportFieldKey | null {
  const normalizedHeader = normalizeStudentImportHeader(sourceHeader);
  return (Object.entries(STUDENT_IMPORT_FIELD_ALIASES) as Array<[
    StudentImportFieldKey,
    readonly string[],
  ]>).find(([, aliases]) => aliases.some(
    (alias) => normalizeStudentImportHeader(alias) === normalizedHeader,
  ))?.[0] ?? null;
}
```

Make `suggestStudentImportMapping()` call this function. Do not change existing aliases or unknown-custom-field behavior.

- [ ] **Step 4: Implement academic types and strict parsers**

Use these stable public contracts:

```ts
export type ScoreComponent = "rw" | "math" | "total";

export type AcademicColumnMapping =
  | { sourceHeader: string; columnIndex: number; kind: "student-name" }
  | { sourceHeader: string; columnIndex: number; kind: "cohort" }
  | { sourceHeader: string; columnIndex: number; kind: "session-title" }
  | { sourceHeader: string; columnIndex: number; kind: "room" }
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
  scores: Array<{ assessmentTitle: string; rw: number; math: number; total: number; warnings: string[] }>;
  errors: string[];
}
```

Limit mapping arrays to 400 columns, text fields to 200 characters, setup cohorts to 100, and date entries to 500. Validate column index/header identity against the detected table on every preview and commit.

- [ ] **Step 5: Implement score inference and normalization**

Create a data-driven alias map and profile:

```ts
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
```

For score columns, combine the nearest outer homework label and test identifier with ` – `. Unknown leaves inside a score group become academic `ignore`, never custom student fields. Group scores by assessment title per source row, calculate blank Total, and attach row-specific errors instead of throwing away other preview rows.

- [ ] **Step 6: Run Task 2 tests**

Run: `npm run test -- src/test/student-import-schema.test.ts src/test/student-workbook-schema.test.ts`

Expected: PASS, including all current simple mapping tests.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/lib/student-import-schema.ts src/lib/student-workbook-schema.ts src/test/student-import-schema.test.ts src/test/student-workbook-schema.test.ts
git commit -m "Separate score meaning from student spreadsheet fields" -m "Model academic context and grouped SAT scores explicitly so unknown score columns cannot leak into student custom data.

Constraint: Total must equal RW plus Math when provided
Confidence: high
Scope-risk: moderate
Tested: student import schema and workbook schema Vitest suites"
```

### Task 3: Plan Eastern Sessions, Cohorts, Enrollments, and Scores

**Files:**
- Create: `src/lib/eastern-recurring-sessions.ts`
- Create: `src/test/eastern-recurring-sessions.test.ts`
- Create: `src/lib/student-academic-import-planner.ts`
- Create: `src/test/student-academic-import-planner.test.ts`

**Interfaces:**
- Consumes: `NormalizedAcademicRow` and `StudentWorkbookSetup` from Task 2.
- Produces: `buildEasternRecurringSessions()` and `buildStudentAcademicImportPlan()`.
- Consumed by: Tasks 4-6.

- [ ] **Step 1: Write failing Eastern recurrence tests**

```ts
expect(buildEasternRecurringSessions({
  cadence: "MWF",
  startDate: "2026-03-06",
  endDate: "2026-03-11",
})).toEqual([
  { startAt: "2026-03-06T13:00:00.000Z", endAt: "2026-03-06T20:30:00.000Z" },
  { startAt: "2026-03-09T12:00:00.000Z", endAt: "2026-03-09T19:30:00.000Z" },
  { startAt: "2026-03-11T12:00:00.000Z", endAt: "2026-03-11T19:30:00.000Z" },
]);

expect(buildEasternRecurringSessions({
  cadence: "TTHS",
  startDate: "2026-07-07",
  endDate: "2026-07-11",
})).toHaveLength(3);

expect(() => buildEasternRecurringSessions({
  cadence: "WEEKEND",
  startDate: "2026-07-01",
  endDate: "2026-07-31",
})).toThrow("Class cadence must be MWF or TTHS.");
```

- [ ] **Step 2: Run recurrence tests and verify failure**

Run: `npm run test -- src/test/eastern-recurring-sessions.test.ts`

Expected: FAIL because the Eastern recurrence module does not exist.

- [ ] **Step 3: Implement timezone-stable recurrence**

Export:

```ts
export function buildEasternRecurringSessions(input: {
  cadence: string;
  startDate: string;
  endDate: string;
}): Array<{ startAt: string; endAt: string }>;
```

Iterate ISO calendar dates in UTC, select weekday numbers `[1,3,5]` or `[2,4,6]`, and convert 08:00/15:30 wall times through `Intl.DateTimeFormat` with `timeZone: "America/New_York"`. Cap one cohort plan at 366 sessions and the complete import at 1,000 sessions. Preserve the source Class as the cohort name; only cadence comparison is normalized.

- [ ] **Step 4: Write failing academic planner tests**

Test these exact outcomes:

```ts
const plan = buildStudentAcademicImportPlan({
  targetDemo: true,
  rows: [validMwfRow, validTthsRow],
  setup,
  students: demoStudents,
  cohorts: [],
  enrollments: [],
  sessions: [],
  assessments: [],
  results: [],
  programs: [satProgram],
  campuses: [campus],
  terms: [summerTerm],
  createId,
});

expect(plan.cohorts.map((row) => row.name)).toEqual(["MWF", "TTHS"]);
expect(plan.sessions.every((row) => row.title === "G4")).toBe(true);
expect(plan.sessions.every((row) => row.room_label === "Room 201")).toBe(true);
expect(plan.assessments).toEqual(expect.arrayContaining([
  expect.objectContaining({ title: "HW1 – PSAT", date: "2026-07-10", demo: true }),
]));
expect(plan.results[0]).toMatchObject({ total_score: 1480, demo: true });
```

Also assert:

- zero exact normalized name matches blocks;
- two exact normalized name matches block;
- one match plans a missing active enrollment;
- a missing cohort produces one metadata requirement per source Class;
- multiple matching cohorts require `selectedCohortId`;
- date requirements are distinct for MWF and TTHS even with the same test title;
- conflicting Level/Room values block the affected cohort plan;
- existing sessions, assessments, enrollments, and results are reused/updated without duplicate payloads;
- every lookup filters `demo` before matching.

- [ ] **Step 5: Run planner tests and verify failure**

Run: `npm run test -- src/test/student-academic-import-planner.test.ts`

Expected: FAIL because the academic planner does not exist.

- [ ] **Step 6: Implement the pure academic planner**

Use these payload/result types:

```ts
export interface StudentAcademicImportPlan {
  rows: Array<{
    rowNumber: number;
    studentId: string | null;
    cohortId: string | null;
    actions: string[];
    warnings: string[];
    errors: string[];
  }>;
  requirements: {
    cohorts: string[];
    assessmentDates: Array<{ sourceClass: string; assessmentTitle: string }>;
  };
  cohorts: Array<Record<string, unknown>>;
  sessions: Array<Record<string, unknown>>;
  enrollments: Array<Record<string, unknown>>;
  assessments: Array<Record<string, unknown>>;
  results: Array<Record<string, unknown>>;
  summary: {
    cohorts: number;
    sessions: number;
    enrollments: number;
    assessments: number;
    resultCreates: number;
    resultUpdates: number;
    errors: number;
  };
}
```

New cohorts use the chosen program/campus/term/capacity, term start/end dates, source cadence, `cohort_mode = "In person"`, and the unique source Room. Assessments use sections `[{ label: "RW", score: 800 }, { label: "Math", score: 800 }]`. Results use the existing deterministic `${assessmentId}:${studentId}` ID convention and section-score labels `RW` and `Math`.

- [ ] **Step 7: Run Task 3 tests**

Run: `npm run test -- src/test/eastern-recurring-sessions.test.ts src/test/student-academic-import-planner.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/lib/eastern-recurring-sessions.ts src/lib/student-academic-import-planner.ts src/test/eastern-recurring-sessions.test.ts src/test/student-academic-import-planner.test.ts
git commit -m "Make spreadsheet academics deterministic before database writes" -m "Plan exact-name matches, cohort setup, Eastern recurring classes, enrollments, assessments, and results as a pure previewable operation.

Constraint: MWF and TTHS dates differ by cohort and all classes run 8:00-15:30 Eastern
Confidence: high
Scope-risk: broad
Tested: recurrence and academic planner Vitest suites"
```

### Task 4: Extend Preview and Request Boundaries

**Files:**
- Modify: `src/lib/student-import-operations.ts`
- Modify: `src/lib/student-import-request.ts`
- Modify: `src/app/api/students/import/preview/route.ts`
- Modify: `src/test/student-import-operations.test.ts`
- Modify: `src/test/student-import-routes.test.ts`

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: `StudentWorkbookPreview`, expanded `StudentImportPartitionData`, and strict multipart forwarding.
- Consumed by: Tasks 5-7.

- [ ] **Step 1: Write failing operation tests for all profiles**

Add repository fixture data for programs, campuses, terms, full cohorts, sessions, assessments, and results. Assert a wide preview returns:

```ts
expect(preview).toMatchObject({
  profile: "wide",
  targetDemo: true,
  mappingPlan: expect.any(Object),
  setup: expect.any(Object),
  academic: {
    requirements: {
      cohorts: ["MWF", "TTHS"],
      assessmentDates: expect.arrayContaining([
        { sourceClass: "MWF", assessmentTitle: "HW1 – PSAT" },
      ]),
    },
  },
});
```

Assert a simple CSV preview retains its current mappings, row actions, and summary. Assert normalized two-sheet input reads both sheets from one digest.

- [ ] **Step 2: Run operation tests and verify failure**

Run: `npm run test -- src/test/student-import-operations.test.ts`

Expected: FAIL because preview only understands a one-row simple table.

- [ ] **Step 3: Expand repository data and preview contracts**

Extend `StudentImportPartitionData` with typed rows for:

```ts
programs: Array<{ id: string; name: string; track: string; is_archived: boolean }>;
campuses: Array<{ id: string; name: string; modality: string }>;
terms: Array<{ id: string; name: string; start_date: string; end_date: string }>;
sessions: Array<{ id: string; cohort_id: string; title: string; start_at: string; end_at: string; mode: string; room_label: string; demo: boolean }>;
assessments: Array<{ id: string; cohort_id: string; title: string; date: string; sections: Json; demo: boolean }>;
results: Array<{ id: string; assessment_id: string; student_id: string; total_score: number; section_scores: Json; delta_from_previous: number; demo: boolean }>;
```

Load every partitioned table with `.eq("demo", targetDemo)` before pagination. Programs/campuses/terms remain global reference tables. Load only non-archived programs/cohorts for new resolution while retaining IDs referenced by existing records where needed.

- [ ] **Step 4: Implement profile-aware preparation**

`prepareStudentImport()` must:

1. decode all sheets;
2. detect the profile/layout;
3. infer or validate the structured mapping plan;
4. normalize directory rows through the current schema;
5. normalize academic rows through Task 2;
6. build the current directory plan;
7. build the academic plan using the same target partition and IDs;
8. return both plans and combined blocking status.

For wide/normalized academic rows, require an existing exact-name student; do not create a student merely because a score row contains directory columns. Simple directory-only imports retain current create behavior.

- [ ] **Step 5: Write failing strict route tests**

Add `mappingPlan` and `setup` multipart fields and assert only parsed values reach the operation:

```ts
expect(mocks.preview).toHaveBeenCalledWith(expect.objectContaining({
  mappingPlan,
  setup,
  requestedTarget: true,
}));
```

Reject arrays/objects with wrong shapes, excessive entries, invalid dates, negative/non-integer capacity, column indexes outside bounds, text over limits, and client-supplied normalized rows/counts.

- [ ] **Step 6: Implement bounded multipart parsing**

Keep the 5 MB total multipart limit and 16-part limit unless the two new fields require raising the part limit to exactly 18. Cap `mappingPlan` JSON at 250 KB and `setup` at 100 KB. The route imports and calls `parseStudentWorkbookMappings()` and `parseStudentWorkbookSetup()`; it never forwards arbitrary JSON.

- [ ] **Step 7: Run Task 4 tests**

Run: `npm run test -- src/test/student-import-operations.test.ts src/test/student-import-routes.test.ts src/test/student-import-planner.test.ts`

Expected: PASS with the simple planner regression suite unchanged.

- [ ] **Step 8: Commit Task 4**

```bash
git add src/lib/student-import-operations.ts src/lib/student-import-request.ts src/app/api/students/import/preview/route.ts src/test/student-import-operations.test.ts src/test/student-import-routes.test.ts src/test/student-import-planner.test.ts
git commit -m "Preview every academic side effect before accepting workbook setup" -m "Extend the existing authenticated preview boundary with strict profile mappings, cohort metadata, dates, and partition-scoped academic plans.

Constraint: Client rows and counts remain untrusted
Confidence: high
Scope-risk: broad
Tested: import operations, routes, and simple planner Vitest suites"
```

### Task 5: Add Partition-Safe Academic Constraints and Atomic RPC

**Files:**
- Create: the exact `supabase/migrations/` path returned by Task 5 Step 2
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces: the 13-argument `public.commit_student_workbook_import` signature defined in Task 5 Step 5.
- Consumed by: Task 6.

- [ ] **Step 1: Re-check current Supabase guidance and live preflight**

Use Supabase MCP `search_docs` for database functions, function privileges, RLS, and indexes. Scan the Supabase changelog for relevant breaking changes. Re-run read-only live queries for:

- duplicate active cohorts on `(demo, program_id, campus_id, term_id, normalized name)`;
- duplicate sessions on `(demo, cohort_id, normalized title, start_at, end_at, normalized room)`;
- duplicate assessments on `(demo, cohort_id, normalized title, date)`;
- demo mismatches across sessions/cohorts, assessments/cohorts, results/assessments, and results/students.

Expected: every count remains zero. If not, stop schema application and report exact non-PII group counts; do not delete or merge data automatically.

- [ ] **Step 2: Create the migration through the CLI**

Run: `npm run db:new -- adaptive_student_score_workbook_import`

Expected: one new timestamped migration path printed by Supabase CLI 2.107.0 or newer.

- [ ] **Step 3: Add audit columns and natural keys**

Add these audit columns with backward-compatible defaults:

```sql
alter table public.student_import_runs
  add column if not exists workbook_profile text not null default 'simple'
    check (workbook_profile in ('simple', 'wide', 'normalized')),
  add column if not exists workbook_mapping jsonb not null default '{}'::jsonb
    check (jsonb_typeof(workbook_mapping) = 'object'),
  add column if not exists workbook_setup jsonb not null default '{}'::jsonb
    check (jsonb_typeof(workbook_setup) = 'object'),
  add column if not exists cohort_count integer not null default 0,
  add column if not exists session_count integer not null default 0,
  add column if not exists assessment_count integer not null default 0,
  add column if not exists result_count integer not null default 0;

create unique index if not exists cohorts_import_natural_key
  on public.cohorts (
    demo, program_id, campus_id, term_id, lower(btrim(name))
  ) where is_archived = false;

create unique index if not exists sessions_import_natural_key
  on public.sessions (
    demo, cohort_id, lower(btrim(title)), start_at, end_at, lower(btrim(room_label))
  );

create unique index if not exists assessments_import_natural_key
  on public.assessments (
    demo, cohort_id, lower(btrim(title)), date
  );
```

Guard every constraint creation with catalog checks so the migration is rerunnable in local verification.

- [ ] **Step 4: Add composite partition relationships**

Create unique `(id, demo)` constraints for sessions and assessments, then add `NOT VALID` composite foreign keys and validate them:

```sql
alter table public.sessions
  add constraint sessions_cohort_demo_fkey
  foreign key (cohort_id, demo) references public.cohorts (id, demo)
  on delete cascade not valid;

alter table public.assessments
  add constraint assessments_cohort_demo_fkey
  foreign key (cohort_id, demo) references public.cohorts (id, demo)
  on delete cascade not valid;

alter table public.assessment_results
  add constraint assessment_results_assessment_demo_fkey
  foreign key (assessment_id, demo) references public.assessments (id, demo)
  on delete cascade not valid,
  add constraint assessment_results_student_demo_fkey
  foreign key (student_id, demo) references public.students (id, demo)
  on delete cascade not valid;
```

Drop only same-named stale constraints before recreating them; preserve the existing single-column foreign keys.

- [ ] **Step 5: Create the expanded transaction wrapper**

Use this exact signature so the existing nine-argument RPC remains available during rollout:

```sql
create or replace function public.commit_student_workbook_import(
  p_actor_id uuid,
  p_actor_role text,
  p_actor_demo boolean,
  p_target_demo boolean,
  p_field_definitions jsonb,
  p_families jsonb,
  p_students jsonb,
  p_enrollments jsonb,
  p_cohorts jsonb,
  p_sessions jsonb,
  p_assessments jsonb,
  p_results jsonb,
  p_import_run jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public;
```

The function must perform these checks before its first write:

- actor role/id/status/partition checks equivalent to `commit_student_spreadsheet_import`;
- all eight collection arguments are JSON arrays of objects and stay within server bounds;
- import metadata contains filename, digest, worksheet, mapping, profile, and non-negative counts matching payload lengths;
- program/campus/term IDs exist for every new cohort;
- every existing/planned cohort, student, session, assessment, and result ID is unique in the payload and belongs to the target partition;
- session timestamps are valid, end after start, use a planned/target cohort, and use `In person` mode;
- assessment dates/titles/sections are valid and use a planned/target cohort;
- results use a planned/target assessment and target student, have integer RW/Math/Total, and Total equals RW plus Math;
- enrollment/result relationships cannot cross the target partition.

After validation, insert new cohorts, call the existing nine-argument `commit_student_spreadsheet_import` with the directory/enrollment arguments, insert sessions and assessments, and upsert results on `(assessment_id, student_id)`. Keep `p_import_run.mapping` as the directory mapping array required by the legacy function; carry the structured mapping/setup in `p_import_run.workbookMapping` and `p_import_run.workbookSetup`. Because the nested call runs in the same Postgres transaction, any later academic failure rolls back the directory import and audit row too. Update the completed audit row with the structured mapping/setup, profile, and academic counts before returning the directory counts plus `cohorts`, `sessions`, `assessments`, and `results`.

- [ ] **Step 6: Restrict RPC privileges**

```sql
revoke all on function public.commit_student_workbook_import(
  uuid, text, boolean, boolean,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.commit_student_workbook_import(
  uuid, text, boolean, boolean,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to service_role;
```

No browser role receives write grants. Existing RLS stays enabled on all affected public tables.

- [ ] **Step 7: Test the migration locally**

Run:

```bash
npm run db:reset
npx supabase db lint --local
npx supabase migration list --local
```

Expected: reset and lint succeed; the new migration appears once. Execute local SQL fixtures proving atomic rollback, cross-partition rejection, idempotent result upsert, and old simple RPC compatibility.

- [ ] **Step 8: Update TypeScript database types**

Add the seven import-run columns and the exact 13-argument `commit_student_workbook_import` function signature to `src/lib/supabase/database.types.ts`. Do not replace unrelated hand-maintained types.

- [ ] **Step 9: Commit Task 5**

```bash
git add supabase/migrations src/lib/supabase/database.types.ts
git commit -m "Make academic workbook commits indivisible across tenant data" -m "Add natural keys, partition relationships, audit counts, and a service-only transaction wrapper around the proven directory import.

Constraint: The legacy simple import RPC must remain callable during rollout
Confidence: high
Scope-risk: broad
Directive: Never grant the workbook RPC to anon or authenticated roles
Tested: local Supabase reset, database lint, migration list, rollback and partition SQL checks"
```

### Task 6: Commit Expanded Plans Through the New RPC

**Files:**
- Modify: `src/lib/student-import-operations.ts`
- Modify: `src/app/api/students/import/commit/route.ts`
- Modify: `src/test/student-import-operations.test.ts`
- Modify: `src/test/student-import-routes.test.ts`

**Interfaces:**
- Consumes: Task 5 RPC.
- Produces: expanded `StudentImportCommitPayload` and `StudentImportCommitResult`.
- Consumed by: Task 7.

- [ ] **Step 1: Write failing commit payload tests**

Assert wide commit reparses the file and sends all arrays from the server plan:

```ts
expect(repository.commitImport).toHaveBeenCalledWith(expect.objectContaining({
  targetDemo: true,
  cohorts: expect.any(Array),
  sessions: expect.any(Array),
  enrollments: expect.any(Array),
  assessments: expect.any(Array),
  results: expect.any(Array),
  importRun: expect.objectContaining({ workbookProfile: "wide" }),
}));
```

Assert a changed digest, mapping, setup, cohort selection, or date snapshot blocks before repository commit. Assert a forced repository error records a bounded failed run and no success response. Assert simple imports still call the legacy RPC path.

- [ ] **Step 2: Run commit tests and verify failure**

Run: `npm run test -- src/test/student-import-operations.test.ts src/test/student-import-routes.test.ts`

Expected: FAIL because commit payloads do not contain academic plans.

- [ ] **Step 3: Expand commit contracts and repository dispatch**

Add:

```ts
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
```

For `simple` with no academic plan, keep `commit_student_spreadsheet_import`. For `wide` or `normalized`, call `commit_student_workbook_import` with the exact server-built arrays. Validate the returned JSON before reporting success.

Keep `importRun.mapping` as the directory mapping array for legacy-RPC validation and add `workbookMapping`, `workbookSetup`, `workbookProfile`, and the academic counts as separate metadata fields. When adapting a successful legacy simple-import response, return zero for `cohorts`, `sessions`, `assessments`, and `results` so the client receives one stable commit result shape. Failed-run inserts must record the profile/counts and structured mapping/setup without copying raw score-cell values into logs.

- [ ] **Step 4: Require reviewed setup on commit**

The commit route parses `mappingPlan`, `setup`, excluded rows, selected sheet, expected digest, and target. It sends none of the client preview rows or counts. `commitStudentSpreadsheetImport()` reruns Task 4 preparation and blocks if any included directory or academic row has errors or unmet requirements.

- [ ] **Step 5: Recalculate imported result deltas**

Before RPC payload creation, calculate each result's `delta_from_previous` from the latest earlier assessment result for that student in the same cohort. When no earlier result exists, use zero as the previous total, matching `persistAssessmentResult()`.

- [ ] **Step 6: Run Task 6 tests**

Run: `npm run test -- src/test/student-import-operations.test.ts src/test/student-import-routes.test.ts`

Expected: PASS, including digest/reparse, rollback, partition, local-QA actor, and simple-import cases.

- [ ] **Step 7: Commit Task 6**

```bash
git add src/lib/student-import-operations.ts src/app/api/students/import/commit/route.ts src/test/student-import-operations.test.ts src/test/student-import-routes.test.ts
git commit -m "Trust only server-rebuilt academic plans at workbook commit" -m "Reparse mappings and setup, dispatch expanded plans through the atomic RPC, and preserve the legacy simple-import path.

Constraint: Preview rows and counts are never commit inputs
Confidence: high
Scope-risk: broad
Tested: import operation and route Vitest suites"
```

### Task 7: Add Profile Mapping, Setup Prompts, and Preview Tabs

**Files:**
- Create: `src/components/portal/student-import-academic-setup.tsx`
- Create: `src/components/portal/student-import-preview-tabs.tsx`
- Modify: `src/components/portal/student-import-panel.tsx`

**Interfaces:**
- Consumes: `StudentWorkbookPreview`, `StudentWorkbookMappingPlan`, and `StudentWorkbookSetup` from Tasks 2/4.
- Produces: visible adaptive import flow used in Task 11 E2E.

- [ ] **Step 1: Extract runtime response guards into pure exported helpers**

Update the preview guard to require profile, structured mappings, setup options, academic requirements/rows/summary, and the original directory fields. Keep commit response guards strict for all eight counts.

- [ ] **Step 2: Add the academic setup component**

Use this prop contract:

```ts
interface StudentImportAcademicSetupProps {
  requirements: StudentWorkbookPreview["academic"]["requirements"];
  options: StudentWorkbookPreview["options"];
  value: StudentWorkbookSetup;
  disabled: boolean;
  onChange: (value: StudentWorkbookSetup) => void;
  onRefreshPreview: () => void;
}
```

Render one card per missing/ambiguous source Class. New cohorts require Program, Campus, Term, and positive integer Capacity. Ambiguous cohorts use an explicit existing-cohort selector. Render a date matrix with one date input per source Class/combined test. Do not ask for a separate schedule: explain that MWF/TTHS and the selected term generate 8:00-3:30 Eastern classes automatically.

- [ ] **Step 3: Add accessible preview tabs**

Use tabs/buttons with visible counts for:

- Student Information;
- Cohorts & Classes;
- Enrollments;
- Scores;
- Errors & Unmapped Columns.

Each score row shows source row, student, cohort, combined test, date, RW, Math, Total, action, and errors/warnings. Calculated totals are labeled. Blocking requirements/errors keep Commit disabled.

- [ ] **Step 4: Wire profile-aware state into the existing dialog**

Replace the single mapping array snapshot with:

```ts
interface PreviewSnapshot {
  selectedSheet: string;
  mappingPlan: StudentWorkbookMappingPlan;
  setup: StudentWorkbookSetup;
  targetDemo?: boolean;
}
```

Simple profile retains the current column mapping UI. Wide/normalized profiles show separate directory and academic mappings; academic unknown columns default to Ignore. Changing profile mappings, setup, sheet, exclusions, or target invalidates the commit snapshot until `Update preview` succeeds.

- [ ] **Step 5: Verify UI statically and through the route suites**

Run:

```bash
npm run lint -- src/components/portal/student-import-panel.tsx src/components/portal/student-import-academic-setup.tsx src/components/portal/student-import-preview-tabs.tsx
npm run typecheck
npm run test -- src/test/student-import-routes.test.ts src/test/student-import-operations.test.ts
```

Expected: all commands pass.

- [ ] **Step 6: Commit Task 7**

```bash
git add src/components/portal/student-import-panel.tsx src/components/portal/student-import-academic-setup.tsx src/components/portal/student-import-preview-tabs.tsx
git commit -m "Make cohort and score decisions visible before import" -m "Add profile-aware mappings, deduplicated metadata/date prompts, and separate academic preview tabs without growing one monolithic component.

Constraint: Engineer target confirmation remains mandatory
Confidence: high
Scope-risk: moderate
Tested: ESLint, TypeScript, import route and operation suites"
```

### Task 8: Build a Dependency-Free Two-Sheet XLSX Writer

**Files:**
- Create: `src/lib/xlsx-workbook.ts`
- Create: `src/test/xlsx-workbook.test.ts`

**Interfaces:**
- Produces: `createXlsxWorkbook()`.
- Consumed by: Task 9.

- [ ] **Step 1: Write a failing compatibility test**

```ts
const bytes = createXlsxWorkbook([
  {
    name: "Student Information",
    headers: ["Student Name", "School"],
    rows: [["Ada Demo", "North High"]],
  },
  {
    name: "Scores",
    headers: ["Student Name", "Test Date", "RW", "Math", "Total"],
    rows: [["Ada Demo", new Date("2026-07-10T00:00:00.000Z"), 720, 760, 1480]],
  },
]);

const sheets = await readXlsxFile(bytes);
expect(sheets.map((sheet) => sheet.sheet)).toEqual(["Student Information", "Scores"]);
expect(sheets[1]?.data[1]).toEqual(["Ada Demo", expect.any(Date), 720, 760, 1480]);
```

Also test XML escaping, Unicode, blank cells, booleans, invalid/duplicate sheet names, header freeze panes, and that formulas are exported as literal text rather than executable formulas.

- [ ] **Step 2: Run the writer test and verify failure**

Run: `npm run test -- src/test/xlsx-workbook.test.ts`

Expected: FAIL because the writer does not exist.

- [ ] **Step 3: Implement the minimal OpenXML writer**

Use this public API:

```ts
export type XlsxCell = string | number | boolean | Date | null;

export interface XlsxSheet {
  name: string;
  headers: string[];
  rows: XlsxCell[][];
  columnWidths?: number[];
}

export function createXlsxWorkbook(sheets: XlsxSheet[]): Buffer;
```

Build `[Content_Types].xml`, root relationships, workbook, workbook relationships, styles, and one worksheet XML per sheet. Use inline strings, numeric cells, boolean cells, and Excel serial dates with a `yyyy-mm-dd` style. Escape XML and prefix literal strings beginning with `=` so spreadsheet applications do not execute imported data.

Package entries with a small ZIP-store encoder using local headers, CRC-32, central-directory records, UTF-8 filename flags, and end-of-central-directory. Do not import a transitive package. Apply a dark-blue header fill, white bold header text, sensible widths, autofilter, and frozen top row.

- [ ] **Step 4: Run Task 8 tests**

Run: `npm run test -- src/test/xlsx-workbook.test.ts`

Expected: PASS and `read-excel-file` reads typed dates/numbers from both sheets.

- [ ] **Step 5: Commit Task 8**

```bash
git add src/lib/xlsx-workbook.ts src/test/xlsx-workbook.test.ts
git commit -m "Export portable workbooks without expanding runtime dependencies" -m "Create typed, escaped, two-sheet OpenXML files that Excel, Google Sheets, and the existing parser can read.

Constraint: No new production dependency
Confidence: medium
Scope-risk: moderate
Tested: XLSX writer compatibility Vitest suite using read-excel-file"
```

### Task 9: Export Student Information, Scores, or Everything

**Files:**
- Create: `src/lib/student-workbook-export.ts`
- Create: `src/test/student-workbook-export.test.ts`
- Create: `src/app/api/students/export/route.ts`
- Create: `src/components/portal/student-workbook-export-actions.tsx`
- Modify: `src/components/portal/student-cohort-assignment-panel.tsx`
- Modify: `src/test/students-route.test.ts`

**Interfaces:**
- Consumes: `createXlsxWorkbook()` from Task 8 and existing partition authorization.
- Produces: `exportStudentWorkbook()` and `GET /api/students/export?scope=students|scores|all`.

- [ ] **Step 1: Write failing export projection tests**

Inject a repository containing both demo and main records and assert:

```ts
const workbook = await exportStudentWorkbook({
  viewer: demoAdmin,
  scope: "all",
  repository,
});

expect(workbook.filename).toMatch(/^intoprep-demo-export-\d{4}-\d{2}-\d{2}\.xlsx$/);
expect(workbook.sheetNames).toEqual(["Student Information", "Scores"]);
expect(workbook.rows.scores[0]).toMatchObject({
  studentName: "Ada Demo",
  cohort: "MWF",
  className: "G4",
  room: "Room 201",
  testName: "HW1 – PSAT",
  rw: 720,
  math: 760,
  total: 1480,
});
expect(workbook.bytes.includes(Buffer.from("Main Student"))).toBe(false);
```

Test `students` and `scores` scopes each return one sheet. Test engineers require `requestedTarget`; admin/staff ignore override attempts and use profile partition.

- [ ] **Step 2: Run export tests and verify failure**

Run: `npm run test -- src/test/student-workbook-export.test.ts`

Expected: FAIL because export operations do not exist.

- [ ] **Step 3: Implement partition-scoped export projection**

Export Student Information columns in this stable order:

```ts
[
  "First Name", "Last Name", "Student Email", "Student Phone",
  "Grade", "School", "Target Test", "Focus",
  "Parent 1 Name", "Parent 1 Email", "Parent 1 Phone",
  "Parent 2 Name", "Parent 2 Email", "Parent 2 Phone",
  "Cohorts", "Registration Date",
]
```

Append active custom-field labels in `sort_order,key` order. One student remains one row; multiple active cohort names are joined with `; ` as reference text.

Export Scores columns exactly:

```ts
[
  "Student Name", "Cohort", "Class", "Room", "Test Name",
  "Test Date", "RW", "Math", "Total",
]
```

Resolve Class/Room first from sessions on the assessment's Eastern calendar date when exactly one context exists, then from one unique cohort-wide context. Leave ambiguous fields blank rather than guessing. Read RW/Math by normalized section label.

- [ ] **Step 4: Add the authenticated export route**

The Node-runtime route accepts only `scope=students|scores|all` and optional strict `targetDemo=true|false`. Authenticate with the same live/suspended/password/role checks as imports. Return:

```ts
return new Response(bytes, {
  status: 200,
  headers: {
    "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "content-disposition": `attachment; filename="${filename}"`,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  },
});
```

- [ ] **Step 5: Add the three download actions**

Render:

- Download Student Information;
- Download Scores;
- Download Everything.

Engineer UI requires a Demo/Main selection before enabling any download. Admin/staff do not receive a target selector. Use ordinary browser download navigation so files are not loaded into React memory.

- [ ] **Step 6: Run Task 9 tests**

Run:

```bash
npm run test -- src/test/student-workbook-export.test.ts src/test/students-route.test.ts src/test/xlsx-workbook.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 9**

```bash
git add src/lib/student-workbook-export.ts src/app/api/students/export/route.ts src/components/portal/student-workbook-export-actions.tsx src/components/portal/student-cohort-assignment-panel.tsx src/test/student-workbook-export.test.ts src/test/students-route.test.ts
git commit -m "Let administrators move directory and score data as one workbook" -m "Project partition-scoped student and assessment data into separate normalized sheets with individual and combined downloads.

Constraint: Ambiguous class context must remain blank instead of being guessed
Confidence: high
Scope-risk: moderate
Tested: export, route, XLSX compatibility, and TypeScript checks"
```

### Task 10: Create and Verify the Sanitized Wide Workbook Fixture

**Files:**
- Create: `src/test/fixtures/adaptive-score-import.xlsx`
- Modify: `src/test/student-spreadsheet.test.ts`
- Modify: `src/test/student-import-operations.test.ts`

**Interfaces:**
- Produces: an actual merged-header `.xlsx` used by parser/integration/E2E verification.
- Consumed by: Task 11.

- [ ] **Step 1: Load the bundled spreadsheet runtime**

Call `codex_app__load_workspace_dependencies`. In a conversation-specific writable temp directory, create a `node_modules` symlink to the returned bundled dependency directory. Use only the returned Node executable and `@oai/artifact-tool`; do not install a workbook library.

- [ ] **Step 2: Build the sanitized workbook with merged headers**

Create one `Camp Scores` sheet with:

- title `SAT Summer Camp 2026`;
- fixed rows/columns for Name, School, Grade, Class, Level, and Room;
- real merged `HW1`, `HW2`, and `HW3` group headers;
- PSAT/BB07/BB08 test identifiers;
- RW/M/Total leaves;
- synthetic names reserved for demo E2E;
- one blank Total, one valid supplied Total, one mismatch, one `UNMATCHED` text value, one missing student, and one ambiguous-name row.

Use typed numbers/dates, readable widths, frozen headers, restrained fills matching the screenshot's green/yellow hierarchy, and no proprietary values.

- [ ] **Step 3: Inspect, scan, and render the fixture**

Use artifact-tool inspection for the header/data range, scan formula errors, and render the populated sheet at a legible scale. Visually confirm merged group boundaries, visible labels, unclipped scores, and no default blank sheet. Save the final file as `src/test/fixtures/adaptive-score-import.xlsx`.

- [ ] **Step 4: Add actual-file integration tests**

Read the fixture through `readStudentSpreadsheet()`, detect `wide`, assert reconstructed paths, and preview with a mock demo repository. Assert mismatch/unmatched/ambiguous rows block while valid score groups plan the expected combined titles and totals.

- [ ] **Step 5: Run fixture integration tests**

Run:

```bash
npm run test -- src/test/student-spreadsheet.test.ts src/test/student-workbook-profile.test.ts src/test/student-import-operations.test.ts
```

Expected: PASS against the actual `.xlsx`, not an in-memory matrix alone.

- [ ] **Step 6: Commit Task 10**

```bash
git add src/test/fixtures/adaptive-score-import.xlsx src/test/student-spreadsheet.test.ts src/test/student-import-operations.test.ts
git commit -m "Lock the real merged-header workbook shape into regression coverage" -m "Add a sanitized Excel fixture modeled on the administrator layout and verify it through the production parser and preview planner.

Constraint: Proprietary workbook data is unavailable and must not be reconstructed
Confidence: high
Scope-risk: narrow
Tested: actual XLSX decoder, profile, and import operation suites"
```

### Task 11: Apply Supabase Changes and Run Required Demo E2E

**Files:**
- Modify: `docs/HANDOFF.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: production schema, verified browser behavior, cleanup evidence, and final operational documentation.

- [ ] **Step 1: Run the complete local quality gate before touching live schema**

Run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Expected: feature-focused tests pass. If the previously known QuickBooks expectation remains the only full-suite failure, report it separately and do not modify QuickBooks; all new/changed suites must be green.

- [ ] **Step 2: Apply the additive migration**

Run `npm run db:push` against linked project `uhtcbipwivvocbndxjqi`. Then verify migration history, function privileges, constraints, and indexes through Supabase MCP/CLI. Run both security and performance advisors and resolve issues introduced by this migration.

- [ ] **Step 3: Record main-data invariants**

Through read-only Supabase SQL, capture counts and stable non-PII fingerprints for main (`demo = false`) families, students, cohorts, enrollments, sessions, assessments, and assessment results. Store only the verification summary in the task report; do not expose names, emails, phones, or scores.

- [ ] **Step 4: Create exact demo prerequisites through the website UI**

Start the application with `INTO_PREP_LOCAL_QA=1`, sign in as the code-defined local demo admin, and use `/students` UI to create the synthetic students required by the fixture. Capture their returned/visible IDs. Do not seed them directly through Supabase.

- [ ] **Step 5: Upload the actual wide workbook through the visible UI**

Use the browser file-upload control with the absolute fixture path. Verify:

- profile reads Wide workbook;
- Name/Class/Level/Room mappings are correct;
- `HW1 – PSAT`, `HW1 – BB07`, and later test names are combined correctly;
- missing cohort prompts request Program/Campus/Term/Capacity once each;
- MWF and TTHS date inputs are separate;
- mismatch, invalid text, missing student, and ambiguous student rows visibly block commit.

Exclude only the intentionally invalid fixture rows, refresh preview, verify Demo target, and commit.

- [ ] **Step 6: Verify application and Supabase results**

In the website, verify demo cohorts, generated calendar classes, enrollments, assessments, and scores. In Supabase, query only captured fixture IDs and assert every related row has `demo = true`, exact Class cohort names, Level session titles, Room classroom labels, correct dates, and correct RW/Math/Total values.

- [ ] **Step 7: Re-upload for idempotency**

Upload the same file and setup again. Verify zero duplicate cohorts, sessions, enrollments, assessments, or results. Existing results may report update/skip, but natural-key counts must remain unchanged.

- [ ] **Step 8: Verify all three exports**

Download Student Information and Scores separately, then Download Everything. Open the combined file with artifact-tool and assert exactly `Student Information` and `Scores`, typed score/date cells, expected demo rows, no main rows, no formula errors, and legible renders of both sheets.

- [ ] **Step 9: Perform the Google Sheets round trip**

Use the available authenticated Chrome/Google Sheets flow approved in the spec: upload the combined `.xlsx`, inspect both tabs, export back to `.xlsx`, and upload that exported file through the demo import UI. Verify the normalized profile is detected and the re-import is idempotent. Browser/API shortcuts may supplement this check but cannot replace the visible Sheets and application interactions.

- [ ] **Step 10: Prove main invariance and clean up exact demo records**

Recompute every main count/fingerprint from Step 3 and require exact equality. Delete only captured synthetic demo IDs in dependency order after recording them; do not use pattern-wide deletion. Verify the demo fixtures are gone and recompute main fingerprints once more.

- [ ] **Step 11: Update the handoff**

Document:

- supported simple/wide/normalized profiles;
- exact Class/Level/Room semantics;
- cohort metadata and date prompts;
- Download Student Information, Download Scores, and Download Everything;
- new migration/RPC name;
- actual fixture path;
- demo E2E, Sheets round-trip, invariant, and cleanup steps;
- any known unrelated QuickBooks test status.

- [ ] **Step 12: Run the final gate after documentation**

Run:

```bash
git diff --check
npm run lint
npm run typecheck
npm run test
npm run build
```

Expected: no whitespace errors; all feature tests pass; lint/typecheck/build pass; any unrelated pre-existing test failure is named with evidence and left untouched.

- [ ] **Step 13: Commit Task 11**

```bash
git add docs/HANDOFF.md
git commit -m "Leave a repeatable proof for safe workbook operations" -m "Record adaptive import/export behavior, live schema identity, browser E2E, Google Sheets round trip, main-data invariance, and precise demo cleanup.

Constraint: Demo verification must never mutate main records
Confidence: high
Scope-risk: narrow
Tested: lint, typecheck, feature/full tests, build, live Supabase checks, browser upload, exports, Sheets round trip, idempotency, and cleanup"
```

## Final Verification Checklist

- [ ] Existing simple student imports still preview, commit, and re-import safely.
- [ ] Wide merged headers resolve without hard-coded row or column letters.
- [ ] Normalized two-sheet workbooks import both student information and scores.
- [ ] Unknown score columns never become student custom fields.
- [ ] Exact-name zero/multiple matches block.
- [ ] Missing cohorts prompt once and use exact Class names.
- [ ] Level/Room generate correct sessions at 8:00-3:30 Eastern for MWF/TTHS.
- [ ] Dates are distinct per cohort/test.
- [ ] Blank Total calculates; mismatched Total blocks.
- [ ] Re-import is idempotent across all academic tables.
- [ ] Expanded commit rolls back completely on a late failure.
- [ ] Demo/main composite constraints and server checks reject cross-partition relationships.
- [ ] Separate exports contain one normalized sheet each.
- [ ] Download Everything contains both normalized sheets.
- [ ] Google Sheets round trip preserves both sheets and imports idempotently.
- [ ] Main fingerprints are unchanged and exact demo fixtures are removed.
- [ ] QuickBooks remains untouched.
