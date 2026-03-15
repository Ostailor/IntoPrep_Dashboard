import { describe, expect, it } from "vitest";
import {
  getIntakeTemplateCsv,
  parseCsv,
  parseIntakeCsvRows,
} from "@/lib/intake-import-shared";

describe("intake csv parsing", () => {
  it("parses quoted csv cells with commas intact", () => {
    const rows = parseCsv('A,B,C\n1,"two, still two",3\n');

    expect(rows).toEqual([
      ["A", "B", "C"],
      ["1", "two, still two", "3"],
    ]);
  });

  it("maps google forms style headers into normalized intake rows", () => {
    const rows = parseIntakeCsvRows(
      [
        "Timestamp,Guardian Name,Guardian Email,Student Name,Target Program,Stage,Cohort Name",
        "2026-03-14T08:00:00-04:00,Jordan Ellis,jordan@example.com,Mila Ellis,Digital SAT Score Guarantee,Registered,SAT Spring Elite M/W/F",
      ].join("\n"),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      guardianName: "Jordan Ellis",
      guardianEmail: "jordan@example.com",
      studentFirstName: "Mila",
      studentLastName: "Ellis",
      targetProgram: "Digital SAT Score Guarantee",
      stage: "registered",
      cohortName: "SAT Spring Elite M/W/F",
    });
    expect(rows[0]?.submittedAt).toBe("2026-03-14T12:00:00.000Z");
  });

  it("produces a template csv with the expected header row", () => {
    const template = getIntakeTemplateCsv();

    expect(template).toContain("Guardian Email");
    expect(template).toContain("Cohort Name");
    expect(template.trim().split("\n")).toHaveLength(2);
  });
});
