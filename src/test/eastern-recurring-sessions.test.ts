import { describe, expect, it } from "vitest";
import { buildEasternRecurringSessions } from "@/lib/eastern-recurring-sessions";

describe("buildEasternRecurringSessions", () => {
  it("keeps 08:00-15:30 Eastern stable across the spring DST boundary", () => {
    expect(buildEasternRecurringSessions({
      cadence: "MWF",
      startDate: "2026-03-06",
      endDate: "2026-03-11",
    })).toEqual([
      { startAt: "2026-03-06T13:00:00.000Z", endAt: "2026-03-06T20:30:00.000Z" },
      { startAt: "2026-03-09T12:00:00.000Z", endAt: "2026-03-09T19:30:00.000Z" },
      { startAt: "2026-03-11T12:00:00.000Z", endAt: "2026-03-11T19:30:00.000Z" },
    ]);
  });

  it("uses Tuesday, Thursday, and Saturday for normalized TTHS cadence", () => {
    expect(buildEasternRecurringSessions({
      cadence: "  tths  ",
      startDate: "2026-07-07",
      endDate: "2026-07-11",
    })).toEqual([
      { startAt: "2026-07-07T12:00:00.000Z", endAt: "2026-07-07T19:30:00.000Z" },
      { startAt: "2026-07-09T12:00:00.000Z", endAt: "2026-07-09T19:30:00.000Z" },
      { startAt: "2026-07-11T12:00:00.000Z", endAt: "2026-07-11T19:30:00.000Z" },
    ]);
  });

  it("rejects an unsupported cadence", () => {
    expect(() => buildEasternRecurringSessions({
      cadence: "WEEKEND",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    })).toThrow("Class cadence must be MWF or TTHS.");
  });

  it("rejects invalid or reversed calendar ranges", () => {
    expect(() => buildEasternRecurringSessions({
      cadence: "MWF",
      startDate: "2026-02-30",
      endDate: "2026-03-02",
    })).toThrow("Class dates must be valid ISO calendar dates.");
    expect(() => buildEasternRecurringSessions({
      cadence: "MWF",
      startDate: "2026-03-03",
      endDate: "2026-03-02",
    })).toThrow("Class start date must not be after its end date.");
  });

  it("caps a single cohort recurrence at 366 sessions", () => {
    expect(() => buildEasternRecurringSessions({
      cadence: "MWF",
      startDate: "2026-01-01",
      endDate: "2029-01-01",
    })).toThrow("A cohort cannot plan more than 366 sessions.");
  });
});
