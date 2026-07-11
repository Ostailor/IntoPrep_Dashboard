"use client";

import {
  sourceCohortLegend,
  StudentImportCatalogDraftSelect,
} from "@/components/portal/student-import-catalog-drafts";
import type { StudentWorkbookPreview } from "@/lib/student-import-operations";
import type { StudentWorkbookSetup } from "@/lib/student-workbook-schema";

export interface StudentImportAcademicSetupProps {
  requirements: StudentWorkbookPreview["academic"]["requirements"];
  options: StudentWorkbookPreview["options"];
  value: StudentWorkbookSetup;
  disabled: boolean;
  onChange: (value: StudentWorkbookSetup) => void;
  onRefreshPreview: () => void;
}

export function getAcademicSetupClasses(
  requirements: StudentWorkbookPreview["academic"]["requirements"],
  options: StudentWorkbookPreview["options"],
  value: StudentWorkbookSetup,
) {
  const dateSourceClasses = new Set([
    ...requirements.assessmentDates.map((entry) => normalized(entry.sourceClass)),
    ...value.assessmentDates.map((entry) => normalized(entry.sourceClass)),
  ]);
  return uniqueByNormalized([
    ...requirements.cohorts,
    ...value.cohorts.map((entry) => entry.sourceClass),
    ...options.cohorts
      .filter((cohort) => dateSourceClasses.has(normalized(cohort.name)))
      .map((cohort) => cohort.name),
  ]).filter((sourceClass) => {
    const matches = cohortsForSourceClass(options.cohorts, sourceClass);
    return requirements.cohorts.some((required) => normalized(required) === normalized(sourceClass)) ||
      matches.length > 1 ||
      value.cohorts.some((entry) => normalized(entry.sourceClass) === normalized(sourceClass));
  });
}

