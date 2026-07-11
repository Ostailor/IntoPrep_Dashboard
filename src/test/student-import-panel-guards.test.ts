import { describe, expect, it } from "vitest";
import {
  isStudentImportCommitResponse,
  isStudentImportPreviewResponse,
} from "@/components/portal/student-import-panel";
import * as panelModule from "@/components/portal/student-import-panel";
import * as tabsModule from "@/components/portal/student-import-preview-tabs";

const panelHelpers = panelModule as unknown as Record<string, unknown>;
const tabHelpers = tabsModule as unknown as Record<string, unknown>;

describe("student import panel response guards", () => {
  it("requires bounded academic source rows with structured score groups", () => {
    const preview = validPreview();

    expect(isStudentImportPreviewResponse(preview)).toBe(true);
    expect(isStudentImportPreviewResponse({ ...preview, academicSourceRows: undefined })).toBe(false);
    expect(isStudentImportPreviewResponse({
      ...preview,
      academicSourceRows: [{ ...preview.academicSourceRows[0], rw: "720" }],
    })).toBe(false);
    expect(isStudentImportPreviewResponse({
      ...preview,
      academicSourceRows: Array.from({ length: 2_001 }, () => preview.academicSourceRows[0]),
    })).toBe(false);
    expect(isStudentImportPreviewResponse({
      ...preview,
      academic: { ...preview.academic, programs: undefined },
    })).toBe(false);
  });

  it("requires exact planned Program, Campus, and Term response rows", () => {
    const preview = validPreview();
    const academic = {
      ...preview.academic,
      programs: [{ id: "program-new", name: "Summer SAT", track: "SAT", format: "Small group", demo: true }],
      campuses: [{ id: "campus-new", name: "Westfield", location: "Westfield, NJ", modality: "In person", demo: true }],
      terms: [{ id: "term-new", name: "Summer 2026", start_date: "2026-07-06", end_date: "2026-08-14", demo: true }],
      summary: { ...preview.academic.summary, programs: 1, campuses: 1, terms: 1 },
    };
    expect(isStudentImportPreviewResponse({ ...preview, academic })).toBe(true);
    expect(isStudentImportPreviewResponse({
      ...preview,
      academic: { ...academic, programs: [{ ...academic.programs[0], track: "GRE" }] },
    })).toBe(false);
    expect(isStudentImportPreviewResponse({
      ...preview,
      academic: { ...academic, campuses: [{ ...academic.campuses[0], modality: "Virtual" }] },
    })).toBe(false);
    expect(isStudentImportPreviewResponse({
      ...preview,
      academic: { ...academic, terms: [{ ...academic.terms[0], end_date: "not-a-date" }] },
    })).toBe(false);
    expect(isStudentImportPreviewResponse({
      ...preview,
      academic: { ...academic, terms: [{ ...academic.terms[0], demo: "true" }] },
    })).toBe(false);
  });

  it("rejects preview responses from an obsolete request or file", () => {
    const isCurrent = panelHelpers.isCurrentPreviewRequest as (
      requestId: number,
      currentRequestId: number,
      requestedFile: object,
      currentFile: object | null,
    ) => boolean;
    expect(isCurrent).toBeTypeOf("function");
    const originalFile = {};
    const replacementFile = {};

    expect(isCurrent(2, 2, originalFile, originalFile)).toBe(true);
    expect(isCurrent(1, 2, originalFile, originalFile)).toBe(false);
    expect(isCurrent(2, 2, originalFile, replacementFile)).toBe(false);
  });

  it("excludes hidden tab content from modal focus containment", () => {
    const visible = panelHelpers.isVisibleDialogControl as (control: {
      hidden: boolean;
      closest: (selector: string) => object | null;
    }) => boolean;
    const tabIndex = tabHelpers.tabPanelTabIndex as (active: string, id: string) => number;
    expect(visible).toBeTypeOf("function");
    expect(tabIndex).toBeTypeOf("function");

    expect(visible({ hidden: false, closest: () => null })).toBe(true);
    expect(visible({ hidden: false, closest: () => ({ hidden: true }) })).toBe(false);
    expect(tabIndex("students", "scores")).toBe(-1);
    expect(tabIndex("scores", "scores")).toBe(0);
  });

  it("requires all directory, catalog, and academic commit counts", () => {
    const response = {
      runId: "run-1",
      created: 1,
      updated: 2,
      enrolled: 3,
      skipped: 4,
      programsCreated: 1,
      campusesCreated: 1,
      termsCreated: 1,
      cohorts: 5,
      sessions: 6,
      assessments: 7,
      results: 8,
    };
    expect(isStudentImportCommitResponse(response)).toBe(true);
    expect(isStudentImportCommitResponse({ ...response, results: undefined })).toBe(false);
    expect(isStudentImportCommitResponse({ ...response, programsCreated: undefined })).toBe(false);
  });
});

function validPreview() {
  const mapping = { sourceHeader: "Student Name", kind: "known", field: "fullName" };
  return {
    profile: "normalized",
    targetDemo: true,
    digest: "a".repeat(64),
    sheetNames: ["CSV", "Scores"],
    selectedSheet: "CSV",
    headers: ["Student Name"],
    mappings: [mapping],
    mappingPlan: {
      profile: "normalized",
      directory: { sheetName: "CSV", columns: [mapping] },
      academic: {
        sheetName: "Scores",
        columns: [{ sourceHeader: "RW", columnIndex: 0, kind: "score", assessmentTitle: "", component: "rw" }],
      },
    },
    setup: { cohorts: [], assessmentDates: [] },
    rows: [{
      rowNumber: 2,
      action: "create",
      firstName: "Ada",
      lastName: "Lovelace",
      studentEmail: "ada@example.com",
      studentId: null,
      familyId: null,
      cohortId: null,
      warnings: [],
      errors: [],
    }],
    summary: { creates: 1, updates: 0, enrollments: 0, skips: 0, warnings: 0, errors: 0 },
    definitions: [],
    academic: {
      rows: [{ rowNumber: 2, studentId: null, cohortId: null, actions: [], scoreActions: [], warnings: [], errors: [] }],
      requirements: { cohorts: [], assessmentDates: [] },
      programs: [],
      campuses: [],
      terms: [],
      cohorts: [],
      sessions: [],
      enrollments: [],
      assessments: [],
      results: [],
      summary: { programs: 0, campuses: 0, terms: 0, cohorts: 0, sessions: 0, enrollments: 0, assessments: 0, resultCreates: 0, resultUpdates: 0, errors: 0 },
    },
    academicSourceRows: [{
      sheetName: "Scores",
      rowNumber: 2,
      studentName: "Ada Lovelace",
      cohortName: "MWF",
      sessionTitle: "G4",
      roomLabel: "201",
      assessmentTitle: "PSAT",
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
}
