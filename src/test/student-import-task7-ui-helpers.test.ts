import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as draftModule from "@/components/portal/student-import-catalog-drafts";
import * as setupModule from "@/components/portal/student-import-academic-setup";
import * as tabsModule from "@/components/portal/student-import-preview-tabs";
import type { StudentWorkbookSetup } from "@/lib/student-workbook-schema";

const setupHelpers = setupModule as unknown as Record<string, unknown>;
const draftHelpers = draftModule as unknown as Record<string, unknown>;
const tabHelpers = tabsModule as unknown as Record<string, unknown>;

describe("Task 7 UI state helpers", () => {
  it("adds, reuses, edits, and removes one shared review-level draft", () => {
    const saveDraft = draftHelpers.saveCatalogDraft as CatalogDraftHelpers["saveDraft"];
    const selectDraft = draftHelpers.applyCatalogSelection as CatalogDraftHelpers["selectDraft"];
    const removeDraft = draftHelpers.removeCatalogDraft as CatalogDraftHelpers["removeDraft"];
    expect(saveDraft).toBeTypeOf("function");
    expect(selectDraft).toBeTypeOf("function");
    expect(removeDraft).toBeTypeOf("function");

    const initial = setupWithClasses("MWF", "TTHS");
    const added = saveDraft(initial, "MWF", "programs", {
      name: "Summer SAT",
      track: "SAT",
      format: "Small group",
    });
    const key = added.catalog.programs[0].key;
    expect(added.cohorts.find((entry) => entry.sourceClass === "MWF")?.programDraftKey).toBe(key);

    const reused = selectDraft(added, "TTHS", "programs", `planned:${key}`);
    expect(reused.cohorts.map((entry) => entry.programDraftKey)).toEqual([key, key]);

    const edited = saveDraft(reused, "MWF", "programs", {
      name: "Summer SAT Intensive",
      track: "SAT",
      format: "Small group",
    }, key);
    expect(edited.catalog.programs).toEqual([{
      key,
      name: "Summer SAT Intensive",
      track: "SAT",
      format: "Small group",
    }]);
    expect(edited.cohorts.map((entry) => entry.programDraftKey)).toEqual([key, key]);

    const removed = removeDraft(edited, "programs", key);
    expect(removed.catalog.programs).toEqual([]);
    expect(removed.cohorts.map((entry) => entry.programDraftKey)).toEqual([undefined, undefined]);
  });

  it("switches from catalog creation to one existing cohort without stale mode fields", () => {
    const saveDraft = draftHelpers.saveCatalogDraft as CatalogDraftHelpers["saveDraft"];
    const setCapacity = draftHelpers.applyCohortCapacity as CatalogDraftHelpers["setCapacity"];
    const selectExistingCohort = draftHelpers.selectExistingCohort as CatalogDraftHelpers["selectExistingCohort"];
    const summarize = draftHelpers.buildPlannedCatalogSummary as CatalogDraftHelpers["summarize"];
    expect(setCapacity).toBeTypeOf("function");
    expect(selectExistingCohort).toBeTypeOf("function");

    let reviewed = saveDraft(setupWithClasses("MWF"), "MWF", "programs", {
      name: "Summer SAT",
      track: "SAT",
      format: "Small group",
    });
    reviewed = saveDraft(reviewed, "MWF", "campuses", {
      name: "Westfield",
      location: "Westfield, NJ",
      modality: "In person",
    });
    reviewed = saveDraft(reviewed, "MWF", "terms", {
      name: "Summer 2026",
      startDate: "2026-07-06",
      endDate: "2026-08-14",
    });
    reviewed = setCapacity(reviewed, "MWF", 24);

    const mixedLegacyState = {
      ...reviewed,
      cohorts: [{ ...reviewed.cohorts[0], selectedCohortId: "cohort-mwf-existing" }],
    };
    expect(summarize(mixedLegacyState)).toEqual({
      programs: [],
      campuses: [],
      terms: [],
      counts: { programs: 0, campuses: 0, terms: 0 },
    });

    const existingMode = selectExistingCohort(reviewed, "MWF", "cohort-mwf-existing");
    expect(existingMode.cohorts).toEqual([{
      sourceClass: "MWF",
      selectedCohortId: "cohort-mwf-existing",
    }]);
    expect(summarize(existingMode)).toEqual({
      programs: [],
      campuses: [],
      terms: [],
      counts: { programs: 0, campuses: 0, terms: 0 },
    });
  });

  it("switches from an existing cohort to metadata or capacity creation mode", () => {
    const saveDraft = draftHelpers.saveCatalogDraft as CatalogDraftHelpers["saveDraft"];
    const selectDraft = draftHelpers.applyCatalogSelection as CatalogDraftHelpers["selectDraft"];
    const setCapacity = draftHelpers.applyCohortCapacity as CatalogDraftHelpers["setCapacity"];
    const selectExistingCohort = draftHelpers.selectExistingCohort as CatalogDraftHelpers["selectExistingCohort"];

    const withDraft = saveDraft(setupWithClasses("MWF"), "MWF", "programs", {
      name: "Summer SAT",
      track: "SAT",
      format: "Small group",
    });
    const key = withDraft.catalog.programs[0].key;
    const existingMode = selectExistingCohort(withDraft, "MWF", "cohort-mwf-existing");

    const selectedPlanned = selectDraft(existingMode, "MWF", "programs", `planned:${key}`);
    expect(selectedPlanned.cohorts[0]).toEqual({ sourceClass: "MWF", programDraftKey: key });

    const selectedAgain = selectExistingCohort(selectedPlanned, "MWF", "cohort-mwf-existing");
    const editedDraft = saveDraft(selectedAgain, "MWF", "programs", {
      name: "Summer SAT Intensive",
      track: "SAT",
      format: "Small group",
    }, key);
    expect(editedDraft.cohorts[0]).toEqual({ sourceClass: "MWF", programDraftKey: key });

    const selectedForCapacity = selectExistingCohort(editedDraft, "MWF", "cohort-mwf-existing");
    const capacityMode = setCapacity(selectedForCapacity, "MWF", 28);
    expect(capacityMode.cohorts[0]).toEqual({ sourceClass: "MWF", capacity: 28 });
  });

  it("generates stable unique draft keys when names share a slug", () => {
    const saveDraft = draftHelpers.saveCatalogDraft as CatalogDraftHelpers["saveDraft"];
    expect(saveDraft).toBeTypeOf("function");
    const first = saveDraft(setupWithClasses("MWF", "TTHS"), "MWF", "programs", {
      name: "Summer SAT!",
      track: "SAT",
      format: "Small group",
    });
    const second = saveDraft(first, "TTHS", "programs", {
      name: "Summer SAT?",
      track: "SAT",
      format: "Small group",
    });
    expect(second.catalog.programs.map((draft) => draft.key)).toEqual([
      "program-summer-sat",
      "program-summer-sat-2",
    ]);
  });

  it("labels existing, planned, and create-new selector options", () => {
    const optionsFor = draftHelpers.catalogSelectorOptions as CatalogDraftHelpers["optionsFor"];
    expect(optionsFor).toBeTypeOf("function");
    expect(optionsFor(
      [{ id: "program-existing", name: "Year Round SAT" }],
      [{ key: "program-summer", name: "Summer SAT" }],
    )).toEqual([
      { value: "existing:program-existing", label: "Existing: Year Round SAT" },
      { value: "planned:program-summer", label: "Planned: Summer SAT" },
      { value: "create", label: "Create new…" },
    ]);
  });

  it("converts draft state back to bounded strict setup JSON", () => {
    const strictSetup = draftHelpers.toStrictStudentWorkbookSetup as CatalogDraftHelpers["strictSetup"];
    expect(strictSetup).toBeTypeOf("function");
    const result = strictSetup({
      catalog: {
        programs: [{ key: " program-summer ", name: " Summer SAT ", track: "SAT", format: " Small group " }],
        campuses: [{ key: "campus-westfield", name: "Westfield", location: " Westfield, NJ ", modality: "In person" }],
        terms: [{ key: "term-summer", name: "Summer 2026", startDate: "2026-07-06", endDate: "2026-08-14" }],
      },
      cohorts: [{
        sourceClass: " TTHS ",
        programDraftKey: " program-summer ",
        campusDraftKey: "campus-westfield",
        termDraftKey: "term-summer",
        capacity: 24,
      }],
      assessmentDates: [],
    });
    expect(result).toEqual({
      catalog: {
        programs: [{ key: "program-summer", name: "Summer SAT", track: "SAT", format: "Small group" }],
        campuses: [{ key: "campus-westfield", name: "Westfield", location: "Westfield, NJ", modality: "In person" }],
        terms: [{ key: "term-summer", name: "Summer 2026", startDate: "2026-07-06", endDate: "2026-08-14" }],
      },
      cohorts: [{
        sourceClass: "TTHS",
        programDraftKey: "program-summer",
        campusDraftKey: "campus-westfield",
        termDraftKey: "term-summer",
        capacity: 24,
      }],
      assessmentDates: [],
    });
  });

  it("uses workbook terminology for the source cohort legend", () => {
    const legend = draftHelpers.sourceCohortLegend as (sourceClass: string) => string;
    expect(legend).toBeTypeOf("function");
    expect(legend(" TTHS ")).toBe("Source cohort (Excel Class): TTHS");

    const markup = renderToStaticMarkup(createElement(setupModule.StudentImportAcademicSetup, {
      requirements: { cohorts: ["TTHS"], assessmentDates: [] },
      options: {
        programs: [{ id: "program-existing", name: "Year Round SAT", track: "SAT", format: "Small group", is_archived: false, demo: true }],
        campuses: [{ id: "campus-existing", name: "Westfield", location: "Westfield, NJ", modality: "In person", demo: true }],
        terms: [{ id: "term-existing", name: "Summer 2026", start_date: "2026-07-06", end_date: "2026-08-14", demo: true }],
        cohorts: [],
      },
      value: {
        catalog: {
          programs: [{ key: "program-planned", name: "Summer SAT", track: "SAT", format: "Small group" }],
          campuses: [],
          terms: [],
        },
        cohorts: [{
          sourceClass: "TTHS",
          programDraftKey: "program-planned",
          campusId: "campus-existing",
          termId: "term-existing",
          capacity: 24,
        }],
        assessmentDates: [],
      },
      disabled: false,
      onChange: () => undefined,
      onRefreshPreview: () => undefined,
    }));
    expect(markup).toContain("Source cohort (Excel Class): TTHS");
    expect(markup).toContain("Existing: Year Round SAT");
    expect(markup).toContain("Planned: Summer SAT");
    expect(markup).toContain("Create new…");
  });

  it("summarizes planned creations with every referencing source cohort", () => {
    const summarize = draftHelpers.buildPlannedCatalogSummary as CatalogDraftHelpers["summarize"];
    expect(summarize).toBeTypeOf("function");
    const setup = {
      catalog: {
        programs: [{ key: "program-summer", name: "Summer SAT", track: "SAT" as const, format: "Small group" }],
        campuses: [{ key: "campus-westfield", name: "Westfield", location: "Westfield, NJ", modality: "In person" as const }],
        terms: [{ key: "term-summer", name: "Summer 2026", startDate: "2026-07-06", endDate: "2026-08-14" }],
      },
      cohorts: [
        { sourceClass: "MWF", programDraftKey: "program-summer", campusDraftKey: "campus-westfield", termDraftKey: "term-summer" },
        { sourceClass: "TTHS", programDraftKey: "program-summer", campusDraftKey: "campus-westfield", termDraftKey: "term-summer" },
      ],
      assessmentDates: [],
    } satisfies StudentWorkbookSetup;
    expect(summarize(setup)).toEqual({
      programs: [{ key: "program-summer", name: "Summer SAT", sourceCohorts: ["MWF", "TTHS"] }],
      campuses: [{ key: "campus-westfield", name: "Westfield", sourceCohorts: ["MWF", "TTHS"] }],
      terms: [{ key: "term-summer", name: "Summer 2026", sourceCohorts: ["MWF", "TTHS"] }],
      counts: { programs: 1, campuses: 1, terms: 1 },
    });
  });

  it("blocks commit when the server still reports catalog or academic requirements", () => {
    const hasBlockers = draftHelpers.hasStudentImportServerBlockers as (preview: {
      blocking: boolean;
      academic: {
        requirements: { cohorts: string[]; assessmentDates: unknown[] };
        rows: Array<{ errors: string[] }>;
      };
    }) => boolean;
    expect(hasBlockers).toBeTypeOf("function");
    expect(hasBlockers({
      blocking: false,
      academic: { requirements: { cohorts: ["MWF"], assessmentDates: [] }, rows: [] },
    })).toBe(true);
    expect(hasBlockers({
      blocking: false,
      academic: { requirements: { cohorts: [], assessmentDates: [] }, rows: [{ errors: ["Draft conflict."] }] },
    })).toBe(true);
    expect(hasBlockers({
      blocking: false,
      academic: { requirements: { cohorts: [], assessmentDates: [] }, rows: [] },
    })).toBe(false);
  });

  it("discovers every required setup Class once, including ambiguous cohorts", () => {
    const discover = setupHelpers.getAcademicSetupClasses as (
      requirements: { cohorts: string[]; assessmentDates: Array<{ sourceClass: string; assessmentTitle: string }> },
      options: { cohorts: Array<{ id: string; name: string }> },
      value: { cohorts: Array<{ sourceClass: string }>; assessmentDates: [] },
    ) => string[];
    expect(discover).toBeTypeOf("function");

    expect(discover(
      { cohorts: ["MWF", " mwf "], assessmentDates: [] },
      { cohorts: [{ id: "one", name: "MWF" }, { id: "two", name: "MWF" }] },
      { cohorts: [], assessmentDates: [] },
    )).toEqual(["MWF"]);
  });

  it("keeps the Include checkbox name invariant across checked state", () => {
    const reference = { sheetName: "Camp Scores", rowNumber: 5 };
    const mappingPlan: PreviewTabsProps["mappingPlan"] = {
      profile: "normalized",
      directory: { sheetName: "Student Information", columns: [] },
      academic: { sheetName: "Camp Scores", columns: [] },
    };
    const preview: PreviewTabsProps["preview"] = {
      profile: "normalized",
      targetDemo: true,
      digest: "test-digest",
      sheetNames: ["Student Information", "Camp Scores"],
      selectedSheet: "Student Information",
      headers: [],
      mappings: [],
      mappingPlan,
      setup: { cohorts: [], assessmentDates: [] },
      rows: [],
      summary: { creates: 0, updates: 0, enrollments: 0, skips: 0, warnings: 0, errors: 0 },
      definitions: [],
      academic: {
        rows: [],
        requirements: { cohorts: [], assessmentDates: [] },
        programs: [],
        campuses: [],
        terms: [],
        cohorts: [],
        sessions: [],
        enrollments: [],
        assessments: [],
        results: [],
        summary: {
          programs: 0,
          campuses: 0,
          terms: 0,
          cohorts: 0,
          sessions: 0,
          enrollments: 0,
          assessments: 0,
          resultCreates: 0,
          resultUpdates: 0,
          errors: 0,
        },
      },
      academicSourceRows: [{
        ...reference,
        studentName: "Maya Demo",
        cohortName: "MWF",
        sessionTitle: "G4",
        roomLabel: "201",
        assessmentTitle: "HW1 – PSAT",
        sourceAssessmentDate: "",
        rw: 720,
        math: 760,
        total: 1480,
        action: "Create assessment result.",
        warnings: [],
        errors: [],
      }],
      sourceAssessmentDateSuggestions: [],
      options: { programs: [], campuses: [], terms: [], cohorts: [] },
      blocking: false,
    };
    const render = (excludedRows: PreviewTabsProps["excludedRows"]) => renderToStaticMarkup(createElement(
      tabsModule.StudentImportPreviewTabs,
      { preview, mappingPlan, excludedRows, disabled: false, onToggleRow: () => undefined },
    ));

    const checkedMarkup = render([]);
    const uncheckedMarkup = render([reference]);

    expect(checkedMarkup).toContain('aria-label="Include Camp Scores row 5"');
    expect(uncheckedMarkup).toContain('aria-label="Include Camp Scores row 5"');
    expect(checkedMarkup).not.toContain('aria-label="Exclude Camp Scores row 5"');
    expect(uncheckedMarkup).not.toContain('aria-label="Exclude Camp Scores row 5"');
  });

  it("keeps mixed score actions attached to their own source score groups", () => {
    const build = tabHelpers.buildScoreRows as (preview: Record<string, unknown>) => Array<Record<string, unknown>>;
    expect(build).toBeTypeOf("function");
    const common = {
      sheetName: "Camp Scores",
      rowNumber: 5,
      studentName: "Maya Demo",
      cohortName: "MWF",
      sessionTitle: "G4",
      roomLabel: "201",
      sourceAssessmentDate: "",
      warnings: [],
      errors: [],
    };
    const rows = build({
      academicSourceRows: [
        { ...common, assessmentTitle: "HW1 – PSAT", rw: 720, math: 760, total: 1480, action: "Update assessment result." },
        { ...common, assessmentTitle: "HW2 – SAT", rw: 730, math: 770, total: 1500, action: "Create assessment result." },
        { ...common, assessmentTitle: "HW3 – SAT", rw: null, math: 770, total: null, action: "Blocked", errors: ["RW must be a number."] },
      ],
      setup: { assessmentDates: [] },
    });

    expect(rows.map((row) => ({
      test: row.assessmentTitle,
      action: row.action,
      rw: row.rw,
      total: row.total,
      errors: row.errors,
    }))).toEqual([
      { test: "HW1 – PSAT", action: "Update assessment result.", rw: 720, total: 1480, errors: [] },
      { test: "HW2 – SAT", action: "Create assessment result.", rw: 730, total: 1500, errors: [] },
      { test: "HW3 – SAT", action: "Blocked", rw: "—", total: "—", errors: ["RW must be a number."] },
    ]);
  });
});

