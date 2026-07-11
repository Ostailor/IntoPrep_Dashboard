import { describe, expect, it } from "vitest";
import * as setupModule from "@/components/portal/student-import-academic-setup";
import * as tabsModule from "@/components/portal/student-import-preview-tabs";

const setupHelpers = setupModule as unknown as Record<string, unknown>;
const tabHelpers = tabsModule as unknown as Record<string, unknown>;

describe("Task 7 UI state helpers", () => {
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
