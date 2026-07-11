import readXlsxFile from "read-excel-file/node";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  buildStudentWorkbookExportHref,
  StudentWorkbookExportActions,
} from "@/components/portal/student-workbook-export-actions";
import {
  createStudentWorkbookExportRepository,
  exportStudentWorkbook,
  STUDENT_WORKBOOK_EXPORT_LIMITS,
  StudentWorkbookExportLimitError,
  type StudentWorkbookExportDataSource,
  type StudentWorkbookExportLimits,
  type StudentWorkbookExportPartitionData,
  type StudentWorkbookExportRepository,
} from "@/lib/student-workbook-export";

const demoAdmin = {
  id: "admin-demo",
  name: "Demo Admin",
  role: "admin" as const,
  title: "Administrator",
  assignedCohortIds: [],
  demo: true,
};

const mainEngineer = {
  ...demoAdmin,
  id: "engineer-main",
  name: "Engineer",
  role: "engineer" as const,
  demo: false,
};

function partitionData(): StudentWorkbookExportPartitionData {
  return {
    families: [
      {
        id: "family-demo",
        guardian_names: ["Grace Demo"],
        parent1_name: "Grace Demo",
        parent1_email: "grace@example.test",
        parent1_phone: "555-0101",
        parent2_name: "Charles Demo",
        parent2_email: "charles@example.test",
        parent2_phone: "555-0102",
        email: "family@example.test",
        phone: "555-0100",
        demo: true,
      },
      {
        id: "family-main",
        guardian_names: ["Main Parent"],
        parent1_name: "Main Parent",
        parent1_email: "main-parent@example.test",
        parent1_phone: "555-0199",
        parent2_name: null,
        parent2_email: null,
        parent2_phone: null,
        email: "main-family@example.test",
        phone: "555-0198",
        demo: false,
      },
    ],
    students: [
      {
        id: "student-demo",
        family_id: "family-demo",
        first_name: "Ada",
        last_name: "Demo",
        email: "ada@example.test",
        phone: "555-0103",
        grade_level: "11",
        school: "North High",
        target_test: "SAT",
        focus: "Reading pace",
        custom_fields: { counselor: "Dr. Chen", graduation_year: 2027, inactive: "hidden" },
        demo: true,
      },
      {
        id: "student-main",
        family_id: "family-main",
        first_name: "Main",
        last_name: "Student",
        email: "main-student@example.test",
        phone: "555-0197",
        grade_level: "12",
        school: "Main High",
        target_test: "ACT",
        focus: "Main-only focus",
        custom_fields: { counselor: "Main Counselor" },
        demo: false,
      },
    ],
    fieldDefinitions: [
      {
        key: "graduation_year",
        label: "Graduation Year",
        data_type: "number",
        sort_order: 10,
        archived_at: null,
        demo: true,
      },
      {
        key: "counselor",
        label: "Counselor",
        data_type: "text",
        sort_order: 10,
        archived_at: null,
        demo: true,
      },
      {
        key: "inactive",
        label: "Inactive Field",
        data_type: "text",
        sort_order: 1,
        archived_at: "2026-01-01T00:00:00.000Z",
        demo: true,
      },
      {
        key: "main_only",
        label: "Main Only",
        data_type: "text",
        sort_order: 1,
        archived_at: null,
        demo: false,
      },
    ],
    cohorts: [
      { id: "cohort-demo", name: "MWF", is_archived: false, demo: true },
      { id: "cohort-demo-second", name: "SAT Intensive", is_archived: false, demo: true },
      { id: "cohort-demo-archived", name: "Archived", is_archived: true, demo: true },
      { id: "cohort-main", name: "Main Cohort", is_archived: false, demo: false },
    ],
    enrollments: [
      {
        student_id: "student-demo",
        cohort_id: "cohort-demo-second",
        status: "active",
        registered_at: "2026-06-02T12:00:00.000Z",
        demo: true,
      },
      {
        student_id: "student-demo",
        cohort_id: "cohort-demo",
        status: "active",
        registered_at: "2026-06-01T12:00:00.000Z",
        demo: true,
      },
      {
        student_id: "student-demo",
        cohort_id: "cohort-demo-archived",
        status: "active",
        registered_at: "2026-05-01T12:00:00.000Z",
        demo: true,
      },
      {
        student_id: "student-main",
        cohort_id: "cohort-main",
        status: "active",
        registered_at: "2026-01-01T12:00:00.000Z",
        demo: false,
      },
    ],
    sessions: [
      {
        cohort_id: "cohort-demo",
        title: "G4",
        start_at: "2026-07-11T01:00:00.000Z",
        room_label: "Room 201",
        demo: true,
      },
      {
        cohort_id: "cohort-demo",
        title: "G5",
        start_at: "2026-07-13T13:00:00.000Z",
        room_label: "Room 202",
        demo: true,
      },
      {
        cohort_id: "cohort-demo-archived",
        title: "Historical G3",
        start_at: "2026-07-20T13:00:00.000Z",
        room_label: "Archive Room",
        demo: true,
      },
      {
        cohort_id: "cohort-main",
        title: "Main Class",
        start_at: "2026-07-10T13:00:00.000Z",
        room_label: "Main Room",
        demo: false,
      },
    ],
    assessments: [
      {
        id: "assessment-demo",
        cohort_id: "cohort-demo",
        title: "HW1 – PSAT",
        date: "2026-07-10",
        demo: true,
      },
      {
        id: "assessment-demo-archived",
        cohort_id: "cohort-demo-archived",
        title: "Historical PSAT",
        date: "2026-07-20",
        demo: true,
      },
      {
        id: "assessment-main",
        cohort_id: "cohort-main",
        title: "Main Test",
        date: "2026-07-10",
        demo: false,
      },
    ],
    results: [
      {
        assessment_id: "assessment-demo",
        student_id: "student-demo",
        total_score: 1480,
        section_scores: [
          { label: "R&W", score: 720 },
          { label: "Mathematics", score: 760 },
        ],
        demo: true,
      },
      {
        assessment_id: "assessment-demo-archived",
        student_id: "student-demo",
        total_score: 1420,
        section_scores: [
          { label: "RW", score: 700 },
          { label: "Math", score: 720 },
        ],
        demo: true,
      },
      {
        assessment_id: "assessment-main",
        student_id: "student-main",
        total_score: 1200,
        section_scores: [
          { label: "RW", score: 600 },
          { label: "Math", score: 600 },
        ],
        demo: false,
      },
    ],
  };
}

