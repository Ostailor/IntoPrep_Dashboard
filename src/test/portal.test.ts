import { describe, expect, it } from "vitest";
import {
  canAccessSection,
  canManageAdminAnnouncements,
  canManageBillingFollowUp,
  canManageBulkOperations,
  canManageCohortAssignments,
  canManageOperationalTasks,
  canManageSavedViews,
  canManageSchedules,
  canDeleteRole,
  canGrantSensitiveAccess,
  canManageFeatureFlags,
  canManageRoleTransition,
  canPreviewRoles,
  canProvisionRole,
  canRevokeSessions,
  canRunIntakeImports,
  canSendPasswordResetForRole,
  canSuspendRole,
  canStartFamilyThreads,
  canUpdateAssignedTasks,
  canUpdateSessionChecklists,
  canViewFamilyContactBasics,
  canViewAllSyncJobs,
  getVisibleSections,
} from "@/lib/permissions";
import {
  getAlertsFromSyncJobs,
  getBillingRows,
  getPortalContext,
  getSectionFallback,
  getSessionRosterView,
} from "@/lib/portal";

describe("permission matrix", () => {
  it("keeps instructor navigation limited to teaching surfaces", () => {
    expect(getVisibleSections("instructor")).toEqual([
      "dashboard",
      "calendar",
      "cohorts",
      "attendance",
      "academics",
    ]);
    expect(canAccessSection("instructor", "academics")).toBe(true);
    expect(canAccessSection("instructor", "students")).toBe(false);
    expect(canAccessSection("instructor", "messaging")).toBe(false);
    expect(canViewFamilyContactBasics("instructor")).toBe(false);
    expect(canUpdateAssignedTasks("instructor")).toBe(true);
    expect(canStartFamilyThreads("instructor")).toBe(false);
    expect(canRunIntakeImports("instructor")).toBe(false);
    expect(getSectionFallback("instructor")).toBe("dashboard");
  });

  it("blocks billing for TAs while leaving student-facing support surfaces open", () => {
    expect(canAccessSection("ta", "billing")).toBe(false);
    expect(canAccessSection("ta", "messaging")).toBe(true);
    expect(canAccessSection("ta", "programs")).toBe(false);
    expect(canAccessSection("ta", "settings")).toBe(false);
    expect(getBillingRows("ta")).toEqual([]);
  });

  it("gives TAs support-only permissions inside assigned cohorts", () => {
    expect(canViewFamilyContactBasics("ta")).toBe(true);
    expect(canUpdateSessionChecklists("ta")).toBe(true);
    expect(canStartFamilyThreads("ta")).toBe(true);
    expect(canRunIntakeImports("ta")).toBe(false);
  });

  it("keeps integrations visible to staff but still hides settings", () => {
    expect(canAccessSection("staff", "integrations")).toBe(true);
    expect(canAccessSection("staff", "settings")).toBe(false);
    expect(canViewAllSyncJobs("staff")).toBe(true);
    expect(canRunIntakeImports("staff")).toBe(true);
  });

  it("gives engineer full portal access including settings", () => {
    expect(getVisibleSections("engineer")).toEqual([
      "dashboard",
      "calendar",
      "cohorts",
      "attendance",
      "students",
      "families",
      "programs",
      "academics",
      "messaging",
      "billing",
      "integrations",
      "settings",
    ]);
    expect(canAccessSection("engineer", "settings")).toBe(true);
    expect(canGrantSensitiveAccess("engineer")).toBe(true);
    expect(canPreviewRoles("engineer")).toBe(true);
    expect(canRevokeSessions("engineer")).toBe(true);
    expect(canManageFeatureFlags("engineer")).toBe(true);
  });

  it("keeps admin role changes reserved for engineer", () => {
    expect(canManageRoleTransition("admin", "staff", "ta")).toBe(true);
    expect(canManageRoleTransition("admin", "staff", "admin")).toBe(false);
    expect(canManageRoleTransition("admin", "admin", "staff")).toBe(false);
    expect(canManageRoleTransition("engineer", "admin", "staff")).toBe(true);
    expect(canManageRoleTransition("engineer", "admin", "engineer")).toBe(false);
  });

  it("limits account provisioning and deletion by manager role", () => {
    expect(canProvisionRole("engineer", "admin")).toBe(true);
    expect(canProvisionRole("engineer", "engineer")).toBe(false);
    expect(canProvisionRole("admin", "admin")).toBe(false);
    expect(canProvisionRole("admin", "staff")).toBe(true);
    expect(canSuspendRole("engineer", "admin")).toBe(true);
    expect(canSuspendRole("engineer", "engineer")).toBe(false);
    expect(canSuspendRole("admin", "admin")).toBe(false);
    expect(canSuspendRole("admin", "ta")).toBe(true);
    expect(canDeleteRole("engineer", "admin")).toBe(true);
    expect(canDeleteRole("engineer", "engineer")).toBe(false);
    expect(canDeleteRole("admin", "admin")).toBe(false);
    expect(canDeleteRole("admin", "instructor")).toBe(true);
    expect(canSendPasswordResetForRole("engineer", "admin")).toBe(true);
    expect(canSendPasswordResetForRole("admin", "admin")).toBe(false);
    expect(canSendPasswordResetForRole("admin", "instructor")).toBe(true);
    expect(canManageCohortAssignments("admin", "ta")).toBe(true);
    expect(canManageCohortAssignments("admin", "staff")).toBe(true);
    expect(canManageCohortAssignments("engineer", "instructor")).toBe(true);
  });

  it("gives admin explicit operations controls without engineer-only escalation tools", () => {
    expect(canManageBillingFollowUp("admin")).toBe(true);
    expect(canManageOperationalTasks("admin")).toBe(true);
    expect(canManageSavedViews("admin")).toBe(true);
    expect(canManageAdminAnnouncements("admin")).toBe(true);
    expect(canManageSchedules("admin")).toBe(true);
    expect(canManageBulkOperations("admin")).toBe(true);
    expect(canGrantSensitiveAccess("admin")).toBe(false);
    expect(canPreviewRoles("admin")).toBe(false);
    expect(canRevokeSessions("admin")).toBe(false);
    expect(canManageFeatureFlags("admin")).toBe(false);
  });
});

