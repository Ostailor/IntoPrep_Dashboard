# Photo-Style Workbook Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import a sanitized structural reproduction of the photographed merged-header camp workbook while preserving the normalized `Student Information` + `Scores` export round trip.

**Architecture:** Broaden wide-profile detection only at the header-band boundary: a candidate's first row must contain at least two context labels, while the reconstructed band must contain `Name`, `Class`, `Level`, and `Room`. Keep normalized detection separate. Infer only recognized directory fields from wide workbooks, ignore unknown/sensitive columns by default, and retain editable mappings in the existing preview.

**Tech Stack:** TypeScript, Next.js 16, Vitest, `@oai/artifact-tool` for the synthetic `.xlsx`, Playwright browser E2E, Supabase Demo partition.

## Global Constraints

- Never use proprietary values from the photo; all fixture and browser data is synthetic and Demo-only.
- Preserve `Class` as the exact cohort name, `Level` as the website class/session title, and `Room` as the classroom.
- Scores remain in assessments/results, never student custom fields.
- Preserve simple and normalized workbook detection and normalized export re-import behavior.
- Unknown, password, policy, resource-link, and diagnostic columns default to ignored.
- Do not add dependencies or modify QuickBooks.
- Browser commits may target Demo only; capture exact IDs, verify Main fingerprints, and clean up only captured Demo rows.

---

### Task 1: Reconstruct context spread across the photographed header band

**Files:**
- Modify: `src/test/student-workbook-profile.test.ts`
- Modify: `src/lib/student-workbook-profile.ts`

**Interfaces:**
- Consumes: `detectStudentWorkbook({ sheets, selectedSheet? }): DetectedStudentWorkbook`
- Produces: wide detection where `Name`/`Class` may be above `Level`/`Room`, plus recognition of the `M` score leaf.

- [ ] **Step 1: Write the failing detector regression**

Add a workbook table whose first header row contains `No`, `Class`, `ID`, `PW`, `Name`, `School`, grouped contact labels, and `HW1`; whose lower rows contain `Level`, `Room`, `PSAT`, `RW`, `M`, and `Total`. Assert:

```ts
expect(detected).toMatchObject({
  profile: "wide",
  directory: { headerRowNumbers: [2, 3, 4], dataStartRow: 5 },
});
expect(detected.academic?.columns).toEqual(expect.arrayContaining([
  expect.objectContaining({ sourceHeader: "HW1 / PSAT / M" }),
]));
```

- [ ] **Step 2: Run the detector regression and verify RED**

Run: `npx vitest run src/test/student-workbook-profile.test.ts`

Expected: FAIL because the current detector requires all four context headers in the first physical header row.

- [ ] **Step 3: Implement minimal band-wide detection**

In `findWideTable`, replace the four-label first-row gate with a bounded candidate gate:

```ts
const firstRowContextCount = WIDE_CONTEXT_HEADERS.filter(
  (header) => firstRowValues.includes(header),
).length;
if (firstRowContextCount < 2) continue;
```

Keep the existing reconstructed-column check requiring all four context labels across the complete band. Add `"m"` to `SCORE_LEAF_HEADERS` so photographed Math leaves contribute to wide detection.

- [ ] **Step 4: Run detector tests and verify GREEN**

Run: `npx vitest run src/test/student-workbook-profile.test.ts`

Expected: all profile tests PASS, including title-row and shifted-header regressions.

---

### Task 2: Keep photographed fixed columns safe and map grouped contacts

**Files:**
- Modify: `src/test/student-workbook-schema.test.ts`
- Modify: `src/test/student-import-schema.test.ts`
- Modify: `src/lib/student-workbook-schema.ts`
- Modify: `src/lib/student-import-schema.ts`

**Interfaces:**
- Consumes: reconstructed `WorkbookColumn.path` values and `inferStudentWorkbookMappings(detected)`.
- Produces: known mappings for photo context/contact columns and `ignore` mappings for `PW`, policy, links, and unknown fixed columns.

- [ ] **Step 1: Write failing mapping regressions**

Construct a detected wide workbook with these paths and expected directory mappings:

```ts
[
  { path: ["Name"], field: "fullName" },
  { path: ["Class"], field: "cohortName" },
  { path: ["School"], field: "school" },
  { path: ["Gr"], field: "gradeLevel" },
  { path: ["Student", "Cell"], field: "studentPhone" },
  { path: ["Student", "E-Mail"], field: "studentEmail" },
  { path: ["Parent", "Cell 1"], field: "parent1Phone" },
  { path: ["Parent", "Cell 2"], field: "parent2Phone" },
  { path: ["Parent", "E-Mail 1"], field: "parent1Email" },
  { path: ["Parent", "E-Mail 2"], field: "parent2Email" },
]
```

Assert `PW`, `Policy Report`, `Resource Link`, and an unknown diagnostic column infer `kind: "ignore"`. Add `Gr` as a grade alias regression.

- [ ] **Step 2: Run mapping tests and verify RED**

Run: `npx vitest run src/test/student-workbook-schema.test.ts src/test/student-import-schema.test.ts`

