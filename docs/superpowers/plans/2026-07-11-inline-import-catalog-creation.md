# Inline Import Catalog Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an administrator define missing Programs, Campuses, and Terms during workbook review, preview those definitions without writes, and commit them atomically with cohorts, classes, students, enrollments, assessments, and scores.

**Architecture:** Extend the bounded workbook setup contract with reusable catalog drafts, resolve existing-versus-planned records in the server planner, and send one reviewed payload to a partition-aware Supabase transaction. Keep the client keys ephemeral, generate database IDs server-side, enforce Demo/Main catalog isolation in both schema and queries, and remove Program tuition without changing billing or QuickBooks.

**Tech Stack:** TypeScript, React 19, Next.js 16 App Router, Vitest, Supabase Postgres/RPC/RLS, Playwright browser E2E, Vercel.

## Global Constraints

- Preview and `Update preview` perform zero writes.
- The final commit is atomic: catalog records and all workbook-derived rows either all persist or none do.
- Demo catalog and imported data are visible only to Demo; Main catalog and imported data are visible only to Main.
- Spreadsheet `Class` is the cohort, `Level` is the website class title, and `Room` is the classroom.
- Catalog definitions come only from the reviewer; never infer Program, Campus, or Term from workbook abbreviations.
- Program fields are Name, Track, and Format. Tuition must not be collected, defaulted, displayed, or stored.
- Preserve photo-style wide workbook import, normalized export re-import, and existing simple workbook import.
- Do not modify QuickBooks or invoice/billing behavior.
- Browser write tests use a Demo account, capture created IDs, compare Main fingerprints, and clean up only captured Demo rows.
- Add no dependencies.

---

### Task 1: Extend and bound the reviewed setup contract

**Files:**
- Modify: `src/test/student-workbook-schema.test.ts`
- Modify: `src/lib/student-workbook-schema.ts`
- Modify: `src/components/portal/student-import-panel.tsx`

**Interfaces:**
- Consumes: multipart `setup` JSON posted to preview/commit routes.
- Produces: a parsed `StudentWorkbookSetup` with reusable `catalog` drafts and exactly-one existing ID or draft key references.

- [ ] **Step 1: Write failing setup parser tests**

Add valid Program/Campus/Term draft coverage:

```ts
const setup = parseStudentWorkbookSetup(JSON.stringify({
  catalog: {
    programs: [{ key: "program-1", name: "Summer SAT", track: "SAT", format: "Small group" }],
    campuses: [{ key: "campus-1", name: "Main Campus", location: "Wayne", modality: "In person" }],
    terms: [{ key: "term-1", name: "Summer 2026", startDate: "2026-06-22", endDate: "2026-08-07" }],
  },
  cohorts: [{
    sourceClass: "MWF",
    programDraftKey: "program-1",
    campusDraftKey: "campus-1",
    termDraftKey: "term-1",
    capacity: 20,
  }],
  assessmentDates: [],
}));

expect(setup.catalog.programs[0].format).toBe("Small group");
```

Also assert rejection for unknown keys, duplicate draft keys, duplicate normalized names, invalid enums, invalid term ranges, overlong text, excessive draft counts, dangling draft references, and both `programId` plus `programDraftKey` on one cohort.

- [ ] **Step 2: Run the parser tests and verify RED**

Run: `npx vitest run src/test/student-workbook-schema.test.ts`

Expected: FAIL because the current strict parser does not accept `catalog` or draft-key references.

- [ ] **Step 3: Implement the minimal setup types and parser**

Add bounded interfaces:

```ts
export interface PlannedProgramInput {
  key: string;
  name: string;
  track: "SAT" | "ACT" | "Admissions" | "Support";
  format: string;
}

export interface PlannedCampusInput {
  key: string;
  name: string;
  location: string;
  modality: "In person" | "Hybrid" | "Online";
}

export interface PlannedTermInput {
  key: string;
  name: string;
  startDate: string;
  endDate: string;
}
```

Normalize the absent legacy `catalog` value to empty arrays, keep parsing strict, and make `isStudentWorkbookSetup` in the import panel accept only the same validated shape used by the server.