function repository(data = partitionData()) {
  return {
    loadPartition: vi.fn(async () => data),
  } satisfies StudentWorkbookExportRepository;
}

describe("exportStudentWorkbook", () => {
  it("exports normalized demo student and score sheets without leaking main records", async () => {
    const exportRepository = repository();

    const workbook = await exportStudentWorkbook({
      viewer: demoAdmin,
      scope: "all",
      repository: exportRepository,
    });

    expect(exportRepository.loadPartition).toHaveBeenCalledWith(true, "all");
    expect(workbook.filename).toMatch(/^intoprep-demo-export-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(workbook.sheetNames).toEqual(["Student Information", "Scores"]);
    expect(workbook.rows.students).toHaveLength(1);
    expect(workbook.rows.students[0]).toMatchObject({
      firstName: "Ada",
      lastName: "Demo",
      cohorts: "MWF; SAT Intensive",
      customFields: { counselor: "Dr. Chen", graduation_year: 2027 },
    });
    expect(workbook.rows.students[0]?.registrationDate?.toISOString()).toBe(
      "2026-06-01T00:00:00.000Z",
    );
    expect(workbook.rows.scores[0]).toMatchObject({
      studentName: "Ada Demo",
      cohort: "MWF",
      className: "G4",
      room: "Room 201",
      testName: "HW1 – PSAT",
      rw: 720,
      math: 760,
      total: 1480,
    });
    expect(workbook.rows.scores.find((row) => row.testName === "Historical PSAT")).toMatchObject({
      cohort: "Archived",
      className: "Historical G3",
      room: "Archive Room",
      rw: 700,
      math: 720,
      total: 1420,
    });
    expect(workbook.bytes.includes(Buffer.from("Main Student"))).toBe(false);
    expect(workbook.bytes.includes(Buffer.from("main-student@example.test"))).toBe(false);

    const sheets = await readXlsxFile(workbook.bytes);
    expect(sheets.map((sheet) => sheet.sheet)).toEqual(["Student Information", "Scores"]);
    expect(sheets[0]?.data[0]).toEqual([
      "First Name", "Last Name", "Student Email", "Student Phone",
      "Grade", "School", "Target Test", "Focus",
      "Parent 1 Name", "Parent 1 Email", "Parent 1 Phone",
      "Parent 2 Name", "Parent 2 Email", "Parent 2 Phone",
      "Cohorts", "Registration Date", "Counselor", "Graduation Year",
    ]);
    expect(sheets[1]?.data[0]).toEqual([
      "Student Name", "Cohort", "Class", "Room", "Test Name",
      "Test Date", "RW", "Math", "Total",
    ]);
  });

  it.each([
    ["students" as const, ["Student Information"]],
    ["scores" as const, ["Scores"]],
  ])("exports only the requested %s sheet", async (scope, expectedSheets) => {
    const workbook = await exportStudentWorkbook({
      viewer: demoAdmin,
      scope,
      repository: repository(),
    });

    expect(workbook.sheetNames).toEqual(expectedSheets);
    await expect(readXlsxFile(workbook.bytes)).resolves.toEqual([
      expect.objectContaining({ sheet: expectedSheets[0] }),
    ]);
  });

  it.each(["admin", "staff"] as const)(
    "%s ignores requested target overrides and uses the profile partition",
    async (role) => {
      const exportRepository = repository();

      await exportStudentWorkbook({
        viewer: { ...demoAdmin, role },
        scope: "students",
        requestedTarget: false,
        repository: exportRepository,
      });

      expect(exportRepository.loadPartition).toHaveBeenCalledWith(true, "students");
    },
  );

  it("requires engineers to choose a target and honors an explicit selection", async () => {
    const exportRepository = repository();

    await expect(exportStudentWorkbook({
      viewer: mainEngineer,
      scope: "all",
      repository: exportRepository,
    })).rejects.toThrow("Engineers must choose Demo or Main before exporting students.");
    expect(exportRepository.loadPartition).not.toHaveBeenCalled();

    const workbook = await exportStudentWorkbook({
      viewer: mainEngineer,
      scope: "all",
      requestedTarget: false,
      repository: exportRepository,
    });

    expect(exportRepository.loadPartition).toHaveBeenCalledWith(false, "all");
    expect(workbook.filename).toMatch(/^intoprep-main-export-/);
    expect(workbook.rows.students.map((student) => student.firstName)).toEqual(["Main"]);
  });

  it("uses one unique cohort-wide class context and leaves ambiguous contexts blank", async () => {
    const data = partitionData();
    data.cohorts.push(
      { id: "cohort-fallback", name: "TTHS", is_archived: false, demo: true },
      { id: "cohort-ambiguous", name: "Weekend", is_archived: false, demo: true },
    );
    data.sessions.push(
      {
        cohort_id: "cohort-fallback",
        title: "G6",
        start_at: "2026-07-08T13:00:00.000Z",
        room_label: "Room 301",
        demo: true,
      },
      {
        cohort_id: "cohort-fallback",
        title: "G6",
        start_at: "2026-07-13T13:00:00.000Z",
        room_label: "Room 301",
        demo: true,
      },
      {
        cohort_id: "cohort-ambiguous",
        title: "G7",
        start_at: "2026-07-10T13:00:00.000Z",
        room_label: "Room 401",
        demo: true,
      },
      {
        cohort_id: "cohort-ambiguous",
        title: "G8",
        start_at: "2026-07-10T14:00:00.000Z",
        room_label: "Room 402",
        demo: true,
      },
    );
    data.assessments.push(
      {
        id: "assessment-fallback",
        cohort_id: "cohort-fallback",
        title: "HW2 – PSAT",
        date: "2026-07-10",
        demo: true,
      },
      {
        id: "assessment-ambiguous",
        cohort_id: "cohort-ambiguous",
        title: "HW3 – PSAT",
        date: "2026-07-10",
        demo: true,
      },
    );
    data.results.push(
      {
        assessment_id: "assessment-fallback",
        student_id: "student-demo",
        total_score: 1400,
        section_scores: [{ label: "Reading/Writing", score: 680 }, { label: "M", score: 720 }],
        demo: true,
      },
      {
        assessment_id: "assessment-ambiguous",
        student_id: "student-demo",
        total_score: 1300,
        section_scores: [{ label: "RW", score: 650 }, { label: "Math", score: 650 }],
        demo: true,
      },
    );

    const workbook = await exportStudentWorkbook({
      viewer: demoAdmin,
      scope: "scores",
      repository: repository(data),
    });

    expect(workbook.rows.scores.find((row) => row.testName === "HW2 – PSAT")).toMatchObject({
      className: "G6",
      room: "Room 301",
      rw: 680,
      math: 720,
    });
    expect(workbook.rows.scores.find((row) => row.testName === "HW3 – PSAT")).toMatchObject({
      className: "",
      room: "",
    });
  });

  it("rejects injected projections above the practical row ceiling", async () => {
    const data = partitionData();
    data.results.push({
      assessment_id: "assessment-demo",
      student_id: "student-demo",
      total_score: 1500,
      section_scores: [{ label: "RW", score: 740 }, { label: "Math", score: 760 }],
      demo: true,
    });
    const limits: StudentWorkbookExportLimits = {
      ...STUDENT_WORKBOOK_EXPORT_LIMITS,
      projectedScoreRows: 1,
    };

    await expect(exportStudentWorkbook({
      viewer: demoAdmin,
      scope: "scores",
      repository: repository(data),
      limits,
    })).rejects.toBeInstanceOf(StudentWorkbookExportLimitError);
  });
});

describe("student workbook export repository", () => {
  function dataSource(rows: Partial<Record<keyof StudentWorkbookExportPartitionData, unknown[]>> = {}) {
    return {
      loadPage: vi.fn(async ({ collection, from, to }:
        Parameters<StudentWorkbookExportDataSource["loadPage"]>[0]) => ({
        data: (rows[collection] ?? []).slice(from, to + 1),
        error: null,
      })),
    } satisfies StudentWorkbookExportDataSource;
  }

  const smallLimits: StudentWorkbookExportLimits = {
    ...STUDENT_WORKBOOK_EXPORT_LIMITS,
    pageSize: 2,
    collectionRows: {
      ...STUDENT_WORKBOOK_EXPORT_LIMITS.collectionRows,
      students: 4,
    },
  };

  it("loads only directory collections for students scope", async () => {
    const source = dataSource();
    const repository = createStudentWorkbookExportRepository(source, smallLimits);

    await repository.loadPartition(true, "students");

    expect(source.loadPage.mock.calls.map(([input]) => input.collection)).toEqual([
      "families", "students", "fieldDefinitions", "enrollments", "cohorts",
    ]);
    expect(source.loadPage.mock.calls.find(([input]) => input.collection === "cohorts")?.[0])
      .toMatchObject({ includeArchivedCohorts: false });
    expect(source.loadPage.mock.calls.find(([input]) => input.collection === "students")?.[0])
      .toMatchObject({ studentProjection: "directory" });
  });

  it("loads only score collections and retains archived cohorts for scores scope", async () => {
    const source = dataSource();
    const repository = createStudentWorkbookExportRepository(source, smallLimits);

    await repository.loadPartition(false, "scores");

    expect(source.loadPage.mock.calls.map(([input]) => input.collection)).toEqual([
      "students", "cohorts", "sessions", "assessments", "results",
    ]);
    expect(source.loadPage.mock.calls.find(([input]) => input.collection === "cohorts")?.[0])
      .toMatchObject({ includeArchivedCohorts: true });
    expect(source.loadPage.mock.calls.find(([input]) => input.collection === "students")?.[0])
      .toMatchObject({ studentProjection: "score" });
  });

  it("accepts an exact page boundary after a one-row overflow probe", async () => {
    const source = dataSource({ students: [1, 2, 3, 4] });
    const repository = createStudentWorkbookExportRepository(source, smallLimits);

    await expect(repository.loadPartition(true, "scores")).resolves.toMatchObject({
      students: [1, 2, 3, 4],
    });
    expect(source.loadPage.mock.calls
      .filter(([input]) => input.collection === "students")
      .map(([input]) => [input.from, input.to])).toEqual([[0, 1], [2, 3], [4, 4]]);
  });

  it("rejects one row over the collection limit without accumulating it", async () => {
    const source = dataSource({ students: [1, 2, 3, 4, 5] });
    const repository = createStudentWorkbookExportRepository(source, smallLimits);

    await expect(repository.loadPartition(true, "scores"))
      .rejects.toBeInstanceOf(StudentWorkbookExportLimitError);
    expect(source.loadPage.mock.calls
      .filter(([input]) => input.collection === "students")
      .at(-1)?.[0]).toMatchObject({ from: 4, to: 4 });
  });
});

describe("StudentWorkbookExportActions", () => {
  it("renders three ordinary download navigations without an admin target selector", () => {
    const markup = renderToStaticMarkup(createElement(StudentWorkbookExportActions, {
      role: "admin",
    }));

    expect(markup).toContain('href="/api/students/export?scope=students"');
    expect(markup).toContain('href="/api/students/export?scope=scores"');
    expect(markup).toContain('href="/api/students/export?scope=all"');
    expect(markup).toContain("Download Student Information");
    expect(markup).toContain("Download Scores");
    expect(markup).toContain("Download Everything");
    expect(markup).not.toContain("Export data partition");
  });

  it("requires an engineer partition selection before download links are enabled", () => {
    const markup = renderToStaticMarkup(createElement(StudentWorkbookExportActions, {
      role: "engineer",
    }));

    expect(markup).toContain("Export data partition");
    expect(markup).toContain("Choose Demo or Main");
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).not.toContain('href="/api/students/export');
    expect(buildStudentWorkbookExportHref("scores", true)).toBe(
      "/api/students/export?scope=scores&targetDemo=true",
    );
    expect(buildStudentWorkbookExportHref("all", false)).toBe(
      "/api/students/export?scope=all&targetDemo=false",
    );
  });

  it("renders staff downloads without a target selector", () => {
    const markup = renderToStaticMarkup(createElement(StudentWorkbookExportActions, {
      role: "staff",
    }));

    expect(markup).toContain('href="/api/students/export?scope=students"');
    expect(markup).toContain('href="/api/students/export?scope=scores"');
    expect(markup).toContain('href="/api/students/export?scope=all"');
    expect(markup).not.toContain("Export data partition");
  });
});
