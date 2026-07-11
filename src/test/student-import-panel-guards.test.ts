import { describe, expect, it } from "vitest";
import {
  isStudentImportCommitResponse,
  isStudentImportPreviewResponse,
} from "@/components/portal/student-import-panel";

describe("student import panel response guards", () => {
  it("requires bounded academic source rows with structured score groups", () => {
    const preview = validPreview();

    expect(isStudentImportPreviewResponse(preview)).toBe(true);
    expect(isStudentImportPreviewResponse({ ...preview, academicSourceRows: undefined })).toBe(false);
    expect(isStudentImportPreviewResponse({
      ...preview,
      academicSourceRows: [{ ...preview.academicSourceRows[0], scores: [{ rw: 720 }] }],
    })).toBe(false);
    expect(isStudentImportPreviewResponse({
      ...preview,
      academicSourceRows: Array.from({ length: 2_001 }, () => preview.academicSourceRows[0]),
    })).toBe(false);
  });

  it("requires all eight non-negative commit counts", () => {
    const response = {
      runId: "run-1",
      created: 1,
      updated: 2,
      enrolled: 3,
      skipped: 4,
      cohorts: 5,
      sessions: 6,
      assessments: 7,
      results: 8,
    };
    expect(isStudentImportCommitResponse(response)).toBe(true);
    expect(isStudentImportCommitResponse({ ...response, results: undefined })).toBe(false);
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
      rows: [{ rowNumber: 2, studentId: null, cohortId: null, actions: [], warnings: [], errors: [] }],
      requirements: { cohorts: [], assessmentDates: [] },
      cohorts: [],
      sessions: [],
      enrollments: [],
      assessments: [],
      results: [],
      summary: { cohorts: 0, sessions: 0, enrollments: 0, assessments: 0, resultCreates: 0, resultUpdates: 0, errors: 0 },
    },
    academicSourceRows: [{
      sheetName: "Scores",
      rowNumber: 2,
      studentName: "Ada Lovelace",
      cohortName: "MWF",
      sessionTitle: "G4",
      roomLabel: "201",
      scores: [{ assessmentTitle: "PSAT", assessmentDate: "", rw: 720, math: 760, total: 1480, warnings: [] }],
      errors: [],
    }],
    sourceAssessmentDateSuggestions: [],
    options: { programs: [], campuses: [], terms: [], cohorts: [] },
    blocking: false,
  };
}