interface CatalogDraftHelpers {
  saveDraft: (
    setup: StudentWorkbookSetup,
    sourceClass: string,
    kind: "programs" | "campuses" | "terms",
    draft:
      | { name: string; track: "SAT"; format: string }
      | { name: string; location: string; modality: "In person" }
      | { name: string; startDate: string; endDate: string },
    editingKey?: string,
  ) => StrictSetup;
  selectDraft: (
    setup: StrictSetup,
    sourceClass: string,
    kind: "programs",
    selection: string,
  ) => StrictSetup;
  removeDraft: (
    setup: StrictSetup,
    kind: "programs",
    key: string,
  ) => StrictSetup;
  setCapacity: (
    setup: StrictSetup,
    sourceClass: string,
    capacity: number | undefined,
  ) => StrictSetup;
  selectExistingCohort: (
    setup: StrictSetup,
    sourceClass: string,
    cohortId: string | undefined,
  ) => StrictSetup;
  optionsFor: (
    existing: Array<{ id: string; name: string }>,
    drafts: Array<{ key: string; name: string }>,
  ) => Array<{ value: string; label: string }>;
  strictSetup: (setup: unknown) => StudentWorkbookSetup & { catalog: NonNullable<StudentWorkbookSetup["catalog"]> };
  summarize: (setup: StudentWorkbookSetup) => {
    programs: Array<{ key: string; name: string; sourceCohorts: string[] }>;
    campuses: Array<{ key: string; name: string; sourceCohorts: string[] }>;
    terms: Array<{ key: string; name: string; sourceCohorts: string[] }>;
    counts: { programs: number; campuses: number; terms: number };
  };
}

type StrictSetup = StudentWorkbookSetup & {
  catalog: NonNullable<StudentWorkbookSetup["catalog"]>;
};

type PreviewTabsProps = Parameters<typeof tabsModule.StudentImportPreviewTabs>[0];

function setupWithClasses(...sourceClasses: string[]): StrictSetup {
  return {
    catalog: { programs: [], campuses: [], terms: [] },
    cohorts: sourceClasses.map((sourceClass): StudentWorkbookSetup["cohorts"][number] => ({ sourceClass })),
    assessmentDates: [],
  };
}
