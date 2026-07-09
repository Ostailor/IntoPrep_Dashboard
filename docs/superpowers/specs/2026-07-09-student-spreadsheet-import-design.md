# Student spreadsheet import design

## Purpose

Add a safe bulk-import workflow to the Student Directory so IntoPrep staff can transfer existing Excel records without manually recreating each student. The importer must accept unfamiliar column labels, preserve additional student information, prevent partial writes, and make demo data invisible to non-engineer main accounts while preserving engineer troubleshooting access.

## Confirmed decisions

- Accept `.xlsx` and `.csv` files. Use the focused MIT-licensed `read-excel-file` package pinned to version `9.2.0` for workbook parsing; retain the existing CSV parser for CSV input.
- Use a three-step workflow: upload, map and preview, then confirm import.
- Keep stable operational fields in typed columns and store changing or unknown student fields through a field registry plus `students.custom_fields` JSONB.
- Treat `demo` as a tenant boundary for all records touched by this workflow.
- Demo accounts can read and write only `demo = true`; main accounts can read and write only `demo = false`.
- Engineers retain cross-partition read access for troubleshooting. Every engineer import requires an explicit Demo or Main target and an additional confirmation before commit.
- Derive the partition from the authenticated account for admin and staff users. Never accept a partition value from spreadsheet contents.
- Validate the complete included batch before writing and commit it atomically.
- Test committed imports only in the demo partition. Main data is inspected read-only before and after the demo test.

## Scope

### Included

- Student, family, optional cohort enrollment, and custom student profile fields.
- Direct `.xlsx` and `.csv` upload from the Student Directory.
- Worksheet selection for workbooks with multiple sheets.
- Automatic header aliases, editable mappings, unknown-field handling, preview, duplicate detection, and audit history.
- Additive database changes for custom fields, import history, stable external IDs, transactional import, row-level visibility, and partition-consistent relationships.
- A downloadable `.xlsx` template and a demo-only workbook fixture.

### Not included

- Importing attendance, scores, invoices, billing data, messages, or staff accounts.
- Importing multiple worksheets in one commit. The user selects one worksheet per import.
- Replacing the existing Google Forms intake sync.
- A repository-wide rewrite of every historical demo RLS policy. This work hardens the student/family/enrollment/import relationship set used by this feature.

## Roles and partition behavior

- `admin` and `staff`: may import into the partition on their profile only.
- `engineer`: may view both partitions and must select `Demo` or `Main` for each import. The UI has no preselected engineer target.
- `ta` and `instructor`: cannot access the importer.
- Role preview remains read-only.

The server ignores any client attempt to set another partition for a non-engineer. The database import function also checks the actor and target relationship before writing. Service-role access is never exposed to the browser.

## User experience

Add an `Import spreadsheet` action beside `Add student` on the Student Directory. Keep the import UI in a dedicated component so the existing directory component does not continue to grow.

### Step 1: Upload

- Accept `.xlsx` and `.csv` only.
- Maximum file size: 4 MB.
- Maximum data rows per commit: 2,000.
- For `.xlsx`, list worksheets and default to the first non-empty worksheet. The user can choose a different worksheet before previewing.
- For engineers, require a Demo/Main target before parsing the preview. Display the target continuously through the workflow.

### Step 2: Map and preview

The server returns source headers, suggested mappings, worksheet names, a file digest, validation results, and a bounded row preview. Each source column can be:

- mapped to a known field;
- mapped to an existing custom field;
- created as a new custom field;
- or ignored.

Known mappings include:

- external student ID;
- full student name or separate first/last name;
- grade, school, target test, and focus;
- student email and phone;
- parent 1 and parent 2 names, emails, and phones;
- family notes;
- cohort ID or cohort name;
- registration date.

Header matching is case-insensitive and ignores punctuation, underscores, hyphens, and repeated whitespace. Alias definitions live in one shared module used by production and tests.

Unknown headers default to `Create custom field`, but they are never created until the mapping is confirmed. New custom fields default to sensitive and use an inferred type of text, number, date, or boolean that the user can adjust.

Every row is classified as `create`, `update`, `skip`, `warning`, or `error`. The preview shows the reason, target cohort, and duplicate match. Users can exclude rows. Blocking errors must be corrected or excluded before commit.

