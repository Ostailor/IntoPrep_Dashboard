# Inline Import Catalog Creation Design

Date: 2026-07-11

Status: Approved in conversation; pending written-spec review

## Purpose

Allow an administrator reviewing a student workbook import to define missing Programs, Campuses, and Terms without leaving the import flow. These definitions remain planned and read-only during preview. The final import commit creates the catalog records, cohort, recurring classes, enrollments, assessments, and scores in one database transaction.

The same change corrects the misleading `Source Class` wording and removes tuition from the Program model. The spreadsheet `Class` column remains the cohort name; spreadsheet `Level` remains the website class title; spreadsheet `Room` remains the classroom label.

## Goals

- Display `Source cohort (Excel Class): <value>` instead of `Source Class`.
- Let the reviewer choose an existing Program, Campus, or Term or define a planned one inline.
- Reuse one planned catalog definition across multiple source cohorts in the same review.
- Show every planned catalog creation before commit.
- Keep preview free of database writes.
- Create all planned records atomically with the reviewed workbook import.
- Keep Programs, Campuses, and Terms isolated between Demo and Main.
- Make exact replay idempotent.
- Remove tuition from the Program schema and application model.

## Non-goals

- A general standalone catalog-administration redesign.
- Importing Program, Campus, or Term definitions directly from arbitrary workbook columns.
- Automatically inventing Program, Campus, or Term values from `MWF`, `TTHS`, Level, or Room.
- Creating catalog records as soon as `Update preview` is clicked.
- Changing the unused QuickBooks implementation.

## Terminology

- **Source cohort**: the exact value from the workbook `Class` column, such as `MWF` or `TTHS`.
- **Website class**: the workbook `Level` value used as the recurring session title.
- **Classroom**: the workbook `Room` value.
- **Existing catalog record**: a Program, Campus, or Term already present in the selected Demo/Main partition.
- **Planned catalog record**: a Program, Campus, or Term defined in review but not persisted until commit.

## Approaches considered

### 1. Shared review drafts with atomic commit — selected

Planned catalog definitions live in the reviewed setup payload and become reusable options for every source-cohort card. The server validates them, shows their effects in preview, and sends them to the atomic workbook RPC on commit.

This preserves preview semantics, prevents half-finished catalog state, supports reuse between `MWF` and `TTHS`, and keeps the database boundary authoritative.

### 2. Embed definitions independently in each cohort card

This is locally simpler but repeats fields, makes reuse awkward, and risks creating duplicate catalog records for multiple source cohorts.

### 3. Create records immediately or in a separate catalog screen

This avoids expanding the import RPC but makes preview mutate the database or forces the administrator to leave the review. It also weakens rollback and cleanup guarantees.

## Review experience

### Source-cohort wording

Every visible `Source Class` label and academic setup error becomes user-facing source-cohort language. The review card legend is:

`Source cohort (Excel Class): TTHS`

Internal `sourceClass` wire keys may remain for backward compatibility; only user-facing language changes.

### Existing or planned selection

When an exact cohort does not exist, the review shows Program, Campus, Term, and Capacity.

Each catalog selector contains:

- catalog records from the selected Demo/Main partition;
- planned records already defined in this review, labeled `Planned: <name>`;
- `Create new…`.

Choosing `Create new…` expands the corresponding inline form. Saving the draft adds it to the shared review-level planned catalog and selects it for the current source cohort. Other source cohorts can then select the same draft.

### Planned Program fields

- Name: required bounded text.
- Track: required enum using the existing Program tracks (`SAT`, `ACT`, `Admissions`, `Support`).
- Format: required bounded text, such as `Small group`.

Tuition is not collected, defaulted, displayed, or stored.

### Planned Campus fields

- Name: required bounded text.
- Location: required bounded text.
- Modality: required enum (`In person`, `Hybrid`, `Online`).

### Planned Term fields

- Name: required bounded text.
- Start date: required valid calendar date.
- End date: required valid calendar date on or after the start date.

Term dates remain authoritative for recurring MWF/TTHS class generation.

### Preview presentation

The preview summary adds planned counts for Programs, Campuses, and Terms. A planned-creations section lists each definition and every source cohort that references it.

`Update preview` reparses and validates the workbook and setup but performs no writes. The final commit button remains disabled while any catalog or cohort setup blocker exists.

## Setup contract

