"use client";

import { useState, type FormEvent } from "react";
import type { StudentWorkbookPreview } from "@/lib/student-import-operations";
import {
  parseStudentWorkbookSetup,
  type ParsedStudentWorkbookSetup,
  type PlannedCampusInput,
  type PlannedProgramInput,
  type PlannedTermInput,
  type StudentWorkbookSetup,
} from "@/lib/student-workbook-schema";

export type CatalogDraftKind = "programs" | "campuses" | "terms";
type ProgramDraft = Omit<PlannedProgramInput, "key">;
type CampusDraft = Omit<PlannedCampusInput, "key">;
type TermDraft = Omit<PlannedTermInput, "key">;
type CatalogDraftInput = ProgramDraft | CampusDraft | TermDraft;

interface CatalogDraftSelectProps {
  kind: CatalogDraftKind;
  label: "Program" | "Campus" | "Term";
  sourceClass: string;
  existing: Array<{ id: string; name: string }>;
  setup: StudentWorkbookSetup;
  disabled: boolean;
  onChange: (setup: ParsedStudentWorkbookSetup) => void;
}

interface DraftEditor {
  key?: string;
  name: string;
  firstDetail: string;
  secondDetail: string;
}

const KIND_FIELDS = {
  programs: { existing: "programId", planned: "programDraftKey", prefix: "program" },
  campuses: { existing: "campusId", planned: "campusDraftKey", prefix: "campus" },
  terms: { existing: "termId", planned: "termDraftKey", prefix: "term" },
} as const;

