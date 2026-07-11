# Adaptive score workbook import and export design

## Purpose

Extend the existing student spreadsheet importer so an administrator can upload the wide, multi-row Excel or Google Sheets layout already used for summer-camp operations. The workflow must keep student information separate from assessment scores, translate spreadsheet Class/Level/Room values into the website's cohort and class-session models, and support a normalized export that can be edited and imported again.

The feature must be safe to test end to end in the demo partition without changing or exposing main-account data.

## Confirmed decisions

- Use an adaptive importer that recognizes the existing simple student table, the wide multi-row camp workbook, and the normalized two-sheet export.
- Treat the Excel `Class` column as the cohort name exactly as supplied. Do not invent or replace abbreviations.
- Treat Excel `Level` as the website class/session title.
- Treat Excel `Room` as the actual classroom.
- Combine homework sequence and test identifier into assessment titles such as `HW1 – PSAT`, `HW1 – BB07`, and `HW2 – BB08`.
- Keep scores in assessments and assessment results, never in student custom fields.
- Match a wide-workbook row to a student by exact normalized student name. Zero matches or multiple matches are blocking errors.
- Automatically enroll a uniquely matched student into the cohort named by the spreadsheet when that enrollment does not exist.
- Create a missing cohort after the administrator supplies its program, campus, term, and capacity.
- Require one assessment date for every distinct cohort and combined assessment title. The date applies to all students in that cohort/test group.
- Generate recurring classes for the selected term in Eastern Time: MWF means Monday, Wednesday, and Friday; TTHS means Tuesday, Thursday, and Saturday; all run from 8:00 AM to 3:30 PM.
- If Total is blank, calculate it from RW plus Math. If Total is present and does not equal RW plus Math, block that result.
- Export normalized student information and scores as separate worksheets.
- Provide a `Download Everything` action that returns one `.xlsx` workbook containing both worksheets, alongside separate downloads.
- Use file-based Google Sheets compatibility in this version: an administrator can upload/download `.xlsx` or CSV without granting the application direct Google Drive access.
- Perform real browser E2E verification with an actual uploaded workbook in a demo account, including a Google Sheets round trip.

## Approaches considered

### Adaptive wide import and normalized export (selected)

Detect the workbook structure, reconstruct merged multi-row headers, and translate the administrator's existing workbook directly. Export a stable two-sheet workbook for subsequent editing and re-import.

This requires the most parser and preview work, but removes repetitive spreadsheet conversion from the administrator's workflow and preserves a clean database model.

### Conversion-first workflow (rejected)

Convert the wide workbook to a normalized workbook, require the administrator to review it outside the application, and then upload it again. This reduces import complexity but adds an unnecessary second transfer step and makes the automation feel incomplete.

### One flat student-and-score table (rejected)

Repeat student information for every assessment row. This is simple to parse, but duplicates student data, makes blank-update behavior ambiguous, and conflicts with the requirement that scores remain separate from student information.

## Scope

### Included

- `.xlsx` and `.csv` upload using the existing import entry point and security model.
- Adaptive detection of simple, wide, and normalized workbook profiles.
- Multi-row and merged-header reconstruction for the wide camp workbook.
- Editable mapping for ambiguous or unfamiliar headers.
- Student-information updates through the existing student importer.
- Cohort creation prompts, automatic enrollment, recurring session generation, assessment creation, and result upsert.
- Per-cohort/test date prompts.
- Preview tabs for directory changes, cohorts/classes, enrollments, assessments/results, warnings, and errors.
- Atomic commit and import-run auditing.
- Separate Student Information and Scores exports plus a combined two-sheet workbook.
- Excel and Google Sheets round-trip testing.
- Demo/main partition enforcement across all new reads and writes.

### Not included

- Direct Google Drive or Google Sheets API synchronization.
- Attendance, billing, invoice, payment, messaging, or staff-account import/export.
- Guessing a schedule for an unrecognized cohort cadence.
- Persisting spreadsheet formulas. Displayed values are imported as untrusted data.
- Treating unknown score columns as custom student information.
- QuickBooks changes.

## Workbook profiles

The server detects a profile before showing the preview. The administrator can override a low-confidence detection, but cannot bypass profile-specific validation.

### Simple student table

The current importer behavior remains supported: one header row followed by one student per row, with flexible known-field and custom-field mappings.

### Wide camp workbook

This profile may contain a title row, multiple header rows, merged cells, fixed student/context columns, and repeated homework/test score groups. Detection looks for a compatible combination of student name, Class, Level, Room, and score labels rather than relying on a fixed row number or column letter.