`StudentWorkbookSetup` gains a bounded review-level catalog section:

```ts
interface PlannedProgram {
  key: string;
  name: string;
  track: "SAT" | "ACT" | "Admissions" | "Support";
  format: string;
}

interface PlannedCampus {
  key: string;
  name: string;
  location: string;
  modality: "In person" | "Hybrid" | "Online";
}

interface PlannedTerm {
  key: string;
  name: string;
  startDate: string;
  endDate: string;
}

interface StudentWorkbookSetup {
  catalog: {
    programs: PlannedProgram[];
    campuses: PlannedCampus[];
    terms: PlannedTerm[];
  };
  cohorts: Array<{
    sourceClass: string;
    selectedCohortId?: string;
    programId?: string;
    programDraftKey?: string;
    campusId?: string;
    campusDraftKey?: string;
    termId?: string;
    termDraftKey?: string;
    capacity?: number;
  }>;
  assessmentDates: Array<{
    sourceClass: string;
    assessmentTitle: string;
    date: string;
  }>;
}
```

For each Program, Campus, and Term reference, exactly one existing ID or planned key is allowed. Client keys are bounded review references only. The server never trusts them as database IDs.

The existing setup and multipart size limits remain in force. Catalog arrays, text lengths, and draft counts receive explicit upper bounds.

## Server planning

The server loads Programs, Campuses, and Terms only from the selected target partition. It resolves each source-cohort setup as follows:

1. Resolve an exact existing cohort or the explicitly selected cohort as today.
2. For a new cohort, resolve each metadata reference to an existing record or planned draft.
3. Compare planned names using trimmed, whitespace-normalized, case-insensitive equality inside the target partition.
4. If an exact existing name has identical fields, reuse it and plan no catalog insert. This makes replay idempotent.
5. If an exact existing name has conflicting fields, block preview and require the reviewer to select the existing value or rename the draft.
6. If two planned definitions normalize to the same name, block and require one reusable definition.
7. Generate database IDs on the server only after validation.
8. Build planned Programs, Campuses, Terms, cohorts, sessions, enrollments, assessments, and results as one reviewed plan.

The preview exposes human-readable planned catalog rows and counts but does not trust or round-trip database IDs generated during preview.

## Database changes

### Remove Program tuition

- Drop `public.programs.tuition`.
- Remove tuition from database types, domain types, preview fixtures, live mappings, and Program row mapping.
- Do not alter invoice or billing records as part of this feature.

### Partition catalog tables

Add `demo boolean not null` to:

- `public.programs`;
- `public.campuses`;
- `public.terms`.

Backfill rules:

- records referenced only by Demo cohorts become `demo = true`;
- records referenced only by Main cohorts or by no cohorts remain `demo = false`;
- if a record is referenced by both partitions, retain the original for Main, clone it for Demo with a new ID, and update Demo cohorts to the clone before adding partition constraints.

The current production audit found one Program, one Campus, one Term, two Demo cohorts, no Main cohorts, and no cross-partition shared references. The migration must nevertheless handle shared references safely.

Add:

- normalized-name uniqueness per partition;
- unique `(id, demo)` catalog keys;
- composite cohort foreign keys from `(program_id, demo)`, `(campus_id, demo)`, and `(term_id, demo)` to the matching catalog record;
- partition-aware indexes;
- partition-aware RLS read policies so authenticated Data API access cannot see the other partition.

Service-role application queries must also apply the selected Demo/Main filter explicitly.

## Atomic commit

Create a backward-compatible expanded `commit_student_workbook_import` RPC overload that accepts planned Programs, Campuses, and Terms in addition to the existing reviewed payloads.

The transaction order is:

1. validate actor, target partition, payload bounds, uniqueness, relationships, and catalog fields;
2. insert or safely reuse Programs, Campuses, and Terms in the target partition;
3. insert cohorts referencing same-partition catalog rows;
4. invoke the existing atomic directory-import layer;
5. insert sessions and assessments;
6. insert or update assessment results;
7. record planned/created catalog counts and structured setup in the import audit row;
8. return the combined counts.

Any failure rolls back catalog records and every downstream import effect. The existing RPC overload remains available during deployment so the migration-first release window does not break the currently deployed application.

Database uniqueness and relationship checks remain authoritative against concurrent commits. A same-name concurrent conflict must fail the complete transaction rather than leave a partial catalog.

## Demo/Main isolation