describe("roster privacy", () => {
  const rosterSource = {
    enrollments: [
      {
        id: "enroll-1",
        studentId: "student-1",
        cohortId: "cohort-1",
        status: "active" as const,
        registeredAt: "2026-03-01",
      },
      {
        id: "enroll-2",
        studentId: "student-2",
        cohortId: "cohort-1",
        status: "active" as const,
        registeredAt: "2026-03-01",
      },
      {
        id: "enroll-3",
        studentId: "student-3",
        cohortId: "cohort-1",
        status: "active" as const,
        registeredAt: "2026-03-01",
      },
    ],
    students: [
      {
        id: "student-1",
        familyId: "family-1",
        firstName: "Ava",
        lastName: "Stone",
        gradeLevel: "11",
        school: "Great Valley",
        targetTest: "SAT" as const,
        focus: "Reading timing",
      },
      {
        id: "student-2",
        familyId: "family-2",
        firstName: "Liam",
        lastName: "Hart",
        gradeLevel: "10",
        school: "Conestoga",
        targetTest: "SAT" as const,
        focus: "Math pacing",
      },
      {
        id: "student-3",
        familyId: "family-3",
        firstName: "Mia",
        lastName: "Chen",
        gradeLevel: "11",
        school: "Radnor",
        targetTest: "SAT" as const,
        focus: "Module accuracy",
      },
    ],
    families: [
      {
        id: "family-1",
        familyName: "Stone",
        guardianNames: ["Jordan Stone"],
        email: "stone.family@intoprep.com",
        phone: "(610) 555-1001",
        preferredCampusId: "campus-real",
        notes: "",
      },
      {
        id: "family-2",
        familyName: "Hart",
        guardianNames: ["Riley Hart"],
        email: "hart.family@intoprep.com",
        phone: "(610) 555-1002",
        preferredCampusId: "campus-real",
        notes: "",
      },
      {
        id: "family-3",
        familyName: "Chen",
        guardianNames: ["Casey Chen"],
        email: "chen.family@intoprep.com",
        phone: "(610) 555-1003",
        preferredCampusId: "campus-real",
        notes: "",
      },
    ],
    assessments: [
      {
        id: "assessment-1",
        cohortId: "cohort-1",
        title: "Saturday benchmark",
        date: "2026-03-14",
        sections: [
          { label: "Reading & Writing", score: 800 },
          { label: "Math", score: 800 },
        ],
      },
    ],
    attendanceRecords: [
      {
        id: "session-1:student-1",
        sessionId: "session-1",
        studentId: "student-1",
        status: "present" as const,
        updatedBy: null,
      },
      {
        id: "session-1:student-2",
        sessionId: "session-1",
        studentId: "student-2",
        status: "tardy" as const,
        updatedBy: null,
      },
      {
        id: "session-1:student-3",
        sessionId: "session-1",
        studentId: "student-3",
        status: "present" as const,
        updatedBy: null,
      },
    ],
    scoreTrends: [
      {
        studentId: "student-1",
        points: [
          { label: "Jan", score: 1380 },
          { label: "Mar", score: 1450 },
        ],
      },
      {
        studentId: "student-2",
        points: [
          { label: "Jan", score: 1310 },
          { label: "Mar", score: 1390 },
        ],
      },
      {
        studentId: "student-3",
        points: [
          { label: "Jan", score: 1400 },
          { label: "Mar", score: 1470 },
        ],
      },
    ],
  };

  const buildRosterContext = (role: "instructor" | "ta") => ({
    ...getPortalContext(role),
    user: {
      id: `test-${role}`,
      name: `Test ${role}`,
      role,
      title: role,
      assignedCohortIds: ["cohort-1"],
    },
    visibleSessions: [
      {
        id: "session-1",
        cohortId: "cohort-1",
        title: "Saturday benchmark",
        startAt: "2026-03-14T08:30:00-04:00",
        endAt: "2026-03-14T11:30:00-04:00",
        mode: "Hybrid" as const,
        roomLabel: "Room A",
      },
    ],
    visibleResults: [
      {
        id: "result-1",
        assessmentId: "assessment-1",
        studentId: "student-1",
        totalScore: 1450,
        sectionScores: [
          { label: "Reading & Writing", score: 710 },
          { label: "Math", score: 740 },
        ],
        deltaFromPrevious: 70,
      },
      {
        id: "result-2",
        assessmentId: "assessment-1",
        studentId: "student-2",
        totalScore: 1390,
        sectionScores: [
          { label: "Reading & Writing", score: 680 },
          { label: "Math", score: 710 },
        ],
        deltaFromPrevious: 80,
      },
      {
        id: "result-3",
        assessmentId: "assessment-1",
        studentId: "student-3",
        totalScore: 1470,
        sectionScores: [
          { label: "Reading & Writing", score: 720 },
          { label: "Math", score: 750 },
        ],
        deltaFromPrevious: 70,
      },
    ],
  });

  it("sanitizes instructor roster data to names plus academic context only", () => {
    const roster = getSessionRosterView("instructor", "session-1", {
      context: buildRosterContext("instructor"),
      source: rosterSource,
    });

    expect(roster).toHaveLength(3);
    expect(roster[0]?.studentName).toBeTruthy();
    expect(roster[0]?.latestAssessment?.totalScore).toBeGreaterThan(0);
    expect(roster[0]?.familyEmail).toBeUndefined();
    expect(roster[0]?.familyPhone).toBeUndefined();
    expect(roster[0]?.school).toBeUndefined();
    expect(roster[0]?.gradeLevel).toBeUndefined();
  });

  it("preserves family contact visibility for TA roster support", () => {
    const roster = getSessionRosterView("ta", "session-1", {
      context: buildRosterContext("ta"),
      source: rosterSource,
    });

    expect(roster[0]?.familyEmail).toContain("@");
    expect(roster[0]?.familyPhone).toContain("(");
    expect(roster[0]?.latestAssessment?.sectionScores.length).toBeGreaterThan(1);
  });
});

describe("sync alerts", () => {
  it("prioritizes sync failures for staff dashboards", () => {
    const alerts = getAlertsFromSyncJobs("staff", [
      {
        id: "sync-forms",
        label: "Google Forms registration import",
        cadence: "Daily around 7:00 AM ET",
        status: "healthy",
        lastRunAt: "2026-03-14T11:00:00+00:00",
        summary: "Healthy.",
      },
      {
        id: "sync-quickbooks",
        label: "QuickBooks invoice snapshot",
        cadence: "Daily around 7:00 AM ET",
        status: "warning",
        lastRunAt: "2026-03-14T11:00:00+00:00",
        summary: "One invoice needs matching.",
      },
      {
        id: "sync-scheduling",
        label: "Scheduling bridge fallback",
        cadence: "Nightly CSV",
        status: "error",
        lastRunAt: "2026-03-14T11:00:00+00:00",
        summary: "Host unavailable.",
      },
    ]);

    expect(alerts.map((alert) => alert.label)).toEqual([
      "Scheduling bridge fallback",
      "QuickBooks invoice snapshot",
    ]);
  });
});