The required context labels do not need to appear on the same physical header row. In the photographed camp workbook, `Name` and `Class` appear in the upper header rows while `Level` and `Room` appear lower in the same merged header band. Detection reconstructs the complete band first and then validates the combined column paths. It must not require all four labels in the first row of the band.

The parser scans a bounded header band above the first likely data row, expands merged/header group context horizontally and vertically, and builds a canonical path for each column. Example paths are:

- `Student / Name`
- `Class`
- `Level`
- `Room`
- `HW1 / PSAT / RW`
- `HW1 / PSAT / M`
- `HW1 / PSAT / Total`
- `HW2 / BB08 / RW`

Repeated text and blank merge placeholders are collapsed without carrying a group value across a real group boundary. The parsed paths, confidence, and source header cells are returned to the preview so an administrator can correct an ambiguous interpretation before commit.

The photographed format may also contain unrelated fixed columns such as `No`, `ID`, `PW`, `DoB`, student and parent contact subcolumns, policy-report values, level numbers, and resource links. Recognized student fields may be mapped through the directory registry; unknown or sensitive fixed columns default to ignored and never become scores. Unknown values inside homework score groups remain visible but ignored unless the administrator explicitly supplies a valid academic mapping.

### Normalized two-sheet workbook

The first-party export contains:

- `Student Information`: one row per student/family.
- `Scores`: one row per student and assessment.

Sheet names are matched case-insensitively through aliases so minor renaming does not make the workbook unusable. Stable helper columns may be included for safe round trips, but every referenced record is revalidated against the active partition and visible name. A workbook is never trusted merely because it resembles an application export.

## Canonical fields and aliases

Header definitions live in a shared, data-driven registry used by parsing, preview, export, and tests. Adding a new spelling should normally require a registry entry rather than a new parser branch.

Student/context mappings include:

- student name;
- external/student ID when present;
- school and grade;
- date of birth;
- student email and phone;
- parent emails and phones;
- spreadsheet Class (cohort);
- spreadsheet Level (session title);
- spreadsheet Room (classroom).

Score aliases initially include:

- `RW`, `R&W`, `Reading Writing`, and `Reading/Writing` -> Reading and Writing;
- `M`, `Math`, and `Mathematics` -> Math;
- `Total` and `Composite` -> Total.

The registry separates label normalization from score-range profiles so later assessment types can add different valid ranges without rewriting the header resolver.

Unknown fixed columns appear as unmapped student-information columns and can use the existing ignore/custom-field workflow. Unknown columns inside a detected score group appear as unmapped score columns and cannot silently become student custom fields.

## Photographed-header compatibility acceptance

The regression workbook uses synthetic Demo-only data and reproduces the visible structure without copying proprietary values:

- a `SAT Summer Camp 2026` title row;
- a multi-row merged header band containing `No`, `Class`, `ID`, `PW`, `Name`, `School`, `Gr`, `DoB`, grouped student/parent contact labels, and `Policy Report`;
- `Level` and `Room` on a lower header row than `Name` and `Class`;
- repeated `HW1`, `HW2`, and `HW3` groups with test identifiers such as `PSAT`, `BB07`, and `BB08`;
- score leaves using both `RW` and the photographed `M` alias, plus `Total` where the source group supplies it.

Acceptance requires all of the following:

1. The workbook is detected as `wide` without fixed row or column assumptions.
2. `Name`, `Class`, `Level`, and `Room` map to student match, cohort, website class/session, and classroom respectively.
3. Homework sequence and test identifier remain combined in assessment titles.
4. RW, Math, and Total remain academic score data and never enter student custom fields.
5. Password, policy, link, and unrecognized diagnostic columns default to ignored.
6. The normalized two-sheet export continues to import with its stable one-row headers and existing mappings.
7. A signed-in Demo browser preview accepts both the synthetic photographed format and the exported normalized format without committing Main data.

## Score-group reconstruction

For every score column, the parser resolves:

1. the outer homework/group label, such as `HW1`;
2. the test identifier, such as `PSAT` or `BB07`;
3. the score component, such as RW, Math, or Total.

The persisted assessment title is the normalized combination of the first two values, separated by an en dash. Source capitalization is preserved where practical, while comparison uses normalized whitespace and case.

Columns that contain diagnostic/raw subsection values but are not mapped to RW, Math, or Total remain visible as ignored/unmapped score columns. A group with no recognized score component produces no assessment result.

## Matching and academic planning

### Students

