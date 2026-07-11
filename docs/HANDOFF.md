# IntoPrep Dashboard Handoff

Use this as the first file to read in a new chat. It captures the operational context needed to work on the IntoPrep Dashboard without rediscovering Supabase, Vercel, and release details.

## Project

- Repo: `/Users/omtailor/IntoPrep_Dashboard`
- App: Next.js App Router, TypeScript, Tailwind CSS
- Production URL: `https://dashboard-alpha-nine-82.vercel.app`
- Latest known production deployment URL: `https://dashboard-azw7axbi2-ostailors-projects.vercel.app`
- Local dev URL: `http://localhost:3000`
- Timezone for user-facing schedule logic: `America/New_York`

## Environment

Local secrets live in `.env.local`. Do not print or commit secret values.

Required env names are listed in `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
RESEND_API_KEY=
SYNC_ALERT_EMAIL_FROM=
SYNC_ALERT_EMAIL_TO=
NEXT_PUBLIC_DESKTOP_RELEASES_URL=
```

Use `.env.example` for names only. Read `.env.local` only when a command genuinely needs local configuration.

## Supabase

- Live Supabase project ref: `uhtcbipwivvocbndxjqi`
- Local Supabase config: `supabase/config.toml`
- Local API port: `45421`
- Local DB port: `45422`
- Local Studio port: `45423`
- Migrations directory: `supabase/migrations`
- Seed file: `supabase/seed.sql`

Preferred migration flow:

```bash
npm run db:new -- migration_name
npm run db:push
```

Useful local commands:

```bash
npm run db:reset
npx supabase status
npx supabase migration list
```

Important production rules:

- Use additive migrations for production schema changes.
- Do not reset, truncate, or reseed production tables during normal work.
- Do not run `supabase/seed.sql` against production unless the user explicitly asks for a production seed.
- Demo and live data are separated with the `demo` partition fields. Do not move students, enrollments, cohorts, or families across demo/main boundaries.
- If production data needs inspection or cleanup, use precise SQL and report candidate records before destructive deletion unless the user already approved the exact records.

Supabase-related source files to know:

- `src/lib/supabase/config.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/service.ts`
- `src/lib/supabase/browser.ts`
- `src/lib/supabase/database.types.ts`
- `src/lib/live-portal.ts`
- `src/lib/live-writes.ts`
- `src/lib/admin-operations.ts`
- `src/lib/staff-operations.ts`
- `src/lib/ta-operations.ts`
- `src/lib/instructor-operations.ts`
- `src/lib/demo-partition.ts`

## Vercel

- Vercel project name: `dashboard`
- Vercel project id: `prj_SBUpzPpE7XXcZ1ZlEo0adkTzZlGb`
- Vercel team/org id: `team_eWSA1x2V4mWVTLdaYG8S3PYh`
- Vercel local link metadata: `.vercel/project.json`
- Vercel config: `vercel.json`

Deploy production:

```bash
vercel deploy --prod --yes
```

Check production after deploy:

```bash
curl -I https://dashboard-alpha-nine-82.vercel.app/login
curl https://dashboard-alpha-nine-82.vercel.app/api/health
```

The app has scheduled Vercel cron in `vercel.json`. The cron route is `src/app/api/cron/morning-sync/route.ts` and expects `CRON_SECRET`.

## Local Development

Install and run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Production-like local build:

```bash
npm run build
npm run start
```

## Verification

Standard gate:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

One-command gate:

```bash
npm run ci
```

Use focused tests when iterating, then run the full gate before reporting completion for broad changes.

### Portal performance verification (2026-07-11)

The production-style local QA benchmark is recorded in `.superpowers/sdd/portal-performance-report.md`. With Next.js production mode on port 3002 and one warm-up plus five Chromium hard navigations per route, median load/FCP were: `/dashboard` 20.0/68 ms, `/students` 17.0/64 ms, `/calendar` 17.2/68 ms, and `/cohorts` 15.3/68 ms. Two idle seconds on `/students` produced zero sibling RSC requests; Calendar hover/focus produced only Calendar-specific RSC GETs. Lint, typecheck, and build passed; the full suite remained at the one known QuickBooks assertion (304/305 passed). Live portal SELECTs were previously measured around 1–15 ms, and migrations `20260627005833` and `20260627103752` plus their named indexes are live. These local-QA numbers do not include signed-in Supabase latency, Vercel cold starts, user-to-region latency, or first uncached fetches and are not a production sub-second guarantee. No valid pre-optimization browser baseline exists, so use this report's raw samples as the comparison baseline for future changes.