### Step 3: Confirm and import

Show included row count, creates, updates, cohort enrollments, custom fields, skipped rows, warnings, and the target partition. Engineers must confirm the target again. Commit re-uploads the file plus the selected worksheet and mapping; the server reparses and revalidates it instead of trusting normalized browser data.

On success, show created, updated, enrolled, skipped, and warning counts with a link back to the filtered directory. On failure, show a concise reason and keep the mapping state so the user can correct and retry.

## Parsing and normalization

Create a pure shared import-schema module containing canonical field keys, aliases, normalization, mapping validation, and row validation. Keep file decoding in a server-only module.

- CSV input uses the existing quote-aware CSV parser after moving it to a shared implementation used by production and tests.
- XLSX input uses `read-excel-file/server` and reads cell values as strings, numbers, booleans, or dates.
- Empty trailing rows and columns are discarded.
- Formula results are imported as displayed values; formulas are not stored or executed.
- HTML, scripts, and spreadsheet instructions are treated as plain untrusted values.
- Text is trimmed and internal whitespace normalized. Emails are lowercased for matching while preserving the normalized value.
- Dates are stored as ISO date strings where the mapped field expects a date.

## Matching and update rules

All matching queries are restricted to the target partition before comparison.

Match an existing student in this order:

1. non-empty external student ID;
2. unique student email;
3. parent 1 email plus normalized student name;
4. unique normalized student name plus school.

An ambiguous match is a blocking error. New records use random system IDs; deterministic IDs from spreadsheet values are not used. The optional external ID receives a unique partition-scoped index.

For updates, blank spreadsheet cells do not erase existing values. Non-empty mapped values replace the corresponding value. Custom fields are merged by key, so only imported keys change. Re-importing the same workbook must update or skip existing students rather than create duplicates.

Rows sharing the same parent email within the target partition share a family. Without a reliable family match, a new family is created for the student. Missing optional fields use the current directory-safe defaults; first and last name remain required.

Cohorts match by exact ID first and then case-insensitive exact name within the target partition. No match or multiple matches is a blocking error. If no cohort column is mapped, the student imports without an enrollment.

## Database changes

Create one additive migration with the following changes.

### Students

- Add `external_id text null`.
- Add `custom_fields jsonb not null default '{}'::jsonb`.
- Add a check requiring `jsonb_typeof(custom_fields) = 'object'`.
- Add a partial unique index on normalized `(demo, external_id)` when the external ID is non-empty.

### Student field definitions

Create `student_field_definitions` with:

- `id`, stable `key`, mutable `label`, `data_type`, `header_aliases`, `required`, `sensitive`, `sort_order`, archive timestamps, audit timestamps, creator, and `demo`;
- a unique `(demo, key)` constraint;
- RLS enabled;
- partition-aware read policies for admin/staff and cross-partition engineer reads;
- direct table writes denied to browser roles and performed only through service-role server paths;
- explicit Data API grants required by current Supabase table-exposure behavior.

### Student import runs

Create `student_import_runs` with filename, file digest, selected worksheet, target partition, status, mapping JSON, row counts, error samples, actor, and timestamps. Enable RLS and use the same partition visibility rule, with the engineer exception.

### Partition constraints

Add unique `(id, demo)` keys and composite foreign keys:

- `students(family_id, demo) -> families(id, demo)`;
- `enrollments(student_id, demo) -> students(id, demo)`;
- `enrollments(cohort_id, demo) -> cohorts(id, demo)`.

Live inspection on 2026-07-09 found zero mismatches across all three relationships, so the migration can add and validate these constraints without data repair. The migration still fails rather than guessing if a mismatch appears before deployment.

### Transactional import function

Create a `SECURITY INVOKER` batch function callable only by `service_role`. Revoke execution from `PUBLIC`, `anon`, and `authenticated`, and explicitly grant it to `service_role`. The function:

- verifies the actor/target partition contract supplied by the authenticated server route;
- rechecks partition consistency for every matched family, student, cohort, and enrollment;
- creates or updates families and students;
- merges custom JSON fields;
- creates missing enrollments without duplicating existing ones;
- refreshes affected cohort enrollment counts;
- writes the completed import-run record;
- returns created, updated, enrolled, and skipped counts.