Wide-workbook student matching uses the exact normalized full name within the selected demo/main partition. Normalization trims outer whitespace, collapses repeated internal whitespace, and compares case-insensitively without fuzzy or partial matching.

- Exactly one match: continue.
- No match: block the row and show the source name.
- Multiple matches: block the row and show that the administrator must disambiguate the directory data.

The importer does not create a new student from a score-only row. Student creation or updates must have sufficient student-information mappings and appear separately in the directory plan.

### Cohorts

Excel `Class` is compared to cohort name using normalized case/whitespace while preserving the exact source value when creating a cohort.

- Exactly one match in the active partition and selected program context: reuse it.
- No match: prompt once for program, campus, term, and capacity, then plan a cohort creation.
- Multiple matches: block until the administrator selects or corrects a unique cohort context.

No abbreviation is synthesized by the application.

### Enrollments

A uniquely matched student is enrolled in the resolved spreadsheet cohort if needed. Existing active enrollment is reused. The preview distinguishes new enrollment, already enrolled, and blocked states.

### Sessions/classes

Excel `Level` becomes the website session title and Excel `Room` becomes the session room. Sessions are generated for every matching weekday from the selected term start through term end, inclusive, at 8:00 AM-3:30 PM in `America/New_York`.

- MWF generates Monday, Wednesday, and Friday sessions.
- TTHS generates Tuesday, Thursday, and Saturday sessions.
- An unrecognized cadence blocks session generation rather than guessing.

Existing sessions with the same partition, cohort, title, start/end time, and room are reused so re-importing is idempotent. Conflicting Level or Room values for the same planned cohort/date are reported before commit.

### Assessments and dates

The preview produces a date matrix with one required input for every distinct `(cohort, combined assessment title)` pair. A date entered for `MWF / HW1 – PSAT` applies to all matching MWF students, while `TTHS / HW1 – PSAT` has its own date.

An assessment is reused by active partition, cohort, normalized title, and date. Otherwise it is created with RW and Math sections. A result is unique by assessment and student.

## Score validation

- A blank score cell is absent, not zero.
- A score group with no RW, Math, or Total is ignored.
- RW and Math must be numeric and within the configured section range.
- Total must be numeric and within the configured total range.
- When RW and Math exist and Total is blank, Total is calculated as `RW + Math`.
- When all three exist, Total must equal `RW + Math`; a mismatch blocks that result.
- A Total without enough component information is allowed only if the selected score profile permits total-only results; the initial SAT profile requires the component scores used by this workflow.
- Text such as `UNMATCHED`, spreadsheet errors, and non-finite numeric values are blocking score errors, not zeroes.
- A result cannot commit without one student, one cohort, one combined test title, and one administrator-entered date.

The initial SAT score profile uses section and total constraints appropriate to the existing SAT workbook. Range rules remain registry-based so additional tests can be introduced without changing the import pipeline.

## Administrator workflow

### 1. Upload and detect

The administrator uploads a workbook through the Student Directory import panel. The server returns worksheet names, detected profile, header paths, confidence, source digest, and a bounded preview. Engineers must explicitly choose Demo or Main before preview; admins and staff inherit their account partition.

### 2. Review mappings

The mapping screen separates student/context mappings from score-group mappings. Ambiguous paths and unknown columns are highlighted. Any manual mapping is sent back on commit, where the server reparses the original file and validates the mapping again.

### 3. Complete setup

The administrator supplies:

- program, campus, term, and capacity once for each new cohort;
- term start/end dates used for recurring class generation when they are not already authoritative on the selected term;
- one assessment date for each cohort/test pair.

Repeated prompts are deduplicated. All values remain editable until commit.

### 4. Preview

Preview sections show:

- Student Information changes;
- cohorts to reuse or create;
- recurring class sessions to reuse or create;
- enrollment changes;
- assessments/results to create, update, skip, or block;
- warnings, ignored columns, and blocking errors.

The final confirmation summarizes the exact demo/main target and all operation counts. Engineers confirm the target a second time.

### 5. Atomic commit

The server independently authenticates, reparses the file, checks its digest and mappings, reruns all matching and validation, and submits one transaction. A validation or database failure rolls back all changes from that commit.

## Export workflow

The Student Directory provides:

- `Download Student Information`;
- `Download Scores`;
- `Download Everything`.

`Download Everything` returns a single `.xlsx` file containing both normalized worksheets. The individual actions may return one-sheet `.xlsx` files and CSV where appropriate. Generated workbooks use plain values and stable headers so Excel and Google Sheets can open, edit, and export them without preserving application-specific formatting.

