"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Cohort } from "@/lib/domain";

interface AdminSessionCreatePanelProps {
  viewerMode: "preview" | "live" | "live-role-preview";
  cohorts: Cohort[];
}

type SchedulePattern = "single" | "weekly" | "mwf" | "tths" | "six" | "custom";

const weekdayOptions = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

function formatDateTimeLocal(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDateLocal(value: Date) {
  return formatDateTimeLocal(value.toISOString()).slice(0, 10);
}

function getDefaultDateRange() {
  const start = new Date();
  const end = new Date(start);
  end.setDate(start.getDate() + 28);

  return {
    rangeStart: formatDateLocal(start),
    rangeEnd: formatDateLocal(end),
  };
}

function getWeekdaysForPattern(pattern: SchedulePattern, customWeekdays: number[], rangeStart: string) {
  switch (pattern) {
    case "mwf":
      return [1, 3, 5];
    case "tths":
      return [2, 4, 6];
    case "six":
      return [1, 2, 3, 4, 5, 6];
    case "weekly": {
      const startDate = new Date(`${rangeStart}T00:00:00`);
      return [startDate.getDay()];
    }
    case "custom":
      return customWeekdays;
    default:
      return [];
  }
}

function buildRecurringSessions({
  schedulePattern,
  rangeStart,
  rangeEnd,
  startTime,
  endTime,
  customWeekdays,
}: {
  schedulePattern: SchedulePattern;
  rangeStart: string;
  rangeEnd: string;
  startTime: string;
  endTime: string;
  customWeekdays: number[];
}) {
  const weekdays = getWeekdaysForPattern(schedulePattern, customWeekdays, rangeStart);
  const startDate = new Date(`${rangeStart}T00:00:00`);
  const endDate = new Date(`${rangeEnd}T00:00:00`);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("Recurring start and end dates are required.");
  }

  if (startDate > endDate) {
    throw new Error("Recurring end date must be on or after the start date.");
  }

  if (weekdays.length === 0) {
    throw new Error("Choose at least one weekday for the schedule.");
  }

  const sessions: Array<{ startAt: string; endAt: string }> = [];
  const cursor = new Date(startDate);

  while (cursor <= endDate) {
    if (weekdays.includes(cursor.getDay())) {
      const datePart = formatDateLocal(cursor);
      const startAt = new Date(`${datePart}T${startTime}`);
      const endAt = new Date(`${datePart}T${endTime}`);

      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        throw new Error("Recurring start and end times are required.");
      }

      if (startAt >= endAt) {
        throw new Error("Recurring end time must be after the start time.");
      }

      sessions.push({
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      });
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  if (sessions.length === 0) {
    throw new Error("No sessions match the selected dates and weekdays.");
  }

  if (sessions.length > 120) {
    throw new Error("Narrow the date range to 120 sessions or fewer.");
  }

  return sessions;
}

function getDefaultSessionWindow() {
  const start = new Date();
  start.setHours(16, 0, 0, 0);
  const end = new Date(start);
  end.setHours(17, 0, 0, 0);

  return {
    startAt: formatDateTimeLocal(start.toISOString()),
    endAt: formatDateTimeLocal(end.toISOString()),
  };
}

export function AdminSessionCreatePanel({ viewerMode, cohorts }: AdminSessionCreatePanelProps) {
  const router = useRouter();
  const readOnly = viewerMode === "live-role-preview";
  const sortedCohorts = useMemo(
    () => [...cohorts].sort((left, right) => left.name.localeCompare(right.name)),
    [cohorts],
  );
  const defaultCohort = sortedCohorts[0];
  const defaultWindow = useMemo(() => getDefaultSessionWindow(), []);
  const defaultRange = useMemo(() => getDefaultDateRange(), []);
  const [formState, setFormState] = useState(() => ({
    cohortId: defaultCohort?.id ?? "",
    title: "",
    startAt: defaultWindow.startAt,
    endAt: defaultWindow.endAt,
    mode: "Hybrid",
    roomLabel: defaultCohort?.roomLabel ?? "",
    schedulePattern: "single" as SchedulePattern,
    rangeStart: defaultRange.rangeStart,
    rangeEnd: defaultRange.rangeEnd,
    startTime: "16:00",
    endTime: "17:00",
    customWeekdays: [1, 3, 5] as number[],
  }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [warningMessages, setWarningMessages] = useState<string[]>([]);

  const selectedCohort = sortedCohorts.find((cohort) => cohort.id === formState.cohortId);
  const recurringPreviewCount = useMemo(() => {
    if (formState.schedulePattern === "single") {
      return 1;
    }

    try {
      return buildRecurringSessions(formState).length;
    } catch {
      return 0;
    }
  }, [formState]);

  const handleCreate = (force = false) => {
    if (readOnly) {
      setError("Role preview is read-only.");
      setSuccess(null);
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);
    if (!force) {
      setWarningMessages([]);
    }

    startTransition(async () => {
      try {
        const recurringSessions =
          formState.schedulePattern === "single" ? [] : buildRecurringSessions(formState);
        const startDate = new Date(formState.startAt);
        const endDate = new Date(formState.endAt);

        if (
          formState.schedulePattern === "single" &&
          (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()))
        ) {
          throw new Error("Session start and end times are required.");
        }

        const response = await fetch("/api/admin/sessions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cohortId: formState.cohortId,
            title: formState.title,
            mode: formState.mode,
            roomLabel: formState.roomLabel,
            startAt: formState.schedulePattern === "single" ? startDate.toISOString() : undefined,
            endAt: formState.schedulePattern === "single" ? endDate.toISOString() : undefined,
            sessions: formState.schedulePattern === "single" ? undefined : recurringSessions,
            force,
          }),
        });
        const payload = (await response.json()) as {
          error?: string;
          warnings?: string[];
          created?: boolean;
          createdCount?: number;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Session create failed.");
        }

        if (!force && payload.created === false && payload.warnings && payload.warnings.length > 0) {
          setWarningMessages(payload.warnings);
          return;
        }

        const nextWindow = getDefaultSessionWindow();
        setSuccess(
          `Created ${payload.createdCount ?? recurringPreviewCount} instruction session${(payload.createdCount ?? recurringPreviewCount) === 1 ? "" : "s"}.`,
        );
        setWarningMessages([]);
        setFormState((current) => ({
          ...current,
          title: "",
          startAt: nextWindow.startAt,
          endAt: nextWindow.endAt,
        }));
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Session create failed.");
      } finally {
        setPending(false);
      }
    });
  };

  return (
    <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
      <div className="section-kicker">Create session</div>
      <h3 className="display-font mt-2 text-2xl text-[color:var(--navy-strong)]">
        Add instruction to the calendar
      </h3>
      <p className="mt-2 text-sm text-[color:var(--muted)]">
        New sessions inherit the selected cohort demo/main partition and appear on the calendar after save.
      </p>

      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-100/90 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-100/90 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      ) : null}
      {warningMessages.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-100/90 px-4 py-3 text-sm text-amber-900">
          <div className="font-semibold">Review before creating.</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {warningMessages.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
            Cohort
          </span>
          <select
            value={formState.cohortId}
            onChange={(event) => {
              const cohortId = event.currentTarget.value;
              const cohort = sortedCohorts.find((item) => item.id === cohortId);
              setFormState((current) => ({
                ...current,
                cohortId,
                roomLabel: cohort?.roomLabel ?? "",
              }));
            }}
            className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            disabled={readOnly || sortedCohorts.length === 0}
          >
            {sortedCohorts.length === 0 ? <option value="">No cohorts available</option> : null}
            {sortedCohorts.map((cohort) => (
              <option key={cohort.id} value={cohort.id}>
                {cohort.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
            Session title
          </span>
          <input
            value={formState.title}
            onChange={(event) => {
              const title = event.currentTarget.value;
              setFormState((current) => ({ ...current, title }));
            }}
            className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            placeholder="Example: SAT Math strategy"
            disabled={readOnly}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
            Schedule pattern
          </span>
          <select
            value={formState.schedulePattern}
            onChange={(event) => {
              const schedulePattern = event.currentTarget.value as SchedulePattern;
              setFormState((current) => ({
                ...current,
                schedulePattern,
              }));
            }}
            className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            disabled={readOnly}
          >
            <option value="single">One session</option>
            <option value="weekly">Weekly on range start day</option>
            <option value="mwf">Monday / Wednesday / Friday</option>
            <option value="tths">Tuesday / Thursday / Saturday</option>
            <option value="six">Monday through Saturday intensive</option>
            <option value="custom">Custom weekdays</option>
          </select>
        </label>

        {formState.schedulePattern === "single" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Start
              </span>
              <input
                value={formState.startAt}
                onChange={(event) => {
                  const startAt = event.currentTarget.value;
                  setFormState((current) => ({ ...current, startAt }));
                }}
                type="datetime-local"
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                disabled={readOnly}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                End
              </span>
              <input
                value={formState.endAt}
                onChange={(event) => {
                  const endAt = event.currentTarget.value;
                  setFormState((current) => ({ ...current, endAt }));
                }}
                type="datetime-local"
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                disabled={readOnly}
              />
            </label>
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-stone-50/80 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  First date
                </span>
                <input
                  value={formState.rangeStart}
                  onChange={(event) => {
                    const rangeStart = event.currentTarget.value;
                    setFormState((current) => ({ ...current, rangeStart }));
                  }}
                  onInput={(event) => {
                    const rangeStart = event.currentTarget.value;
                    setFormState((current) => ({ ...current, rangeStart }));
                  }}
                  type="date"
                  className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                  disabled={readOnly}
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  Last date
                </span>
                <input
                  value={formState.rangeEnd}
                  onChange={(event) => {
                    const rangeEnd = event.currentTarget.value;
                    setFormState((current) => ({ ...current, rangeEnd }));
                  }}
                  onInput={(event) => {
                    const rangeEnd = event.currentTarget.value;
                    setFormState((current) => ({ ...current, rangeEnd }));
                  }}
                  type="date"
                  className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                  disabled={readOnly}
                />
              </label>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  Start time
                </span>
                <input
                  value={formState.startTime}
                  onChange={(event) => {
                    const startTime = event.currentTarget.value;
                    setFormState((current) => ({ ...current, startTime }));
                  }}
                  onInput={(event) => {
                    const startTime = event.currentTarget.value;
                    setFormState((current) => ({ ...current, startTime }));
                  }}
                  type="time"
                  className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                  disabled={readOnly}
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  End time
                </span>
                <input
                  value={formState.endTime}
                  onChange={(event) => {
                    const endTime = event.currentTarget.value;
                    setFormState((current) => ({ ...current, endTime }));
                  }}
                  onInput={(event) => {
                    const endTime = event.currentTarget.value;
                    setFormState((current) => ({ ...current, endTime }));
                  }}
                  type="time"
                  className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                  disabled={readOnly}
                />
              </label>
            </div>
            {formState.schedulePattern === "custom" ? (
              <div className="mt-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  Meeting days
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {weekdayOptions.map((day) => {
                    const checked = formState.customWeekdays.includes(day.value);
                    return (
                      <label
                        key={day.value}
                        className="flex items-center gap-2 rounded-full border border-[color:var(--line)] bg-white px-3 py-2 text-xs font-semibold text-[color:var(--navy-strong)]"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const isChecked = event.currentTarget.checked;
                            const nextWeekdays = isChecked
                              ? [...formState.customWeekdays, day.value]
                              : formState.customWeekdays.filter((value) => value !== day.value);
                            setFormState((current) => ({
                              ...current,
                              customWeekdays: [...new Set(nextWeekdays)].sort(),
                            }));
                          }}
                          disabled={readOnly}
                        />
                        <span>{day.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="mt-3 rounded-2xl border border-[rgba(115,138,123,0.22)] bg-[rgba(115,138,123,0.12)] px-4 py-3 text-sm text-[color:var(--sage)]">
              This will create {recurringPreviewCount} calendar session
              {recurringPreviewCount === 1 ? "" : "s"} in the selected date range.
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Mode
            </span>
            <select
              value={formState.mode}
              onChange={(event) => {
                const mode = event.currentTarget.value;
                setFormState((current) => ({ ...current, mode }));
              }}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              disabled={readOnly}
            >
              <option value="In person">In person</option>
              <option value="Hybrid">Hybrid</option>
              <option value="Zoom">Zoom</option>
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Room
            </span>
            <input
              value={formState.roomLabel}
              onChange={(event) => {
                const roomLabel = event.currentTarget.value;
                setFormState((current) => ({ ...current, roomLabel }));
              }}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder={selectedCohort?.roomLabel ?? "Room or Zoom label"}
              disabled={readOnly}
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => handleCreate(warningMessages.length > 0)}
          disabled={pending || readOnly || !formState.cohortId}
          className="w-full rounded-full bg-[color:var(--navy-strong)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending
            ? "Creating..."
            : readOnly
              ? "Preview only"
              : warningMessages.length > 0
                ? "Create anyway"
                : "Create session"}
        </button>
      </div>
    </section>
  );
}
