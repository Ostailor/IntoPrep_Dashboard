import { describe, expect, it, vi } from "vitest";
import {
  mergeValidatedStudentCustomFields,
  resolveStudentDirectoryWritePartition,
  resolveStudentExternalId,
  validateStudentDirectoryRequestPayload,
} from "@/lib/student-directory-writes";
import type { User } from "@/lib/domain";

vi.mock("server-only", () => ({}));

describe("manual student custom fields", () => {
  const definitions = [
    {
      id: "field-grad-year",
      key: "graduation_year",
      label: "Graduation year",
      dataType: "number" as const,
      headerAliases: ["Grad year"],
      required: false,
      sensitive: true,
      sortOrder: 10,
      demo: true,
    },
    {
      id: "field-accommodations",
      key: "accommodations",
      label: "Accommodations",
      dataType: "text" as const,
      headerAliases: [],
      required: false,
      sensitive: true,
      sortOrder: 20,
      demo: true,
    },
    {
      id: "field-start-date",
      key: "start_date",
      label: "Start date",
      dataType: "date" as const,
      headerAliases: [],
      required: false,
      sensitive: true,
      sortOrder: 30,
      demo: true,
    },
    {
      id: "field-required-code",
      key: "required_code",
      label: "Required code",
      dataType: "text" as const,
      headerAliases: [],
      required: true,
      sensitive: true,
      sortOrder: 40,
      demo: true,
    },
  ];

  it("validates submitted keys and merges omitted imported values", () => {
    expect(
      mergeValidatedStudentCustomFields({
        existing: { accommodations: "Extended time", imported_only: "preserve me" },
        submitted: { graduation_year: 2027, required_code: "A-1" },
        definitions,
      }),
    ).toEqual({
      accommodations: "Extended time",
      imported_only: "preserve me",
      graduation_year: 2027,
      required_code: "A-1",
    });
  });

  it("rejects unknown keys and values that do not match the definition type", () => {
    expect(() =>
      mergeValidatedStudentCustomFields({
        existing: {},
        submitted: { main_only: "private", required_code: "A-1" },
        definitions,
      }),
    ).toThrow("Custom field main_only is not available in this student directory.");
    expect(() =>
      mergeValidatedStudentCustomFields({
        existing: {},
        submitted: { graduation_year: "2027", required_code: "A-1" },
        definitions,
      }),
    ).toThrow("Graduation year must be a number.");
  });

  it("clears a known optional field with null while preserving omitted stored keys", () => {
    expect(
      mergeValidatedStudentCustomFields({
        existing: {
          accommodations: "Extended time",
          imported_only: "preserve me",
          required_code: "A-1",
        },
        submitted: { accommodations: null },
        definitions,
      }),
    ).toEqual({ imported_only: "preserve me", required_code: "A-1" });
  });

  it("does not allow a required custom field to be cleared", () => {
    expect(() =>
      mergeValidatedStudentCustomFields({
        existing: { required_code: "A-1" },
        submitted: { required_code: null },
        definitions,
      }),
    ).toThrow("Required code is required.");
  });

  it("accepts only real calendar dates in YYYY-MM-DD form", () => {
    expect(
      mergeValidatedStudentCustomFields({
        existing: { required_code: "A-1" },
        submitted: { start_date: "2027-02-28" },
        definitions,
      }),
    ).toMatchObject({ start_date: "2027-02-28" });

    for (const invalidDate of ["2027-02-30", "2027-02-28T00:00:00.000Z", "02/28/2027"]) {
      expect(() =>
        mergeValidatedStudentCustomFields({
          existing: { required_code: "A-1" },
          submitted: { start_date: invalidDate },
          definitions,
        }),
      ).toThrow("Start date must be a valid date.");
    }
  });

  it("preserves omitted external IDs, supports explicit clearing, and bounds new values", () => {
    expect(resolveStudentExternalId("S-100", undefined)).toBe("S-100");
    expect(resolveStudentExternalId("S-100", null)).toBeNull();
    expect(resolveStudentExternalId("S-100", "  ")).toBeNull();
    expect(resolveStudentExternalId(null, " S-200 ")).toBe("S-200");
    expect(() => resolveStudentExternalId(null, "x".repeat(121))).toThrow(
      "External ID must be 120 characters or fewer.",
    );
  });

  it("keeps engineer manual editing denied while deriving admin partitions", () => {
    const viewer = {
      id: "viewer",
      name: "Viewer",
      role: "admin",
      title: "Admin",
      assignedCohortIds: [],
      demo: true,
    } satisfies User;

    expect(resolveStudentDirectoryWritePartition(viewer)).toBe(true);
    expect(resolveStudentDirectoryWritePartition({ ...viewer, demo: false })).toBe(false);
    expect(() =>
      resolveStudentDirectoryWritePartition({ ...viewer, role: "engineer" }),
    ).toThrow("You cannot edit the student directory.");
  });

  it("rejects excessive custom-field counts, keys, and string values", () => {
    expect(() =>
      validateStudentDirectoryRequestPayload({
        customFields: Object.fromEntries(
          Array.from({ length: 51 }, (_, index) => [`field_${index}`, "value"]),
        ),
      }),
    ).toThrow("Additional student information is limited to 50 fields.");
    expect(() =>
      validateStudentDirectoryRequestPayload({
        customFields: { ["k".repeat(65)]: "value" },
      }),
    ).toThrow("Custom field keys must be 64 characters or fewer.");
    expect(() =>
      validateStudentDirectoryRequestPayload({
        customFields: { note: "x".repeat(4001) },
      }),
    ).toThrow("Custom field text must be 4000 characters or fewer.");
  });
});
