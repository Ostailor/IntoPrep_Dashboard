import { describe, expect, it } from "vitest";
import type { PortalContext } from "@/lib/portal";
import { buildVisibleSessionRosterMaps } from "@/lib/session-rosters";

const context = {
  currentDate: "2026-07-11",
  user: {
    id: "admin-1",
    name: "Admin User",
    role: "admin",
    title: "Administrator",
    assignedCohortIds: [],
  },
  visibleSections: ["attendance"],
  visiblePrograms: [],
  visibleCampuses: [],
  visibleTerms: [],
  visibleUsers: [],
  visibleCohorts: [],
  visibleSessions: [
    {
      id: "session-1",
      cohortId: "cohort-1",
      title: "Session One",
      startAt: "2026-07-11T09:00:00-04:00",
      endAt: "2026-07-11T12:00:00-04:00",
      mode: "Hybrid",
      roomLabel: "Room A",
    },
    {
      id: "session-2",
      cohortId: "cohort-1",
      title: "Session Two",
      startAt: "2026-07-18T09:00:00-04:00",
      endAt: "2026-07-18T12:00:00-04:00",
      mode: "Hybrid",
      roomLabel: "Room A",
    },
  ],
  visibleSessionInstructionBlocks: [],
  visibleEnrollments: [
    {
      id: "enrollment-grace",
      studentId: "student-grace",
      cohortId: "cohort-1",
      status: "active",
      registeredAt: "2026-06-01",
    },
    {
      id: "enrollment-inactive",
      studentId: "student-inactive",
      cohortId: "cohort-1",
      status: "waitlist",
      registeredAt: "2026-06-02",
    },
    {
      id: "enrollment-ada",
      studentId: "student-ada",
      cohortId: "cohort-1",
      status: "active",
      registeredAt: "2026-06-03",
    },
  ],
  visibleStudents: [
    {
      id: "student-grace",
      familyId: "family-grace",
      firstName: "Grace",
      lastName: "Two",
      gradeLevel: "11",
      school: "North High",
      targetTest: "SAT",
      focus: "Math",
      customFields: {},
      demo: false,
    },
    {
      id: "student-inactive",
      familyId: "family-inactive",
      firstName: "Alan",
      lastName: "Waitlist",
      gradeLevel: "10",
      school: "West High",
      targetTest: "SAT",
      focus: "Reading",
      customFields: {},
      demo: false,
    },
    {
      id: "student-ada",
      familyId: "family-ada",
      firstName: "Ada",
      lastName: "One",
      gradeLevel: "12",
      school: "Central High",
      targetTest: "SAT",
      focus: "Reading",
      customFields: {},
      demo: false,
    },
  ],
  visibleFamilies: [
    {
      id: "family-grace",
      familyName: "Two",
      guardianNames: ["Guardian Two"],
      email: "grace-family@example.com",
      phone: "555-0002",
      preferredCampusId: "campus-1",
      notes: "",
    },
    {
      id: "family-inactive",
      familyName: "Waitlist",
      guardianNames: ["Guardian Waitlist"],
      email: "waitlist-family@example.com",
      phone: "555-0003",
      preferredCampusId: "campus-1",
      notes: "",
    },
    {
      id: "family-ada",
      familyName: "One",
      guardianNames: ["Guardian One"],
      email: "ada-family@example.com",
      phone: "555-0001",
      preferredCampusId: "campus-1",
      notes: "",
    },
  ],
  visibleAssessments: [
    {
      id: "assessment-old",
      cohortId: "cohort-1",
      title: "Older Practice Test",
      date: "2026-07-03",
      sections: [],
    },
    {
      id: "assessment-new",
      cohortId: "cohort-1",
      title: "Newer Practice Test",
      date: "2026-07-10",
      sections: [],
    },
  ],
  visibleResults: [
    {
      id: "result-old",
      assessmentId: "assessment-old",
      studentId: "student-ada",
      totalScore: 1400,
      sectionScores: [{ label: "Math", score: 700 }],
      deltaFromPrevious: 20,
      notes: "Older note",
    },
    {
      id: "result-new",
      assessmentId: "assessment-new",
      studentId: "student-ada",
      totalScore: 1450,
      sectionScores: [{ label: "Math", score: 730 }],
      deltaFromPrevious: 50,
      notes: "Newer note",
    },
  ],
  visibleInvoices: [],
  visibleThreads: [],
  visibleLeads: [],
  visibleSyncJobs: [],
  visibleImportRuns: [],
} satisfies PortalContext;

describe("buildVisibleSessionRosterMaps", () => {
  it("reuses one sorted active cohort roster while preserving role-based fields", () => {
    const maps = buildVisibleSessionRosterMaps("admin", context);

    expect(Object.keys(maps)).toEqual(["session-1", "session-2"]);
    expect(maps["session-1"].map((row) => row.studentName)).toEqual([
      "Ada One",
      "Grace Two",
    ]);
    expect(maps["session-1"][0]?.practiceTests?.map((test) => test.date)).toEqual([
      "2026-07-10",
      "2026-07-03",
    ]);
    expect(maps["session-1"][0]).toMatchObject({
      gradeLevel: "12",
      school: "Central High",
      familyEmail: "ada-family@example.com",
      familyPhone: "555-0001",
    });
    expect(maps["session-1"]).toEqual(maps["session-2"]);
    expect(maps["session-1"]).toBe(maps["session-2"]);

    const instructorRows = buildVisibleSessionRosterMaps("instructor", context)["session-1"];

    expect(instructorRows[0]).toMatchObject({
      studentName: "Ada One",
      gradeLevel: undefined,
      school: undefined,
      familyEmail: undefined,
      familyPhone: undefined,
    });
  });
});
