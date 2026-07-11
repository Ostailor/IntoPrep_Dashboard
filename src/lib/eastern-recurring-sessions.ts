const EASTERN_TIME_ZONE = "America/New_York";
const MAX_COHORT_SESSIONS = 366;
const DAY_IN_MS = 24 * 60 * 60 * 1_000;

const easternParts = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

function easternWallTimeToIso(date: Date, hour: number, minute: number): string {
  const wallAsUtc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    hour,
    minute,
  );
  const parts = Object.fromEntries(
    easternParts.formatToParts(new Date(wallAsUtc))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const easternAtGuessAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const offset = easternAtGuessAsUtc - wallAsUtc;
  return new Date(wallAsUtc - offset).toISOString();
}

export function buildEasternRecurringSessions(input: {
  cadence: string;
  startDate: string;
  endDate: string;
}): Array<{ startAt: string; endAt: string }> {
  const cadence = input.cadence.trim().toUpperCase();
  const weekdays = cadence === "MWF"
    ? new Set([1, 3, 5])
    : cadence === "TTHS"
      ? new Set([2, 4, 6])
      : null;
  if (!weekdays) throw new Error("Class cadence must be MWF or TTHS.");

  const startDate = parseIsoDate(input.startDate);
  const endDate = parseIsoDate(input.endDate);
  if (!startDate || !endDate) {
    throw new Error("Class dates must be valid ISO calendar dates.");
  }
  if (startDate > endDate) {
    throw new Error("Class start date must not be after its end date.");
  }

  const sessions: Array<{ startAt: string; endAt: string }> = [];
  for (
    let timestamp = startDate.getTime();
    timestamp <= endDate.getTime();
    timestamp += DAY_IN_MS
  ) {
    const date = new Date(timestamp);
    if (!weekdays.has(date.getUTCDay())) continue;
    if (sessions.length === MAX_COHORT_SESSIONS) {
      throw new Error(`A cohort cannot plan more than ${MAX_COHORT_SESSIONS} sessions.`);
    }
    sessions.push({
      startAt: easternWallTimeToIso(date, 8, 0),
      endAt: easternWallTimeToIso(date, 15, 30),
    });
  }
  return sessions;
}
