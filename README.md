# IntoPrep Admin Portal

Internal dashboard prototype for IntoPrep operations. The app is built with Next.js App Router, TypeScript, and Tailwind CSS, and it implements the role model discussed in planning:

- `engineer`: full platform access, governance control, and admin-role management
- `admin`: full portal visibility
- `staff`: enrollment, academics, messaging, and billing visibility
- `ta`: assigned-cohort support, family messaging, and score operations
- `instructor`: assigned classes, attendance, same-day scores, and read-only trends only

The portal is also wired as an installable web app, so users can install it from the browser and receive updates through normal web deployments.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The root route redirects to the admin dashboard.

## Install as an app

- In a supported browser, sign in to the production portal and use the `Install app` button in the sidebar or the browser install prompt.
- The installed app updates from normal deployments; users do not need to reinstall it for each release.
- This is the recommended first delivery model because it behaves like an app while keeping release iteration fast.

## Downloadable desktop app

- A Tauri-based desktop shell now lives in [src-tauri](/Users/omtailor/IntoPrep_Dashboard/src-tauri).
- The shell loads the live production portal instead of bundling a separate copy of the app, so normal GitHub and Vercel releases update the in-app experience automatically.
- Browser-only PWA behavior is disabled inside the desktop shell, and the shell now opens directly at `/dashboard` so logged-in users avoid an extra startup redirect.
- The desktop shell now supports in-app native updates when updater secrets are configured and a newer tagged desktop release is published.
- Build locally with:

```bash
npm run desktop:build
```

- Run locally against the Next.js dev server with:

```bash
npm run desktop:dev
```

