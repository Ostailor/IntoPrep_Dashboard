# Task 11 Report: Live Migration and Demo Browser E2E

Status: implementation, live migration, actual demo XLSX upload, idempotent replay, exports, artifact inspection, main-data invariance, and exact cleanup are complete. The visible Google Sheets round trip is the only unverified item because the authenticated Chrome environment never exposed a native macOS file picker.

## Live Supabase migration

- Confirmed linked project ref: `uhtcbipwivvocbndxjqi` (`ACTIVE_HEALTHY`, Postgres 17).
- Immediately-before-apply read-only preflight: duplicate cohort/session/assessment natural keys all `0`; session/cohort, assessment/cohort, result/assessment, and result/student demo mismatches all `0`; adaptive RPC count `0`; adaptive migration history count `0`.
- `npm run db:push -- --dry-run` could not create the temporary CLI login role because the project rejected `ALTER ROLE`; no migration was applied by the CLI.
- Applied only `supabase/migrations/20260711040125_adaptive_student_score_workbook_import.sql` through the Supabase migration API.
- The API initially recorded generated history version `20260711061651`. A guarded migration-history-only repair changed that one exact row to repository version `20260711040125` without rerunning SQL. Post-repair remote history has exactly one `20260711040125 adaptive_student_score_workbook_import` row and zero `20260711061651` rows.
- Post-apply verification: exact 13-argument `public.commit_student_workbook_import` count `1`; `SECURITY INVOKER`; `search_path=public`; execute denied to `PUBLIC`, `anon`, and `authenticated`; execute allowed to `service_role`; all 10 migration constraints validated; all 3 natural-key indexes present.
- Advisors after apply: 113 security and 245 performance notices in the existing project; zero findings identified the new RPC or the three new natural-key indexes.

## Main-data baseline (non-PII)

Captured after migration and before browser mutations. Fingerprints exclude names, contact fields, and scores.

| Table | Main count | Stable fingerprint |
| --- | ---: | --- |
| families | 3 | `f6595c74abc19f0b69b80fe236feba2e` |
| students | 3 | `fca76626cb716671bbb728ddd471d707` |
| cohorts | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| enrollments | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| sessions | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| assessments | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| assessment_results | 0 | `d41d8cd98f00b204e9800998ecf8427e` |

## Visible Demo prerequisite creation

- Started local Next.js with `INTO_PREP_LOCAL_QA=1` at `http://localhost:3001` (port 3000 was already occupied).
- Used the Chrome extension browser surface and visibly signed in as the code-defined QA Admin.
- Created six fixture-matching synthetic students through `/students` -> `Add student`; no direct database seed was used.
- Read-only verification found exactly six captured students and six captured families, all `demo=true`.

Captured synthetic IDs for exact later verification and cleanup:

| External marker | Student ID | Family ID |
| --- | --- | --- |
| `E2E-WIDE-MAYA-20260711` | `student-b7d62429d4ef` | `family-0faca2b153d1` |
| `E2E-WIDE-ROHAN-20260711` | `student-dbfd098b6b89` | `family-75093bf2ef98` |
| `E2E-WIDE-TOTAL-20260711` | `student-6e5a5e70804a` | `family-9f547328317a` |
| `E2E-WIDE-TEXT-20260711` | `student-16ec85cd9545` | `family-37eabdafcf1e` |
| `E2E-WIDE-JORDAN-A-20260711` | `student-91c5c22e2e4c` | `family-95654928600d` |
| `E2E-WIDE-JORDAN-B-20260711` | `student-2309188e10c4` | `family-f7b8227bbcea` |

## First wide import and database verification

- A controller-owned isolated Playwright flow signed in through `/login`, uploaded the exact committed fixture, and verified the visible `Wide scores profile`, `Camp Scores`, and `Demo data only` target.
- Verified mappings: Name -> student name, Class -> cohort, Level -> website class/session, Room -> classroom; score triplets resolve to RW/Math/Total with combined titles `HW1 – PSAT`, `HW1 – BB07`, `HW2 – BB08`, and `HW3 – BB08`.
- Reused the single existing MWF cohort. TTHS prompted once for Program/Campus/Term/Capacity and was created with the reviewed Demo metadata.
- Entered distinct authoritative dates for each MWF/TTHS combined test.
- Before exclusion, the UI showed 1 cohort, 72 classes, 2 enrollments, 8 assessments, 8 score creates, and 12 score rows. Rows 7–10 visibly showed the intended total mismatch, nonnumeric RW, missing exact Demo student, and multiple exact Demo student blockers.
- Excluded only rows 7–10. The refreshed preview showed 8 score rows and enabled commit. Commit returned HTTP 200.
- Captured-scope database verification: 6/6 prerequisite students are Demo; 2 active Demo enrollments; 72 Demo sessions; 8 Demo assessments; 8 Demo results.
- MWF has 52 Monday/Wednesday/Friday sessions and TTHS has 20 Tuesday/Thursday/Saturday sessions. Every captured session resolves to 08:00–15:30 in `America/New_York`; website class/session and room values are G4/201 and G5/202. Assessment titles/dates and result RW/Math/Total values exactly match the reviewed fixture.

## Same-file idempotency defect and correction