### Student Information columns

The sheet contains the current supported directory fields, including stable helper identity where appropriate, student name, school, grade, student contacts, parent contacts, cohort membership, and configured custom student fields. It contains no assessment scores.

### Scores columns

The sheet contains one row per student/assessment with at least:

- Student Name;
- Cohort;
- Class;
- Room;
- Test Name;
- Test Date;
- RW;
- Math;
- Total.

The exported Class and Room come from the relevant session/context available for that cohort and assessment. If no unambiguous class/session context exists, the export leaves the field blank or uses an explicit warning value rather than guessing.

Exports are restricted to the selected partition. Demo exports contain only demo records; main exports contain only main records. Engineers choose the target explicitly.

## API and code boundaries

Extend the existing import modules instead of creating a competing importer:

- workbook profile detection and header-band reconstruction remain pure and testable;
- canonical student/context/score aliases live in a shared registry;
- spreadsheet decoding stays server-only;
- academic planning resolves cohorts, sessions, enrollments, assessments, and results without writing;
- preview endpoints return typed plans and blocking issues;
- commit reparses and validates before calling the transactional database boundary;
- export query/build modules are server-only and partition-aware;
- the existing import panel gains profile-specific mapping, setup, and preview sections through focused components.

The normalized import and export schema is versioned in code so future columns can be added without depending on display order.

## Database and transaction behavior

Use the existing students, cohorts, enrollments, sessions, assessments, and assessment-results tables. Scores are never copied into `students.custom_fields`.

Add only the schema support required for deterministic idempotency, partition-consistent relationships, and auditability. Before adding a unique constraint, inspect live data for conflicts and prefer a scoped unique index that matches existing domain behavior.

The atomic import function, callable only through the authenticated server/service boundary:

1. validates the actor and target partition;
2. creates or reuses missing cohorts from confirmed setup values;
3. creates or reuses generated sessions;
4. creates missing enrollments;
5. creates or reuses assessments;
6. upserts assessment results;
7. refreshes derived cohort counts as required;
8. records the completed import audit summary.

Every referenced family, student, cohort, enrollment, session, assessment, and result must belong to the target partition. Any cross-partition reference raises an error and rolls back the transaction.

Uniqueness/idempotency is enforced for:

- a resolved cohort within its partition and program/term context;
- a generated session by partition, cohort, title, date/time, and room;
- an assessment by partition, cohort, normalized title, and date;
- an assessment result by assessment and student;
- an enrollment by cohort and student.

Import audit data includes source filename, file digest, selected worksheet/profile, target partition, confirmed mappings/setup values, operation counts, bounded warnings/errors, actor, and timestamps. Sensitive cell values are not copied wholesale into logs.

## Demo/main isolation

The spreadsheet never controls the partition. Admin/staff operations derive it from the authenticated profile. Engineers explicitly select a target for each preview and commit and retain their cross-partition troubleshooting access.

All matching begins inside the selected partition. The database transaction repeats the partition checks instead of trusting API planning. Export queries follow the same contract.

Demo E2E verification may create and remove only synthetic `demo = true` records whose IDs were captured by the test. Main records are read-only throughout verification.

## Error handling

Blocking conditions include:

- unsupported or malformed workbook;
- no confidently resolvable data/header band;
- conflicting or incomplete score-group paths;
- unknown required score component;
- nonnumeric or out-of-range scores;
- supplied Total mismatch;
- zero or multiple student-name matches;
- zero/multiple unresolved cohort matches without completed setup;
- missing assessment date;
- unknown session cadence;
- conflicting Level/Room planning;
- stale source digest or mapping/setup values;
- any partition mismatch.

Warnings include ignored columns, blank optional values, normalized labels, pre-existing enrollment/session/assessment/result reuse, and calculated Total. Warnings never hide a blocking row.

Errors identify the source worksheet, row, group/test, and field without returning raw SQL, credentials, or unrelated records. Failed commits do not report success and do not leave partial academic data.

## Verification strategy

Implementation follows test-driven development for parser, planner, validation, export, and database behavior. Each behavior begins with a failing focused test before implementation.

### Sanitized workbook fixture

Create a synthetic `.xlsx` fixture modeled on the supplied screenshot without copying proprietary names or values. It includes:

- a title row and multiple merged header rows;
- fixed student, Class, Level, and Room columns;
- MWF and TTHS rows;
- HW1/HW2/HW3 groups;
- PSAT, BB07, BB08, and similar test identifiers;
- RW, Math, provided Total, calculated Total, mismatch, blank, and text-error cases;
- a duplicate-name ambiguity case and an unmatched-name case.

