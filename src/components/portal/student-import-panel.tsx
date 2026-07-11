"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StudentImportAcademicSetup } from "@/components/portal/student-import-academic-setup";
import { StudentImportPreviewTabs } from "@/components/portal/student-import-preview-tabs";
import type { UserRole } from "@/lib/domain";
import type {
  StudentImportCommitResult,
  StudentWorkbookExcludedRowReference,
  StudentWorkbookPreview,
} from "@/lib/student-import-operations";
import {
  STUDENT_IMPORT_FIELD_LABELS,
  formatStudentImportSummary,
  getStudentImportTargetLabel,
  suggestStudentImportMapping,
  type StudentCustomFieldType,
  type StudentImportFieldKey,
  type StudentImportMapping,
  type StudentImportSummaryCounts,
} from "@/lib/student-import-schema";
import type {
  AcademicColumnMapping,
  ScoreComponent,
  StudentWorkbookMappingPlan,
  StudentWorkbookSetup,
} from "@/lib/student-workbook-schema";

interface StudentImportPanelProps {
  role: UserRole;
  onImported: () => void;
  defaultOpen?: boolean;
}

export interface PreviewSnapshot {
  selectedSheet: string;
  mappingPlan: StudentWorkbookMappingPlan;
  setup: StudentWorkbookSetup;
  targetDemo?: boolean;
}

const KNOWN_FIELDS = Object.keys(STUDENT_IMPORT_FIELD_LABELS) as StudentImportFieldKey[];
const CUSTOM_FIELD_TYPES: StudentCustomFieldType[] = ["text", "number", "date", "boolean"];
const ACADEMIC_MAPPING_LABELS: Record<Exclude<AcademicColumnMapping["kind"], "score">, string> = {
  "student-name": "Student name",
  cohort: "Cohort / source Class",
  "session-title": "Website class / session",
  room: "Classroom",
  "assessment-title": "Combined test name",
  "assessment-date": "Source assessment date (reference only)",
  ignore: "Ignore this column",
};

