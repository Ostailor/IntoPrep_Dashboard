import { describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/domain";
import { getPortalLoadPlan } from "@/lib/live-portal";

vi.mock("server-only", () => ({}));

const adminViewer: User = {
  id: "admin-1",
  name: "Admin User",
  role: "admin",
  title: "Administrator",
  assignedCohortIds: [],
};

describe("portal load plan", () => {
  it("loads only cohort data consumed by the cohort page", () => {
    const plan = getPortalLoadPlan(adminViewer, "cohorts");

    expect(plan.sessions).toBe(true);
    expect(plan).toMatchObject({
      enrollments: false,
      students: false,
      assessments: false,
      academicNotes: false,
      instructorFollowUpFlags: false,
      allProfiles: false,
      adminTasks: false,
      savedViews: false,
      archivedCohorts: false,
      sessionChecklists: false,
      attendanceExceptionFlags: false,
    });
  });

  it("retains the admin dashboard load plan", () => {
    expect(getPortalLoadPlan(adminViewer, "dashboard")).toMatchObject({
      sessions: true,
      enrollments: true,
      students: true,
      assessments: true,
      academicNotes: true,
      instructorFollowUpFlags: true,
      allProfiles: true,
      adminTasks: true,
      savedViews: true,
      sessionChecklists: true,
      attendanceExceptionFlags: false,
      archivedCohorts: false,
    });
  });

  it("retains the admin students load plan", () => {
    expect(getPortalLoadPlan(adminViewer, "students")).toMatchObject({
      sessions: true,
      enrollments: true,
      students: true,
      assessments: true,
      academicNotes: true,
      instructorFollowUpFlags: false,
      allProfiles: false,
      adminTasks: true,
      savedViews: false,
      sessionChecklists: false,
      attendanceExceptionFlags: false,
    });
  });

  it("retains the admin attendance load plan", () => {
    expect(getPortalLoadPlan(adminViewer, "attendance")).toMatchObject({
      sessions: true,
      enrollments: true,
      students: true,
      assessments: true,
      academicNotes: false,
      instructorFollowUpFlags: true,
      allProfiles: false,
      adminTasks: true,
      savedViews: false,
      sessionChecklists: true,
      attendanceExceptionFlags: false,
      archivedCohorts: false,
    });
  });
});