Visually inspect the fixture and generated export using the spreadsheet tooling before using it for E2E tests.

### Unit tests

- profile detection for simple, wide, and normalized workbooks;
- data-row/header-band discovery at varying row offsets;
- merged and multi-row path reconstruction without group bleed;
- canonical aliases and easy registry extension;
- combined test-name construction;
- separation of student information and scores;
- score range, blank, calculation, mismatch, and invalid-text behavior;
- exact normalized student matching with zero/one/multiple outcomes;
- cohort resolution and prompt deduplication;
- per-cohort/test date matrix generation;
- MWF/TTHS recurrence across term boundaries and daylight-saving transitions;
- Level/Room conflict detection;
- idempotent session, assessment, result, and enrollment planning;
- normalized two-sheet export and import round trip;
- demo/main override rejection.

### Service and database tests

- full rollback when any late operation fails;
- missing cohort plus sessions, enrollment, assessment, and result commit together;
- re-import updates/reuses instead of duplicating;
- assessment date separation between MWF and TTHS;
- composite/partition constraints reject cross-partition references;
- import audit counts match committed operations;
- export queries return only the selected partition.

### Required browser E2E test

The feature is not considered verified by parser or API tests alone. Run the complete workflow in a real browser using a demo admin account:

1. Record read-only counts and stable fingerprints for relevant main cohorts, sessions, enrollments, students, assessments, and results.
2. Capture the exact IDs of any pre-existing synthetic demo fixtures that may be reused.
3. Upload the sanitized wide `.xlsx` through the visible Student Directory UI.
4. Confirm profile detection and correct or confirm the header/score mappings.
5. Supply missing cohort metadata, term range, and distinct MWF/TTHS assessment dates.
6. Verify every preview section and one intentionally blocked Total mismatch.
7. Correct/exclude the blocking fixture row and commit through the UI.
8. Verify the resulting demo cohort, generated sessions, enrollment, assessment titles/dates, and RW/Math/Total results in the application and connected Supabase.
9. Re-upload the identical workbook and verify that it does not duplicate cohorts, sessions, enrollments, assessments, or results.
10. Use `Download Everything` and verify that the file contains `Student Information` and `Scores` with the expected rows.
11. Upload that workbook to Google Sheets using the available authenticated browser flow, export it back to `.xlsx`, and import the exported copy through the application.
12. Verify the Sheets round trip remains idempotent and preserves student/score separation.
13. Compare main counts/fingerprints with step 1 and prove they are unchanged.
14. Delete only the synthetic demo records created by this run, using their captured IDs, and verify cleanup without touching main data.

If browser automation cannot interact with a native file chooser, use the browser-visible upload control plus the narrowest safe file-injection mechanism available. Direct API checks may supplement the browser test but do not replace the required visible UI flow.

### Completion gate

Run focused tests throughout development, then run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

After applying the additive migration, inspect the connected Supabase schema, grants, RLS policies, constraints, and advisors. Capture evidence for the browser upload, database results, two-sheet export, Google Sheets round trip, idempotent re-import, main-data invariance, and demo cleanup.

## Rollout and recovery

- Apply additive schema changes before deploying code that calls them.
- Do not reset, truncate, reseed, or broadly delete production data.
- Keep the existing simple student importer available throughout rollout.
- Hide only the new academic-import/export controls if the required schema is unavailable.
- Because commit is atomic and idempotent, a failed import can be corrected and retried without manual partial-data cleanup.
- Rollback can disable the new UI/API paths while leaving additive audit data and constraints in place if they remain compatible with existing reads.

## Acceptance criteria

- The supplied screenshot-style structure can be represented by a sanitized workbook and parsed without hard-coded column letters or row numbers.
- Scores are persisted only as assessment results and export on the separate Scores worksheet.
- Excel Class creates/resolves the exact cohort, Level names generated sessions, and Room populates their classroom.
- MWF and TTHS sessions generate at 8:00 AM-3:30 PM Eastern across the selected term.
- The administrator provides one date per cohort/test combination.
- Exact-name ambiguity, missing matches, invalid scores, missing dates, and unknown cadence block commit.
- Re-import does not create duplicates.
- One `Download Everything` workbook contains both normalized sheets and survives a Google Sheets round trip.
- A real demo-account browser upload succeeds end to end and is verified in Supabase.
- Main data is unchanged before versus after E2E verification, and synthetic demo data is cleaned up precisely.
