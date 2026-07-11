"use client";

import { useMemo, useState } from "react";
import { buildPlannedCatalogSummary } from "@/components/portal/student-import-catalog-drafts";
import type {
  StudentWorkbookExcludedRowReference,
  StudentWorkbookPreview,
} from "@/lib/student-import-operations";
import type { StudentWorkbookMappingPlan } from "@/lib/student-workbook-schema";

interface StudentImportPreviewTabsProps {
  preview: StudentWorkbookPreview;
  mappingPlan: StudentWorkbookMappingPlan;
  excludedRows: StudentWorkbookExcludedRowReference[];
  disabled: boolean;
  onToggleRow: (row: StudentWorkbookExcludedRowReference, included: boolean) => void;
}

type TabId = "students" | "classes" | "enrollments" | "scores" | "errors";

export function StudentImportPreviewTabs({
  preview,
  mappingPlan,
  excludedRows,
  disabled,
  onToggleRow,
}: StudentImportPreviewTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("students");
  const ignoredMappings = useMemo(() => [
    ...mappingPlan.directory.columns
      .filter((mapping) => mapping.kind === "ignore")
      .map((mapping) => ({ sheetName: mappingPlan.directory.sheetName, header: mapping.sourceHeader })),
    ...(mappingPlan.academic?.columns ?? [])
      .filter((mapping) => mapping.kind === "ignore")
      .map((mapping) => ({ sheetName: mappingPlan.academic!.sheetName, header: mapping.sourceHeader })),
  ], [mappingPlan]);
  const directoryDiagnostics = preview.rows.filter(
    (row) => row.errors.length > 0 || row.warnings.length > 0,
  );
  const academicDiagnostics = preview.academic.rows.filter(
    (row) => row.errors.length > 0 || row.warnings.length > 0,
  );
  const scoreRows = buildScoreRows(preview);
  const plannedCatalog = buildPlannedCatalogSummary(preview.setup, preview.academic);
  const plannedCatalogGroups = [
    { label: "Programs", entries: plannedCatalog.programs },
    { label: "Campuses", entries: plannedCatalog.campuses },
    { label: "Terms", entries: plannedCatalog.terms },
  ];
  const plannedCatalogCount = plannedCatalog.counts.programs +
    plannedCatalog.counts.campuses + plannedCatalog.counts.terms;
  const tabs: Array<{ id: TabId; label: string; count: number }> = [
    { id: "students", label: "Student Information", count: preview.rows.length },
    { id: "classes", label: "Cohorts & Classes", count: plannedCatalogCount + preview.academic.cohorts.length + preview.academic.sessions.length },
    { id: "enrollments", label: "Enrollments", count: preview.academic.enrollments.length },
    { id: "scores", label: "Scores", count: scoreRows.length },
    {
      id: "errors",
      label: "Errors & Unmapped Columns",
      count: directoryDiagnostics.length + academicDiagnostics.length + ignoredMappings.length,
    },
  ];

  const moveTab = (current: TabId, direction: -1 | 1) => {
    const index = tabs.findIndex((tab) => tab.id === current);
    const next = tabs[(index + direction + tabs.length) % tabs.length];
    setActiveTab(next.id);
    document.getElementById(`student-import-tab-${next.id}`)?.focus();
  };

  return (
    <div className="mt-4">
      <div role="tablist" aria-label="Student import preview" className="flex flex-wrap gap-2 border-b border-[color:var(--line)] pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`student-import-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`student-import-panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                moveTab(tab.id, -1);
              }
              if (event.key === "ArrowRight") {
                event.preventDefault();
                moveTab(tab.id, 1);
              }
              if (event.key === "Home") {
                event.preventDefault();
                setActiveTab(tabs[0].id);
                document.getElementById(`student-import-tab-${tabs[0].id}`)?.focus();
              }
              if (event.key === "End") {
                event.preventDefault();
                setActiveTab(tabs.at(-1)!.id);
                document.getElementById(`student-import-tab-${tabs.at(-1)!.id}`)?.focus();
              }
            }}
            className={`rounded-t-lg px-3 py-2 text-sm font-semibold ${
              activeTab === tab.id
                ? "bg-[color:var(--navy)] text-white"
                : "bg-stone-100 text-[color:var(--navy)]"
            }`}
          >
            {tab.label} <span aria-label={`${tab.count} items`}>({tab.count})</span>
          </button>
        ))}
      </div>

      <TabPanel id="students" active={activeTab}>
        <DataTable headers={["Include", "Source", "Status", "Student", "Warnings and errors"]}>
          {preview.rows.map((row) => {
            const reference = { sheetName: mappingPlan.directory.sheetName, rowNumber: row.rowNumber };
            const included = !isExcluded(excludedRows, reference);
            return (
              <tr key={rowKey(reference)} className="border-t border-[color:var(--line)] align-top">
                <td className="px-2 py-3"><IncludeToggle reference={reference} included={included} disabled={disabled} onToggle={onToggleRow} /></td>
                <td className="px-2 py-3"><SourceRow reference={reference} /></td>
                <td className="px-2 py-3 capitalize">{included ? row.action : "excluded"}</td>
                <td className="px-2 py-3">{[row.firstName, row.lastName].filter(Boolean).join(" ") || "Unnamed student"}{row.studentEmail ? <div className="text-xs text-[color:var(--muted)]">{row.studentEmail}</div> : null}</td>
                <td className="px-2 py-3"><Messages errors={row.errors} warnings={row.warnings} /></td>
              </tr>
            );
          })}
        </DataTable>
      </TabPanel>

      <TabPanel id="classes" active={activeTab}>
        <section className="mb-5 rounded-lg border border-sky-200 bg-sky-50 p-3" aria-labelledby="student-import-planned-catalogs">
          <h6 id="student-import-planned-catalogs" className="text-sm font-semibold text-sky-950">
            Planned creations ({plannedCatalogCount})
          </h6>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {plannedCatalogGroups.map((group) => (
              <div key={group.label} className="rounded border border-sky-200 bg-white p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-sky-900">
                  {group.label} ({group.entries.length})
                </div>
                {group.entries.length > 0 ? (
                  <ul className="mt-2 space-y-2 text-sm text-sky-950">
                    {group.entries.map((entry) => (
                      <li key={entry.key}>
                        <span className="font-semibold">{entry.name}</span>
                        <div className="text-xs text-sky-900">
                          Source cohorts: {entry.sourceCohorts.join(", ")}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-2 text-xs text-sky-900">None</p>}
              </div>
            ))}
          </div>
        </section>
        <PlanRecordTable
          title="Cohorts"
          records={preview.academic.cohorts}
          columns={[
            ["Name", "name"], ["Program", "program_id"], ["Campus", "campus_id"],
            ["Term", "term_id"], ["Capacity", "capacity"], ["Room", "room_label"],
          ]}
          empty="No cohort changes are planned."
        />
        <PlanRecordTable
          title="Automatically generated classes"
          records={preview.academic.sessions}
          columns={[["Title", "title"], ["Starts", "start_at"], ["Ends", "end_at"], ["Room", "room_label"]]}
          empty="No class changes are planned."
        />
      </TabPanel>

      <TabPanel id="enrollments" active={activeTab}>
        <PlanRecordTable
          title="Enrollment changes"
          records={preview.academic.enrollments}
          columns={[["Student", "student_id"], ["Cohort", "cohort_id"], ["Status", "status"], ["Registered", "registered_at"]]}
          empty="No enrollment changes are planned."
        />
      </TabPanel>

      <TabPanel id="scores" active={activeTab}>
        <DataTable headers={["Include", "Source row", "Student", "Cohort", "Combined test", "Date", "RW", "Math", "Total", "Action", "Errors / warnings"]}>
          {scoreRows.map((row, index) => {
            const included = !isExcluded(excludedRows, row.reference);
            return (
              <tr key={`${rowKey(row.reference)}:${row.assessmentId}:${index}`} className="border-t border-[color:var(--line)] align-top">
                <td className="px-2 py-3"><IncludeToggle reference={row.reference} included={included} disabled={disabled} onToggle={onToggleRow} /></td>
                <td className="px-2 py-3"><SourceRow reference={row.reference} /></td>
                <td className="px-2 py-3">{row.student}</td>
                <td className="px-2 py-3">{row.cohort}</td>
                <td className="px-2 py-3">{row.assessmentTitle}</td>
                <td className="px-2 py-3">{row.date}</td>
                <td className="px-2 py-3">{row.rw}</td>
                <td className="px-2 py-3">{row.math}</td>
                <td className="px-2 py-3">{row.total}{row.calculated ? <span className="ml-1 text-xs font-semibold text-amber-800">(calculated)</span> : null}</td>
                <td className="px-2 py-3">{included ? row.action : "Excluded"}</td>
                <td className="px-2 py-3"><Messages errors={row.errors} warnings={row.warnings} /></td>
              </tr>
            );
          })}
        </DataTable>
        {scoreRows.length === 0 ? <EmptyState>No score changes are planned yet.</EmptyState> : null}
      </TabPanel>

      <TabPanel id="errors" active={activeTab}>
        {directoryDiagnostics.length === 0 && academicDiagnostics.length === 0 ? (
          <EmptyState>No row errors or warnings.</EmptyState>
        ) : (
          <div className="space-y-2">
            {directoryDiagnostics.map((row) => (
              <DiagnosticRow
                key={`directory:${row.rowNumber}`}
                reference={{ sheetName: mappingPlan.directory.sheetName, rowNumber: row.rowNumber }}
                errors={row.errors}
                warnings={row.warnings}
                excludedRows={excludedRows}
                disabled={disabled}
                onToggle={onToggleRow}
              />
            ))}
            {academicDiagnostics.map((row) => (
              <DiagnosticRow
                key={`academic:${row.rowNumber}`}
                reference={{ sheetName: mappingPlan.academic?.sheetName ?? preview.selectedSheet, rowNumber: row.rowNumber }}
                errors={row.errors}
                warnings={row.warnings}
                excludedRows={excludedRows}
                disabled={disabled}
                onToggle={onToggleRow}
              />
            ))}
          </div>
        )}

        <div className="mt-5">
          <h6 className="text-sm font-semibold text-[color:var(--navy-strong)]">Ignored / unmapped columns ({ignoredMappings.length})</h6>
          {ignoredMappings.length > 0 ? (
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {ignoredMappings.map((mapping) => (
                <li key={`${mapping.sheetName}:${mapping.header}`} className="rounded border border-[color:var(--line)] bg-stone-50 px-3 py-2 text-sm">
                  <span className="font-semibold">{mapping.header}</span> <span className="text-[color:var(--muted)]">({mapping.sheetName})</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState>Every detected column has an import mapping.</EmptyState>}
        </div>

        {preview.sourceAssessmentDateSuggestions.length > 0 ? (
          <div className="mt-5 rounded-lg border border-sky-200 bg-sky-50 p-3">
            <h6 className="text-sm font-semibold text-sky-950">Source date suggestions — reference only</h6>
            <p className="mt-1 text-xs text-sky-900">These workbook dates are not used automatically. The dates entered in Academic setup remain authoritative.</p>
            <ul className="mt-2 space-y-1 text-sm text-sky-950">
              {preview.sourceAssessmentDateSuggestions.map((suggestion) => (
                <li key={`${suggestion.sheetName}:${suggestion.rowNumber}:${suggestion.sourceClass}:${suggestion.assessmentTitle}:${suggestion.date}`}>
                  {suggestion.sheetName} row {suggestion.rowNumber}: {suggestion.sourceClass} · {suggestion.assessmentTitle} · {suggestion.date}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </TabPanel>
    </div>
  );
}

function TabPanel({ id, active, children }: { id: TabId; active: TabId; children: React.ReactNode }) {
  return (
    <div
      id={`student-import-panel-${id}`}
      role="tabpanel"
      aria-labelledby={`student-import-tab-${id}`}
      hidden={active !== id}
      tabIndex={tabPanelTabIndex(active, id)}
      className="pt-4"
    >
      {children}
    </div>
  );
}

function DataTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-[color:var(--muted)]">
          <tr>{headers.map((header) => <th key={header} className="px-2 py-2">{header}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function IncludeToggle({
  reference,
  included,
  disabled,
  onToggle,
}: {
  reference: StudentWorkbookExcludedRowReference;
  included: boolean;
  disabled: boolean;
  onToggle: (reference: StudentWorkbookExcludedRowReference, included: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={included}
      disabled={disabled}
      onChange={(event) => onToggle(reference, event.target.checked)}
      aria-label={`Include ${reference.sheetName} row ${reference.rowNumber}`}
    />
  );
}

function SourceRow({ reference }: { reference: StudentWorkbookExcludedRowReference }) {
  return <><span className="font-semibold">{reference.rowNumber}</span><div className="whitespace-nowrap text-xs text-[color:var(--muted)]">{reference.sheetName}</div></>;
}

function Messages({ errors, warnings }: { errors: string[]; warnings: string[] }) {
  if (errors.length === 0 && warnings.length === 0) return <span className="text-[color:var(--muted)]">None</span>;
  return (
    <>
      {errors.map((message) => <div key={`error:${message}`} className="text-rose-700">Error: {message}</div>)}
      {warnings.map((message) => <div key={`warning:${message}`} className="text-amber-800">Warning: {message}</div>)}
    </>
  );
}

function DiagnosticRow({
  reference,
  errors,
  warnings,
  excludedRows,
  disabled,
  onToggle,
}: {
  reference: StudentWorkbookExcludedRowReference;
  errors: string[];
  warnings: string[];
  excludedRows: StudentWorkbookExcludedRowReference[];
  disabled: boolean;
  onToggle: (reference: StudentWorkbookExcludedRowReference, included: boolean) => void;
}) {
  const included = !isExcluded(excludedRows, reference);
  return (
    <div className="flex items-start gap-3 rounded-lg border border-[color:var(--line)] p-3 text-sm">
      <IncludeToggle reference={reference} included={included} disabled={disabled} onToggle={onToggle} />
      <div><SourceRow reference={reference} /><Messages errors={errors} warnings={warnings} /></div>
    </div>
  );
}

function PlanRecordTable({
  title,
  records,
  columns,
  empty,
}: {
  title: string;
  records: Array<Record<string, unknown>>;
  columns: Array<[string, string]>;
  empty: string;
}) {
  return (
    <div className="mb-5">
      <h6 className="mb-2 text-sm font-semibold text-[color:var(--navy-strong)]">{title} ({records.length})</h6>
      {records.length > 0 ? (
        <DataTable headers={columns.map(([label]) => label)}>
          {records.map((record, index) => (
            <tr key={recordString(record, "id") || String(index)} className="border-t border-[color:var(--line)]">
              {columns.map(([, key]) => <td key={key} className="px-2 py-3">{formatValue(record[key])}</td>)}
            </tr>
          ))}
        </DataTable>
      ) : <EmptyState>{empty}</EmptyState>}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-stone-50 p-3 text-sm text-[color:var(--muted)]">{children}</p>;
}

export function tabPanelTabIndex(active: string, id: string) {
  return active === id ? 0 : -1;
}

export function buildScoreRows(preview: Pick<StudentWorkbookPreview, "academicSourceRows" | "setup">) {
  return preview.academicSourceRows.map((sourceRow, scoreIndex) => {
    const reviewedDate = preview.setup.assessmentDates.find((entry) =>
      normalized(entry.sourceClass) === normalized(sourceRow.cohortName) &&
      normalized(entry.assessmentTitle) === normalized(sourceRow.assessmentTitle),
    );
    const date = reviewedDate?.date || (sourceRow.sourceAssessmentDate
      ? `${sourceRow.sourceAssessmentDate} (source suggestion)`
      : "—");
    return {
      reference: { sheetName: sourceRow.sheetName, rowNumber: sourceRow.rowNumber },
      assessmentId: `${sourceRow.assessmentTitle || "invalid"}:${scoreIndex}`,
      student: sourceRow.studentName || "Unnamed student",
      cohort: sourceRow.cohortName || "Unmapped cohort",
      assessmentTitle: sourceRow.assessmentTitle || "Invalid score row",
      date,
      rw: sourceRow.rw ?? "—",
      math: sourceRow.math ?? "—",
      total: sourceRow.total ?? "—",
      calculated: sourceRow.warnings.some((warning) => warning.includes("Total calculated")),
      action: sourceRow.action,
      errors: [...sourceRow.errors],
      warnings: [...sourceRow.warnings],
    };
  });
}

function isExcluded(
  excludedRows: StudentWorkbookExcludedRowReference[],
  reference: StudentWorkbookExcludedRowReference,
) {
  return excludedRows.some((entry) => rowKey(entry) === rowKey(reference));
}

function rowKey(reference: StudentWorkbookExcludedRowReference) {
  return `${reference.sheetName}\0${reference.rowNumber}`;
}

function recordString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function normalized(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}
