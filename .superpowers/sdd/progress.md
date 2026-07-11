Plan: docs/superpowers/plans/2026-07-09-student-spreadsheet-import.md
Baseline: 22 passing, 2 pre-existing failures before importer work.
User decision: leave unused QuickBooks expectation unchanged; update instructor navigation test to match the intentional hidden Cohorts page.
Task 0: complete (commits 3e082a5..5e76f59, review clean; Lore trailers verified by controller)
Task 1: complete (commits 5e76f59..195f704, corrected and re-reviewed clean; Lore trailers verified by controller)
Task 2: complete (commits 195f704..9788802, review clean; fixture render independently viewed; Lore trailers verified by controller)
Task 3: complete (commits 9788802..3f4425a, corrected and re-reviewed clean; Lore trailers verified by controller)
Task 4: complete (migration commits 3f4425a..e9ca582, corrected and re-reviewed clean; live BEGIN/ROLLBACK verified; type/legacy compatibility edits intentionally unstaged)
Task 5: complete (unstaged snapshot-isolated changes, corrected and final review clean; 21 focused tests passed)
Task 6: complete (unstaged snapshot-isolated changes, corrected and final review clean; 54 focused tests passed)
Task 7: complete (unstaged snapshot-isolated changes, corrected and final review clean; accessible workflow verified)

Plan: docs/superpowers/plans/2026-07-10-adaptive-score-workbook-import-export.md
Branch: feat/adaptive-score-workbooks
Task 1: complete (commits 1e2d673..298fc32, review clean; 17 focused tests, typecheck, ESLint, and build evidence recorded)
Task 2: complete (commits 298fc32..d086e0e, review clean after profile-specific Class/Cohort clarification; 38 focused tests and 42 workbook regressions passed)
Task 3: complete (commits d086e0e..a366f92, review approved after date-authority/cap fix; 20 focused tests passed)
Minor review ledger: Task 3 planner function is large; final reviewer should assess whether extraction is warranted without changing behavior.
Task 4: complete (commits a366f92..df56ed7, review clean after sheet-aware exclusions, display-only dates, and full snapshot reuse coverage; 84 focused tests passed)
Task 5: complete (commits df56ed7..00a9d18, review approved after raw JSON SAT bounds/shape/type fix; local reset, lint, fixtures, advisors, and compatibility checks passed)
Task 6: complete (commit 00a9d18..ca3a44f, review approved; 74 focused tests, lint, typecheck, and build passed)
Minor review ledger: Task 6 lacks direct tests for earlier planned workbook delta and 2,001-result rejection; final review should decide whether to add them.
Task 7: complete (commits ca3a44f..0fa4829, corrected and re-reviewed clean; 121 focused tests, lint, typecheck, and build passed)
Minor review ledger: Task 7 panel remains large and preview normalization duplicates a pure normalization pass; final review should assess without broad refactor.
Task 8: complete (commits 0fa4829..28ab195, corrected twice and re-reviewed clean; 30 focused tests and touched-file lint passed; shared typecheck/build will rerun after Task 9 RED settles)
Task 9: complete (commits 28ab195..d5de43c excluding interleaved Task 10 commits, corrected twice and re-reviewed clean; 70 focused tests, lint, typecheck, and build passed)
Task 10: complete (commits b7267f9..6c68a43 excluding interleaved Task 9 fixes, corrected twice and re-reviewed clean; actual sanitized XLSX, 55 focused tests, valid G5 pane, artifact-tool/LibreOffice/visual checks passed)
Task 11: complete with one documented environment-limited verification gap (live migration, actual Demo XLSX upload, invalid-row blocking, atomic rollback, corrected idempotent replay, all exports, artifact inspection, exact main invariance, and captured-ID cleanup passed; authenticated Chrome never exposed the native picker, so the visible Google Sheets round trip and normalized UI re-import were not tested)
Task 11 defect fix: complete (commits d5de43c..bf67e4d, strict microsecond session matching, exact 72-session regression, corrected and re-reviewed clean; 96 focused regressions, lint, typecheck, and build passed)