- Catalog options are filtered to the authenticated target partition.
- Existing IDs from the other partition are rejected during server planning and again in the RPC.
- Planned catalog rows receive the target partition on the server; the client cannot choose their `demo` value.
- Cohort composite foreign keys prevent a Demo cohort from referencing Main catalog metadata or the inverse.
- Exports remain partition-scoped and unchanged.

## Error handling

Preview blockers include:

- missing required Program, Campus, or Term fields;
- invalid track or modality;
- invalid or reversed Term dates;
- missing, unknown, or multiply defined draft keys;
- both an existing ID and planned key supplied for one reference;
- duplicate normalized draft names;
- same-name existing records with conflicting details;
- catalog IDs from the wrong partition;
- missing capacity or assessment dates;
- existing cohort ambiguity.

Errors use source-cohort wording, for example:

`Cohort setup is required for source cohort "TTHS" from the Excel Class column.`

The commit route reparses the same file, validates its digest and reviewed setup, and rebuilds the full plan. A stale or modified setup cannot bypass preview.

## Compatibility

- Existing imports that reference only existing Program, Campus, and Term IDs continue to work.
- Simple and normalized directory-only imports do not require catalog drafts.
- Wide and normalized academic imports keep existing score, class, room, cadence, and assessment-date semantics.
- Existing exports remain importable.
- The internal `sourceClass` key remains accepted to avoid an unnecessary wire migration.

## Performance

- No catalog form code or data request is added to initial portal navigation beyond the already deferred importer boundary.
- Planned catalog state remains inside the import modal chunk.
- Preview adds only bounded in-memory validation and the catalog rows already required for setup.
- Catalog inserts occur only during the final commit.

## Verification

### Automated tests

- Strict setup-schema parsing for catalog drafts, references, bounds, and invalid combinations.
- Academic planner tests for existing selection, planned creation, shared draft reuse, identical exact-name reuse, conflicting exact-name blocking, invalid dates, and cross-partition rejection.
- Import-operation tests for new planned payloads, server-generated IDs, replay counts, digest/setup binding, and RPC arguments.
- Route tests for malformed and oversized catalog setup.
- UI-helper/component tests for source-cohort wording, `Create new…`, shared planned options, and planned-creation summaries.
- Portal regressions confirming Program rows no longer depend on tuition.
- Migration/RPC tests covering atomic rollback, partition constraints, RLS, catalog count validation, and the backward-compatible overload.
- Full lint, typecheck, unit test, and production build gates.

### Demo E2E

1. Record Main and Demo counts plus stable non-PII fingerprints for Programs, Campuses, Terms, cohorts, sessions, enrollments, assessments, results, families, and students.
2. Sign in with an active Demo admin and visibly confirm `Demo data only`.
3. Upload the real synthetic photo-style XLSX through the file input.
4. Confirm `TTHS` is displayed as `Source cohort (Excel Class)`.
5. Define one planned Program, Campus, and Term in review and reuse them where applicable.
6. Confirm `Update preview` changes no database counts.
7. Confirm preview lists the planned catalog rows and complete downstream counts.
8. Commit and verify every created catalog and operational row is Demo.
9. Re-import the same workbook and require zero planned catalog, cohort, session, enrollment, and assessment creations; result updates or skips remain acceptable.
10. Confirm the normalized export still previews successfully.
11. Delete only captured Demo IDs in dependency order and require all Demo and Main fingerprints to return to baseline.
12. Verify browser console, Vercel runtime logs, and production health.

## Release sequence

1. Add the migration and backward-compatible RPC overload.
2. Apply the migration and verify catalog partition backfill and constraints.
3. Deploy application support for the expanded setup and RPC.
4. Run Demo E2E and exact cleanup.
5. Measure affected Vercel routes to ensure the importer remains deferred and normal navigation stays sub-second.

## Acceptance criteria

- The review says `Source cohort (Excel Class): TTHS`.
- The reviewer can define and reuse planned Programs, Campuses, and Terms without leaving the import.
- Program creation never asks for or stores tuition.
- Preview performs zero writes.
- Commit creates catalog and import records atomically.
- Demo and Main catalog visibility and references are strictly separated.
- Exact replay creates no duplicate catalog or academic records.
- Existing export-format imports and photo-style imports continue to work.
- Full automated and Demo browser verification passes, cleanup is exact, and production remains healthy.
