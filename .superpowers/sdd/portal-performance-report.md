# Portal Performance Verification Report

Date: 2026-07-11  
Verifier: Codex performance Task 5  
Verdict: **PARTIAL** — the optimized local production target and functional regression checks pass, but no comparable pre-optimization browser baseline exists and the `/students` UI does not render a literal `Demo data only` label.

## Scope and environment

- Application: Next.js 16.1.6 production build.
- Server: `INTO_PREP_LOCAL_QA=1 npm run start -- --port 3002` at `http://localhost:3002`; ready in 111 ms.
- Browser: real Playwright-driven Chromium 147.0.7727.15, headless, 1440 × 1000 viewport.
- Account: code-defined `QA Admin` (`qa-admin@intoprep.local`), whose local-QA user is `demo: true`.
- Timing procedure: sign in once; for each route perform one unrecorded hard-navigation warm-up followed by five recorded `page.goto()` hard navigations. After `load`, read the Navigation Timing entry (`responseStart`, `domContentLoadedEventEnd`, `loadEventEnd`) and the `first-contentful-paint` Paint Timing entry. All values below are milliseconds from navigation start.
- Percentiles: nearest-rank; with five samples, p95 is the maximum observed sample.

## Optimized warm-route results

Every route passes the required median warm `load` and FCP threshold of less than 1,000 ms.

| Route | Median TTFB | p95 TTFB | Median DOMContentLoaded | p95 DOMContentLoaded | Median load | p95 load | Median FCP | p95 FCP | Target |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `/dashboard` | 9.1 | 9.4 | 15.7 | 16.1 | 20.0 | 20.5 | 68 | 72 | PASS |
| `/students` | 7.7 | 8.7 | 13.7 | 14.7 | 17.0 | 18.3 | 64 | 64 | PASS |
| `/calendar` | 7.5 | 7.7 | 13.4 | 13.9 | 17.2 | 17.7 | 68 | 72 | PASS |
| `/cohorts` | 6.4 | 7.3 | 12.3 | 13.3 | 15.3 | 16.5 | 68 | 68 | PASS |

### Raw samples

| Route | Sample | TTFB | DOMContentLoaded | load | FCP |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/dashboard` | 1 | 9.4 | 16.1 | 20.5 | 68 |
| `/dashboard` | 2 | 9.3 | 15.9 | 20.4 | 68 |
| `/dashboard` | 3 | 9.1 | 15.7 | 20.0 | 68 |
| `/dashboard` | 4 | 9.0 | 15.3 | 19.7 | 72 |
| `/dashboard` | 5 | 8.6 | 15.4 | 19.9 | 68 |
| `/students` | 1 | 8.7 | 14.7 | 18.3 | 64 |
| `/students` | 2 | 7.9 | 13.7 | 17.0 | 64 |
| `/students` | 3 | 7.7 | 13.5 | 16.6 | 60 |
| `/students` | 4 | 7.7 | 13.7 | 17.1 | 64 |
| `/students` | 5 | 7.1 | 13.1 | 16.3 | 60 |
| `/calendar` | 1 | 6.6 | 12.6 | 16.6 | 64 |
| `/calendar` | 2 | 7.6 | 13.9 | 17.4 | 68 |
| `/calendar` | 3 | 7.7 | 13.8 | 17.7 | 64 |
| `/calendar` | 4 | 7.4 | 13.4 | 17.1 | 68 |
| `/calendar` | 5 | 7.5 | 13.2 | 17.2 | 72 |
| `/cohorts` | 1 | 6.9 | 13.3 | 16.5 | 64 |
| `/cohorts` | 2 | 7.3 | 13.1 | 16.2 | 64 |
| `/cohorts` | 3 | 6.4 | 12.0 | 15.1 | 68 |
| `/cohorts` | 4 | 6.3 | 11.9 | 15.0 | 68 |
| `/cohorts` | 5 | 6.4 | 12.3 | 15.3 | 68 |

## Before/after evidence

No valid pre-optimization browser timing artifact was captured before Tasks 1–4. A historical reconstruction was attempted from commit `62210db`, immediately before the performance-plan commit, but that tree is not a standalone buildable baseline: it lacks prerequisite dirty-worktree modules/exports such as `cache-invalidation`, `canRunStudentImports`, and `resolveStudentImportTarget`. It would be misleading to invent or compare timings from a source tree that cannot produce the same application.

Therefore the table above is the reproducible **after** baseline for future comparisons. The requested numeric before/after delta remains an evidence gap.

## Intent-prefetch verification

On a fresh authenticated `/students` document:

- Two seconds idle without pointer or keyboard intent produced **0** `?_rsc=` requests for sibling portal routes.
- Hovering the `Instruction calendar` link produced exactly two GETs, both route-specific: `/calendar?_rsc=1pgt4` and `/calendar?_rsc=e0lhf`.
- In a fresh page, focusing the same link also produced exactly those two Calendar GETs and no unrelated route request.

Next.js split one `router.prefetch('/calendar')` intent into multiple internal Calendar RSC GETs. This satisfies the route-intent contract because both requests target only Calendar; it is not sibling-route amplification.

## Functional and partition regression checks

- Client navigation reached `/students`, `/calendar`, `/cohorts`, and `/dashboard`; each expected page heading was present.
- `/students` retained one each of `Download Student Information`, `Download Scores`, and `Download Everything`.
- `Import students` opened the `Bulk student import` panel. The file control and disabled preview step were present. No file was selected, previewed, or committed; no data was created.
- Browser evidence showed `QA Admin`, `qa-admin@intoprep.local`, and only the local fixture external IDs `QA-100` and `QA-200`. The code-defined local-QA admin has `demo: true`, and no Main label/data appeared.
- UI-label gap: the page says `The import will use your account's data partition.` but does not literally render `Demo data only` for an admin. Demo scoping is evidenced by the local-QA identity and fixtures, not by the explicit label requested in the acceptance wording.
- Console errors: 0. Uncaught page errors: 0.