- Override the production portal URL for desktop builds with `DESKTOP_APP_URL` if you move from the current Vercel hostname to a custom domain.
- Desktop release automation is defined in [desktop-release.yml](/Users/omtailor/IntoPrep_Dashboard/.github/workflows/desktop-release.yml).
- macOS internet downloads must be signed and notarized. Configure the Apple GitHub secrets listed in [release-and-migrations.md](/Users/omtailor/IntoPrep_Dashboard/docs/release-and-migrations.md) or Gatekeeper will show the “Apple could not verify” warning.
- The desktop updater also requires GitHub secrets for `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, and `TAURI_UPDATER_PUBLIC_KEY`.
- If Apple signing secrets are not configured, the desktop release workflow still publishes the macOS build, but it will be unsigned and Gatekeeper will warn users when they open it.

## Enable Supabase auth and live operations

1. Copy `.env.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
RESEND_API_KEY=
SYNC_ALERT_EMAIL_FROM=
SYNC_ALERT_EMAIL_TO=
```

2. Apply the scoped schema in:
   - [supabase/migrations/20260314221500_portal_auth_and_attendance.sql](/Users/omtailor/IntoPrep_Dashboard/supabase/migrations/20260314221500_portal_auth_and_attendance.sql)
   - [supabase/migrations/20260314241000_engineer_role_and_role_management.sql](/Users/omtailor/IntoPrep_Dashboard/supabase/migrations/20260314241000_engineer_role_and_role_management.sql)
   - [supabase/migrations/20260314241100_engineer_policy_updates.sql](/Users/omtailor/IntoPrep_Dashboard/supabase/migrations/20260314241100_engineer_policy_updates.sql)
   - [supabase/migrations/20260315004500_account_governance_hardening.sql](/Users/omtailor/IntoPrep_Dashboard/supabase/migrations/20260315004500_account_governance_hardening.sql)
   - [supabase/migrations/20260315013000_live_staff_ta_writes.sql](/Users/omtailor/IntoPrep_Dashboard/supabase/migrations/20260315013000_live_staff_ta_writes.sql)
   - [supabase/migrations/20260315021500_google_forms_sync_source.sql](/Users/omtailor/IntoPrep_Dashboard/supabase/migrations/20260315021500_google_forms_sync_source.sql)
   - [supabase/migrations/20260315031500_scheduled_syncs_and_billing_sources.sql](/Users/omtailor/IntoPrep_Dashboard/supabase/migrations/20260315031500_scheduled_syncs_and_billing_sources.sql)
3. Seed the demo operational slice with [supabase/seed.sql](/Users/omtailor/IntoPrep_Dashboard/supabase/seed.sql).
4. Bootstrap accounts through Supabase seed data or the Settings screen:
   - first create or seed an `engineer` account
   - engineer provisions `admin` accounts with email + default password
   - admin provisions `staff`, `ta`, and `instructor` accounts

When Supabase is configured:

- `/login` becomes the real entrypoint.
- self-signup is disabled; accounts must be provisioned in Settings by an engineer or admin.
- first-login accounts are forced through `/reset-password` before they can access live portal data.
- `/forgot-password` and `/auth/confirm` handle email-based password recovery.
- route protection is enforced in [src/proxy.ts](/Users/omtailor/IntoPrep_Dashboard/src/proxy.ts)
- attendance writes go through [route.ts](/Users/omtailor/IntoPrep_Dashboard/src/app/api/attendance/route.ts)
- live academic notes, resource publishing, score writes, messaging replies, and cohort assignment updates now persist to Supabase through the `/api/academics/*`, `/api/messaging/reply`, and `/api/settings/users/assignments` routes
- Google Forms/CSV intake imports go through [route.ts](/Users/omtailor/IntoPrep_Dashboard/src/app/api/intake/import/route.ts)
- linked Google Forms sync source configuration goes through [route.ts](/Users/omtailor/IntoPrep_Dashboard/src/app/api/intake/source/route.ts)
- linked Google Forms sync execution goes through [route.ts](/Users/omtailor/IntoPrep_Dashboard/src/app/api/intake/sync/route.ts)
- linked QuickBooks sync source configuration goes through [route.ts](/Users/omtailor/IntoPrep_Dashboard/src/app/api/billing/source/route.ts)
- linked QuickBooks sync execution goes through [route.ts](/Users/omtailor/IntoPrep_Dashboard/src/app/api/billing/sync/route.ts)
- manual QuickBooks snapshot imports go through [route.ts](/Users/omtailor/IntoPrep_Dashboard/src/app/api/billing/import/route.ts)
- the morning automation bundle runs through [route.ts](/Users/omtailor/IntoPrep_Dashboard/src/app/api/cron/morning-sync/route.ts)
- all current portal sections use live Supabase-backed data, including `dashboard`, `calendar`, `cohorts`, `students`, `families`, `programs`, `academics`, `messaging`, `billing`, `integrations`, `attendance`, and `settings`

## Role previews

Each route accepts a `role` query parameter so you can preview permissions before wiring real auth:

- `/dashboard?role=admin`
- `/dashboard?role=engineer`
- `/dashboard?role=staff`
- `/dashboard?role=ta`
- `/dashboard?role=instructor`

The same `role` query parameter works on every section route:

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

## Google Forms intake sync

- Save the CSV export URL from the Google Sheet linked to your Google Form responses in `/integrations`.
- Live linked sync and manual CSV fallback are available from `/integrations` for `engineer`, `admin`, and `staff`.
- Use [intake-import-template.csv](/Users/omtailor/IntoPrep_Dashboard/public/intake-import-template.csv) as the starter shape for Google Forms exports and linked-sheet columns.
- The importer creates or updates `leads`, `families`, `students`, and `enrollments`, logs the run in `intake_import_runs`, and updates the `Google Forms registration import` sync card.
- `registered` and `waitlist` rows create enrollments when the cohort is explicit or can be inferred from the target program and campus.

## QuickBooks billing sync

- Save a linked QuickBooks invoice CSV URL in `/integrations` or upload a manual CSV snapshot from finance.
- Use [quickbooks-import-template.csv](/Users/omtailor/IntoPrep_Dashboard/public/quickbooks-import-template.csv) as the expected column shape for invoice snapshots.
- The billing sync matches invoices to `families` by email first, then family name, upserts `invoices`, records sync-job runs, and updates the `QuickBooks invoice snapshot` sync card.
- Warning or error-state syncs can send alert emails when `RESEND_API_KEY`, `SYNC_ALERT_EMAIL_FROM`, and either `SYNC_ALERT_EMAIL_TO` or active engineer/admin profile emails are configured.

## Scheduling and production

- [vercel.json](/Users/omtailor/IntoPrep_Dashboard/vercel.json) schedules the morning sync bundle twice per day in UTC (`11:00` and `12:00`) so one invocation lands in the 7 AM New York hour across daylight-saving changes.
- The cron route only executes inside the 7 AM Eastern window and deduplicates by local date, so only one morning sync run is accepted each day.
- Set `CRON_SECRET` in Vercel so the platform sends the `Authorization: Bearer ...` header automatically to the cron route.
- [next.config.mjs](/Users/omtailor/IntoPrep_Dashboard/next.config.mjs) now adds production-safe security headers, and [route.ts](/Users/omtailor/IntoPrep_Dashboard/src/app/api/health/route.ts) exposes a lightweight health endpoint.

## Verification

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Or run the full local gate in one command:

```bash
npm run ci
```

## Delivery pipeline

- [CI workflow](/Users/omtailor/IntoPrep_Dashboard/.github/workflows/ci.yml) runs on pull requests and pushes to `main`.
- [Deploy workflow](/Users/omtailor/IntoPrep_Dashboard/.github/workflows/deploy.yml) reruns checks, applies Supabase migrations, deploys to Vercel, and optionally hits `/api/health`.
- [Desktop release workflow](/Users/omtailor/IntoPrep_Dashboard/.github/workflows/desktop-release.yml) publishes macOS and Windows installers from GitHub when you tag `desktop-v*` or run it manually.
- The release and migration rules are documented in [release-and-migrations.md](/Users/omtailor/IntoPrep_Dashboard/docs/release-and-migrations.md).

## Notes

- The current implementation is seeded with mock data grounded in the public IntoPrep workflows researched during planning.
- Supabase auth, core cohort/schedule/student/family reads, program catalog summaries, governance views, academic notes/resources, billing snapshots, cohort messaging, lead intake, sync monitoring, and attendance persistence are implemented.
- Linked Google Forms sync, linked QuickBooks sync, manual CSV fallback, and sync run logging are implemented for the first real lead/enrollment and billing pipelines.
- The portal can be installed as a PWA via [manifest.ts](/Users/omtailor/IntoPrep_Dashboard/src/app/manifest.ts), [sw.js](/Users/omtailor/IntoPrep_Dashboard/public/sw.js), and [pwa-register.tsx](/Users/omtailor/IntoPrep_Dashboard/src/components/pwa-register.tsx).
- Engineers can provision, edit, and delete admin accounts from [src/app/api/settings/users/route.ts](/Users/omtailor/IntoPrep_Dashboard/src/app/api/settings/users/route.ts) via the Settings screen.
- Admins can provision, edit, and delete `staff`, `ta`, and `instructor` accounts, but cannot create, edit, or delete `admin` or `engineer` accounts.
- Engineers and admins can send password reset emails, suspend accounts, and review the live governance audit log in Settings.
- TA and staff users can now save coaching notes, publish cohort resources, update same-day assessment scores, and reply inside cohort-scoped messaging threads.
- Admins can update TA and instructor cohort assignments directly from Settings, and those changes sync back to `user_templates`.
- Suspended users are blocked from live portal data, and users with `must_change_password` cannot access live sections until the password is updated.
- Google Forms intake now supports linked-sheet CSV sync plus manual CSV fallback, and QuickBooks now supports linked CSV snapshots plus manual CSV fallback. The older portal and scheduling bridge still remain integration surfaces rather than direct API connections.
- GitHub Actions and additive Supabase migrations are the intended update path. Do not destroy or reset production tables during normal releases; ship new migrations instead.
- Instructor-facing surfaces intentionally hide family, billing, and broader student profile information.