export function StudentImportAcademicSetup({
  requirements,
  options,
  value,
  disabled,
  onChange,
  onRefreshPreview,
}: StudentImportAcademicSetupProps) {
  const setupClasses = getAcademicSetupClasses(requirements, options, value);
  const assessmentDates = uniqueAssessmentDates([
    ...requirements.assessmentDates,
    ...value.assessmentDates,
  ]);

  const updateCohort = (
    sourceClass: string,
    patch: Partial<StudentWorkbookSetup["cohorts"][number]>,
  ) => {
    const current = value.cohorts.find(
      (entry) => normalized(entry.sourceClass) === normalized(sourceClass),
    ) ?? { sourceClass };
    const next = { ...current, ...patch, sourceClass };
    onChange({
      ...value,
      cohorts: [
        ...value.cohorts.filter(
          (entry) => normalized(entry.sourceClass) !== normalized(sourceClass),
        ),
        next,
      ],
    });
  };

  const updateDate = (sourceClass: string, assessmentTitle: string, date: string) => {
    const matching = (entry: StudentWorkbookSetup["assessmentDates"][number]) =>
      normalized(entry.sourceClass) === normalized(sourceClass) &&
      normalized(entry.assessmentTitle) === normalized(assessmentTitle);
    const nextDates = value.assessmentDates.filter((entry) => !matching(entry));
    if (date) nextDates.push({ sourceClass, assessmentTitle, date });
    onChange({ ...value, assessmentDates: nextDates });
  };

  if (setupClasses.length === 0 && assessmentDates.length === 0) return null;

  return (
    <section className="mt-4 rounded-lg border border-amber-200 bg-amber-50/50 p-4" aria-labelledby="student-import-academic-setup">
      <h5 id="student-import-academic-setup" className="font-semibold text-[color:var(--navy-strong)]">
        Academic setup required
      </h5>
      <p className="mt-1 text-sm text-[color:var(--muted)]">
        MWF/TTHS and the selected term automatically generate 8:00 AM–3:30 PM Eastern classes. No separate schedule is needed.
      </p>

      {setupClasses.length > 0 ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {setupClasses.map((sourceClass) => {
            const matches = cohortsForSourceClass(options.cohorts, sourceClass);
            const setup = value.cohorts.find(
              (entry) => normalized(entry.sourceClass) === normalized(sourceClass),
            );
            const ambiguous = matches.length > 1;
            return (
              <fieldset key={normalized(sourceClass)} className="rounded-lg border border-[color:var(--line)] bg-white p-3">
                <legend className="px-1 text-sm font-semibold text-[color:var(--navy-strong)]">
                  {sourceCohortLegend(sourceClass)}
                </legend>
                {ambiguous ? (
                  <label className="mt-2 block text-xs font-semibold text-[color:var(--muted)]">
                    Existing cohort
                    <select
                      value={setup?.selectedCohortId ?? ""}
                      onChange={(event) => updateCohort(sourceClass, {
                        selectedCohortId: event.target.value || undefined,
                      })}
                      disabled={disabled}
                      className="mt-1 block w-full rounded border border-[color:var(--line)] bg-white px-2 py-2 text-sm font-normal text-[color:var(--navy-strong)]"
                    >
                      <option value="">Choose the exact existing cohort</option>
                      {matches.map((cohort) => (
                        <option key={cohort.id} value={cohort.id}>
                          {cohort.name} · {labelFor(options.terms, cohort.term_id)} · {labelFor(options.campuses, cohort.campus_id)} · capacity {cohort.capacity}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <StudentImportCatalogDraftSelect
                      kind="programs"
                      label="Program"
                      sourceClass={sourceClass}
                      existing={options.programs}
                      setup={value}
                      disabled={disabled}
                      onChange={onChange}
                    />
                    <StudentImportCatalogDraftSelect
                      kind="campuses"
                      label="Campus"
                      sourceClass={sourceClass}
                      existing={options.campuses}
                      setup={value}
                      disabled={disabled}
                      onChange={onChange}
                    />
                    <StudentImportCatalogDraftSelect
                      kind="terms"
                      label="Term"
                      sourceClass={sourceClass}
                      existing={options.terms}
                      setup={value}
                      disabled={disabled}
                      onChange={onChange}
                    />
                    <label className="text-xs font-semibold text-[color:var(--muted)]">
                      Capacity
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={setup?.capacity ?? ""}
                        onChange={(event) => {
                          const capacity = event.target.value === "" ? undefined : Number(event.target.value);
                          updateCohort(sourceClass, { capacity });
                        }}
                        disabled={disabled}
                        required
                        className="mt-1 block w-full rounded border border-[color:var(--line)] bg-white px-2 py-2 text-sm font-normal text-[color:var(--navy-strong)]"
                      />
                    </label>
                  </div>
                )}
              </fieldset>
            );
          })}
        </div>
      ) : null}

      {assessmentDates.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <caption className="pb-2 text-left font-semibold text-[color:var(--navy-strong)]">
              Assessment dates
            </caption>
            <thead className="text-xs uppercase tracking-wide text-[color:var(--muted)]">
              <tr><th className="px-2 py-2">Source cohort (Excel Class)</th><th className="px-2 py-2">Combined test</th><th className="px-2 py-2">Import date</th></tr>
            </thead>
            <tbody>
              {assessmentDates.map((entry) => {
                const date = value.assessmentDates.find((candidate) =>
                  normalized(candidate.sourceClass) === normalized(entry.sourceClass) &&
                  normalized(candidate.assessmentTitle) === normalized(entry.assessmentTitle),
                )?.date ?? "";
                return (
                  <tr key={`${normalized(entry.sourceClass)}:${normalized(entry.assessmentTitle)}`} className="border-t border-[color:var(--line)]">
                    <td className="px-2 py-2 font-semibold">{entry.sourceClass}</td>
                    <td className="px-2 py-2">{entry.assessmentTitle}</td>
                    <td className="px-2 py-2">
                      <label className="sr-only" htmlFor={`assessment-date-${stableId(entry.sourceClass)}-${stableId(entry.assessmentTitle)}`}>
                        Import date for {entry.sourceClass} {entry.assessmentTitle}
                      </label>
                      <input
                        id={`assessment-date-${stableId(entry.sourceClass)}-${stableId(entry.assessmentTitle)}`}
                        type="date"
                        value={date}
                        onChange={(event) => updateDate(entry.sourceClass, entry.assessmentTitle, event.target.value)}
                        disabled={disabled}
                        required
                        className="rounded border border-[color:var(--line)] bg-white px-2 py-1.5"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onRefreshPreview}
        disabled={disabled}
        className="mt-4 rounded-full border border-[color:var(--navy)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--navy)] disabled:opacity-50"
      >
        Update preview
      </button>
    </section>
  );
}

function cohortsForSourceClass(
  cohorts: StudentWorkbookPreview["options"]["cohorts"],
  sourceClass: string,
) {
  return cohorts.filter((cohort) => normalized(cohort.name) === normalized(sourceClass));
}

function labelFor(options: Array<{ id: string; name: string }>, id: string) {
  return options.find((option) => option.id === id)?.name ?? "Unknown";
}

function uniqueByNormalized(values: string[]) {
  const unique = new Map<string, string>();
  values.filter(Boolean).forEach((value) => {
    const key = normalized(value);
    if (!unique.has(key)) unique.set(key, value.trim());
  });
  return [...unique.values()];
}

function uniqueAssessmentDates(
  values: Array<{ sourceClass: string; assessmentTitle: string }>,
) {
  return [...new Map(values.map((entry) => [
    `${normalized(entry.sourceClass)}\0${normalized(entry.assessmentTitle)}`,
    { sourceClass: entry.sourceClass.trim(), assessmentTitle: entry.assessmentTitle.trim() },
  ])).values()];
}

function normalized(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function stableId(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "value";
}
