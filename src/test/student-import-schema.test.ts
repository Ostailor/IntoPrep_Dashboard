import { describe, expect, it } from "vitest";
import {
  normalizeStudentImportHeader,
  normalizeStudentImportRow,
  suggestStudentImportMapping,
  validateStudentImportMappings,
} from "@/lib/student-import-schema";

describe("student import schema", () => {
  it("normalizes punctuation and suggests known aliases", () => {
    expect(normalizeStudentImportHeader(" Student_First-Name ")).toBe("student first name");
    expect(normalizeStudentImportHeader("Parent / Guardian Email")).toBe("parent/guardian email");
    expect(suggestStudentImportMapping("Parent/Guardian Email")).toMatchObject({
      kind: "known",
      field: "parent1Email",
    });
    expect(suggestStudentImportMapping("Parent / Guardian Email")).toMatchObject({
      kind: "known",
      field: "parent1Email",
    });
  });

  it("defaults unknown headers to a sensitive custom field", () => {
    expect(suggestStudentImportMapping("Transportation Notes")).toMatchObject({
      kind: "custom-new",
      label: "Transportation Notes",
      sensitive: true,
    });
  });

  it("rejects two source columns mapped to the same known field", () => {
    expect(() => validateStudentImportMappings([
      { sourceHeader: "Email", kind: "known", field: "studentEmail" },
      { sourceHeader: "Student Email", kind: "known", field: "studentEmail" },
    ])).toThrow("Student email is mapped more than once.");
  });

  it.each([
    [
      { sourceHeader: "Student Name", kind: "known" as const, field: "fullName" as const },
      { sourceHeader: "First Name", kind: "known" as const, field: "firstName" as const },
    ],
    [
      { sourceHeader: "Last Name", kind: "known" as const, field: "lastName" as const },
      { sourceHeader: "Student Name", kind: "known" as const, field: "fullName" as const },
    ],
  ])("rejects full-name mappings combined with separate name columns", (...mappings) => {
    expect(() => validateStudentImportMappings(mappings)).toThrow(
      "Full name cannot be mapped with separate first or last name columns.",
    );
  });

  it("normalizes a full name and preserves typed custom values", () => {
    const row = normalizeStudentImportRow({
      rowNumber: 2,
      cells: ["Maya Chen", true, 2026],
      mappings: [
        { sourceHeader: "Student Name", kind: "known", field: "fullName" },
        { sourceHeader: "Needs Bus", kind: "custom-new", key: "needs_bus", label: "Needs Bus", dataType: "boolean", sensitive: true },
        { sourceHeader: "Graduation Year", kind: "custom-new", key: "graduation_year", label: "Graduation Year", dataType: "number", sensitive: true },
      ],
    });
    expect(row.firstName).toBe("Maya");
    expect(row.lastName).toBe("Chen");
    expect(row.customFields).toEqual({ needs_bus: true, graduation_year: 2026 });
  });

  it("keeps blank known cells out of supplied fields", () => {
    const row = normalizeStudentImportRow({
      rowNumber: 3,
      cells: ["  ", null],
      mappings: [
        { sourceHeader: "First Name", kind: "known", field: "firstName" },
        { sourceHeader: "School", kind: "known", field: "school" },
      ],
    });

    expect(row.suppliedFields).toEqual([]);
  });

  it("lowercases imported email addresses", () => {
    const row = normalizeStudentImportRow({
      rowNumber: 4,
      cells: [" Student@Example.COM ", " Parent@Example.COM "],
      mappings: [
        { sourceHeader: "Student Email", kind: "known", field: "studentEmail" },
        { sourceHeader: "Parent Email", kind: "known", field: "parent1Email" },
      ],
    });

    expect(row.studentEmail).toBe("student@example.com");
    expect(row.parent1Email).toBe("parent@example.com");
    expect(row.suppliedFields).toEqual(["studentEmail", "parent1Email"]);
  });

  it("normalizes target tests and defaults missing values to support", () => {
    const normalized = normalizeStudentImportRow({
      rowNumber: 5,
      cells: ["sat"],
      mappings: [{ sourceHeader: "Target Test", kind: "known", field: "targetTest" }],
    });
    const missing = normalizeStudentImportRow({ rowNumber: 6, cells: [], mappings: [] });

    expect(normalized.targetTest).toBe("SAT");
    expect(missing.targetTest).toBe("Support");
    expect(missing.suppliedFields).toEqual([]);
  });

  it("rejects duplicate custom field keys", () => {
    expect(() => validateStudentImportMappings([
      { sourceHeader: "Bus", kind: "custom-existing", key: "needs_bus" },
      { sourceHeader: "Needs Bus", kind: "custom-new", key: "needs_bus", label: "Needs Bus", dataType: "boolean", sensitive: true },
    ])).toThrow("Custom field needs_bus is mapped more than once.");
  });

  it("normalizes custom dates to ISO strings", () => {
    const importedAt = new Date("2026-07-09T12:30:00.000Z");
    const row = normalizeStudentImportRow({
      rowNumber: 7,
      cells: [importedAt],
      mappings: [{ sourceHeader: "Imported At", kind: "custom-existing", key: "imported_at" }],
    });

    expect(row.customFields).toEqual({ imported_at: importedAt.toISOString() });
  });
});
