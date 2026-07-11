import { describe, expect, it } from "vitest";
import type { NumberedSpreadsheetRow } from "@/lib/student-spreadsheet";
import type { DetectedStudentWorkbook, WorkbookColumn } from "@/lib/student-workbook-profile";
import {
  inferStudentWorkbookMappings,
  normalizeAcademicRows,
  normalizeScoreGroup,
  parseStudentWorkbookMappings,
  parseStudentWorkbookSetup,
} from "@/lib/student-workbook-schema";

function column(index: number, ...path: string[]): WorkbookColumn {
  return { index, path, sourceHeader: path.join(" / ") };
}

function wideWorkbook(columns: WorkbookColumn[]): DetectedStudentWorkbook {
  const table = {
    sheetName: "Camp Scores",
    headerRowNumbers: [2, 3, 4],
    dataStartRow: 5,
    columns,
  };
  return {
    profile: "wide",
    directory: table,
    academic: table,
    sheetNames: ["Camp Scores"],
  };
}

function normalizedWorkbook(): DetectedStudentWorkbook {
  return {
    profile: "normalized",
    directory: {
      sheetName: "Student Information",
      headerRowNumbers: [1],
      dataStartRow: 2,
      columns: [column(0, "Student Name"), column(1, "School")],
    },
    academic: {
      sheetName: "Scores",
      headerRowNumbers: [1],
      dataStartRow: 2,
      columns: [
        column(0, "Student Name"),
        column(1, "Cohort"),
        column(2, "Class"),
        column(3, "Room"),
        column(4, "Test Name"),
        column(5, "Test Date"),
        column(6, "RW"),
        column(7, "Math"),
        column(8, "Total"),
        column(9, "Percentile"),
      ],
    },
    sheetNames: ["Student Information", "Scores"],
  };
}

const detectedWideWorkbook = wideWorkbook([
  column(0, "Name"),
  column(1, "Class"),
  column(2, "Level"),
  column(3, "Room"),
  column(4, "HW1", "PSAT", "RW"),
  column(5, "HW1", "PSAT", "Math"),
  column(6, "HW1", "PSAT", "Total"),
  column(7, "HW1", "PSAT", "UNMATCHED"),
]);

