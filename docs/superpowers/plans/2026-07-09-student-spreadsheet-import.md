# Student Spreadsheet Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and demo-test an atomic `.xlsx`/`.csv` student importer with flexible headers, custom profile fields, and database-enforced demo/main isolation.

**Architecture:** A pure import-schema module normalizes headers and values, a server-only decoder reads CSV/XLSX workbooks, and a partition-scoped planner produces a preview and commit payload. A service-role-only `SECURITY INVOKER` Postgres function commits families, students, custom fields, enrollments, and the audit run in one transaction.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Vitest 4, Supabase/Postgres, Tailwind CSS 4, `read-excel-file@9.2.0`, OpenAI spreadsheet artifact tooling, Chrome connector.

## Global Constraints

- Preserve all pre-existing workspace changes; stage only files named by the active task.
- Use `apply_patch` for source edits and `npm run db:new -- student_spreadsheet_import` to create the migration filename.
- Add no dependency except the approved, exact `read-excel-file@9.2.0` package.
- Demo accounts read/write only `demo = true`; main accounts read/write only `demo = false`.
- Engineers retain cross-partition reads, but every engineer import requires an explicit Demo/Main target and confirmation.
- Spreadsheet contents can never select or override the target partition.
- All included rows commit atomically; no success response may represent a partial write.
- Browser commit testing uses a demo account only. Main data is read-only and compared before/after.
- Do not reset, truncate, or seed production, and do not deploy the dirty workspace to Vercel.
- Every production behavior starts with a focused failing test and an observed expected failure.
- Every commit follows the repository Lore commit protocol.

---

## File structure

**Create**

- `src/lib/student-import-schema.ts` — canonical fields, aliases, mappings, normalization, type validation.
- `src/lib/student-spreadsheet.ts` — server-only CSV/XLSX decoding and worksheet discovery.
- `src/lib/student-import-planner.ts` — pure partition-scoped match/preview planning.
- `src/lib/student-import-operations.ts` — authenticated preview/commit orchestration and Supabase RPC.
- `src/app/api/students/import/preview/route.ts` — multipart preview endpoint.
- `src/app/api/students/import/commit/route.ts` — multipart atomic commit endpoint.
- `src/components/portal/student-import-panel.tsx` — upload, mapping, preview, confirmation UI.
- `src/test/student-import-schema.test.ts` — normalization/mapping/value tests.
- `src/test/student-spreadsheet.test.ts` — CSV/XLSX decoder tests.
- `src/test/student-import-planner.test.ts` — matching, partition, cohort, and idempotency tests.
- `src/test/student-import-operations.test.ts` — permission/target/commit error tests.
- `src/test/fixtures/student-import-demo.xlsx` — compact real workbook fixture.
- `public/student-import-template.xlsx` — admin-facing template.
- The timestamped `student_spreadsheet_import.sql` path printed by `npm run db:new -- student_spreadsheet_import` — schema, RLS, constraints, grants, RPC. The filename is intentionally command-generated per the Supabase CLI contract.

**Modify**

- `package.json`, `package-lock.json` — pin `read-excel-file@9.2.0`.
- `src/lib/domain.ts` — custom field, import run, and student properties.
- `src/lib/supabase/database.types.ts` — generated schema types.
- `src/lib/live-portal.ts` — partition-scoped field-definition/import-run loading and custom student mapping.
- `src/components/portal/portal-shell.tsx` — pass field definitions and recent runs into the student directory.
- `src/components/portal/student-cohort-assignment-panel.tsx` — mount importer and edit/display custom values.
- `src/app/api/students/route.ts` — accept external ID and validated custom values for manual edits.
- `src/lib/student-directory-writes.ts` — persist manual external/custom values within the viewer partition.
- `src/lib/permissions.ts` — central import permission helper for engineer/admin/staff.
- `README.md` and `docs/HANDOFF.md` — document template, import route, and demo-only verification rule.

---

### Task 1: Canonical import schema and approved dependency

**Files:**

- Create: `src/lib/student-import-schema.ts`
- Create: `src/test/student-import-schema.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**

- Produces: `StudentImportFieldKey`, `StudentImportMapping`, `StudentImportCell`, `normalizeStudentImportHeader()`, `suggestStudentImportMapping()`, `normalizeStudentImportRow()`, `validateStudentImportMappings()`.
- Consumes: `ProgramTrack` from `src/lib/domain.ts`.

- [ ] **Step 1: Install the exact approved package**

Run:

```bash
npm install --save-exact read-excel-file@9.2.0
```

Expected: `package.json` contains `"read-excel-file": "9.2.0"` and the lockfile changes only for that package and its transitive dependencies.

- [ ] **Step 2: Write failing schema tests**

Create tests with these exact expectations:

```ts
import { describe, expect, it } from "vitest";
import {
  normalizeStudentImportHeader,
  normalizeStudentImportRow,
  suggestStudentImportMapping,
  validateStudentImportMappings,
} from "@/lib/student-import-schema";