Expected: FAIL because grouped paths are not resolved and unknown one-level wide columns currently propose custom fields.

- [ ] **Step 3: Implement a focused wide-directory resolver**

Add a helper in `student-workbook-schema.ts` that normalizes `column.path` and returns known mappings for the grouped student/parent contact paths. Continue using academic mappings for student name, cohort, session, room, and scores. For any remaining wide column, use a known one-level registry match when available and otherwise return `{ kind: "ignore" }`.

Add `"gr"` to `gradeLevel` aliases in `student-import-schema.ts`. Do not add `PW`, password, policy, link, or score headers to student aliases.

- [ ] **Step 4: Run mapping tests and verify GREEN**

Run: `npx vitest run src/test/student-workbook-schema.test.ts src/test/student-import-schema.test.ts`

Expected: all mapping and alias tests PASS.

---

### Task 3: Replace the simplified fixture with a sanitized photo-style workbook

**Files:**
- Modify: `src/test/fixtures/adaptive-score-import.xlsx`
- Modify: `src/test/student-import-operations.test.ts`

**Interfaces:**
- Consumes: the real XLSX reader, workbook detector, mapping inference, and preview planner.
- Produces: a reproducible non-proprietary workbook used by integration and browser tests.

- [ ] **Step 1: Render and inspect the current fixture before editing**

Use `@oai/artifact-tool` to import the workbook, inspect its used range and computed styles, and render every populated sheet. Preserve its synthetic students and score semantics.

- [ ] **Step 2: Author the photographed structure**

Using `@oai/artifact-tool`, write and merge a three-row header band below `SAT Summer Camp 2026`. Include representative fixed columns, grouped student/parent contact columns, lower-row `Level` and `Room`, and repeated `HW1`–`HW3` score groups with `PSAT`, `BB07`, and `BB08` plus `RW`, `M`, and `Total` leaves. Keep all names, emails, phones, and scores synthetic.

- [ ] **Step 3: Add an integration assertion for the real XLSX**

Extend the existing fixture preview test to assert:

```ts
expect(preview.profile).toBe("wide");
expect(preview.mappingPlan.directory.columns).toEqual(expect.arrayContaining([
  expect.objectContaining({ sourceHeader: "PW", kind: "ignore" }),
  expect.objectContaining({ sourceHeader: "Student / E-Mail", kind: "known", field: "studentEmail" }),
]));
expect(preview.academicSourceRows).toEqual(expect.arrayContaining([
  expect.objectContaining({ assessmentTitle: "HW1 – PSAT" }),
  expect.objectContaining({ assessmentTitle: "HW1 – BB07" }),
]));
```

- [ ] **Step 4: Verify workbook values and visuals**

Inspect the header/data ranges, scan for formula errors, and render the populated sheet. Confirm merged headers, readable labels, typed numeric scores, and no proprietary content.

- [ ] **Step 5: Run fixture integration tests**

Run: `npx vitest run src/test/student-import-operations.test.ts src/test/student-workbook-profile.test.ts src/test/student-workbook-schema.test.ts`

Expected: all fixture, profile, mapping, and operation tests PASS.

---

### Task 4: Prove both formats through Demo UI and complete verification

**Files:**
- Modify: `.superpowers/sdd/task-11-report.md`
- Modify: `docs/HANDOFF.md`

**Interfaces:**
- Consumes: `src/test/fixtures/adaptive-score-import.xlsx` and `.superpowers/sdd/task11-artifacts/sheets-roundtrip.xlsx`.
- Produces: signed-in Demo browser evidence for both profiles and current verification documentation.

- [ ] **Step 1: Run focused and full automated gates**

Run sequentially:

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
git diff --check
```

Expected: exit 0 for every command and all tests PASS.

- [ ] **Step 2: Start production-mode local QA and sign in visibly**

Run: `INTO_PREP_LOCAL_QA=1 npm run start -- --port 3002`

Sign in as the code-defined local Demo QA Admin so the request-auth cookie is present.

- [ ] **Step 3: Upload the photo-style workbook through the actual file input**

Open `/students`, click `Import students`, choose `src/test/fixtures/adaptive-score-import.xlsx`, and preview. Confirm `Wide score workbook`, `Target: Demo data only`, grouped homework/test titles, `Class`/`Level`/`Room` mappings, and ignored `PW`/policy/link columns.

- [ ] **Step 4: Verify actual Demo commit safely**

If the synthetic fixture students are absent, create only those Demo students through the website. Capture all IDs, record Main counts/fingerprints, commit the import, verify exact scores/enrollments/assessments have `demo=true`, replay for idempotency, then delete only captured Demo IDs and confirm Main fingerprints are unchanged.

- [ ] **Step 5: Re-preview the normalized export workbook**

Upload `.superpowers/sdd/task11-artifacts/sheets-roundtrip.xlsx` without committing. Confirm `Normalized directory + scores profile`, `Target: Demo data only`, and `Cohorts → Cohort name`.

- [ ] **Step 6: Document evidence and stop test processes**

Update the E2E report and handoff with both-format evidence, exact test counts, Demo cleanup, and any external latency caveat. Close browser pages and stop port 3002.