## Final quality gate

Commands were run sequentially against the current shared worktree:

| Command | Result |
| --- | --- |
| `npm run lint` | PASS, exit 0 |
| `npm run typecheck` | PASS, exit 0 |
| `npm run test` | EXPECTED KNOWN FAILURE, exit 1: 304/305 tests passed; the sole failure is `src/test/portal.test.ts:413`, where `sync alerts > prioritizes sync failures for staff dashboards` still expects `QuickBooks invoice snapshot` |
| `npm run build` | PASS, exit 0; optimized production build compiled and generated 90/90 static pages |

The QuickBooks assertion was not changed.

## Live database evidence and boundaries

Previously established live read-only evidence shows the relevant portal `SELECT` queries average approximately **1–15 ms**. No live query or write was performed during this Task 5 run.

The live migration history includes:

- `20260627005833_portal_performance_indexes`, with its named partition-aware indexes live: `idx_cohorts_demo_archived_name`, `idx_sessions_demo_cohort_start`, `idx_enrollments_demo_cohort_status`, `idx_enrollments_demo_student`, `idx_students_demo_family`, `idx_assessments_demo_cohort_date`, `idx_assessment_results_demo_assessment`, `idx_assessment_results_demo_student`, `idx_academic_notes_demo_student_created`, `idx_session_instruction_notes_demo_session_updated`, `idx_instructional_accommodations_demo_student_updated`, `idx_instructor_follow_up_flags_demo_cohort_created`, `idx_resources_demo_cohort_published`, `idx_invoices_demo_family_due`, `idx_message_threads_demo_cohort_last`, `idx_message_posts_demo_thread_created`, `idx_leads_demo_submitted`, `idx_profiles_demo_full_name`, `idx_cohort_assignments_demo_cohort_user`, `idx_cohort_assignments_demo_user_cohort`, `idx_user_templates_demo_email`, `idx_account_audit_logs_demo_created`, `idx_billing_follow_up_notes_demo_family_created`, `idx_admin_tasks_demo_assignee_due`, `idx_admin_tasks_demo_due`, `idx_task_activities_demo_task_created`, `idx_admin_saved_views_demo_creator_updated`, `idx_family_contact_events_demo_family_contact`, `idx_admin_announcements_demo_active_start`, `idx_session_checklists_demo_session`, `idx_session_handoff_notes_demo_session_created`, `idx_attendance_exception_flags_demo_session_created`, `idx_session_coverage_flags_demo_session_updated`, `idx_attendance_records_demo_session_student`, `idx_approval_requests_demo_requested_created`, `idx_admin_escalations_demo_created`, `idx_admin_escalations_demo_creator_created`, `idx_outreach_templates_demo_owner_updated`, and `idx_feedback_submissions_demo_created`.
- `20260627103752_portal_navigation_hot_path_indexes`, with its named hot-path indexes live: `idx_sessions_start_at`, `idx_sessions_cohort_start_at`, `idx_enrollments_cohort_status_student`, `idx_enrollments_student_status_cohort`, `idx_assessments_cohort_date`, `idx_assessment_results_assessment_student`, `idx_assessment_results_student_assessment`, `idx_academic_notes_student_created_at`, `idx_session_instruction_blocks_instructor_start`, `idx_session_instruction_blocks_session_start`, `idx_attendance_records_session_student`, `idx_attendance_records_student_updated_at`, `idx_family_contact_events_family_contact_at`, `idx_admin_tasks_assigned_due`, `idx_cohort_assignments_user_cohort`, and `idx_cohort_assignments_cohort_user`.

These local-QA timings exercise production-rendered code and browser work but code-defined fixtures replace signed-in Supabase reads. Unauthenticated production checks likewise cannot prove signed-in live-route latency. Vercel cold starts, user-to-region latency, and the first uncached Supabase fetch remain external variables; sub-second behavior must not be represented as guaranteed for every production request.

## Reproduction

```bash
npm run lint
npm run typecheck
npm run test
npm run build
INTO_PREP_LOCAL_QA=1 npm run start -- --port 3002
```

Sign in with the code-defined local QA admin, then repeat one warm-up plus five hard navigations per route and read the Navigation/Paint Performance APIs. Preserve the 2-second no-intent window before testing Calendar hover/focus.