- [ ] **Step 4: Run setup tests and verify GREEN**

Run: `npx vitest run src/test/student-workbook-schema.test.ts src/test/student-import-routes.test.ts`

Expected: all setup and route contract tests PASS.

- [ ] **Step 5: Commit the setup contract**

Use a Lore commit describing why reusable bounded drafts are required and what parser behavior was verified.

---

### Task 2: Plan exact reuse, conflicts, and planned catalog records

**Files:**
- Modify: `src/test/student-academic-import-planner.test.ts`
- Modify: `src/lib/student-academic-import-planner.ts`

**Interfaces:**
- Consumes: partition-scoped existing catalogs, validated setup drafts, and workbook academic rows.
- Produces: planned catalog rows with server-generated IDs, cohort references to those IDs, blocking requirements, and preview counts.

- [ ] **Step 1: Write failing planner tests**

Cover:

```ts
expect(plan.programs).toEqual([
  expect.objectContaining({
    id: expect.stringMatching(/^program-/),
    name: "Summer SAT",
    track: "SAT",
    format: "Small group",
    demo: true,
  }),
]);
expect(plan.cohorts[0].program_id).toBe(plan.programs[0].id);
```

Add assertions for one shared draft across MWF/TTHS, exact-name identical-field reuse, exact-name conflicting-field block, duplicate normalized planned names block, dangling key block, and Main/Demo catalogs never resolving across partitions. Assert new user-facing errors say `Source cohort (Excel Class)` rather than `Source Class`.

- [ ] **Step 2: Run planner tests and verify RED**

Run: `npx vitest run src/test/student-academic-import-planner.test.ts`

Expected: FAIL because the planner currently resolves only existing catalog IDs.

- [ ] **Step 3: Implement catalog resolution before cohort planning**

Introduce a normalized-name helper and planned output types:

```ts
interface PlannedAcademicProgram {
  id: string;
  name: string;
  track: ProgramTrack;
  format: string;
  demo: boolean;
}
```

Resolve each input draft once. Reuse a matching same-partition record only when every material field matches; otherwise add a blocking requirement. Generate IDs on the server planner, never from client draft keys. Resolve cohort IDs from either the existing record or the planned record.

- [ ] **Step 4: Run planner tests and verify GREEN**

Run: `npx vitest run src/test/student-academic-import-planner.test.ts`

Expected: all academic planning tests PASS, including schedule and assessment-date behavior.

- [ ] **Step 5: Commit planner behavior**

Use a Lore commit documenting exact-name replay semantics and cross-partition constraints.

---

### Task 3: Make catalog storage partition-safe and remove Program tuition

**Files:**
- Create via CLI: `supabase/migrations/<generated>_inline_import_catalog_creation.sql`
- Modify: `src/lib/supabase/database.types.ts`
- Modify: `src/lib/domain.ts`
- Modify: `src/lib/portal.ts`
- Modify: `src/lib/live-portal.ts`
- Modify: `src/test/live-portal.test.ts`

**Interfaces:**
- Adds `demo boolean not null` to Programs, Campuses, and Terms.
- Removes `public.programs.tuition` and application Program tuition fields.
- Adds same-partition catalog/cohort integrity and partition-aware RLS.

- [ ] **Step 1: Lock application behavior with failing type/mapping tests**

Assert Program mappings no longer require or expose `tuition`, and catalog rows preserve `demo` through live mappings.

- [ ] **Step 2: Generate the migration using the repository command**

Run: `npm run db:new -- inline_import_catalog_creation`

Expected: a timestamped migration is created under `supabase/migrations/`.

- [ ] **Step 3: Implement robust catalog partition backfill**

The migration must:

1. add nullable `demo` columns;
2. classify catalog rows used only by Demo or Main;
3. clone records referenced by both partitions and repoint Demo cohorts;
4. classify unreferenced rows as Main;
5. set `demo not null`;
6. add unique `(id, demo)` keys and composite cohort foreign keys;
7. add normalized-name uniqueness within each partition;
8. replace catalog RLS policies with partition-aware authenticated reads;
9. drop `programs.tuition`.