describe("student import schema", () => {
  it("normalizes punctuation and suggests known aliases", () => {
    expect(normalizeStudentImportHeader(" Student_First-Name ")).toBe("student first name");
    expect(suggestStudentImportMapping("Parent/Guardian Email")).toMatchObject({
      kind: "known",
      field: "parent1Email",
    });
  });

  it("defaults unknown headers to a sensitive custom field", () => {
    expect(suggestStudentImportMapping("Transportation Notes")).toMatchObject({
      kind: "custom-new",
      label: "Transportation Notes",
      sensitive: true,
    });
  });

  it("rejects two source columns mapped to the same known field", () => {
    expect(() => validateStudentImportMappings([
      { sourceHeader: "Email", kind: "known", field: "studentEmail" },
      { sourceHeader: "Student Email", kind: "known", field: "studentEmail" },
    ])).toThrow("Student email is mapped more than once.");
  });

  it("normalizes a full name and preserves typed custom values", () => {
    const row = normalizeStudentImportRow({
      rowNumber: 2,
      cells: ["Maya Chen", true, 2026],
      mappings: [
        { sourceHeader: "Student Name", kind: "known", field: "fullName" },
        { sourceHeader: "Needs Bus", kind: "custom-new", key: "needs_bus", label: "Needs Bus", dataType: "boolean", sensitive: true },
        { sourceHeader: "Graduation Year", kind: "custom-new", key: "graduation_year", label: "Graduation Year", dataType: "number", sensitive: true },
      ],
    });
    expect(row.firstName).toBe("Maya");
    expect(row.lastName).toBe("Chen");
    expect(row.customFields).toEqual({ needs_bus: true, graduation_year: 2026 });
  });
});
```

- [ ] **Step 3: Run RED**

Run: `npm test -- src/test/student-import-schema.test.ts`

Expected: FAIL because `@/lib/student-import-schema` does not exist.

- [ ] **Step 4: Implement the canonical schema**

Create the following public contract and implement one alias record covering every known field listed in the design:

```ts
import type { ProgramTrack } from "@/lib/domain";

export type StudentImportFieldKey =
  | "externalId" | "fullName" | "firstName" | "lastName"
  | "gradeLevel" | "school" | "targetTest" | "focus"
  | "studentEmail" | "studentPhone"
  | "parent1Name" | "parent1Email" | "parent1Phone"
  | "parent2Name" | "parent2Email" | "parent2Phone"
  | "familyNotes" | "cohortId" | "cohortName" | "registeredAt";

export type StudentCustomFieldType = "text" | "number" | "date" | "boolean";
export type StudentImportCell = string | number | boolean | Date | null;

export type StudentImportMapping =
  | { sourceHeader: string; kind: "known"; field: StudentImportFieldKey }
  | { sourceHeader: string; kind: "custom-existing"; key: string }
  | { sourceHeader: string; kind: "custom-new"; key: string; label: string; dataType: StudentCustomFieldType; sensitive: true }
  | { sourceHeader: string; kind: "ignore" };

export interface NormalizedStudentImportRow {
  rowNumber: number;
  externalId: string;
  firstName: string;
  lastName: string;
  gradeLevel: string;
  school: string;
  targetTest: ProgramTrack;
  focus: string;
  studentEmail: string;
  studentPhone: string;
  parent1Name: string;
  parent1Email: string;
  parent1Phone: string;
  parent2Name: string;
  parent2Email: string;
  parent2Phone: string;
  familyNotes: string;
  cohortId: string;
  cohortName: string;
  registeredAt: string;
  customFields: Record<string, string | number | boolean>;
  suppliedFields: StudentImportFieldKey[];
}

export function normalizeStudentImportHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/[^\w\s/]/g, "").replace(/\s+/g, " ");
}
```

Use a single alias record keyed by `StudentImportFieldKey`. `normalizeStudentImportRow()` must split full names, lowercase emails, preserve typed custom values, default target test to `Support`, and track supplied fields so blank updates do not erase stored values.

- [ ] **Step 5: Run GREEN**

Run: `npm test -- src/test/student-import-schema.test.ts`

Expected: all schema tests pass.

- [ ] **Step 6: Commit only Task 1 files**

Use a Lore commit whose intent line is `Keep spreadsheet headers adaptable without weakening typed student fields` and record the exact focused test in `Tested:`.

---

### Task 2: Real CSV/XLSX workbook decoding

**Files:**

- Create: `src/lib/student-spreadsheet.ts`
- Create: `src/test/student-spreadsheet.test.ts`
- Create: `src/test/fixtures/student-import-demo.xlsx`

**Interfaces:**

- Consumes: `StudentImportCell` from Task 1.
- Produces: `readStudentSpreadsheet(input): Promise<StudentSpreadsheetReadResult>`.

- [ ] **Step 1: Build the compact XLSX fixture with spreadsheet artifact tooling**

Create a workbook with a `Students` sheet and headers `Student Name`, `Parent Email`, `School`, `Needs Bus`; include rows for `Maya Demo Import` and `Rohan Demo Import`. Render it once to confirm headers and values are visible, then export exactly to `src/test/fixtures/student-import-demo.xlsx`.

- [ ] **Step 2: Write failing decoder tests**

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { readStudentSpreadsheet } from "@/lib/student-spreadsheet";

describe("student spreadsheet decoding", () => {
  it("decodes quoted CSV cells", async () => {
    const result = await readStudentSpreadsheet({
      filename: "students.csv",
      bytes: Buffer.from('Student Name,Family Notes\nMaya Demo,"Needs pacing, algebra"'),
    });
    expect(result.headers).toEqual(["Student Name", "Family Notes"]);
    expect(result.rows[0]?.cells[1]).toBe("Needs pacing, algebra");
  });

  it("lists and reads a real XLSX worksheet", async () => {
    const bytes = await readFile("src/test/fixtures/student-import-demo.xlsx");
    const result = await readStudentSpreadsheet({ filename: "student-import-demo.xlsx", bytes });
    expect(result.sheetNames).toContain("Students");
    expect(result.headers).toContain("Needs Bus");
    expect(result.rows).toHaveLength(2);
  });

  it("rejects files larger than four megabytes", async () => {
    await expect(readStudentSpreadsheet({
      filename: "students.csv",
      bytes: Buffer.alloc(4 * 1024 * 1024 + 1),
    })).rejects.toThrow("Spreadsheet files must be 4 MB or smaller.");
  });
});
```

