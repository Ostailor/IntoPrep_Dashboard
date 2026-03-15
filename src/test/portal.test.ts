import { describe, expect, it } from "vitest";
import {
  canAccessSection,
  canManageCohortAssignments,
  canDeleteRole,
  canGrantSensitiveAccess,
  canManageFeatureFlags,
  canManageRoleTransition,
  canPreviewRoles,
  canProvisionRole,
  canRevokeSessions,
  canSendPasswordResetForRole,
  canSuspendRole,
  canViewAllSyncJobs,
  getVisibleSections,
} from "@/lib/permissions";
import { getAlertsFromSyncJobs, getBillingRows, getSectionFallback, getSessionRosterView } from "@/lib/portal";

describe("permission matrix", () => {
  it("keeps instructor navigation limited to teaching surfaces", () => {
    expect(getVisibleSections("instructor")).toEqual([
      "dashboard",
      "calendar",
      "cohorts",
      "attendance",
    ]);
    expect(canAccessSection("instructor", "academics")).toBe(false);
    expect(getSectionFallback("instructor")).toBe("dashboard");
  });

  it("blocks billing for TAs while leaving student-facing support surfaces open", () => {
    expect(canAccessSection("ta", "billing")).toBe(false);
    expect(canAccessSection("ta", "messaging")).toBe(true);
    expect(getBillingRows("ta")).toEqual([]);
  });

  it("keeps integrations visible to staff but still hides settings", () => {
    expect(canAccessSection("staff", "integrations")).toBe(true);
    expect(canAccessSection("staff", "settings")).toBe(false);
    expect(canViewAllSyncJobs("staff")).toBe(true);
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
    expect(canManageCohortAssignments("admin", "staff")).toBe(false);
    expect(canManageCohortAssignments("engineer", "instructor")).toBe(true);
  });
});

describe("roster privacy", () => {
  it("sanitizes instructor roster data to names plus academic context only", () => {
    const roster = getSessionRosterView("instructor", "session-sat-mock");

    expect(roster).toHaveLength(3);
    expect(roster[0]?.studentName).toBeTruthy();
    expect(roster[0]?.latestAssessment?.totalScore).toBeGreaterThan(0);
    expect(roster[0]?.familyEmail).toBeUndefined();
    expect(roster[0]?.familyPhone).toBeUndefined();
    expect(roster[0]?.school).toBeUndefined();
    expect(roster[0]?.gradeLevel).toBeUndefined();
  });

  it("preserves family contact visibility for TA roster support", () => {
    const roster = getSessionRosterView("ta", "session-sat-mock");

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