export function StudentImportCatalogDraftSelect({
  kind,
  label,
  sourceClass,
  existing,
  setup,
  disabled,
  onChange,
}: CatalogDraftSelectProps) {
  const [editor, setEditor] = useState<DraftEditor | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const catalog = setup.catalog ?? { programs: [], campuses: [], terms: [] };
  const drafts = catalog[kind];
  const selectedValue = catalogSelectionValue(setup, sourceClass, kind);
  const selectedDraftKey = selectedValue.startsWith("planned:")
    ? selectedValue.slice("planned:".length)
    : null;
  const selectedDraft = selectedDraftKey
    ? drafts.find((draft) => draft.key === selectedDraftKey)
    : undefined;
  const selectId = `student-import-${kind}-${stableId(sourceClass)}`;

  const openEditor = (key?: string) => {
    const draft = key ? drafts.find((candidate) => candidate.key === key) : undefined;
    setEditor(draft ? editorForDraft(kind, draft) : emptyEditor(kind));
    setEditorError(null);
  };

  const submitDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor) return;
    try {
      const next = saveCatalogDraft(
        setup,
        sourceClass,
        kind,
        inputForEditor(kind, editor),
        editor.key,
      );
      onChange(next);
      setEditor(null);
      setEditorError(null);
    } catch {
      setEditorError(`Enter a valid, uniquely named ${label.toLowerCase()} before saving.`);
    }
  };

  return (
    <div>
      <label htmlFor={selectId} className="text-xs font-semibold text-[color:var(--muted)]">
        {label}
      </label>
      <select
        id={selectId}
        value={selectedValue}
        onChange={(event) => {
          if (event.target.value === "create") {
            openEditor();
            return;
          }
          onChange(applyCatalogSelection(setup, sourceClass, kind, event.target.value));
          setEditor(null);
          setEditorError(null);
        }}
        disabled={disabled}
        required
        className="mt-1 block w-full rounded border border-[color:var(--line)] bg-white px-2 py-2 text-sm font-normal text-[color:var(--navy-strong)]"
      >
        <option value="">Choose {label.toLowerCase()}</option>
        {catalogSelectorOptions(existing, drafts).map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>

      {selectedDraft ? (
        <div className="mt-1 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openEditor(selectedDraft.key)}
            disabled={disabled}
            className="text-xs font-semibold text-[color:var(--navy)] underline disabled:opacity-50"
          >
            Edit planned {label.toLowerCase()}
          </button>
          <button
            type="button"
            onClick={() => {
              onChange(removeCatalogDraft(setup, kind, selectedDraft.key));
              setEditor(null);
              setEditorError(null);
            }}
            disabled={disabled}
            className="text-xs font-semibold text-rose-700 underline disabled:opacity-50"
          >
            Remove planned {label.toLowerCase()}
          </button>
        </div>
      ) : null}

      {editor ? (
        <form onSubmit={submitDraft} className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
          <div className="text-xs font-semibold text-sky-950">
            {editor.key ? "Edit" : "Create"} planned {label.toLowerCase()}
          </div>
          <label className="mt-2 block text-xs font-semibold text-sky-950">
            Name
            <input
              value={editor.name}
              onChange={(event) => setEditor({ ...editor, name: event.target.value })}
              disabled={disabled}
              required
              maxLength={200}
              className="mt-1 block w-full rounded border border-sky-200 bg-white px-2 py-1.5 font-normal text-[color:var(--navy-strong)]"
            />
          </label>
          {kind === "programs" ? (
            <>
              <label className="mt-2 block text-xs font-semibold text-sky-950">
                Track
                <select
                  value={editor.firstDetail}
                  onChange={(event) => setEditor({ ...editor, firstDetail: event.target.value })}
                  disabled={disabled}
                  required
                  className="mt-1 block w-full rounded border border-sky-200 bg-white px-2 py-1.5 font-normal text-[color:var(--navy-strong)]"
                >
                  {(["SAT", "ACT", "Admissions", "Support"] as const).map((track) => <option key={track}>{track}</option>)}
                </select>
              </label>
              <label className="mt-2 block text-xs font-semibold text-sky-950">
                Format
                <input
                  value={editor.secondDetail}
                  onChange={(event) => setEditor({ ...editor, secondDetail: event.target.value })}
                  disabled={disabled}
                  required
                  maxLength={200}
                  className="mt-1 block w-full rounded border border-sky-200 bg-white px-2 py-1.5 font-normal text-[color:var(--navy-strong)]"
                />
              </label>
            </>
          ) : null}
          {kind === "campuses" ? (
            <>
              <label className="mt-2 block text-xs font-semibold text-sky-950">
                Location
                <input
                  value={editor.firstDetail}
                  onChange={(event) => setEditor({ ...editor, firstDetail: event.target.value })}
                  disabled={disabled}
                  required
                  maxLength={200}
                  className="mt-1 block w-full rounded border border-sky-200 bg-white px-2 py-1.5 font-normal text-[color:var(--navy-strong)]"
                />
              </label>
              <label className="mt-2 block text-xs font-semibold text-sky-950">
                Modality
                <select
                  value={editor.secondDetail}
                  onChange={(event) => setEditor({ ...editor, secondDetail: event.target.value })}
                  disabled={disabled}
                  required
                  className="mt-1 block w-full rounded border border-sky-200 bg-white px-2 py-1.5 font-normal text-[color:var(--navy-strong)]"
                >
                  {(["In person", "Hybrid", "Online"] as const).map((modality) => <option key={modality}>{modality}</option>)}
                </select>
              </label>
            </>
          ) : null}
          {kind === "terms" ? (
            <>
              <label className="mt-2 block text-xs font-semibold text-sky-950">
                Start date
                <input
                  type="date"
                  value={editor.firstDetail}
                  onChange={(event) => setEditor({ ...editor, firstDetail: event.target.value })}
                  disabled={disabled}
                  required
                  className="mt-1 block w-full rounded border border-sky-200 bg-white px-2 py-1.5 font-normal text-[color:var(--navy-strong)]"
                />
              </label>
              <label className="mt-2 block text-xs font-semibold text-sky-950">
                End date
                <input
                  type="date"
                  min={editor.firstDetail || undefined}
                  value={editor.secondDetail}
                  onChange={(event) => setEditor({ ...editor, secondDetail: event.target.value })}
                  disabled={disabled}
                  required
                  className="mt-1 block w-full rounded border border-sky-200 bg-white px-2 py-1.5 font-normal text-[color:var(--navy-strong)]"
                />
              </label>
            </>
          ) : null}
          {editorError ? <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{editorError}</p> : null}
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={disabled}
              className="rounded-full bg-[color:var(--navy)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Save planned {label.toLowerCase()}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditor(null);
                setEditorError(null);
              }}
              disabled={disabled}
              className="rounded-full border border-[color:var(--line)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--navy)] disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function saveCatalogDraft(
  setup: StudentWorkbookSetup,
  sourceClass: string,
  kind: CatalogDraftKind,
  draft: CatalogDraftInput,
  editingKey?: string,
): ParsedStudentWorkbookSetup {
  const current = toStrictStudentWorkbookSetup(setup);
  const existingDrafts = current.catalog[kind];
  if (editingKey && !existingDrafts.some((candidate) => candidate.key === editingKey)) {
    throw new Error("The planned catalog entry no longer exists.");
  }
  const key = editingKey ?? createCatalogDraftKey(
    KIND_FIELDS[kind].prefix,
    draft.name,
    existingDrafts.map((candidate) => candidate.key),
  );
  const catalog = { ...current.catalog };
  if (kind === "programs") {
    catalog.programs = upsertDraft(current.catalog.programs, { key, ...(draft as ProgramDraft) }, editingKey);
  } else if (kind === "campuses") {
    catalog.campuses = upsertDraft(current.catalog.campuses, { key, ...(draft as CampusDraft) }, editingKey);
  } else {
    catalog.terms = upsertDraft(current.catalog.terms, { key, ...(draft as TermDraft) }, editingKey);
  }
  return applyCatalogSelection({ ...current, catalog }, sourceClass, kind, `planned:${key}`);
}

export function applyCatalogSelection(
  setup: StudentWorkbookSetup,
  sourceClass: string,
  kind: CatalogDraftKind,
  selection: string,
): ParsedStudentWorkbookSetup {
  const current = toStrictStudentWorkbookSetup(setup);
  let existingId: string | undefined;
  let plannedKey: string | undefined;
  if (selection.startsWith("existing:")) {
    existingId = selection.slice("existing:".length);
    if (!existingId) throw new Error("Catalog selection is invalid.");
  } else if (selection.startsWith("planned:")) {
    plannedKey = selection.slice("planned:".length);
    if (!current.catalog[kind].some((draft) => draft.key === plannedKey)) {
      throw new Error("Planned catalog selection is invalid.");
    }
  } else if (selection !== "") {
    throw new Error("Catalog selection is invalid.");
  }

  const cohorts = updateSourceCohort(current.cohorts, sourceClass, (cohort) => {
    const next = { ...cohort };
    delete next.selectedCohortId;
    clearCatalogReference(next, kind);
    if (kind === "programs") {
      if (existingId) next.programId = existingId;
      if (plannedKey) next.programDraftKey = plannedKey;
    } else if (kind === "campuses") {
      if (existingId) next.campusId = existingId;
      if (plannedKey) next.campusDraftKey = plannedKey;
    } else {
      if (existingId) next.termId = existingId;
      if (plannedKey) next.termDraftKey = plannedKey;
    }
    return next;
  });
  return toStrictStudentWorkbookSetup({ ...current, cohorts });
}

export function selectExistingCohort(
  setup: StudentWorkbookSetup,
  sourceClass: string,
  cohortId: string | undefined,
): ParsedStudentWorkbookSetup {
  const current = toStrictStudentWorkbookSetup(setup);
  const cohorts = updateSourceCohort(current.cohorts, sourceClass, (cohort) => {
    const next = { ...cohort };
    delete next.selectedCohortId;
    clearCatalogCreationMode(next);
    if (cohortId) next.selectedCohortId = cohortId;
    return next;
  });
  return toStrictStudentWorkbookSetup({ ...current, cohorts });
}

export function applyCohortCapacity(
  setup: StudentWorkbookSetup,
  sourceClass: string,
  capacity: number | undefined,
): ParsedStudentWorkbookSetup {
  const current = toStrictStudentWorkbookSetup(setup);
  const cohorts = updateSourceCohort(current.cohorts, sourceClass, (cohort) => {
    const next = { ...cohort };
    delete next.selectedCohortId;
    if (capacity === undefined) delete next.capacity;
    else next.capacity = capacity;
    return next;
  });
  return toStrictStudentWorkbookSetup({ ...current, cohorts });
}

export function removeCatalogDraft(
  setup: StudentWorkbookSetup,
  kind: CatalogDraftKind,
  key: string,
): ParsedStudentWorkbookSetup {
  const current = toStrictStudentWorkbookSetup(setup);
  const catalog = { ...current.catalog };
  if (kind === "programs") catalog.programs = catalog.programs.filter((draft) => draft.key !== key);
  if (kind === "campuses") catalog.campuses = catalog.campuses.filter((draft) => draft.key !== key);
  if (kind === "terms") catalog.terms = catalog.terms.filter((draft) => draft.key !== key);
  const plannedField = KIND_FIELDS[kind].planned;
  const cohorts = current.cohorts.map((cohort) => {
    if (cohort[plannedField] !== key) return cohort;
    const next = { ...cohort };
    clearCatalogReference(next, kind);
    return next;
  });
  return toStrictStudentWorkbookSetup({ ...current, catalog, cohorts });
}

export function catalogSelectorOptions(
  existing: Array<{ id: string; name: string }>,
  drafts: Array<{ key: string; name: string }>,
) {
  return [
    ...existing.map((option) => ({
      value: `existing:${option.id}`,
      label: `Existing: ${display(option.name)}`,
    })),
    ...drafts.map((draft) => ({
      value: `planned:${draft.key}`,
      label: `Planned: ${display(draft.name)}`,
    })),
    { value: "create", label: "Create new…" },
  ];
}

export function toStrictStudentWorkbookSetup(value: unknown): ParsedStudentWorkbookSetup {
  return parseStudentWorkbookSetup(value);
}

export function sourceCohortLegend(sourceClass: string) {
  return `Source cohort (Excel Class): ${display(sourceClass)}`;
}

export function buildPlannedCatalogSummary(
  setup: StudentWorkbookSetup,
  serverPlan?: Pick<StudentWorkbookPreview["academic"], "programs" | "campuses" | "terms">,
) {
  const current = toStrictStudentWorkbookSetup(setup);
  const programs = summarizeDrafts(
    current.catalog.programs,
    current.cohorts,
    "programDraftKey",
    serverPlan?.programs,
  );
  const campuses = summarizeDrafts(
    current.catalog.campuses,
    current.cohorts,
    "campusDraftKey",
    serverPlan?.campuses,
  );
  const terms = summarizeDrafts(
    current.catalog.terms,
    current.cohorts,
    "termDraftKey",
    serverPlan?.terms,
  );
  return {
    programs,
    campuses,
    terms,
    counts: { programs: programs.length, campuses: campuses.length, terms: terms.length },
  };
}

export function hasStudentImportServerBlockers(
  preview: Pick<StudentWorkbookPreview, "blocking" | "academic">,
) {
  return preview.blocking ||
    preview.academic.requirements.cohorts.length > 0 ||
    preview.academic.requirements.assessmentDates.length > 0 ||
    preview.academic.rows.some((row) => row.errors.length > 0);
}

function catalogSelectionValue(
  setup: StudentWorkbookSetup,
  sourceClass: string,
  kind: CatalogDraftKind,
) {
  const cohort = setup.cohorts.find(
    (entry) => normalized(entry.sourceClass) === normalized(sourceClass),
  );
  if (!cohort) return "";
  const fields = KIND_FIELDS[kind];
  const plannedKey = cohort[fields.planned];
  if (plannedKey) return `planned:${plannedKey}`;
  const existingId = cohort[fields.existing];
  return existingId ? `existing:${existingId}` : "";
}

function createCatalogDraftKey(prefix: string, name: string, keys: string[]) {
  const slug = display(name).toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160) || "new";
  const base = `${prefix}-${slug}`;
  const used = new Set(keys);
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function upsertDraft<T extends { key: string }>(drafts: T[], draft: T, editingKey?: string) {
  return editingKey
    ? drafts.map((candidate) => candidate.key === editingKey ? draft : candidate)
    : [...drafts, draft];
}

function updateSourceCohort(
  cohorts: StudentWorkbookSetup["cohorts"],
  sourceClass: string,
  update: (cohort: StudentWorkbookSetup["cohorts"][number]) => StudentWorkbookSetup["cohorts"][number],
) {
  const target = normalized(sourceClass);
  let found = false;
  const next = cohorts.map((cohort) => {
    if (normalized(cohort.sourceClass) !== target) return cohort;
    found = true;
    return update(cohort);
  });
  if (!found) next.push(update({ sourceClass: display(sourceClass) }));
  return next;
}

function clearCatalogReference(
  cohort: StudentWorkbookSetup["cohorts"][number],
  kind: CatalogDraftKind,
) {
  if (kind === "programs") {
    delete cohort.programId;
    delete cohort.programDraftKey;
  } else if (kind === "campuses") {
    delete cohort.campusId;
    delete cohort.campusDraftKey;
  } else {
    delete cohort.termId;
    delete cohort.termDraftKey;
  }
}

function clearCatalogCreationMode(
  cohort: StudentWorkbookSetup["cohorts"][number],
) {
  delete cohort.programId;
  delete cohort.programDraftKey;
  delete cohort.campusId;
  delete cohort.campusDraftKey;
  delete cohort.termId;
  delete cohort.termDraftKey;
  delete cohort.capacity;
}

function summarizeDrafts<T extends { key: string; name: string }>(
  drafts: T[],
  cohorts: StudentWorkbookSetup["cohorts"],
  field: "programDraftKey" | "campusDraftKey" | "termDraftKey",
  serverDrafts?: ReadonlyArray<{ name: string }>,
) {
  const plannedNames = serverDrafts
    ? new Set(serverDrafts.map((draft) => normalized(draft.name)))
    : null;
  return drafts.flatMap((draft) => {
    const sourceCohorts = uniqueDisplayValues(cohorts
      .filter((cohort) => !cohort.selectedCohortId && cohort[field] === draft.key)
      .map((cohort) => cohort.sourceClass));
    if (sourceCohorts.length === 0 || (plannedNames && !plannedNames.has(normalized(draft.name)))) {
      return [];
    }
    return [{ key: draft.key, name: draft.name, sourceCohorts }];
  });
}

function uniqueDisplayValues(values: string[]) {
  const unique = new Map<string, string>();
  for (const value of values) {
    const key = normalized(value);
    if (!unique.has(key)) unique.set(key, display(value));
  }
  return [...unique.values()];
}

function emptyEditor(kind: CatalogDraftKind): DraftEditor {
  if (kind === "programs") return { name: "", firstDetail: "SAT", secondDetail: "" };
  if (kind === "campuses") return { name: "", firstDetail: "", secondDetail: "In person" };
  return { name: "", firstDetail: "", secondDetail: "" };
}

function editorForDraft(kind: CatalogDraftKind, draft: PlannedProgramInput | PlannedCampusInput | PlannedTermInput): DraftEditor {
  if (kind === "programs") {
    const program = draft as PlannedProgramInput;
    return { key: program.key, name: program.name, firstDetail: program.track, secondDetail: program.format };
  }
  if (kind === "campuses") {
    const campus = draft as PlannedCampusInput;
    return { key: campus.key, name: campus.name, firstDetail: campus.location, secondDetail: campus.modality };
  }
  const term = draft as PlannedTermInput;
  return { key: term.key, name: term.name, firstDetail: term.startDate, secondDetail: term.endDate };
}

function inputForEditor(kind: CatalogDraftKind, editor: DraftEditor): CatalogDraftInput {
  if (kind === "programs") {
    return { name: editor.name, track: editor.firstDetail as ProgramDraft["track"], format: editor.secondDetail };
  }
  if (kind === "campuses") {
    return { name: editor.name, location: editor.firstDetail, modality: editor.secondDetail as CampusDraft["modality"] };
  }
  return { name: editor.name, startDate: editor.firstDetail, endDate: editor.secondDetail };
}

function display(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalized(value: string) {
  return display(value).toLocaleLowerCase("en-US");
}

function stableId(value: string) {
  return normalized(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "cohort";
}