- [ ] **Step 3: Run RED**

Run: `npm test -- src/test/student-spreadsheet.test.ts`

Expected: FAIL because the server decoder does not exist.

- [ ] **Step 4: Implement the decoder**

```ts
import "server-only";
import readXlsxFile, { readSheetNames } from "read-excel-file/server";
import { parseCsv } from "@/lib/intake-import-shared";
import type { StudentImportCell } from "@/lib/student-import-schema";

export const STUDENT_IMPORT_MAX_BYTES = 4 * 1024 * 1024;
export const STUDENT_IMPORT_MAX_ROWS = 2000;

export interface StudentSpreadsheetReadResult {
  sheetNames: string[];
  selectedSheet: string;
  headers: string[];
  rows: Array<{ rowNumber: number; cells: StudentImportCell[] }>;
  digest: string;
}

export async function readStudentSpreadsheet(input: {
  filename: string;
  bytes: Buffer;
  sheetName?: string;
}): Promise<StudentSpreadsheetReadResult> {
  if (input.bytes.byteLength > STUDENT_IMPORT_MAX_BYTES) {
    throw new Error("Spreadsheet files must be 4 MB or smaller.");
  }
  const lowerName = input.filename.toLowerCase();
  const isCsv = lowerName.endsWith(".csv");
  const isXlsx = lowerName.endsWith(".xlsx");
  if (!isCsv && !isXlsx) {
    throw new Error("Upload an .xlsx or .csv student spreadsheet.");
  }
  const sheetNames = isCsv ? ["CSV"] : await readSheetNames(input.bytes);
  const selectedSheet = input.sheetName ?? sheetNames[0] ?? "";
  if (!selectedSheet || !sheetNames.includes(selectedSheet)) {
    throw new Error("Choose a worksheet from the uploaded workbook.");
  }
  const matrix: StudentImportCell[][] = isCsv
    ? parseCsv(input.bytes.toString("utf8"))
    : await readXlsxFile(input.bytes, { sheet: selectedSheet });
  const nonEmpty = matrix.filter((row) => row.some((cell) => cell !== null && String(cell).trim() !== ""));
  if (nonEmpty.length < 2) {
    throw new Error("The spreadsheet must contain headers and at least one student row.");
  }
  const headers = nonEmpty[0]!.map((cell) => String(cell ?? "").trim());
  const rows = nonEmpty.slice(1).map((cells, index) => ({ rowNumber: index + 2, cells }));
  if (rows.length > STUDENT_IMPORT_MAX_ROWS) {
    throw new Error("Student imports are limited to 2,000 rows at a time.");
  }
  const { createHash } = await import("node:crypto");
  return {
    sheetNames,
    selectedSheet,
    headers,
    rows,
    digest: createHash("sha256").update(input.bytes).digest("hex"),
  };
}
```

Do not evaluate formulas. Treat returned strings and markup as untrusted text.

- [ ] **Step 5: Run GREEN**

Run: `npm test -- src/test/student-spreadsheet.test.ts`

Expected: all decoder tests pass.

- [ ] **Step 6: Commit only Task 2 files**

Use intent line `Accept the admin workbook without broad spreadsheet machinery` and record fixture rendering plus the focused test.

---

### Task 3: Pure preview planner and duplicate safety

**Files:**

- Create: `src/lib/student-import-planner.ts`
- Create: `src/test/student-import-planner.test.ts`

**Interfaces:**

- Consumes: normalized rows/mappings from Task 1 and decoded row numbers from Task 2.
- Produces: `buildStudentImportPlan(input): StudentImportPlan` containing exact family/student/enrollment payloads and row statuses.

- [ ] **Step 1: Write failing planner tests**

Cover these behaviors as separate tests:

```ts
it("never matches a student from the opposite partition", () => {
  const plan = buildStudentImportPlan(makeInput({
    targetDemo: true,
    existingStudents: [makeStudent({ id: "main-student", demo: false, email: "same@example.com" })],
    rows: [makeRow({ studentEmail: "same@example.com" })],
  }));
  expect(plan.rows[0]?.action).toBe("create");
  expect(plan.students[0]?.id).not.toBe("main-student");
});

it("matches by external id before email", () => {
  const plan = buildStudentImportPlan(makeInput({
    targetDemo: true,
    existingStudents: [
      makeStudent({ id: "by-external", demo: true, external_id: "S-100", email: "old@example.com" }),
      makeStudent({ id: "by-email", demo: true, external_id: "S-200", email: "new@example.com" }),
    ],
    rows: [makeRow({ externalId: "S-100", studentEmail: "new@example.com" })],
  }));
  expect(plan.rows[0]).toMatchObject({ action: "update", studentId: "by-external" });
});

it("blocks an ambiguous cohort name", () => {
  const plan = buildStudentImportPlan(makeInput({
    targetDemo: true,
    cohorts: [makeCohort({ id: "a", name: "SAT Weekend" }), makeCohort({ id: "b", name: "SAT Weekend" })],
    rows: [makeRow({ cohortName: "SAT Weekend" })],
  }));
  expect(plan.rows[0]?.errors).toContain("Cohort name matches more than one demo cohort.");
});

it("preserves stored values when update cells are blank", () => {
  const plan = buildStudentImportPlan(makeInput({
    targetDemo: true,
    existingStudents: [makeStudent({ id: "existing", demo: true, external_id: "S-100", school: "Existing School" })],
    rows: [makeRow({ externalId: "S-100", school: "", suppliedFields: [] })],
  }));
  expect(plan.students[0]?.school).toBe("Existing School");
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- src/test/student-import-planner.test.ts`

Expected: FAIL because planner exports are missing.

- [ ] **Step 3: Implement the planner contract**

```ts
export type StudentImportRowAction = "create" | "update" | "skip" | "warning" | "error";

export interface StudentImportPlanRow {
  rowNumber: number;
  action: StudentImportRowAction;
  studentId: string | null;
  familyId: string | null;
  cohortId: string | null;
  warnings: string[];
  errors: string[];
}

export interface StudentImportPlan {
  targetDemo: boolean;
  rows: StudentImportPlanRow[];
  families: Array<Record<string, unknown>>;
  students: Array<Record<string, unknown>>;
  enrollments: Array<Record<string, unknown>>;
  newFieldDefinitions: Array<Record<string, unknown>>;
  summary: { creates: number; updates: number; enrollments: number; skips: number; warnings: number; errors: number };
}
```

Implement `buildStudentImportPlan(input: StudentImportPlannerInput): StudentImportPlan` with this exact sequence: filter every existing collection to `input.targetDemo`; build unique and ambiguous indexes for external ID, student email, parent email plus name, and name plus school; match in that order; create random IDs through injected `createId(prefix)` only when no match exists; merge only fields listed in `suppliedFields`; merge custom JSON by key; resolve exact cohort ID before exact normalized cohort name; classify ambiguous matches as errors; collapse same-file family/student/enrollment duplicates; and compute summary counts from the final included row plans. The injected ID factory keeps tests deterministic.

- [ ] **Step 4: Run GREEN and the existing demo helper tests**

Run:

```bash
npm test -- src/test/student-import-planner.test.ts src/test/demo-partition.test.ts
```

Expected: both files pass.

- [ ] **Step 5: Commit only Task 3 files**

Use intent line `Make preview decisions deterministic before any student write`.

---

### Task 4: Additive Supabase schema, RLS, constraints, and atomic RPC

**Files:**

- Create: the timestamped `student_spreadsheet_import.sql` path returned by `npm run db:new -- student_spreadsheet_import`
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**

- Produces tables `student_field_definitions`, `student_import_runs`; student columns `external_id`, `custom_fields`; RPC `commit_student_spreadsheet_import`.
- Consumes exact family/student/enrollment payloads from Task 3.

- [ ] **Step 1: Re-run the live read-only partition preflight**

Execute the three mismatch counts from the design. Expected: all three counts equal `0`. Stop migration work if any count differs.

- [ ] **Step 2: Create the migration through the project command**

Run: `npm run db:new -- student_spreadsheet_import`

Expected: exactly one timestamped migration file is created.

- [ ] **Step 3: Write the additive schema and partition constraints**

Use this concrete schema shape:

```sql
alter table public.students
  add column if not exists external_id text,
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

alter table public.students
  drop constraint if exists students_custom_fields_object;
alter table public.students
  add constraint students_custom_fields_object
  check (jsonb_typeof(custom_fields) = 'object');

create unique index if not exists students_demo_external_id_key
  on public.students (demo, lower(btrim(external_id)))
  where external_id is not null and btrim(external_id) <> '';

create table if not exists public.student_field_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  label text not null,
  data_type text not null check (data_type in ('text', 'number', 'date', 'boolean')),
  header_aliases text[] not null default '{}',
  required boolean not null default false,
  sensitive boolean not null default true,
  sort_order integer not null default 0,
  demo boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz,
  unique (demo, key)
);

create table if not exists public.student_import_runs (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  file_digest text not null,
  worksheet text not null,
  status text not null check (status in ('completed', 'failed')),
  mapping jsonb not null default '[]'::jsonb,
  total_rows integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  enrollment_count integer not null default 0,
  skipped_count integer not null default 0,
  warning_count integer not null default 0,
  error_samples jsonb not null default '[]'::jsonb,
  demo boolean not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);
```

Add unique `(id, demo)` constraints on families, students, cohorts, then add and validate composite foreign keys for student-family and enrollment-student/cohort. Add a unique `(student_id, cohort_id, demo)` enrollment constraint after a duplicate preflight.

- [ ] **Step 4: Add exact partition-aware RLS and grants**

Enable RLS on both new tables. Their select predicate is:

```sql
public.viewer_can_access_portal()
and (
  public.current_app_role() = 'engineer'
  or demo = coalesce((select profile.demo from public.profiles profile where profile.id = auth.uid()), false)
)
```

Conjoin the same partition predicate with the existing families, students, and enrollments read policies. Preserve the engineer role/cohort permissions already present. Grant `select` on new tables to `authenticated`, grant all to `service_role`, and create no browser-role insert/update/delete policies.

- [ ] **Step 5: Add the atomic service-role-only RPC**

Create this exact signature:

```sql
create or replace function public.commit_student_spreadsheet_import(
  p_actor_id uuid,
  p_actor_role text,
  p_actor_demo boolean,
  p_target_demo boolean,
  p_field_definitions jsonb,
  p_families jsonb,
  p_students jsonb,
  p_enrollments jsonb,
  p_import_run jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  run_id uuid := coalesce((p_import_run->>'id')::uuid, gen_random_uuid());
  affected integer;
begin
  if p_actor_role not in ('engineer', 'admin', 'staff') then
    raise exception 'This role cannot import students.';
  end if;
  if p_actor_role <> 'engineer' and p_actor_demo is distinct from p_target_demo then
    raise exception 'The import target does not match the actor partition.';
  end if;
  if p_actor_id is null and (p_actor_role <> 'admin' or not p_target_demo) then
    raise exception 'Only the local demo admin may import without a persisted actor id.';
  end if;
  if p_actor_id is not null and not exists (
    select 1 from public.profiles profile
    where profile.id = p_actor_id
      and profile.role::text = p_actor_role
      and profile.demo is not distinct from p_actor_demo
      and profile.account_status = 'active'
      and profile.deleted_at is null
  ) then
    raise exception 'The import actor is not active.';
  end if;
  if jsonb_typeof(p_field_definitions) <> 'array'
    or jsonb_typeof(p_families) <> 'array'
    or jsonb_typeof(p_students) <> 'array'
    or jsonb_typeof(p_enrollments) <> 'array' then
    raise exception 'Import payload collections must be JSON arrays.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_families) as incoming(id text)
    join public.families existing on existing.id = incoming.id
    where existing.demo is distinct from p_target_demo
  ) then
    raise exception 'A family id belongs to another partition.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_students) as incoming(id text)
    join public.students existing on existing.id = incoming.id
    where existing.demo is distinct from p_target_demo
  ) then
    raise exception 'A student id belongs to another partition.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_enrollments) as incoming(cohort_id text)
    join public.cohorts cohort on cohort.id = incoming.cohort_id
    where cohort.demo is distinct from p_target_demo
  ) then
    raise exception 'A cohort belongs to another partition.';
  end if;
  insert into public.student_field_definitions (
    id, key, label, data_type, header_aliases, required, sensitive,
    sort_order, demo, created_by
  )
  select
    incoming.id, incoming.key, incoming.label, incoming.data_type,
    incoming.header_aliases, incoming.required, true,
    incoming.sort_order, p_target_demo, p_actor_id
  from jsonb_to_recordset(p_field_definitions) as incoming(
    id uuid, key text, label text, data_type text, header_aliases text[],
    required boolean, sort_order integer
  )
  on conflict (demo, key) do update set
    label = excluded.label,
    data_type = excluded.data_type,
    header_aliases = excluded.header_aliases,
    required = excluded.required,
    sensitive = true,
    sort_order = excluded.sort_order,
    updated_at = timezone('utc', now()),
    archived_at = null;

  insert into public.families (
    id, family_name, guardian_names, email, phone, preferred_campus_id,
    notes, parent1_name, parent1_email, parent1_phone,
    parent2_name, parent2_email, parent2_phone, demo
  )
  select
    incoming.id, incoming.family_name, incoming.guardian_names,
    incoming.email, incoming.phone, incoming.preferred_campus_id,
    incoming.notes, incoming.parent1_name, incoming.parent1_email,
    incoming.parent1_phone, incoming.parent2_name, incoming.parent2_email,
    incoming.parent2_phone, p_target_demo
  from jsonb_to_recordset(p_families) as incoming(
    id text, family_name text, guardian_names text[], email text, phone text,
    preferred_campus_id text, notes text, parent1_name text, parent1_email text,
    parent1_phone text, parent2_name text, parent2_email text, parent2_phone text
  )
  on conflict (id) do update set
    family_name = excluded.family_name,
    guardian_names = excluded.guardian_names,
    email = excluded.email,
    phone = excluded.phone,
    preferred_campus_id = excluded.preferred_campus_id,
    notes = excluded.notes,
    parent1_name = excluded.parent1_name,
    parent1_email = excluded.parent1_email,
    parent1_phone = excluded.parent1_phone,
    parent2_name = excluded.parent2_name,
    parent2_email = excluded.parent2_email,
    parent2_phone = excluded.parent2_phone
  where public.families.demo is not distinct from p_target_demo;
  get diagnostics affected = row_count;
  if affected <> jsonb_array_length(p_families) then
    raise exception 'Family import count mismatch.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_students) as incoming(family_id text)
    left join public.families family
      on family.id = incoming.family_id and family.demo = p_target_demo
    where family.id is null
  ) then
    raise exception 'A student family is missing from the target partition.';
  end if;

  insert into public.students (
    id, family_id, first_name, last_name, email, phone, grade_level,
    school, target_test, focus, external_id, custom_fields, demo
  )
  select
    incoming.id, incoming.family_id, incoming.first_name, incoming.last_name,
    incoming.email, incoming.phone, incoming.grade_level, incoming.school,
    incoming.target_test, incoming.focus, incoming.external_id,
    incoming.custom_fields, p_target_demo
  from jsonb_to_recordset(p_students) as incoming(
    id text, family_id text, first_name text, last_name text,
    email text, phone text, grade_level text, school text,
    target_test text, focus text, external_id text, custom_fields jsonb
  )
  on conflict (id) do update set
    family_id = excluded.family_id,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    email = excluded.email,
    phone = excluded.phone,
    grade_level = excluded.grade_level,
    school = excluded.school,
    target_test = excluded.target_test,
    focus = excluded.focus,
    external_id = excluded.external_id,
    custom_fields = excluded.custom_fields
  where public.students.demo is not distinct from p_target_demo;
  get diagnostics affected = row_count;
  if affected <> jsonb_array_length(p_students) then
    raise exception 'Student import count mismatch.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_enrollments) as incoming(student_id text, cohort_id text)
    left join public.students student
      on student.id = incoming.student_id and student.demo = p_target_demo
    left join public.cohorts cohort
      on cohort.id = incoming.cohort_id and cohort.demo = p_target_demo
    where student.id is null or cohort.id is null
  ) then
    raise exception 'An enrollment crosses the target partition.';
  end if;

  insert into public.enrollments (
    id, student_id, cohort_id, status, registered_at, demo
  )
  select
    incoming.id, incoming.student_id, incoming.cohort_id,
    incoming.status, incoming.registered_at, p_target_demo
  from jsonb_to_recordset(p_enrollments) as incoming(
    id text, student_id text, cohort_id text, status text, registered_at date
  )
  on conflict (student_id, cohort_id, demo) do update set
    status = excluded.status,
    registered_at = excluded.registered_at;

  update public.cohorts cohort
  set enrolled = (
    select count(*)::integer from public.enrollments enrollment
    where enrollment.cohort_id = cohort.id
      and enrollment.demo = cohort.demo
      and enrollment.status = 'active'
  )
  where cohort.demo = p_target_demo
    and cohort.id in (
      select incoming.cohort_id
      from jsonb_to_recordset(p_enrollments) as incoming(cohort_id text)
    );

  insert into public.student_import_runs (
    id, filename, file_digest, worksheet, status, mapping, total_rows,
    created_count, updated_count, enrollment_count, skipped_count,
    warning_count, error_samples, demo, created_by
  ) values (
    run_id, p_import_run->>'filename', p_import_run->>'fileDigest',
    p_import_run->>'worksheet', 'completed', p_import_run->'mapping',
    (p_import_run->>'totalRows')::integer,
    (p_import_run->>'createdCount')::integer,
    (p_import_run->>'updatedCount')::integer,
    (p_import_run->>'enrollmentCount')::integer,
    (p_import_run->>'skippedCount')::integer,
    (p_import_run->>'warningCount')::integer,
    '[]'::jsonb, p_target_demo, p_actor_id
  );
  return jsonb_build_object(
    'runId', run_id,
    'created', (p_import_run->>'createdCount')::integer,
    'updated', (p_import_run->>'updatedCount')::integer,
    'enrolled', (p_import_run->>'enrollmentCount')::integer,
    'skipped', (p_import_run->>'skippedCount')::integer
  );
end;
$$;

revoke all on function public.commit_student_spreadsheet_import(uuid, text, boolean, boolean, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.commit_student_spreadsheet_import(uuid, text, boolean, boolean, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;
```