- A fresh direct Playwright flow signed in through `/login`, uploaded the exact fixture, entered the same eight dates, excluded only rows 7–10, and refreshed the preview.
- The second preview correctly showed 0 cohorts, 72 classes, 0 enrollments, 0 assessments, 0 score creates, 8 score updates, and 8 score rows. Commit was enabled.
- The second `POST /api/students/import/commit` returned HTTP 500.
- Live Postgres logs give the exact cause: `duplicate key value violates unique constraint "sessions_import_natural_key"`.
- Root-cause correction: the planner's `sameSession` check compares timestamp strings literally. Supabase returns stored `timestamptz` values with a `+00:00` suffix, while generated sessions use the equivalent `.000Z` representation. The equal instants compare unequal, so the planner incorrectly sends all 72 existing sessions as creates; the RPC then correctly encounters the natural-key constraint. No second database migration is required.
- Atomicity evidence after the failed commit: captured scope remains exactly 72 sessions, 2 enrollments, 8 assessments, and 8 results. Audit history records one completed and one safe failed run for the fixture; no partial academic writes occurred.
- The correction landed in reviewed commits `05e47b8` and `bf67e4d`: valid session timestamps now compare by exact instant while preserving database precision; a 72-session regression test locks the behavior.
- Repeating the actual file upload after the correction produced a preview of 0 cohorts, 0 classes/sessions, 0 enrollments, 0 assessments, 0 score creates, 8 score updates, and 8 score rows. Excluding only rows 7–10 and committing returned HTTP 200.
- Post-replay natural-key counts remained exactly 72 sessions, 2 enrollments, 8 assessments, and 8 results. The earlier failed run therefore demonstrated atomic rollback, and the corrected run demonstrated same-file idempotency.

## Export verification

- Downloaded all three visible export actions through the Demo UI: Student Information, Scores, and Everything.
- Preserved the downloaded workbooks as `.superpowers/sdd/task11-artifacts/student-information.xlsx`, `scores.xlsx`, and `everything.xlsx`.
- Re-imported all three with artifact-tool. Formula scans returned zero formulas/errors.
- Student Information contains exactly one `Student Information` sheet and 8 Demo rows; Scores contains exactly one `Scores` sheet and 11 Demo rows; Everything contains exactly those two sheets with the same 8/11 rows.
- Date cells are typed numeric dates, score cells are typed numbers with nullable RW supported, and live database counts matched the exported Demo rows. Main remained 3 students and 0 results, so no main rows entered the Demo exports.
- Rendered both combined sheets and visually verified legible headers, values, and layout without clipping.

## Google Sheets environment blocker

- Reached authenticated Google Drive in Chrome as the connected user and visibly opened `New` -> `File upload`.
- The Chrome extension could not attach the local workbook because its file-URL permission is disabled.
- A final approved coordinate-only Computer Use attempt visibly clicked `File upload`, then inspected running applications and `com.apple.appkit.xpc.openAndSavePanelService`. No native Open/Save panel appeared; the panel service returned `kLSApplicationNotFoundErr`.
- No file was uploaded to Google Drive. Therefore the visible two-tab Sheets inspection, Sheets-exported XLSX, and normalized-profile UI re-import are explicitly **not tested** in this environment. Unit/integration coverage for normalized workbooks remains green, but it does not replace the required visible round trip.

## Main invariance and exact cleanup

- Immediately before cleanup, all seven main counts and non-PII fingerprints exactly matched the pre-E2E baseline.
- Captured 6 student IDs, 6 family IDs, 2 enrollment IDs, 72 session IDs, 8 assessment IDs, 8 result IDs, the one created TTHS cohort ID, and all 3 fixture import-run IDs. Dependency checks found zero unrelated attendance, contact, billing, messaging, accommodation, instruction, or cohort artifacts.
- Deleted only those exact captured Demo IDs in one guarded transaction. The pre-existing MWF cohort was retained, and its `enrolled` counter was recomputed from remaining active enrollments.
- Post-cleanup verification found zero captured students, families, enrollments, sessions, assessments, results, TTHS cohort, or import runs. MWF remains with `enrolled=0`.
- All seven main counts and fingerprints still exactly match baseline after cleanup.

## Final live-schema and local verification

- Migration history contains exactly `20260711040125 adaptive_student_score_workbook_import` and no generated-version duplicate.
- The exact 13-argument RPC remains `SECURITY INVOKER`, has `search_path=public`, is executable only by `service_role`, and all 10 migration constraints plus all 3 natural-key indexes are present and validated.
- Final Supabase advisors returned 113 security and 245 performance notices, with zero notices naming the new RPC or indexes.
- `npm run lint`, `npm run typecheck`, `npm run build`, and 35 focused import/route tests passed.
- Full test result: 294 passed and 1 unrelated pre-existing QuickBooks expectation failed (`src/test/portal.test.ts`, expected `QuickBooks invoice snapshot`). QuickBooks was not modified.

## Earlier Chrome-extension chooser blocker (superseded)

- Opened `/students` -> `Import students` and triggered the visible Chrome file chooser for `/Users/omtailor/IntoPrep_Dashboard/src/test/fixtures/adaptive-score-import.xlsx`.
- Chrome rejected `setFiles` because the ChatGPT Chrome Extension does not currently have file-URL access.
- Required recovery: enable **Allow access to file URLs** at `chrome://extensions` -> ChatGPT Chrome Extension -> Details. Documentation: https://developers.openai.com/codex/app/chrome-extension#upload-files
- The controller later completed the actual upload through isolated Playwright, so this chooser limitation no longer blocks the local application flow.

## Remaining external verification

- Enable **Allow access to file URLs** for the ChatGPT Chrome Extension (or use a browser environment that exposes the macOS picker), then perform the visible Google Sheets upload, inspect both tabs, download as XLSX, and re-import through the Demo UI as the Normalized profile. Re-run the same main-invariant and exact-ID cleanup procedure around that test.