describe("student workbook schema", () => {
  it("infers fixed academic context, combined assessment titles, and ignored diagnostics", () => {
    const mappings = inferStudentWorkbookMappings(detectedWideWorkbook);

    expect(mappings.academic?.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "student-name", sourceHeader: "Name" }),
      expect.objectContaining({ kind: "cohort", sourceHeader: "Class" }),
      expect.objectContaining({ kind: "session-title", sourceHeader: "Level" }),
      expect.objectContaining({ kind: "room", sourceHeader: "Room" }),
      expect.objectContaining({
        kind: "score",
        assessmentTitle: "HW1 – PSAT",
        component: "rw",
      }),
      expect.objectContaining({ sourceHeader: "HW1 / PSAT / UNMATCHED", kind: "ignore" }),
    ]));
    expect(mappings.directory.columns[4]).toEqual({
      sourceHeader: "HW1 / PSAT / RW",
      kind: "ignore",
    });
  });

  it("infers normalized per-row assessment title and date columns", () => {
    const detected = normalizedWorkbook();
    const mappings = inferStudentWorkbookMappings(detected);

    expect(mappings.academic?.columns).toEqual([
      expect.objectContaining({ sourceHeader: "Student Name", kind: "student-name" }),
      expect.objectContaining({ sourceHeader: "Cohort", kind: "cohort" }),
      expect.objectContaining({ sourceHeader: "Class", kind: "session-title" }),
      expect.objectContaining({ sourceHeader: "Room", kind: "room" }),
      expect.objectContaining({ sourceHeader: "Test Name", kind: "assessment-title" }),
      expect.objectContaining({ sourceHeader: "Test Date", kind: "assessment-date" }),
      expect.objectContaining({ sourceHeader: "RW", kind: "score", component: "rw" }),
      expect.objectContaining({ sourceHeader: "Math", kind: "score", component: "math" }),
      expect.objectContaining({ sourceHeader: "Total", kind: "score", component: "total" }),
      expect.objectContaining({ sourceHeader: "Percentile", kind: "ignore" }),
    ]);
    expect(parseStudentWorkbookMappings(mappings, detected)).toEqual(mappings);
  });

  it.each([
    ["RW", "rw"],
    ["R&W", "rw"],
    ["Reading Writing", "rw"],
    ["Reading/Writing", "rw"],
    ["M", "math"],
    ["Math", "math"],
    ["Mathematics", "math"],
    ["Total", "total"],
    ["Composite", "total"],
  ] as const)("maps the %s score alias to %s", (alias, component) => {
    const detected = wideWorkbook([
      column(0, "Name"),
      column(1, "Class"),
      column(2, "Level"),
      column(3, "Room"),
      column(4, "HW2", "SAT", alias),
    ]);

    expect(inferStudentWorkbookMappings(detected).academic?.columns[4]).toMatchObject({
      kind: "score",
      assessmentTitle: "HW2 – SAT",
      component,
    });
  });

  it("keeps simple unknown headers as custom student fields", () => {
    const detected: DetectedStudentWorkbook = {
      profile: "simple",
      directory: {
        sheetName: "Students",
        headerRowNumbers: [1],
        dataStartRow: 2,
        columns: [column(0, "Student Name"), column(1, "Transportation Notes")],
      },
      academic: null,
      sheetNames: ["Students"],
    };

    expect(inferStudentWorkbookMappings(detected).directory.columns).toEqual([
      { sourceHeader: "Student Name", kind: "known", field: "fullName" },
      expect.objectContaining({
        sourceHeader: "Transportation Notes",
        kind: "custom-new",
        key: "transportation_notes",
      }),
    ]);
  });

  it("calculates a missing total and rejects a mismatched total", () => {
    expect(normalizeScoreGroup({ rw: 720, math: 760, total: null })).toEqual({
      rw: 720,
      math: 760,
      total: 1480,
      warnings: ["Total calculated from RW + Math."],
    });
    expect(() => normalizeScoreGroup({ rw: 720, math: 760, total: 1490 })).toThrow(
      "Total must equal RW + Math.",
    );
  });

  it.each([
    [{ rw: "UNMATCHED", math: 760, total: null }, "RW must be a number."],
    [{ rw: Number.NaN, math: 760, total: null }, "RW must be a number."],
    [{ rw: 199, math: 760, total: null }, "RW must be between 200 and 800."],
    [{ rw: 720, math: 801, total: null }, "Math must be between 200 and 800."],
    [{ rw: 200, math: 200, total: 399 }, "Total must be between 400 and 1600."],
    [{ rw: 800, math: 800, total: 1601 }, "Total must be between 400 and 1600."],
  ])("rejects invalid SAT score input", (input, message) => {
    expect(() => normalizeScoreGroup(input)).toThrow(message);
  });

  it("normalizes grouped rows and attaches score errors to only the affected row", () => {
    const mappings = inferStudentWorkbookMappings(detectedWideWorkbook).academic!.columns;
    const rows: NumberedSpreadsheetRow[] = [
      { rowNumber: 5, cells: ["Maya Demo", "MWF", "G4", "201", 720, 760, null, "check"] },
      { rowNumber: 6, cells: ["Ravi Demo", "TTHS", "G5", "202", "UNMATCHED", 740, null] },
    ];

    expect(normalizeAcademicRows({ rows, mappings })).toEqual([
      {
        rowNumber: 5,
        studentName: "Maya Demo",
        cohortName: "MWF",
        sessionTitle: "G4",
        roomLabel: "201",
        scores: [{
          assessmentTitle: "HW1 – PSAT",
          assessmentDate: "",
          rw: 720,
          math: 760,
          total: 1480,
          warnings: ["Total calculated from RW + Math."],
        }],
        errors: [],
      },
      expect.objectContaining({
        rowNumber: 6,
        scores: [],
        errors: ["HW1 – PSAT: RW must be a number."],
      }),
    ]);
  });

  it("normalizes each normalized score row under its own test name and source date", () => {
    const mappings = inferStudentWorkbookMappings(normalizedWorkbook()).academic!.columns;
    const rows: NumberedSpreadsheetRow[] = [
      {
        rowNumber: 2,
        cells: ["Maya Demo", "MWF", "G4", "201", "HW1 – PSAT", new Date("2026-07-10T00:00:00.000Z"), 720, 760, 1480, 98],
      },
      {
        rowNumber: 3,
        cells: ["Maya Demo", "MWF", "G4", "201", "HW2 – SAT", "2026-07-17", 730, 770, null, 99],
      },
    ];

    expect(normalizeAcademicRows({ rows, mappings })).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        scores: [{
          assessmentTitle: "HW1 – PSAT",
          assessmentDate: "2026-07-10",
          rw: 720,
          math: 760,
          total: 1480,
          warnings: [],
        }],
        errors: [],
      }),
      expect.objectContaining({
        rowNumber: 3,
        scores: [{
          assessmentTitle: "HW2 – SAT",
          assessmentDate: "2026-07-17",
          rw: 730,
          math: 770,
          total: 1500,
          warnings: ["Total calculated from RW + Math."],
        }],
        errors: [],
      }),
    ]);
  });

  it("keeps missing or invalid normalized assessment metadata as row-local errors", () => {
    const mappings = inferStudentWorkbookMappings(normalizedWorkbook()).academic!.columns;
    const rows: NumberedSpreadsheetRow[] = [
      { rowNumber: 4, cells: ["Missing Name", "MWF", "G4", "201", "", "2026-07-10", 720, 760, 1480] },
      { rowNumber: 5, cells: ["Long Name", "MWF", "G4", "201", "x".repeat(201), "2026-07-10", 720, 760, 1480] },
      { rowNumber: 6, cells: ["Bad Date", "MWF", "G4", "201", "HW1 – PSAT", "2026-02-30", 720, 760, 1480] },
    ];

    expect(normalizeAcademicRows({ rows, mappings })).toEqual([
      expect.objectContaining({
        rowNumber: 4,
        scores: [],
        errors: ["Test Name is required."],
      }),
      expect.objectContaining({
        rowNumber: 5,
        scores: [],
        errors: ["Test Name must be 200 characters or fewer."],
      }),
      expect.objectContaining({
        rowNumber: 6,
        scores: [],
        errors: ["Test Date must be a valid date."],
      }),
    ]);
  });

  it("strictly parses mappings and validates headers and indexes against detection", () => {
    const inferred = inferStudentWorkbookMappings(detectedWideWorkbook);

    expect(parseStudentWorkbookMappings(inferred, detectedWideWorkbook)).toEqual(inferred);
    expect(() => parseStudentWorkbookMappings({
      ...inferred,
      academic: {
        ...inferred.academic!,
        columns: inferred.academic!.columns.map((mapping, index) => index === 4
          ? { ...mapping, columnIndex: 99 }
          : mapping),
      },
    }, detectedWideWorkbook)).toThrow("Student workbook mappings are invalid.");
    expect(() => parseStudentWorkbookMappings({
      ...inferred,
      directory: {
        ...inferred.directory,
        columns: inferred.directory.columns.map((mapping, index) => index === 0
          ? { ...mapping, sourceHeader: "Changed" }
          : mapping),
      },
    }, detectedWideWorkbook)).toThrow("Student workbook mappings are invalid.");
  });

  it("bounds mapping arrays and mapping text", () => {
    const columns = Array.from({ length: 401 }, (_, index) => column(index, `Score ${index}`));
    const detected = wideWorkbook(columns);
    const excessive = {
      profile: "wide",
      directory: {
        sheetName: "Camp Scores",
        columns: columns.map((item) => ({ sourceHeader: item.sourceHeader, kind: "ignore" })),
      },
      academic: {
        sheetName: "Camp Scores",
        columns: columns.map((item) => ({
          sourceHeader: item.sourceHeader,
          columnIndex: item.index,
          kind: "ignore",
        })),
      },
    };

    expect(() => parseStudentWorkbookMappings(excessive, detected)).toThrow(
      "Student workbook mappings are invalid.",
    );
    expect(() => parseStudentWorkbookMappings({
      ...inferStudentWorkbookMappings(detectedWideWorkbook),
      directory: {
        sheetName: "x".repeat(201),
        columns: [],
      },
    }, detectedWideWorkbook)).toThrow("Student workbook mappings are invalid.");
  });

  it("strictly parses bounded cohort setup and assessment dates", () => {
    const setup = {
      cohorts: [{ sourceClass: "MWF", selectedCohortId: "cohort-1", capacity: 24 }],
      assessmentDates: [{ sourceClass: "MWF", assessmentTitle: "HW1 – PSAT", date: "2026-07-10" }],
    };

    expect(parseStudentWorkbookSetup(setup)).toEqual(setup);
    expect(() => parseStudentWorkbookSetup({
      ...setup,
      cohorts: Array.from({ length: 101 }, () => ({ sourceClass: "MWF" })),
    })).toThrow("Student workbook setup is invalid.");
    expect(() => parseStudentWorkbookSetup({
      ...setup,
      assessmentDates: Array.from({ length: 501 }, () => setup.assessmentDates[0]),
    })).toThrow("Student workbook setup is invalid.");
    expect(() => parseStudentWorkbookSetup({
      cohorts: [{ sourceClass: "MWF", capacity: -1 }],
      assessmentDates: [],
    })).toThrow("Student workbook setup is invalid.");
    expect(() => parseStudentWorkbookSetup({
      cohorts: [],
      assessmentDates: [{ sourceClass: "MWF", assessmentTitle: "PSAT", date: "2026-02-30" }],
    })).toThrow("Student workbook setup is invalid.");
  });
});