For local QA, pass a null actor ID only when the server is in local QA mode and the target is demo. Normal authenticated calls always pass and verify the profile UUID. The nullable `created_by` column preserves this distinction in the audit run.

- [ ] **Step 6: Regenerate/update TypeScript database types**

Run the connected type generator if available, then retain only the schema-aligned changes in `database.types.ts`. Ensure migrated `demo` row fields are required booleans.

- [ ] **Step 7: Verify migration locally or with a rolled-back SQL transaction**

Expected checks: tables/columns/functions exist, RLS enabled, grants exclude browser writes, cross-partition test inserts fail, and a forced RPC error leaves no family/student/enrollment rows.

- [ ] **Step 8: Commit only the migration and database types**

Use intent line `Make student imports indivisible across demo and main data`.

---

### Task 5: Domain mapping and manual custom-field editing

**Files:**

- Modify: `src/lib/domain.ts`
- Modify: `src/lib/live-portal.ts`
- Modify: `src/components/portal/portal-shell.tsx`
- Modify: `src/components/portal/student-cohort-assignment-panel.tsx`
- Modify: `src/app/api/students/route.ts`
- Modify: `src/lib/student-directory-writes.ts`

**Interfaces:**

- Produces `Student.externalId`, `Student.customFields`, `StudentFieldDefinition`, `StudentImportRun` and passes definitions/runs to the Student Directory.
- Consumes generated database types from Task 4.

- [ ] **Step 1: Write a failing mapping test in `src/test/portal.test.ts`**

Add a fixture student with `external_id: "S-100"` and `custom_fields: { graduation_year: 2027 }`, then assert the live mapping returns those values and filters field definitions by the viewer partition.