export function StudentImportPanel({ role, onImported, defaultOpen = false }: StudentImportPanelProps) {
  const engineer = role === "engineer";
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const previewRequestIdRef = useRef(0);
  const selectedFileRef = useRef<File | null>(null);
  const [open, setOpen] = useState(defaultOpen);
  const [file, setFile] = useState<File | null>(null);
  const [targetDemo, setTargetDemo] = useState<boolean | undefined>(undefined);
  const [preview, setPreview] = useState<StudentWorkbookPreview | null>(null);
  const [mappingPlan, setMappingPlan] = useState<StudentWorkbookMappingPlan | null>(null);
  const [setup, setSetup] = useState<StudentWorkbookSetup>({ cohorts: [], assessmentDates: [] });
  const [excludedRows, setExcludedRows] = useState<StudentWorkbookExcludedRowReference[]>([]);
  const [snapshot, setSnapshot] = useState<PreviewSnapshot | null>(null);
  const [snapshotExcludedRows, setSnapshotExcludedRows] = useState<StudentWorkbookExcludedRowReference[]>([]);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState<"preview" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const expectedConfirmation = preview?.targetDemo ? "DEMO" : "MAIN";
  const snapshotCurrent = useMemo(() => {
    if (!preview || !mappingPlan) return false;
    return isPreviewSnapshotCurrent(snapshot, {
      selectedSheet: preview.selectedSheet,
      mappingPlan,
      setup,
      targetDemo,
    }) && sameExcludedRows(snapshotExcludedRows, excludedRows);
  }, [excludedRows, mappingPlan, preview, setup, snapshot, snapshotExcludedRows, targetDemo]);

  const reset = useCallback(() => {
    previewRequestIdRef.current += 1;
    selectedFileRef.current = null;
    setFile(null);
    setTargetDemo(undefined);
    setPreview(null);
    setMappingPlan(null);
    setSetup({ cohorts: [], assessmentDates: [] });
    setExcludedRows([]);
    setSnapshot(null);
    setSnapshotExcludedRows([]);
    setConfirmation("");
    setPending(null);
    setError(null);
  }, []);

  const close = useCallback(() => {
    if (pending) return;
    setOpen(false);
    reset();
  }, [pending, reset]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusTimer = window.setTimeout(() => fileInputRef.current?.focus());
    return () => {
      window.clearTimeout(focusTimer);
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (pending === null) {
          event.preventDefault();
          close();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter(isVisibleDialogControl);
      if (controls.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = controls[0];
      const last = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", handleKeyDown);
    return () => dialog.removeEventListener("keydown", handleKeyDown);
  }, [close, open, pending]);

  const runPreview = async (options?: {
    sheetName?: string;
    mappingPlan?: StudentWorkbookMappingPlan;
    setup?: StudentWorkbookSetup;
    excludedRows?: StudentWorkbookExcludedRowReference[];
  }) => {
    if (!file) {
      setError("Choose an .xlsx or .csv file first.");
      return;
    }
    if (engineer && targetDemo === undefined) {
      setError("Choose Demo or Main before previewing the import.");
      return;
    }

    const submittedMappingPlan = options?.mappingPlan;
    const submittedSetup = options?.setup;
    const submittedExcludedRows = options?.excludedRows ?? [];
    const requestedFile = file;
    const requestId = ++previewRequestIdRef.current;
    setPending("preview");
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      if (options?.sheetName) form.set("sheetName", options.sheetName);
      if (submittedMappingPlan) form.set("mappingPlan", JSON.stringify(submittedMappingPlan));
      if (submittedSetup) form.set("setup", JSON.stringify(submittedSetup));
      if (submittedExcludedRows.length > 0) form.set("excludedRows", JSON.stringify(submittedExcludedRows));
      if (targetDemo !== undefined) form.set("targetDemo", String(targetDemo));

      const response = await fetch("/api/students/import/preview", { method: "POST", body: form });
      const body = await readJson(response);
      if (!isCurrentPreviewRequest(
        requestId,
        previewRequestIdRef.current,
        requestedFile,
        selectedFileRef.current,
      )) return;
      if (!response.ok) throw new Error(getResponseError(body, "Student import preview failed."));
      if (!isStudentImportPreviewResponse(body)) {
        throw new Error("Student import preview returned an invalid response.");
      }
      setPreview(body);
      setMappingPlan(body.mappingPlan);
      setSetup(body.setup);
      setExcludedRows(submittedExcludedRows);
      setSnapshot({
        selectedSheet: body.selectedSheet,
        mappingPlan: body.mappingPlan,
        setup: body.setup,
        targetDemo,
      });
      setSnapshotExcludedRows(submittedExcludedRows);
      setConfirmation("");
    } catch (nextError) {
      if (isCurrentPreviewRequest(
        requestId,
        previewRequestIdRef.current,
        requestedFile,
        selectedFileRef.current,
      )) {
        setError(nextError instanceof Error ? nextError.message : "Student import preview failed.");
      }
    } finally {
      if (isCurrentPreviewRequest(
        requestId,
        previewRequestIdRef.current,
        requestedFile,
        selectedFileRef.current,
      )) setPending(null);
    }
  };

  const updatePreview = () => {
    if (!preview || !mappingPlan) return;
    void runPreview({
      sheetName: preview.selectedSheet,
      mappingPlan,
      setup,
      excludedRows,
    });
  };

  const selectSheet = (sheetName: string) => {
    setExcludedRows([]);
    setSnapshot(null);
    setSnapshotExcludedRows([]);
    void runPreview({ sheetName });
  };

  const updateDirectoryMappingKind = (index: number, value: string) => {
    if (!mappingPlan) return;
    const currentMappings = mappingPlan.directory.columns;
    const sourceHeader = currentMappings[index].sourceHeader;
    let mapping: StudentImportMapping;
    if (value === "ignore") {
      mapping = { sourceHeader, kind: "ignore" };
    } else if (value.startsWith("known:")) {
      mapping = { sourceHeader, kind: "known", field: value.slice(6) as StudentImportFieldKey };
    } else if (value.startsWith("existing:")) {
      mapping = { sourceHeader, kind: "custom-existing", key: value.slice(9) };
    } else {
      const suggested = suggestStudentImportMapping(sourceHeader);
      mapping = suggested.kind === "custom-new"
        ? suggested
        : { sourceHeader, kind: "custom-new", key: customKey(sourceHeader), label: sourceHeader, dataType: "text", sensitive: true };
    }
    setMappingPlan({
      ...mappingPlan,
      directory: {
        ...mappingPlan.directory,
        columns: currentMappings.map((entry, entryIndex) => entryIndex === index ? mapping : entry),
      },
    });
  };

  const updateNewCustomMapping = (
    index: number,
    patch: Partial<Extract<StudentImportMapping, { kind: "custom-new" }>>,
  ) => {
    if (!mappingPlan) return;
    setMappingPlan({
      ...mappingPlan,
      directory: {
        ...mappingPlan.directory,
        columns: mappingPlan.directory.columns.map((mapping, entryIndex) =>
          entryIndex === index && mapping.kind === "custom-new" ? { ...mapping, ...patch } : mapping,
        ),
      },
    });
  };

  const updateAcademicMappingKind = (index: number, value: string) => {
    if (!mappingPlan?.academic) return;
    const current = mappingPlan.academic.columns[index];
    const base = { sourceHeader: current.sourceHeader, columnIndex: current.columnIndex };
    let mapping: AcademicColumnMapping;
    if (value.startsWith("score:")) {
      mapping = {
        ...base,
        kind: "score",
        component: value.slice(6) as ScoreComponent,
        assessmentTitle: mappingPlan.profile === "normalized"
          ? ""
          : current.kind === "score" ? current.assessmentTitle : current.sourceHeader,
      };
    } else {
      mapping = { ...base, kind: value as Exclude<AcademicColumnMapping["kind"], "score"> };
    }
    setMappingPlan({
      ...mappingPlan,
      academic: {
        ...mappingPlan.academic,
        columns: mappingPlan.academic.columns.map((entry, entryIndex) => entryIndex === index ? mapping : entry),
      },
    });
  };

  const updateAssessmentTitle = (index: number, assessmentTitle: string) => {
    if (!mappingPlan?.academic) return;
    setMappingPlan({
      ...mappingPlan,
      academic: {
        ...mappingPlan.academic,
        columns: mappingPlan.academic.columns.map((entry, entryIndex) =>
          entryIndex === index && entry.kind === "score" ? { ...entry, assessmentTitle } : entry,
        ),
      },
    });
  };

  const toggleRow = (reference: StudentWorkbookExcludedRowReference, included: boolean) => {
    setExcludedRows((current) => included
      ? current.filter((entry) => rowKey(entry) !== rowKey(reference))
      : [...new Map([...current, reference].map((entry) => [rowKey(entry), entry])).values()]
        .sort((left, right) => left.sheetName.localeCompare(right.sheetName) || left.rowNumber - right.rowNumber));
  };

  const commit = async () => {
    if (!file || !preview || !snapshotCurrent || !snapshot ||
      (engineer && confirmation !== expectedConfirmation)) return;
    setPending("commit");
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("sheetName", snapshot.selectedSheet);
      form.set("mappingPlan", JSON.stringify(snapshot.mappingPlan));
      form.set("setup", JSON.stringify(snapshot.setup));
      form.set("excludedRows", JSON.stringify(snapshotExcludedRows));
      form.set("expectedDigest", preview.digest);
      if (snapshot.targetDemo !== undefined) form.set("targetDemo", String(snapshot.targetDemo));

      const response = await fetch("/api/students/import/commit", { method: "POST", body: form });
      const body = await readJson(response);
      if (!response.ok) throw new Error(getResponseError(body, "Student import failed."));
      if (!isStudentImportCommitResponse(body)) {
        throw new Error("Student import returned an invalid response.");
      }
      setOpen(false);
      reset();
      onImported();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Student import failed.");
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-[color:var(--navy)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--navy)]"
      >
        Import students
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(15,23,42,0.5)] p-4">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-import-title"
            tabIndex={-1}
            className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="section-kicker">Bulk student import</div>
                <h3 id="student-import-title" className="mt-2 text-2xl font-semibold text-[color:var(--navy-strong)]">
                  Preview every workbook change
                </h3>
                <p className="mt-2 text-sm text-[color:var(--muted)]">
                  Upload, map, and review the spreadsheet before any student or academic data is saved.
                </p>
              </div>
              <button type="button" onClick={close} disabled={pending !== null} className="text-sm font-semibold text-[color:var(--muted)] disabled:opacity-50">
                Close
              </button>
            </div>

            {error ? <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</div> : null}

            <section className="mt-5 rounded-lg border border-[color:var(--line)] p-4" aria-labelledby="student-import-upload">
              <h4 id="student-import-upload" className="font-semibold text-[color:var(--navy-strong)]">1. Upload</h4>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <label className="text-sm font-semibold text-[color:var(--navy-strong)]">
                  Student spreadsheet
                  <input
                    ref={fileInputRef}
                    type="file"
                    disabled={pending !== null}
                    accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                    onChange={(event) => {
                      const nextFile = event.target.files?.[0] ?? null;
                      previewRequestIdRef.current += 1;
                      selectedFileRef.current = nextFile;
                      setFile(nextFile);
                      setPending(null);
                      setPreview(null);
                      setMappingPlan(null);
                      setSetup({ cohorts: [], assessmentDates: [] });
                      setExcludedRows([]);
                      setSnapshot(null);
                      setSnapshotExcludedRows([]);
                      setConfirmation("");
                      setError(null);
                    }}
                    className="mt-2 block w-full rounded-lg border border-[color:var(--line)] p-2 text-sm font-normal"
                  />
                </label>
                {engineer ? (
                  <fieldset>
                    <legend className="text-sm font-semibold text-[color:var(--navy-strong)]">Import target (required)</legend>
                    <div className="mt-2 flex gap-4">
                      {[true, false].map((demo) => (
                        <label key={String(demo)} className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            disabled={pending !== null}
                            name="student-import-target"
                            checked={targetDemo === demo}
                            onChange={() => {
                              setTargetDemo(demo);
                              setPreview(null);
                              setMappingPlan(null);
                              setSetup({ cohorts: [], assessmentDates: [] });
                              setExcludedRows([]);
                              setSnapshot(null);
                              setSnapshotExcludedRows([]);
                              setConfirmation("");
                            }}
                          />
                          {getStudentImportTargetLabel(demo)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : <p className="text-sm text-[color:var(--muted)]">The import will use your account&apos;s data partition.</p>}
              </div>
              <button
                type="button"
                onClick={() => void runPreview()}
                disabled={!file || (engineer && targetDemo === undefined) || pending !== null}
                className="mt-4 rounded-full bg-[color:var(--navy)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {pending === "preview" ? "Reading spreadsheet..." : "Preview spreadsheet"}
              </button>
            </section>

            {preview && mappingPlan ? (
              <>
                <section className="mt-4 rounded-lg border border-[color:var(--line)] p-4" aria-labelledby="student-import-map">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 id="student-import-map" className="font-semibold text-[color:var(--navy-strong)]">2. Map workbook</h4>
                      <p className="mt-1 text-sm text-[color:var(--muted)]">
                        {profileLabel(preview.profile)} profile · Target: {getStudentImportTargetLabel(preview.targetDemo)}
                      </p>
                    </div>
                    {preview.sheetNames.length > 1 ? (
                      <label className="text-sm font-semibold text-[color:var(--navy-strong)]">
                        Worksheet
                        <select
                          value={preview.selectedSheet}
                          onChange={(event) => selectSheet(event.target.value)}
                          disabled={pending !== null}
                          className="ml-2 rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 font-normal"
                        >
                          {preview.sheetNames.map((sheetName) => <option key={sheetName}>{sheetName}</option>)}
                        </select>
                      </label>
                    ) : null}
                  </div>

                  {preview.profile === "simple" ? (
                    <DirectoryMappingEditor
                      title="Column mappings"
                      mappings={mappingPlan.directory.columns}
                      definitions={preview.definitions}
                      disabled={pending !== null}
                      onKindChange={updateDirectoryMappingKind}
                      onCustomChange={updateNewCustomMapping}
                    />
                  ) : (
                    <div className="mt-4 grid gap-4 xl:grid-cols-2">
                      <div className="rounded-lg border border-[color:var(--line)] p-3">
                        <DirectoryMappingEditor
                          title={`Directory mappings · ${mappingPlan.directory.sheetName}`}
                          mappings={mappingPlan.directory.columns}
                          definitions={preview.definitions}
                          disabled={pending !== null}
                          onKindChange={updateDirectoryMappingKind}
                          onCustomChange={updateNewCustomMapping}
                        />
                      </div>
                      <div className="rounded-lg border border-[color:var(--line)] p-3">
                        <AcademicMappingEditor
                          profile={preview.profile}
                          mappingPlan={mappingPlan}
                          disabled={pending !== null}
                          onKindChange={updateAcademicMappingKind}
                          onAssessmentTitleChange={updateAssessmentTitle}
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={updatePreview}
                    disabled={pending !== null}
                    className="mt-4 rounded-full border border-[color:var(--navy)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--navy)] disabled:opacity-50"
                  >
                    {pending === "preview" ? "Updating preview..." : "Update preview"}
                  </button>
                </section>

                <StudentImportAcademicSetup
                  requirements={preview.academic.requirements}
                  options={preview.options}
                  value={setup}
                  disabled={pending !== null}
                  onChange={setSetup}
                  onRefreshPreview={updatePreview}
                />

                <section className="mt-4 rounded-lg border border-[color:var(--line)] p-4" aria-labelledby="student-import-review">
                  <h4 id="student-import-review" className="font-semibold text-[color:var(--navy-strong)]">3. Review and import</h4>
                  <p className="mt-2 text-sm text-[color:var(--muted)]">{formatStudentImportSummary(preview.summary)}</p>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">
                    Academic plan: {preview.academic.summary.cohorts} cohorts, {preview.academic.summary.sessions} classes, {preview.academic.summary.enrollments} enrollments, {preview.academic.summary.assessments} assessments, {preview.academic.summary.resultCreates} score creates, {preview.academic.summary.resultUpdates} score updates.
                  </p>
                  {!snapshotCurrent ? <p className="mt-2 text-sm font-semibold text-amber-800">Update the preview after changing mappings, academic setup, worksheet, exclusions, or target.</p> : null}
                  {preview.blocking ? <p className="mt-2 text-sm font-semibold text-rose-700">Resolve every setup requirement and row error, or exclude the affected source row, before importing.</p> : null}

                  <StudentImportPreviewTabs
                    preview={preview}
                    mappingPlan={mappingPlan}
                    excludedRows={excludedRows}
                    disabled={pending !== null}
                    onToggleRow={toggleRow}
                  />

                  {engineer ? (
                    <label className="mt-4 block max-w-sm text-sm font-semibold text-[color:var(--navy-strong)]">
                      Type {expectedConfirmation} to confirm {getStudentImportTargetLabel(preview.targetDemo).toLowerCase()}
                      <input value={confirmation} onChange={(event) => setConfirmation(event.target.value.toUpperCase())} autoComplete="off" className="mt-2 block w-full rounded-lg border border-[color:var(--line)] px-3 py-2 font-normal" />
                    </label>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void commit()}
                    disabled={pending !== null || !snapshotCurrent || preview.blocking || (engineer && confirmation !== expectedConfirmation)}
                    className="mt-4 rounded-full bg-[color:var(--navy)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {pending === "commit" ? "Importing students..." : "Import reviewed changes"}
                  </button>
                </section>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function DirectoryMappingEditor({
  title,
  mappings,
  definitions,
  disabled,
  onKindChange,
  onCustomChange,
}: {
  title: string;
  mappings: StudentImportMapping[];
  definitions: StudentWorkbookPreview["definitions"];
  disabled: boolean;
  onKindChange: (index: number, value: string) => void;
  onCustomChange: (
    index: number,
    patch: Partial<Extract<StudentImportMapping, { kind: "custom-new" }>>,
  ) => void;
}) {
  return (
    <div className="mt-4 first:mt-0">
      <h5 className="text-sm font-semibold text-[color:var(--navy-strong)]">{title}</h5>
      <div className="mt-3 grid gap-3 lg:grid-cols-2 xl:grid-cols-1">
        {mappings.map((mapping, index) => (
          <div key={`${mapping.sourceHeader}-${index}`} className="rounded-lg border border-[color:var(--line)] bg-stone-50/70 p-3">
            <label className="text-sm font-semibold text-[color:var(--navy-strong)]">
              {mapping.sourceHeader}
              <select
                value={directoryMappingValue(mapping)}
                onChange={(event) => onKindChange(index, event.target.value)}
                disabled={disabled}
                className="mt-2 block w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 font-normal"
              >
                <option value="ignore">Ignore this column</option>
                <optgroup label="Student and family fields">
                  {KNOWN_FIELDS.map((field) => <option key={field} value={`known:${field}`}>{STUDENT_IMPORT_FIELD_LABELS[field]}</option>)}
                </optgroup>
                {definitions.length > 0 ? (
                  <optgroup label="Existing custom fields">
                    {definitions.map((definition) => <option key={definition.id} value={`existing:${definition.key}`}>{definition.label}</option>)}
                  </optgroup>
                ) : null}
                <option value="new">Create a custom field</option>
              </select>
            </label>
            {mapping.kind === "custom-new" ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <label className="text-xs font-semibold text-[color:var(--muted)]">Label<input value={mapping.label} disabled={disabled} onChange={(event) => onCustomChange(index, { label: event.target.value })} className="mt-1 w-full rounded border border-[color:var(--line)] bg-white px-2 py-1.5 text-sm font-normal text-[color:var(--navy-strong)]" /></label>
                <label className="text-xs font-semibold text-[color:var(--muted)]">Key<input value={mapping.key} disabled={disabled} onChange={(event) => onCustomChange(index, { key: customKey(event.target.value) })} className="mt-1 w-full rounded border border-[color:var(--line)] bg-white px-2 py-1.5 text-sm font-normal text-[color:var(--navy-strong)]" /></label>
                <label className="text-xs font-semibold text-[color:var(--muted)]">Type<select value={mapping.dataType} disabled={disabled} onChange={(event) => onCustomChange(index, { dataType: event.target.value as StudentCustomFieldType })} className="mt-1 w-full rounded border border-[color:var(--line)] bg-white px-2 py-1.5 text-sm font-normal text-[color:var(--navy-strong)]">{CUSTOM_FIELD_TYPES.map((dataType) => <option key={dataType}>{dataType}</option>)}</select></label>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function AcademicMappingEditor({
  profile,
  mappingPlan,
  disabled,
  onKindChange,
  onAssessmentTitleChange,
}: {
  profile: "wide" | "normalized";
  mappingPlan: StudentWorkbookMappingPlan;
  disabled: boolean;
  onKindChange: (index: number, value: string) => void;
  onAssessmentTitleChange: (index: number, value: string) => void;
}) {
  const mappings = mappingPlan.academic?.columns ?? [];
  return (
    <div>
      <h5 className="text-sm font-semibold text-[color:var(--navy-strong)]">Academic mappings · {mappingPlan.academic?.sheetName}</h5>
      <p className="mt-1 text-xs text-[color:var(--muted)]">
        {profile === "wide"
          ? "Wide workbook: Class → cohort, Level → website class/session, Room → classroom."
          : "Normalized Scores: Cohort → cohort, Class → website class/session, Room → classroom."}
        {" "}Unknown academic columns stay ignored unless you map them explicitly.
      </p>
      <div className="mt-3 space-y-3">
        {mappings.map((mapping, index) => (
          <div key={`${mapping.columnIndex}:${mapping.sourceHeader}`} className="rounded-lg border border-[color:var(--line)] bg-stone-50/70 p-3">
            <label className="text-sm font-semibold text-[color:var(--navy-strong)]">
              {mapping.sourceHeader}
              <select
                value={academicMappingValue(mapping)}
                onChange={(event) => onKindChange(index, event.target.value)}
                disabled={disabled}
                className="mt-2 block w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 font-normal"
              >
                {Object.entries(ACADEMIC_MAPPING_LABELS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
                <optgroup label="Score component">
                  <option value="score:rw">RW score</option>
                  <option value="score:math">Math score</option>
                  <option value="score:total">Total score</option>
                </optgroup>
              </select>
            </label>
            {mapping.kind === "score" && profile === "wide" ? (
              <label className="mt-2 block text-xs font-semibold text-[color:var(--muted)]">
                Combined test name
                <input
                  value={mapping.assessmentTitle}
                  onChange={(event) => onAssessmentTitleChange(index, event.target.value)}
                  disabled={disabled}
                  className="mt-1 block w-full rounded border border-[color:var(--line)] bg-white px-2 py-1.5 text-sm font-normal text-[color:var(--navy-strong)]"
                />
              </label>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function directoryMappingValue(mapping: StudentImportMapping) {
  if (mapping.kind === "known") return `known:${mapping.field}`;
  if (mapping.kind === "custom-existing") return `existing:${mapping.key}`;
  if (mapping.kind === "custom-new") return "new";
  return "ignore";
}

function academicMappingValue(mapping: AcademicColumnMapping) {
  return mapping.kind === "score" ? `score:${mapping.component}` : mapping.kind;
}

function profileLabel(profile: StudentWorkbookPreview["profile"]) {
  if (profile === "wide") return "Wide scores";
  if (profile === "normalized") return "Normalized directory + scores";
  return "Simple directory";
}

function customKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "custom_field";
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getResponseError(body: unknown, fallback: string) {
  return isRecord(body) && typeof body.error === "string" ? body.error : fallback;
}

export function isStudentImportPreviewResponse(value: unknown): value is StudentWorkbookPreview {
  if (!isRecord(value) ||
    !["simple", "wide", "normalized"].includes(String(value.profile)) ||
    typeof value.targetDemo !== "boolean" ||
    typeof value.digest !== "string" || !/^[a-f0-9]{64}$/.test(value.digest) ||
    typeof value.selectedSheet !== "string" ||
    !isStringArray(value.sheetNames) || !value.sheetNames.includes(value.selectedSheet) ||
    !isStringArray(value.headers) ||
    !Array.isArray(value.mappings) || value.mappings.length !== value.headers.length ||
    !value.mappings.every(isDirectoryMapping) ||
    !Array.isArray(value.definitions) || !value.definitions.every(isDefinition) ||
    !Array.isArray(value.rows) || !value.rows.every(isDirectoryPreviewRow) ||
    !isStudentImportSummary(value.summary) ||
    !isWorkbookMappingPlan(value.mappingPlan, value.profile as StudentWorkbookPreview["profile"]) ||
    !isWorkbookSetup(value.setup) ||
    !isAcademicPlan(value.academic) ||
    !Array.isArray(value.academicSourceRows) || value.academicSourceRows.length > 2_000 ||
    !value.academicSourceRows.every(isAcademicSourceRow) ||
    !Array.isArray(value.sourceAssessmentDateSuggestions) ||
    !value.sourceAssessmentDateSuggestions.every(isSourceDateSuggestion) ||
    !isWorkbookOptions(value.options) ||
    typeof value.blocking !== "boolean"
  ) return false;

  const plan = value.mappingPlan as StudentWorkbookMappingPlan;
  const headers = value.headers as string[];
  const mappings = value.mappings as StudentImportMapping[];
  const academicSourceRows = value.academicSourceRows as StudentWorkbookPreview["academicSourceRows"];
  return plan.directory.sheetName.length > 0 &&
    (plan.academic === null
      ? academicSourceRows.length === 0
      : academicSourceRows.every((row) => row.sheetName === plan.academic!.sheetName)) &&
    headers.every((header, index) =>
      typeof header === "string" && header === plan.directory.columns[index]?.sourceHeader &&
      JSON.stringify(mappings[index]) === JSON.stringify(plan.directory.columns[index]),
    );
}

export function isStudentImportCommitResponse(value: unknown): value is StudentImportCommitResult {
  return isRecord(value) && typeof value.runId === "string" && value.runId.length > 0 &&
    [
      value.created, value.updated, value.enrolled, value.skipped,
      value.cohorts, value.sessions, value.assessments, value.results,
    ].every(isNonNegativeInteger);
}

export function isPreviewSnapshotCurrent(
  snapshot: PreviewSnapshot | null,
  current: PreviewSnapshot,
): boolean {
  return snapshot !== null &&
    snapshot.selectedSheet === current.selectedSheet &&
    snapshot.targetDemo === current.targetDemo &&
    JSON.stringify(snapshot.mappingPlan) === JSON.stringify(current.mappingPlan) &&
    JSON.stringify(snapshot.setup) === JSON.stringify(current.setup);
}

export function isCurrentPreviewRequest<T extends object>(
  requestId: number,
  currentRequestId: number,
  requestedFile: T,
  currentFile: T | null,
): boolean {
  return requestId === currentRequestId && requestedFile === currentFile;
}

export function isVisibleDialogControl(
  control: Pick<HTMLElement, "hidden" | "closest">,
): boolean {
  return !control.hidden && control.closest('[hidden], [aria-hidden="true"]') === null;
}

function isWorkbookMappingPlan(
  value: unknown,
  profile: StudentWorkbookPreview["profile"],
): value is StudentWorkbookMappingPlan {
  if (!isRecord(value) || value.profile !== profile || !isRecord(value.directory) ||
    typeof value.directory.sheetName !== "string" || !Array.isArray(value.directory.columns) ||
    !value.directory.columns.every(isDirectoryMapping)) return false;
  if (value.academic === null) return profile === "simple";
  return profile !== "simple" && isRecord(value.academic) && typeof value.academic.sheetName === "string" &&
    Array.isArray(value.academic.columns) && value.academic.columns.every(isAcademicMapping);
}

function isDirectoryMapping(value: unknown): value is StudentImportMapping {
  if (!isRecord(value) || typeof value.sourceHeader !== "string") return false;
  if (value.kind === "ignore") return hasOnlyKeys(value, ["sourceHeader", "kind"]);
  if (value.kind === "known") return hasOnlyKeys(value, ["sourceHeader", "kind", "field"]) &&
    typeof value.field === "string" && KNOWN_FIELDS.includes(value.field as StudentImportFieldKey);
  if (value.kind === "custom-existing") return hasOnlyKeys(value, ["sourceHeader", "kind", "key"]) && typeof value.key === "string";
  return value.kind === "custom-new" && hasOnlyKeys(value, ["sourceHeader", "kind", "key", "label", "dataType", "sensitive"]) &&
    typeof value.key === "string" && typeof value.label === "string" &&
    CUSTOM_FIELD_TYPES.includes(value.dataType as StudentCustomFieldType) && value.sensitive === true;
}

function isAcademicMapping(value: unknown): value is AcademicColumnMapping {
  if (!isRecord(value) || typeof value.sourceHeader !== "string" ||
    !Number.isInteger(value.columnIndex) || (value.columnIndex as number) < 0) return false;
  if (["student-name", "cohort", "session-title", "room", "assessment-title", "assessment-date", "ignore"].includes(String(value.kind))) {
    return hasOnlyKeys(value, ["sourceHeader", "columnIndex", "kind"]);
  }
  return value.kind === "score" && hasOnlyKeys(value, ["sourceHeader", "columnIndex", "kind", "assessmentTitle", "component"]) &&
    typeof value.assessmentTitle === "string" && ["rw", "math", "total"].includes(String(value.component));
}

function isWorkbookSetup(value: unknown): value is StudentWorkbookSetup {
  return isRecord(value) && hasOnlyKeys(value, ["cohorts", "assessmentDates"]) &&
    Array.isArray(value.cohorts) && value.cohorts.every((entry) => isRecord(entry) &&
      hasOnlyKeys(entry, ["sourceClass", "selectedCohortId", "programId", "campusId", "termId", "capacity"]) &&
      typeof entry.sourceClass === "string" && entry.sourceClass.length > 0 &&
      [entry.selectedCohortId, entry.programId, entry.campusId, entry.termId].every((field) => field === undefined || typeof field === "string") &&
      (entry.capacity === undefined || (Number.isInteger(entry.capacity) && (entry.capacity as number) > 0))) &&
    Array.isArray(value.assessmentDates) && value.assessmentDates.every((entry) => isRecord(entry) &&
      hasOnlyKeys(entry, ["sourceClass", "assessmentTitle", "date"]) &&
      typeof entry.sourceClass === "string" && entry.sourceClass.length > 0 &&
      typeof entry.assessmentTitle === "string" && entry.assessmentTitle.length > 0 &&
      typeof entry.date === "string" && isIsoDate(entry.date));
}

function isAcademicPlan(value: unknown): value is StudentWorkbookPreview["academic"] {
  if (!isRecord(value) || !Array.isArray(value.rows) || !isRecord(value.requirements) ||
    !isStringArray(value.requirements.cohorts) || !Array.isArray(value.requirements.assessmentDates) ||
    !value.requirements.assessmentDates.every((entry) => isRecord(entry) && typeof entry.sourceClass === "string" && typeof entry.assessmentTitle === "string") ||
    ![value.cohorts, value.sessions, value.enrollments, value.assessments, value.results].every((rows) => Array.isArray(rows) && rows.every(isRecord)) ||
    !isRecord(value.summary)) return false;
  return value.rows.every((row) => isRecord(row) && Number.isInteger(row.rowNumber) &&
    (row.studentId === null || typeof row.studentId === "string") &&
    (row.cohortId === null || typeof row.cohortId === "string") &&
    isStringArray(row.actions) && Array.isArray(row.scoreActions) && row.scoreActions.every((entry) =>
      isRecord(entry) && typeof entry.assessmentTitle === "string" &&
      typeof entry.assessmentDate === "string" && isIsoDate(entry.assessmentDate) &&
      ["Create assessment result.", "Update assessment result."].includes(String(entry.action))) &&
    isStringArray(row.warnings) && isStringArray(row.errors)) &&
    [
      value.summary.cohorts, value.summary.sessions, value.summary.enrollments,
      value.summary.assessments, value.summary.resultCreates, value.summary.resultUpdates,
      value.summary.errors,
    ].every(isNonNegativeInteger);
}

function isSourceDateSuggestion(value: unknown): boolean {
  return isRecord(value) && typeof value.sheetName === "string" && Number.isInteger(value.rowNumber) &&
    typeof value.sourceClass === "string" && typeof value.assessmentTitle === "string" &&
    typeof value.date === "string" && isIsoDate(value.date);
}

function isAcademicSourceRow(value: unknown): boolean {
  return isRecord(value) && typeof value.sheetName === "string" && value.sheetName.length > 0 &&
    Number.isInteger(value.rowNumber) && (value.rowNumber as number) >= 2 &&
    typeof value.studentName === "string" && typeof value.cohortName === "string" &&
    typeof value.sessionTitle === "string" && typeof value.roomLabel === "string" &&
    typeof value.assessmentTitle === "string" && typeof value.sourceAssessmentDate === "string" &&
    (value.sourceAssessmentDate === "" || isIsoDate(value.sourceAssessmentDate)) &&
    isNullableBoundedScore(value.rw, 200, 800) && isNullableBoundedScore(value.math, 200, 800) &&
    isNullableBoundedScore(value.total, 400, 1_600) &&
    ["Create assessment result.", "Update assessment result.", "Blocked", "Review score"].includes(String(value.action)) &&
    isStringArray(value.warnings) && isStringArray(value.errors);
}

function isWorkbookOptions(value: unknown): value is StudentWorkbookPreview["options"] {
  return isRecord(value) && Array.isArray(value.programs) && value.programs.every((entry) => isRecord(entry) &&
    typeof entry.id === "string" && typeof entry.name === "string" && typeof entry.track === "string" && typeof entry.is_archived === "boolean") &&
    Array.isArray(value.campuses) && value.campuses.every((entry) => isRecord(entry) &&
      typeof entry.id === "string" && typeof entry.name === "string" && typeof entry.modality === "string") &&
    Array.isArray(value.terms) && value.terms.every((entry) => isRecord(entry) &&
      typeof entry.id === "string" && typeof entry.name === "string" && typeof entry.start_date === "string" && typeof entry.end_date === "string") &&
    Array.isArray(value.cohorts) && value.cohorts.every((entry) => isRecord(entry) &&
      typeof entry.id === "string" && typeof entry.name === "string" && typeof entry.program_id === "string" &&
      typeof entry.campus_id === "string" && typeof entry.term_id === "string" && Number.isInteger(entry.capacity) &&
      typeof entry.cadence === "string" && typeof entry.cohort_mode === "string" &&
      (entry.start_date === null || typeof entry.start_date === "string") &&
      (entry.end_date === null || typeof entry.end_date === "string") &&
      typeof entry.room_label === "string" && typeof entry.is_archived === "boolean" && typeof entry.demo === "boolean");
}

function isDefinition(value: unknown): boolean {
  return isRecord(value) && typeof value.id === "string" && typeof value.key === "string" && typeof value.label === "string" &&
    ["text", "number", "date", "boolean"].includes(String(value.data_type)) &&
    isStringArray(value.header_aliases) && typeof value.required === "boolean" &&
    typeof value.sensitive === "boolean" && Number.isInteger(value.sort_order) && typeof value.demo === "boolean";
}

function isDirectoryPreviewRow(value: unknown): boolean {
  return isRecord(value) && Number.isInteger(value.rowNumber) &&
    ["create", "update", "skip", "warning", "error"].includes(String(value.action)) &&
    typeof value.firstName === "string" && typeof value.lastName === "string" && typeof value.studentEmail === "string" &&
    (value.studentId === null || typeof value.studentId === "string") &&
    (value.familyId === null || typeof value.familyId === "string") &&
    (value.cohortId === null || typeof value.cohortId === "string") &&
    isStringArray(value.warnings) && isStringArray(value.errors);
}

function isStudentImportSummary(value: unknown): value is StudentImportSummaryCounts {
  return isRecord(value) && [value.creates, value.updates, value.enrollments, value.skips, value.warnings, value.errors].every(isNonNegativeInteger);
}

function sameExcludedRows(left: StudentWorkbookExcludedRowReference[], right: StudentWorkbookExcludedRowReference[]) {
  return JSON.stringify([...left].sort(compareRows)) === JSON.stringify([...right].sort(compareRows));
}

function compareRows(left: StudentWorkbookExcludedRowReference, right: StudentWorkbookExcludedRowReference) {
  return left.sheetName.localeCompare(right.sheetName) || left.rowNumber - right.rowNumber;
}

function rowKey(reference: StudentWorkbookExcludedRowReference) {
  return `${reference.sheetName}\0${reference.rowNumber}`;
}

function isNonNegativeInteger(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isNullableBoundedScore(value: unknown, min: number, max: number) {
  return value === null || (Number.isInteger(value) && (value as number) >= min && (value as number) <= max);
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]) {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}