## Authentication And Roles

Roles:

- `engineer`: full platform and governance access
- `admin`: full portal visibility
- `staff`: enrollment, academics, family operations, and billing visibility
- `ta`: assigned cohort support, attendance/family outreach, and score operations
- `instructor`: assigned classes, attendance, same-day scores, and read-only student trends

Auth behavior:

- `/login` is the real entrypoint when Supabase env vars are configured.
- Accounts are provisioned by engineer/admin flows; self-signup is not the expected app path.
- First-login users with `must_change_password` must go through `/reset-password`.
- Suspended users are blocked from live data.
- Route protection is enforced in `src/proxy.ts`.

## Demo Vs Main Data

Keep demo and main/live separated.

Recent issue fixed: demo students/families appeared in main/live. The code now checks demo partition consistency when moving students between cohorts/classes. Preserve those checks when editing:

- `src/lib/staff-operations.ts`
- `src/lib/admin-operations.ts`
- `src/lib/demo-partition.ts`

### Student spreadsheet imports

- UI: `/students` → `Import students`.
- Template: `public/student-import-template.xlsx` (delete the labeled sample row before use).
- Wide-score demo fixture: `src/test/fixtures/adaptive-score-import.xlsx`.
- Routes: `POST /api/students/import/preview` and `POST /api/students/import/commit`.
- Permission boundary: only `engineer`, `admin`, and `staff` can import. Engineers must explicitly select Demo or Main; admin and staff targets come from the authenticated profile and ignore client target overrides.
- Supported profiles:
  - **Simple**: one student-directory table from `.xlsx` or `.csv`, with remappable/ignored columns and unknown headers proposed as sensitive custom fields.
  - **Wide scores**: merged/multi-row spreadsheet headers such as the camp workbook; score columns are grouped into combined names such as `HW1 – PSAT` instead of becoming student custom fields.
  - **Normalized**: an `.xlsx` containing the stable `Student Information` and/or `Scores` sheets produced by the exports.
- Wide semantics are exact: spreadsheet `Class` is the cohort name, `Level` is the website class/session title, and `Room` is the physical classroom label. Do not invent or normalize cohort abbreviations; match the `Class` value exactly inside the selected Demo/Main partition.
- A missing exact cohort prompts once for Program, Campus, Term, and Capacity before preview. Zero or multiple exact student-name matches block that score row. Invalid numeric scores and mismatched totals also block until the row is fixed or explicitly excluded.
- MWF cohorts generate Monday/Wednesday/Friday sessions; TTHS cohorts generate Tuesday/Thursday/Saturday sessions. Generated classes run 8:00 AM–3:30 PM in `America/New_York`. The operator enters one test date per cohort/test combination, so the date is shared by that cohort's students and may differ between MWF and TTHS.
- Scores remain in `assessments` and `assessment_results`, separate from student information. RW and Math are stored separately; a blank Total is calculated, while a supplied Total must equal RW + Math.
- The commit reparses the same file, verifies its digest plus reviewed mapping/setup, and uses `commit_student_workbook_import` for the expanded atomic transaction (`commit_student_spreadsheet_import` remains the directory-import layer). Runs are recorded in `student_import_runs`; custom labels remain in `student_field_definitions` and `students.custom_fields`.
- Migrations: `supabase/migrations/20260710024125_student_spreadsheet_import.sql` and `supabase/migrations/20260711040125_adaptive_student_score_workbook_import.sql`.

### Student spreadsheet exports

- UI: `/students` export menu.
- **Download Student Information** creates one normalized `Student Information` sheet.
- **Download Scores** creates one normalized `Scores` sheet with student, cohort, class, room, test name/date, RW, Math, and Total.
- **Download Everything** creates one workbook containing both sheets.
- Exports are partition-scoped. A Demo export must contain only Demo records; a Main export must contain only Main records.

Demo-only verification procedure:

1. Record read-only counts and stable, non-PII hashes for main (`demo = false`) families, students, cohorts, enrollments, sessions, assessments, and assessment results.
2. Sign in with a demo admin, or use an engineer account and explicitly choose Demo. Never use Main for test uploads.
3. Create any synthetic fixture students through the website UI, capture every returned ID, then upload `src/test/fixtures/adaptive-score-import.xlsx` through the actual file control. Confirm the target visibly reads `Demo data only`.
4. Verify the Wide profile, Class/Level/Room mappings, combined test names, missing-cohort metadata prompts, per-cohort/test dates, and visible blockers. Exclude only the intentionally invalid rows and commit.
5. Re-import the same workbook with identical setup. Require zero planned cohorts, sessions, enrollments, or assessments and unchanged natural-key counts; result updates/skips are acceptable.
6. Download Student Information, Scores, and Everything. Inspect the combined workbook for exactly the two normalized sheets, typed dates/scores, no formulas/errors, expected Demo rows, and no Main rows.
7. For a Google Sheets round trip, visibly upload Everything to authenticated Drive/Sheets, inspect both tabs, download it as `.xlsx`, and re-import that downloaded file through the Demo UI. Require the Normalized profile and idempotent counts. Browser/API shortcuts do not replace these visible interactions.
8. Verify every created family, student, cohort, enrollment, session, assessment, result, and import run has `demo = true`; assert captured identifiers have no `demo = false` matches.
9. Recompute the seven main counts/hashes and require an exact match. Delete only the captured Demo IDs in dependency order, retain any pre-existing cohort, recompute its enrollment counter if needed, verify every captured ID is gone, and require the main fingerprints to match once more.

Latest Demo E2E (2026-07-11): actual wide XLSX upload, invalid-row blocking, atomic rollback, corrected same-file replay, all three exports, artifact-tool workbook inspection, exact main invariance, and captured-ID cleanup passed. The visible Google Sheets round trip was not completed because authenticated Chrome never exposed a native macOS file picker and the extension lacked file-URL access. Re-run step 7 when that browser permission/environment is available; do not claim the normalized Sheets round trip from unit tests alone.

Known unrelated test status: the full suite has one pre-existing QuickBooks alert expectation failure in `src/test/portal.test.ts` (`QuickBooks invoice snapshot`). QuickBooks is unused and was intentionally left unchanged.

Known remaining suspicious but not deleted record:

- `IntoPrep Launch Admin`
- Email: `admin.launch@intoprep.local`
- Reason: local-domain account. Do not delete unless the user approves it.

## Recent Production Cleanup Context

Approved fake/live records were deleted from live Supabase:

- Garcia family/student
- Lee family/student
- Patel family/student
- `Sample Admin` / `admin@intoprep.com` was soft-deleted/suspended and its template row was removed

After cleanup, the suspicious scan only had `IntoPrep Launch Admin` remaining.

## Current Development Caution

The working tree has many pre-existing changes from ongoing dashboard work. Do not revert unrelated files. Before editing, check:

```bash
git status --short
```

When changing files that already have user or prior-agent edits, inspect the local diff and work with those changes instead of resetting them.

## Main Operational Pages

Portal sections:

- `/dashboard`
- `/calendar`
- `/cohorts`
- `/attendance`
- `/students`
- `/families`
- `/programs`
- `/academics`
- `/messaging`
- `/billing`
- `/integrations`
- `/settings`

Key API areas:

- `src/app/api/attendance/route.ts`
- `src/app/api/calendar/instruction-blocks/route.ts`
- `src/app/api/academics/*`
- `src/app/api/settings/users/*`
- `src/app/api/intake/*`
- `src/app/api/billing/*`
- `src/app/api/ta/*`
- `src/app/api/instructor/*`

## Useful Notes For Future Chats

- The user often asks to update Supabase and Vercel after finishing changes. That means apply migrations/data fixes to the linked Supabase project when needed, then deploy production to Vercel.
- The user asked not to seed demo data directly through Supabase when creating demo scenarios; prefer using the website UI unless they explicitly authorize direct database edits.
- Use Chrome connector/browser testing when the user asks for UI verification.
- Keep destructive data operations narrow and auditable.