- [ ] **Step 2: Run RED**

Run: `npm test -- src/test/portal.test.ts`

Expected: FAIL because the domain/bundle does not expose the new values.

- [ ] **Step 3: Add domain contracts and live mapping**

```ts
export interface StudentFieldDefinition {
  id: string;
  key: string;
  label: string;
  dataType: "text" | "number" | "date" | "boolean";
  headerAliases: string[];
  required: boolean;
  sensitive: boolean;
  sortOrder: number;
  demo: boolean;
}

export interface StudentImportRun {
  id: string;
  filename: string;
  worksheet: string;
  status: "completed" | "failed";
  createdCount: number;
  updatedCount: number;
  enrollmentCount: number;
  skippedCount: number;
  warningCount: number;
  demo: boolean;
  createdAt: string;
}
```

Extend `Student` with `externalId?: string | null` and `customFields: Record<string, string | number | boolean>`. Load field definitions and recent import runs only for the Students section. Apply the viewer demo filter, with engineer cross-partition reads, before mapping.

- [ ] **Step 4: Extend manual editing without erasing unknown keys**

Pass definitions into `StudentCohortAssignmentPanel`, render an `Additional information` input per active definition, and send `externalId` plus `customFields`. In `upsertStudentDirectoryRecord`, validate submitted keys against definitions in the target partition and merge them with the existing JSON object.

- [ ] **Step 5: Run GREEN and typecheck**

Run:

```bash
npm test -- src/test/portal.test.ts
npm run typecheck
```

Expected: focused tests and typecheck pass.

- [ ] **Step 6: Commit only Task 5 files**

Use intent line `Keep imported student details visible and editable after transfer`.

---

### Task 6: Preview/commit operations and API routes

**Files:**

- Create: `src/lib/student-import-operations.ts`
- Create: `src/test/student-import-operations.test.ts`
- Create: `src/app/api/students/import/preview/route.ts`
- Create: `src/app/api/students/import/commit/route.ts`
- Modify: `src/lib/permissions.ts`

**Interfaces:**

- Consumes decoder, schema, planner, database types, authenticated viewer, service client.
- Produces `previewStudentSpreadsheetImport()` and `commitStudentSpreadsheetImport()`.

- [ ] **Step 1: Write failing permission and operation tests**

```ts
it("derives an admin target from the profile and ignores a client override", () => {
  expect(resolveStudentImportTarget({ role: "admin", demo: true }, false)).toBe(true);
});

it("requires an explicit engineer target", () => {
  expect(() => resolveStudentImportTarget({ role: "engineer", demo: false }, undefined)).toThrow(
    "Engineers must choose Demo or Main before previewing an import.",
  );
});

it("records a failed run after an RPC rollback", async () => {
  const repository = makeRepository({ rpcError: new Error("forced rollback") });
  await expect(commitStudentSpreadsheetImport(makeCommitInput({ repository }))).rejects.toThrow("Student import failed.");
  expect(repository.insertedFailedRuns).toHaveLength(1);
  expect(repository.insertedFailedRuns[0]).toMatchObject({ demo: true, status: "failed" });
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- src/test/student-import-operations.test.ts`

Expected: FAIL because operations are missing.

- [ ] **Step 3: Implement permissions and operations**

```ts
export function canRunStudentImports(role: UserRole) {
  return role === "engineer" || role === "admin" || role === "staff";
}

export function resolveStudentImportTarget(
  viewer: Pick<User, "role" | "demo">,
  requestedTarget: boolean | undefined,
) {
  if (!canRunStudentImports(viewer.role)) throw new Error("You cannot import students.");
  if (viewer.role !== "engineer") return Boolean(viewer.demo);
  if (typeof requestedTarget !== "boolean") {
    throw new Error("Engineers must choose Demo or Main before previewing an import.");
  }
  return requestedTarget;
}
```

Preview reads only the target partition's families, students, enrollments, cohorts, and field definitions. Commit reparses the same file, verifies its digest, rebuilds the plan, rejects included rows with errors, and calls `commit_student_spreadsheet_import` once. After an RPC error, insert one bounded failed run outside the rolled-back function. On success, invalidate the existing portal-live cache.

- [ ] **Step 4: Implement multipart routes**

Both routes independently authenticate, reject unauthorized/read-only users, validate `File`, parse `sheetName`, `mappings`, excluded row numbers, and engineer target. Return 400 for file/mapping errors, 403 for permission/partition errors, and 500 only for unexpected server failures.

- [ ] **Step 5: Run GREEN, route typecheck, and lint**

Run:

```bash
npm test -- src/test/student-import-operations.test.ts src/test/student-import-planner.test.ts
npm run typecheck
npm run lint
```

Expected: all pass without warnings.

- [ ] **Step 6: Commit only Task 6 files**

Use intent line `Revalidate every workbook before the atomic student commit`.

---

### Task 7: Student Directory import workflow

**Files:**

- Create: `src/components/portal/student-import-panel.tsx`
- Modify: `src/components/portal/student-cohort-assignment-panel.tsx`

**Interfaces:**

- Consumes preview/commit JSON, field definitions, recent runs, viewer role/mode.
- Produces the three-step modal and post-import refresh.

- [ ] **Step 1: Extract pure UI helpers and test them first**

