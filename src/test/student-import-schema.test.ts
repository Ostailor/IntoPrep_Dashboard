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
    expect(suggestStudentImportMapping("Parent/Guardian Email")).toMatchObject({
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
});