Any raised error rolls back the entire function call.

## API and component boundaries

- `student-import-schema`: pure field registry, aliases, normalization, row and mapping validation.
- `student-spreadsheet`: server-only CSV/XLSX decoding and worksheet discovery.
- `student-import-preview`: partition-scoped duplicate/cohort/custom-field resolution with no writes.
- `student-import-commit`: permission checks, reparse/revalidation, RPC call, audit logging, and cache invalidation.
- `/api/students/import/preview`: multipart preview endpoint.
- `/api/students/import/commit`: multipart commit endpoint.
- `StudentImportPanel`: client workflow state and accessible upload/mapping/preview UI.

Preview and commit endpoints authenticate independently and reject password-change-required or suspended accounts through the existing viewer resolution.

## Error handling

Blocking errors include unsupported files, oversized files, missing headers or rows, duplicate mapped destinations, missing names, invalid mapped types, ambiguous duplicates, cross-partition matches, ambiguous cohorts, too many rows, and stale custom-field mappings.

Warnings include defaulted optional fields, ignored columns, rows without cohorts, and non-blocking value normalization. Warnings do not prevent commit.

The commit endpoint never reports success after a partial write. After a rolled-back database error, the server records a separate failed import-run entry without exposing raw SQL, secrets, or unrelated data. Error samples are bounded and values containing spreadsheet formulas or markup are rendered as text.

## Verification strategy

Implementation follows test-driven development: add each failing behavior test, verify the expected failure, implement the minimum behavior, then keep the focused and full suites green.

### Unit tests

- CSV quoting, XLSX cell types, multiple worksheets, blank rows, size and row limits.
- Header normalization, aliases, unknown fields, mapping conflicts, and custom-field type inference.
- Full-name splitting, required fields, target-test normalization, dates, and blank-update preservation.
- Duplicate matching precedence, ambiguity detection, cohort matching, and idempotent re-import planning.
- Non-engineer partition override rejection and engineer target requirements.

### Database and service tests

- Atomic rollback when a later row fails.
- Identical source values in demo and main produce distinct records and never overwrite the opposite partition.
- Composite foreign keys reject all cross-partition family/student/cohort relationships.
- Demo and main RLS visibility for admin/staff; engineer visibility across both.
- Custom fields and field definitions remain partition-scoped and sensitive values follow existing student-sensitive access rules.
- Re-import updates/skips instead of duplicating.
- Import-run counts match committed rows.

### Spreadsheet artifact

Use the spreadsheet artifact tooling to create and visually verify one polished `student-import-template.xlsx`. Commit a compact demo fixture containing recognized aliases, an unknown custom column, dates, booleans, duplicate/update cases, and an optional cohort column.

### Browser and connected Supabase verification

1. Record read-only counts and stable hashes for main families, students, enrollments, and cohorts.
2. Start the website in local QA mode or use an authenticated production demo account.
3. Use Chrome to upload the generated workbook through the Student Directory as a demo admin.
4. Verify mapping, preview statuses, target banner, commit result, and the resulting `demo = true` records in connected Supabase.
5. Re-upload the same workbook and verify no duplicate students or enrollments.
6. Verify no matching `demo = false` records were created or changed and compare the main counts/hashes with step 1.
7. Exercise one blocking preview error and one transaction rollback case.
8. Remove only the exact QA records created by this verification, after capturing their IDs, and confirm main data remains unchanged.

Do not sign in to or mutate the main account for browser testing.

### Completion gate

Run focused tests during development, then:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

After applying the additive migration, run Supabase security and performance advisors, verify explicit grants and RLS, and execute read-only queries proving demo/main separation.

## Rollout and recovery

- Apply the additive migration before deploying code that uses the new columns or RPC.
- Do not reset, truncate, or reseed production.
- The UI remains hidden until the required schema is present.
- A failed import is retriable because the commit is atomic and the file digest/mapping are recorded.
- If rollout must be reversed, hide the UI and stop calling the RPC; additive columns and audit rows can remain without affecting existing student reads.