Add pure helpers to `student-import-schema.ts` for summary copy and engineer confirmation labels. Test:

```ts
expect(formatStudentImportSummary({ creates: 2, updates: 1, enrollments: 1, skips: 0, warnings: 1, errors: 0 }))
  .toBe("2 creates, 1 update, 1 enrollment, 0 skipped, 1 warning.");
expect(getStudentImportTargetLabel(true)).toBe("Demo data only");
expect(getStudentImportTargetLabel(false)).toBe("Main data");
```

- [ ] **Step 2: Run RED then implement helpers**

Run: `npm test -- src/test/student-import-schema.test.ts`

Expected first run: FAIL for missing helpers. Implement them, rerun, and expect PASS.

- [ ] **Step 3: Implement the accessible workflow**

`StudentImportPanel` must:

- retain the `File` object through preview and commit;
- show worksheet selection when more than one exists;
- show a required, unselected Demo/Main control for engineers;
- show mapping selects for every header;
- render preview status, row number, student name, warnings/errors, and include/exclude checkbox;
- disable commit while included errors exist;
- require the engineer to type `DEMO` or `MAIN` matching the target before commit;
- submit the same file, sheet, mapping JSON, exclusions, and target to commit;
- keep mapping state after failure and refresh the directory after success;
- render formulas/markup as text and never use `dangerouslySetInnerHTML`.

Mount it beside `Add student` only when `canRunStudentImports(role)` and not in live role preview.

- [ ] **Step 4: Run typecheck and lint**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 5: Commit only Task 7 files**

Use intent line `Let admins see exactly what a workbook will change`.

---

### Task 8: Template, documentation, full verification, and demo account test

**Files:**

- Create: `public/student-import-template.xlsx`
- Modify: `README.md`
- Modify: `docs/HANDOFF.md`

**Interfaces:**

- Consumes the finished importer and connected Supabase project.
- Produces the user template, verification evidence, and operational handoff.

- [ ] **Step 1: Build and visually verify the final template**

Using spreadsheet artifact tooling, create one `Students` sheet with these columns:

```text
External Student ID, Student First Name, Student Last Name, Grade Level,
School, Target Test, Focus, Student Email, Student Phone,
Parent 1 Name, Parent 1 Email, Parent 1 Phone,
Parent 2 Name, Parent 2 Email, Parent 2 Phone,
Family Notes, Cohort Name, Registration Date, Transportation Notes
```

Include one clearly labeled sample row and an instructions area explaining required names, optional fields, unknown-column custom fields, blanks-preserve-on-update, and exact cohort names. Inspect values/formulas, scan formula errors, render every sheet, and export to `public/student-import-template.xlsx`.

- [ ] **Step 2: Run the full local gate before schema application**

Run: `npm run ci`

Expected: lint, typecheck, tests, and build all pass.

- [ ] **Step 3: Apply the additive migration and run advisors**

Apply only the new migration to project `uhtcbipwivvocbndxjqi`. Run Supabase security and performance advisors. Fix migration-related errors before continuing; report unrelated existing advisories separately.

- [ ] **Step 4: Capture main read-only baselines**

Record counts and stable hashes for `families`, `students`, `enrollments`, and `cohorts` where `demo = false`. Do not output PII.

- [ ] **Step 5: Start local QA and test through Chrome as demo admin**

Run the app with `INTO_PREP_LOCAL_QA=1`, use the code-defined local demo admin login, upload the demo XLSX through `/students`, map `Transportation Notes` as a custom field, preview, and commit. Verify the UI success counts and connected Supabase rows all have `demo = true`.

- [ ] **Step 6: Re-import and test failure behavior**

Upload the same workbook again and verify update/skip outcomes with no duplicate student or enrollment. Upload a copy with an ambiguous cohort and verify commit is disabled. Execute the forced rollback integration case and confirm no partial rows.

- [ ] **Step 7: Prove main data is unchanged**

Recompute the main counts/hashes and compare them exactly with Step 4. Query the imported external IDs with both demo values and assert only `demo = true` rows exist.

- [ ] **Step 8: Clean up only the exact QA records created by this run**

Capture their IDs first, delete in dependency order, and confirm the main counts/hashes remain unchanged. Do not delete pre-existing demo records.

- [ ] **Step 9: Run final gates and advisors again**

Run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Expected: all pass. Re-run Supabase security/performance advisors and read-only partition queries.

- [ ] **Step 10: Update docs and commit final scoped files**

Document the template, routes, permissions, demo/main behavior, and demo-only test procedure. Use intent line `Make spreadsheet transfers repeatable for the client admin` and include every verification command plus demo/main evidence in the Lore trailers.

---

## Plan self-review checklist

- Every design requirement is covered by Tasks 1–8.
- Dependency is exact and approved.
- Parser tests execute against a real XLSX fixture.
- Preview and commit share canonical schema and planner logic.
- Commit reparses instead of trusting browser-normalized rows.
- Demo/main isolation exists in UI, server queries, RPC validation, RLS, and composite foreign keys.
- Engineer cross-partition visibility is preserved while engineer writes require an explicit target.
- Browser writes use demo only; main verification is read-only.
- Existing uncommitted workspace files are staged only when the task explicitly owns them.
- No production Vercel deployment occurs from the dirty workspace.