Use normalized uniqueness equivalent to:

```sql
create unique index programs_demo_normalized_name_key
  on public.programs (demo, lower(regexp_replace(btrim(name), '\\s+', ' ', 'g')));
```

- [ ] **Step 4: Remove tuition and add demo in generated/application types**

Delete only Program tuition fields. Do not alter invoice totals, billing pages, or QuickBooks. Add `demo` to all catalog row/insert/update types and local fixtures.

- [ ] **Step 5: Verify migration and type/model tests**

Run:

```sh
npx vitest run src/test/live-portal.test.ts
npm run typecheck
```

Expected: PASS with no Program tuition references outside historical migrations.

- [ ] **Step 6: Commit the partition schema and model change**

Use a Lore commit recording the live backfill constraint and the rule that billing tuition is out of scope.

---

### Task 4: Expand the atomic workbook RPC for planned catalogs

**Files:**
- Modify: `supabase/migrations/<generated>_inline_import_catalog_creation.sql`
- Modify: `src/lib/supabase/database.types.ts`
- Modify: `src/test/student-import-operations.test.ts`

**Interfaces:**
- Consumes: `p_programs`, `p_campuses`, `p_terms`, then the existing directory/academic payloads.
- Produces: one transaction result with catalog, directory, cohort, class, enrollment, assessment, and result counts.

- [ ] **Step 1: Write failing commit payload/result tests**

Assert the repository sends planned catalogs before cohorts and preserves `demo`:

```ts
expect(rpcArgs.p_programs).toEqual([
  expect.objectContaining({ name: "Summer SAT", demo: true }),
]);
expect(result).toMatchObject({ programsCreated: 1, campusesCreated: 1, termsCreated: 1 });
```

- [ ] **Step 2: Add a backward-compatible RPC overload**

Keep the existing signature during migration-first deployment. Add an expanded overload that validates payload sizes, required fields, normalized uniqueness, same-partition references, and actor access before writing.

The transaction order is catalog records, cohorts, directory rows, sessions, assessments, then results. Use exact-ID or normalized-name conflict checks that make replay safe without silently accepting changed fields.

- [ ] **Step 3: Add database-level atomicity and isolation tests where available**

Cover a late invalid score or cohort reference and assert no catalog row remains. Cover a Demo payload referencing Main catalog IDs and assert rejection.

- [ ] **Step 4: Update database function types**

Add the expanded arguments and returned catalog counts without removing the old overload from the generated type surface until deployment is complete.

- [ ] **Step 5: Run operation/type tests and verify GREEN**

Run:

```sh
npx vitest run src/test/student-import-operations.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the transaction boundary**

Use a Lore commit documenting transaction order, replay behavior, and the retained legacy overload.

---

### Task 5: Carry catalog plans through preview and commit repositories

**Files:**
- Modify: `src/test/student-import-operations.test.ts`
- Modify: `src/test/student-import-routes.test.ts`
- Modify: `src/lib/student-import-operations.ts`
- Modify: `src/lib/admin-operations.ts`

**Interfaces:**
- `prepareStudentImport` includes planned catalog rows/counts and remains read-only.
- `commitStudentImport` sends catalogs only to the final RPC.
- All catalog reads filter by the selected Demo/Main partition.

- [ ] **Step 1: Write failing repository regressions**

Assert preview loads `programs`, `campuses`, and `terms` with `.eq("demo", demo)`, permits an empty catalog because inline creation is available, and makes no RPC/write call. Assert commit includes catalog arrays and returns their counts.

- [ ] **Step 2: Run repository tests and verify RED**

Run: `npx vitest run src/test/student-import-operations.test.ts src/test/student-import-routes.test.ts`

Expected: FAIL on missing partition filters and payload fields.

- [ ] **Step 3: Implement preview/commit plumbing**

Default absent legacy setup catalog arrays to empty. Add planned counts and rows to `StudentWorkbookPreview`. Remove `Create a campus before importing students.` blockers because review can now create catalogs. Treat planned catalog rows as academic work so the expanded RPC is selected.

- [ ] **Step 4: Partition all touched service-role catalog reads**

Update import and admin cohort/program operations to filter by `demo`, including archive/reference checks. Never select a global first catalog record.

- [ ] **Step 5: Run operation and route tests and verify GREEN**

Run: `npx vitest run src/test/student-import-operations.test.ts src/test/student-import-routes.test.ts`

Expected: PASS and preview write spies remain untouched.

- [ ] **Step 6: Commit repository plumbing**

Use a Lore commit explaining preview purity and explicit partition filtering.

---

### Task 6: Add reusable inline catalog creation to workbook review

**Files:**
- Modify: `src/test/student-import-task7-ui-helpers.test.ts`
- Modify: `src/components/portal/student-import-academic-setup.tsx`
- Modify: `src/components/portal/student-import-preview-tabs.tsx`
- Modify: `src/components/portal/student-import-panel.tsx`
- Optionally create: `src/components/portal/student-import-catalog-drafts.tsx`

**Interfaces:**
- Displays existing and `Planned: <name>` options plus `Create new…`.
- Saves one review-level draft reusable by multiple source cohorts.
- Shows planned creations and disables final commit on blockers.

- [ ] **Step 1: Write failing pure-helper/UI tests**

Cover adding, selecting, editing, and removing drafts; reuse across MWF/TTHS; unique draft keys; selector option labels; and conversion back to strict setup JSON. Assert the visible legend is:

```text
Source cohort (Excel Class): TTHS
```

- [ ] **Step 2: Run UI tests and verify RED**

Run: `npx vitest run src/test/student-import-task7-ui-helpers.test.ts`

Expected: FAIL because the current setup supports only existing IDs.

- [ ] **Step 3: Implement shared review-level draft state**

Keep forms controlled and bounded. Program fields: Name, Track, Format. Campus fields: Name, Location, Modality. Term fields: Name, Start date, End date. Do not add tuition. Saving a draft selects its key on the active source cohort and exposes it to other cohort selectors.

- [ ] **Step 4: Add planned creation preview summaries**

Render Programs, Campuses, and Terms with source cohorts that reference them, along with planned counts. Keep actual commit disabled whenever the server preview contains catalog or academic blockers.

- [ ] **Step 5: Run focused UI tests and verify GREEN**

Run: `npx vitest run src/test/student-import-task7-ui-helpers.test.ts src/test/student-import-routes.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit review UI behavior**

Use a Lore commit recording the workbook terminology and shared-draft interaction.

---

### Task 7: Finish partitioning all catalog consumers

**Files:**
- Modify: `src/lib/live-portal.ts`
- Modify: `src/lib/admin-operations.ts`
- Modify: affected portal/admin tests under `src/test/`

**Interfaces:**
- Every Program/Campus/Term load and mutation is explicitly scoped by `demo`.
- Existing visible behavior remains the same inside each partition.

- [ ] **Step 1: Find every catalog table query**

Run: `rg -n 'from\("(programs|campuses|terms)"\)|\.from\('(programs|campuses|terms)'\)' src`

Classify each as Demo/Main-scoped or privileged migration-only.

- [ ] **Step 2: Add failing query-scope regressions**

Add focused mocks asserting the selected `demo` filter is applied to read, archive, reference check, and default-lookup paths.

- [ ] **Step 3: Apply the smallest query changes**

Reuse the existing visibility/scope helpers. Avoid new abstraction layers unless two or more call sites genuinely share the exact query contract.

- [ ] **Step 4: Verify affected tests**

Run: `npx vitest run src/test/live-portal.test.ts src/test/admin-operations.test.ts`

If the second file has a different repository name, run the actual matching admin-operation test files returned by `rg --files src/test | rg 'admin|portal'`.

- [ ] **Step 5: Commit catalog consumer isolation**

Use a Lore commit naming the explicit application-level isolation defense in addition to RLS.

---

### Task 8: Run full static, unit, and database verification

**Files:**
- Modify only if verification exposes a defect.

- [ ] **Step 1: Run focused feature suites**

Run:

```sh
npx vitest run \
  src/test/student-workbook-schema.test.ts \
  src/test/student-academic-import-planner.test.ts \
  src/test/student-import-operations.test.ts \
  src/test/student-import-routes.test.ts \
  src/test/student-import-task7-ui-helpers.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run repository gates**

Run:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: all PASS with no known warnings introduced by this feature.

- [ ] **Step 3: Apply the migration to the linked Supabase project**

Use the repository/Supabase-approved migration workflow. Confirm migration history, then inspect live catalog columns, constraints, functions, and RLS policies.

- [ ] **Step 4: Run Supabase advisors**

Run security and performance advisors after schema changes. Resolve feature-caused issues; document unrelated pre-existing findings.

- [ ] **Step 5: Commit any verification fixes**

Use a focused Lore commit rather than folding unrelated repairs into feature commits.

---

### Task 9: Prove the real upload path in Demo and clean up exactly

**Files:**
- Use: `src/test/fixtures/adaptive-score-import.xlsx`
- Use or generate from existing test tooling: normalized export round-trip workbook
- Modify: `docs/HANDOFF.md`
- Store non-source evidence only in existing ignored/local test-artifact locations.

**Interfaces:**
- Exercises the deployed UI, real multipart upload, preview, final RPC, export, and re-preview.

- [ ] **Step 1: Record Main and Demo fingerprints before writes**

Capture counts/IDs for Programs, Campuses, Terms, cohorts, sessions, students, enrollments, assessments, and results. Main must remain identical throughout the Demo test.

- [ ] **Step 2: Upload the photo-style fixture through the Demo UI**

Use the real file input. Define a new Program, Campus, and Term in review; reuse them for MWF/TTHS as applicable; enter required per-cohort assessment dates; and verify the source-cohort wording.

- [ ] **Step 3: Prove preview purity**

Before clicking final import, query the database and assert all fingerprints are unchanged. Verify the review shows three planned catalog creations and the expected downstream cohorts/classes/assessments.

- [ ] **Step 4: Commit and verify atomic results**

Click the final import action once. Confirm exact Demo catalog/cohort/session/student/enrollment/assessment/result rows and that each catalog/cohort row has `demo = true`. Confirm Main fingerprints are unchanged and a Main login cannot see the created catalog records.

- [ ] **Step 5: Verify idempotent replay**

Upload the same file/setup again. The preview must plan zero duplicate catalog creations and the commit must not duplicate directory or academic rows.

- [ ] **Step 6: Verify normalized export compatibility**

Download the combined export, upload it back into review, and confirm both `Student Information` and `Scores` are detected with no catalog regression.

- [ ] **Step 7: Clean up only captured Demo IDs**

Delete the created Demo rows in dependency order using exact captured IDs. Re-run Demo and Main fingerprints. Never use broad name-only cleanup.

- [ ] **Step 8: Update the handoff**

Document migration, UX, Demo E2E evidence, replay/export results, cleanup, and remaining risks without storing credentials or proprietary data.

---

### Task 10: Deploy and verify production behavior and latency

**Files:**
- Modify only if production verification finds a defect.

- [ ] **Step 1: Review the final diff and history**

Run `git diff --check`, confirm only intended tracked files are staged, and leave `.superpowers/sdd/` artifacts untouched.

- [ ] **Step 2: Push the verified branch**

Push `main` only after tests, migration, and Demo E2E pass.

- [ ] **Step 3: Deploy the verified commit to Vercel**

Confirm the production alias points to the new deployment and that environment configuration still targets the intended Supabase project.

- [ ] **Step 4: Re-run the critical production browser smoke test**

Verify Demo sign-in, import review, planned catalog forms, preview purity, a disposable Demo commit/cleanup if safe, and Main invisibility.

- [ ] **Step 5: Re-measure production latency**

Measure authenticated dashboard, students, cohorts, calendar, and import-review navigation on the Vercel deployment. Target under one second for warmed, representative requests while preserving all functionality.

- [ ] **Step 6: Check production logs and hand off**

Inspect runtime logs for RPC, auth, or serialization errors. Report deployed commit, live URL, verification evidence, simplifications, and any residual external risks.
