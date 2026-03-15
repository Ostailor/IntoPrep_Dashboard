# Release and Migrations

## Recommended delivery model

Use the portal as an installable web app first.

- Users open the production site and choose `Install app` from the browser prompt or the in-app install button.
- Updates are delivered by redeploying the web app. The service worker refreshes static assets without asking users to reinstall a native package.
- This keeps release iteration fast while avoiding desktop packaging complexity.

If you later need a true `.dmg`, `.pkg`, `.exe`, or App Store distribution, add a thin Tauri wrapper around the deployed portal. Do not start there unless offline/native OS APIs become a hard requirement.

## GitHub flow

1. Push work to a feature branch.
2. Open a pull request.
3. GitHub Actions `CI` runs lint, typecheck, tests, and production build.
4. Merge into `main`.
5. GitHub Actions `Deploy Production`:
   - reruns verification
   - applies versioned Supabase migrations
   - deploys the app to Vercel
   - optionally checks `/api/health`

## Required GitHub secrets

Set these in the GitHub repository settings before enabling the deploy workflow:

- `SUPABASE_DB_URL`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `PRODUCTION_URL`

## Required Vercel environment variables

Set these in Vercel for production:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `RESEND_API_KEY`
- `SYNC_ALERT_EMAIL_FROM`
- `SYNC_ALERT_EMAIL_TO`

## Safe migration rules

Never edit old migrations after they have shipped. Add a new migration every time.

Use additive changes first:

1. Add new columns or tables without breaking existing reads.
2. Backfill data in the migration or a follow-up migration.
3. Deploy application code that can read the new shape.
4. Switch writes to the new shape.
5. Remove old columns or tables only after production data has been verified.

Examples of safe changes:

- Add a nullable column, backfill it, then add `not null` in a later migration.
- Create `new_table`, copy data from `old_table`, deploy code to use both, then deprecate `old_table`.
- Rename fields by creating the new field first and copying values instead of dropping the old field immediately.

Examples to avoid:

- Dropping a column in the same release that introduces the replacement.
- Rewriting historical migrations and reapplying them.
- Resetting the database in production.

## Database update workflow

Create a migration locally:

```bash
npm run db:new -- add_feature_name
```

Apply locally or to the linked database:

```bash
npm run db:push
```

For hosted production, let GitHub Actions apply migrations from the current commit. That ensures the deployed app version and schema version move together.
