import { describe, expect, it } from "vitest";
import { canEditAttendance, isAttendanceStatus, viewerCanAccessCohort } from "@/lib/attendance";
import type { User } from "@/lib/domain";

const instructor: User = {
  id: "user-instructor",
  name: "Daniel Ruiz",
  role: "instructor",
  title: "Lead SAT Instructor",
  assignedCohortIds: ["cohort-sat-spring"],
};

describe("attendance permissions", () => {
  it("allows all operational roles to edit attendance", () => {
    expect(canEditAttendance("engineer")).toBe(true);
    expect(canEditAttendance("admin")).toBe(true);
    expect(canEditAttendance("staff")).toBe(true);
    expect(canEditAttendance("ta")).toBe(true);
    expect(canEditAttendance("instructor")).toBe(true);
  });

  it("keeps instructor cohort access scoped to assignments", () => {
    expect(viewerCanAccessCohort(instructor, "cohort-sat-spring")).toBe(true);
    expect(viewerCanAccessCohort(instructor, "cohort-act-sprint")).toBe(false);
  });

  it("validates supported attendance status values", () => {
    expect(isAttendanceStatus("present")).toBe(true);
    expect(isAttendanceStatus("absent")).toBe(true);
    expect(isAttendanceStatus("late")).toBe(false);
  });
});
