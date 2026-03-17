"use client";

import { startTransition, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import type {
  AdminSavedView,
  CapacityForecastRow,
  Cohort,
  Enrollment,
  Session,
  Student,
  User,
} from "@/lib/domain";

interface AdminCohortOperationsPanelProps {
  viewerMode: "preview" | "live" | "live-role-preview";
  cohorts: Cohort[];
  archivedCohorts: Cohort[];
  sessions: Session[];
  students: Student[];
  enrollments: Enrollment[];
  users: User[];
  forecastRows: CapacityForecastRow[];
  savedViews: AdminSavedView[];
}

function formatDateTimeLocal(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function AdminCohortOperationsPanel({
  viewerMode,
  cohorts,
  archivedCohorts,
  sessions,
  students,
  enrollments,
  users,
  forecastRows,
  savedViews,
}: AdminCohortOperationsPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const readOnly = viewerMode === "live-role-preview";
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const forecastFilter = searchParams.get("forecast") ?? "all";
  const sortedCohorts = useMemo(
    () => [...cohorts].sort((left, right) => left.name.localeCompare(right.name)),
    [cohorts],
  );
  const defaultCohort = sortedCohorts[0];
  const [selectedCohortId, setSelectedCohortId] = useState(defaultCohort?.id ?? "");
  const cohort = sortedCohorts.find((item) => item.id === selectedCohortId) ?? defaultCohort;
  const scopedSessions = useMemo(
    () => sessions.filter((session) => session.cohortId === selectedCohortId),
    [selectedCohortId, sessions],
  );
  const defaultSession = scopedSessions[0];
  const [selectedSessionId, setSelectedSessionId] = useState(defaultSession?.id ?? "");
  const selectedSession =
    scopedSessions.find((session) => session.id === selectedSessionId) ?? defaultSession;
  const [formState, setFormState] = useState(() => ({
    capacity: String(defaultCohort?.capacity ?? 0),
    cadence: defaultCohort?.cadence ?? "",
    roomLabel: defaultCohort?.roomLabel ?? "",
    leadInstructorId: defaultCohort?.leadInstructorId ?? "",
    sessionTitle: defaultSession?.title ?? "",
    sessionStartAt: defaultSession ? formatDateTimeLocal(defaultSession.startAt) : "",
    sessionEndAt: defaultSession ? formatDateTimeLocal(defaultSession.endAt) : "",
    sessionMode: defaultSession?.mode ?? "Hybrid",
    sessionRoomLabel: defaultSession?.roomLabel ?? defaultCohort?.roomLabel ?? "",
  }));
  const [bulkMoveState, setBulkMoveState] = useState({
    sourceCohortId: defaultCohort?.id ?? "",
    targetCohortId: sortedCohorts[1]?.id ?? defaultCohort?.id ?? "",
    studentIds: [] as string[],
  });
  const [bulkCoverageState, setBulkCoverageState] = useState({
    cohortId: defaultCohort?.id ?? "",
    userIds: [] as string[],
  });
  const [bulkAttendanceState, setBulkAttendanceState] = useState({
    cohortId: defaultCohort?.id ?? "",
    studentIds: [] as string[],
    dueAt: "",
  });
  const forecastSavedViews = useMemo(
    () => savedViews.filter((view) => view.section === "cohorts"),
    [savedViews],
  );
  const visibleForecastRows = useMemo(
    () =>
      forecastRows.filter((row) =>
        forecastFilter === "all" ? true : row.state === forecastFilter,
      ),
    [forecastFilter, forecastRows],
  );
  const instructorOptions = users.filter((user) => user.role === "instructor");
  const coverageOptions = users.filter(
    (user) => user.role === "staff" || user.role === "ta" || user.role === "instructor",
  );
  const sourceStudents = useMemo(() => {
    const sourceIds = enrollments
      .filter(
        (enrollment) =>
          enrollment.cohortId === bulkMoveState.sourceCohortId && enrollment.status === "active",
      )
      .map((enrollment) => enrollment.studentId);
    return students.filter((student) => sourceIds.includes(student.id));
  }, [bulkMoveState.sourceCohortId, enrollments, students]);
  const attendanceStudents = useMemo(() => {
    const targetIds = enrollments
      .filter(
        (enrollment) =>
          enrollment.cohortId === bulkAttendanceState.cohortId &&
          enrollment.status === "active",
      )
      .map((enrollment) => enrollment.studentId);
    return students.filter((student) => targetIds.includes(student.id));
  }, [bulkAttendanceState.cohortId, enrollments, students]);

  const updateFilters = (next: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([key, value]) => {
      if (value === "all") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    router.replace(`${pathname}${params.size > 0 ? `?${params.toString()}` : ""}`);
  };

  const saveView = () => {
    if (readOnly) {
      setError("Role preview is read-only.");
      setSuccess(null);
      return;
    }

    const name = window.prompt("Name this cohort view:");
    if (!name) {
      return;
    }

    setPendingKey("save-view");
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/views", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            section: "cohorts",
            filterState: {
              forecast: forecastFilter,
            },
          }),
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Saved view failed.");
        }
        setSuccess("Cohort view saved.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Saved view failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const handleCohortSave = (force = false) => {
    if (!cohort) {
      return;
    }

    if (readOnly) {
      setError("Role preview is read-only.");
      setSuccess(null);
      return;
    }

    setPendingKey("cohort");
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/cohorts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cohortId: cohort.id,
            capacity: Number(formState.capacity),
            cadence: formState.cadence,
            roomLabel: formState.roomLabel,
            leadInstructorId: formState.leadInstructorId || null,
            sessionId: selectedSession?.id ?? null,
            sessionTitle: formState.sessionTitle,
            sessionStartAt: formState.sessionStartAt
              ? new Date(formState.sessionStartAt).toISOString()
              : null,
            sessionEndAt: formState.sessionEndAt
              ? new Date(formState.sessionEndAt).toISOString()
              : null,
            sessionMode: formState.sessionMode,
            sessionRoomLabel: formState.sessionRoomLabel,
            force,
          }),
        });
        const payload = (await response.json()) as {
          error?: string;
          warnings?: string[];
          updated?: boolean;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Cohort update failed.");
        }

        if (payload.updated === false && payload.warnings && payload.warnings.length > 0) {
          const confirmed = window.confirm(
            `Save with warnings?\n\n${payload.warnings.join("\n")}`,
          );

          if (confirmed) {
            handleCohortSave(true);
          }
          return;
        }

        setSuccess("Cohort and session details updated.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Cohort update failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const runBulkOperation = async (
    body: Record<string, unknown>,
    successMessage: string,
  ) => {
    const response = await fetch("/api/admin/cohorts/bulk", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      throw new Error(payload.error ?? "Bulk operation failed.");
    }

    setSuccess(successMessage);
    setPendingKey(null);
    router.refresh();
  };

  const handleArchiveState = (targetId: string, archived: boolean) => {
    if (readOnly) {
      setError("Role preview is read-only.");
      setSuccess(null);
      return;
    }

    setPendingKey(`archive-${targetId}`);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/archive", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            targetType: "cohort",
            targetId,
            archived,
          }),
        });
        const payload = (await response.json()) as { error?: string; label?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Archive update failed.");
        }

        setSuccess(`${payload.label ?? "Cohort"} ${archived ? "archived" : "restored"}.`);
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Archive update failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-[1.5rem] border border-rose-200 bg-rose-100/90 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-100/90 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      ) : null}

      <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
        <div className="section-kicker">Capacity forecasting</div>
        <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
          Rebalance before it becomes urgent
        </h3>
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Forecast filter
            </span>
            <span className="text-sm text-[color:var(--muted)]">
              Switch between all cohorts, near-full groups, and underfilled groups.
            </span>
            <select
              value={forecastFilter}
              onChange={(event) => updateFilters({ forecast: event.currentTarget.value })}
              className="rounded-full border border-[color:var(--line)] bg-white px-4 py-2 text-sm text-[color:var(--navy-strong)]"
            >
              <option value="all">All cohorts</option>
              <option value="near_full">Near full</option>
              <option value="underfilled">Underfilled</option>
              <option value="balanced">Balanced</option>
            </select>
          </label>
          <button
            type="button"
            onClick={saveView}
            disabled={pendingKey === "save-view" || readOnly}
            className="rounded-full border border-[color:var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--navy-strong)]"
          >
            Save current view
          </button>
          {forecastSavedViews.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => {
                const nextForecast = String(view.filterState.forecast ?? "all");
                updateFilters({ forecast: nextForecast });
              }}
              className="rounded-full border border-[color:var(--line)] bg-white/80 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]"
            >
              {view.name}
            </button>
          ))}
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleForecastRows.map((row) => (
            <div
              key={row.cohortId}
              className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                  {row.cohortName}
                </div>
                <div className="rounded-full border border-[color:var(--line)] bg-stone-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  {row.fillRate}% full
                </div>
              </div>
              <div className="mt-2 text-sm text-[color:var(--muted)]">{row.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
        <div className="section-kicker">Cohort editor</div>
        <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
          Schedule, rooming, and lead coverage
        </h3>
        <div className="mt-5 rounded-[1.5rem] border border-[color:var(--line)] bg-stone-50/80 px-4 py-3 text-sm text-[color:var(--muted)]">
          Cohort capacity is the max active roster size. Cadence is the meeting pattern. Room label
          is the default location for the cohort, while session room label is the location override
          for the selected session below.
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Cohort
            </span>
            <span className="text-sm text-[color:var(--muted)]">
              Pick the cohort you want to edit.
            </span>
            <select
              value={selectedCohortId}
              onChange={(event) => {
                const nextId = event.currentTarget.value;
                const nextCohort = sortedCohorts.find((item) => item.id === nextId);
                const nextSession = sessions.find((session) => session.cohortId === nextId);
                setSelectedCohortId(nextId);
                setSelectedSessionId(nextSession?.id ?? "");
                setFormState({
                  capacity: String(nextCohort?.capacity ?? 0),
                  cadence: nextCohort?.cadence ?? "",
                  roomLabel: nextCohort?.roomLabel ?? "",
                  leadInstructorId: nextCohort?.leadInstructorId ?? "",
                  sessionTitle: nextSession?.title ?? "",
                  sessionStartAt: nextSession ? formatDateTimeLocal(nextSession.startAt) : "",
                  sessionEndAt: nextSession ? formatDateTimeLocal(nextSession.endAt) : "",
                  sessionMode: nextSession?.mode ?? "Hybrid",
                  sessionRoomLabel: nextSession?.roomLabel ?? nextCohort?.roomLabel ?? "",
                });
              }}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            >
              <option value="">Choose a cohort</option>
              {sortedCohorts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Session
            </span>
            <span className="text-sm text-[color:var(--muted)]">
              Choose the specific session to adjust under the selected cohort.
            </span>
            <select
              value={selectedSessionId}
              onChange={(event) => {
                const nextId = event.currentTarget.value;
                const nextSession = scopedSessions.find((session) => session.id === nextId);
                setSelectedSessionId(nextId);
                setFormState((current) => ({
                  ...current,
                  sessionTitle: nextSession?.title ?? "",
                  sessionStartAt: nextSession ? formatDateTimeLocal(nextSession.startAt) : "",
                  sessionEndAt: nextSession ? formatDateTimeLocal(nextSession.endAt) : "",
                  sessionMode: nextSession?.mode ?? "Hybrid",
                  sessionRoomLabel: nextSession?.roomLabel ?? current.roomLabel,
                }));
              }}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            >
              <option value="">Choose a session</option>
              {scopedSessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Lead instructor
            </span>
            <span className="text-sm text-[color:var(--muted)]">
              Set the instructor primarily responsible for this cohort.
            </span>
            <select
              value={formState.leadInstructorId}
              onChange={(event) => {
                const leadInstructorId = event.currentTarget.value;
                setFormState((current) => ({ ...current, leadInstructorId }));
              }}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            >
              <option value="">Lead instructor</option>
              {instructorOptions.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Capacity
            </span>
            <span className="text-sm text-[color:var(--muted)]">
              Max number of active students allowed in this cohort.
            </span>
            <input
              value={formState.capacity}
              onChange={(event) => {
                const capacity = event.currentTarget.value;
                setFormState((current) => ({ ...current, capacity }));
              }}
              type="number"
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="Example: 12 students"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Cadence
            </span>
            <span className="text-sm text-[color:var(--muted)]">
              Describe the regular meeting pattern for this cohort.
            </span>
            <input
              value={formState.cadence}
              onChange={(event) => {
                const cadence = event.currentTarget.value;
                setFormState((current) => ({ ...current, cadence }));
              }}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="Example: Mondays and Wednesdays"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Cohort room label
            </span>
            <span className="text-sm text-[color:var(--muted)]">
              Default room or campus label used for the cohort.
            </span>
            <input
              value={formState.roomLabel}
              onChange={(event) => {
                const roomLabel = event.currentTarget.value;
                setFormState((current) => ({ ...current, roomLabel }));
              }}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="Example: Malvern Room B"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Session title
            </span>
            <span className="text-sm text-[color:var(--muted)]">
              Name the selected session the way staff and families should recognize it.
            </span>
            <input
              value={formState.sessionTitle}
              onChange={(event) => {
                const sessionTitle = event.currentTarget.value;
                setFormState((current) => ({ ...current, sessionTitle }));
              }}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="Example: Digital SAT Tuesday session"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Session start
            </span>
            <span className="text-sm text-[color:var(--muted)]">
              Start time for the selected session.
            </span>
            <input
              value={formState.sessionStartAt}
              onChange={(event) => {
                const sessionStartAt = event.currentTarget.value;
                setFormState((current) => ({ ...current, sessionStartAt }));
              }}
              type="datetime-local"
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Session end
            </span>
            <span className="text-sm text-[color:var(--muted)]">
              End time for the selected session.
            </span>
            <input
              value={formState.sessionEndAt}
              onChange={(event) => {
                const sessionEndAt = event.currentTarget.value;
                setFormState((current) => ({ ...current, sessionEndAt }));
              }}
              type="datetime-local"
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Session mode
            </span>
            <span className="text-sm text-[color:var(--muted)]">
              Choose whether the session is in person, hybrid, or Zoom.
            </span>
            <select
              value={formState.sessionMode}
              onChange={(event) => {
                const sessionMode = event.currentTarget.value as
                  | "In person"
                  | "Hybrid"
                  | "Zoom";
                setFormState((current) => ({ ...current, sessionMode }));
              }}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            >
              <option value="In person">In person</option>
              <option value="Hybrid">Hybrid</option>
              <option value="Zoom">Zoom</option>
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Session room label
            </span>
            <span className="text-sm text-[color:var(--muted)]">
              Override the default cohort room for this specific session if needed.
            </span>
            <input
              value={formState.sessionRoomLabel}
              onChange={(event) => {
                const sessionRoomLabel = event.currentTarget.value;
                setFormState((current) => ({ ...current, sessionRoomLabel }));
              }}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="Example: Zoom Room 2 or UPenn Lab 1"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => handleCohortSave(false)}
            disabled={pendingKey === "cohort" || readOnly || !cohort}
            className={clsx(
              "rounded-full px-4 py-2 text-sm font-semibold text-white",
              pendingKey === "cohort" || readOnly
                ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
                : "bg-[color:var(--navy-strong)] hover:opacity-90",
            )}
          >
            {pendingKey === "cohort" ? "Saving..." : readOnly ? "Preview only" : "Save cohort updates"}
          </button>
          {cohort ? (
            <button
              type="button"
              onClick={() => handleArchiveState(cohort.id, true)}
              disabled={pendingKey === `archive-${cohort.id}` || readOnly}
              className={clsx(
                "rounded-full border px-4 py-2 text-sm font-semibold",
                pendingKey === `archive-${cohort.id}` || readOnly
                  ? "cursor-not-allowed border-[color:var(--line)] bg-stone-100 text-[color:var(--muted)]"
                  : "border-amber-200 bg-amber-100 text-amber-800",
              )}
            >
              {pendingKey === `archive-${cohort.id}` ? "Archiving..." : "Archive cohort"}
            </button>
          ) : null}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Bulk move</div>
          <div className="mt-2 text-sm text-[color:var(--muted)]">
            Move active students from one cohort to another.
          </div>
          <div className="mt-4 space-y-3">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Source cohort
              </span>
              <span className="text-sm text-[color:var(--muted)]">
                Move students out of this cohort.
              </span>
              <select
              value={bulkMoveState.sourceCohortId}
              onChange={(event) => {
                const sourceCohortId = event.currentTarget.value;
                setBulkMoveState((current) => ({
                  ...current,
                  sourceCohortId,
                  studentIds: [],
                }));
              }}
              className="w-full rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            >
              {sortedCohorts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Target cohort
              </span>
              <span className="text-sm text-[color:var(--muted)]">
                Move the selected students into this cohort.
              </span>
              <select
              value={bulkMoveState.targetCohortId}
              onChange={(event) => {
                const targetCohortId = event.currentTarget.value;
                setBulkMoveState((current) => ({ ...current, targetCohortId }));
              }}
              className="w-full rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            >
              {sortedCohorts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Students to move
              </span>
              <span className="text-sm text-[color:var(--muted)]">
                Select one or more active students from the source cohort.
              </span>
              <select
              multiple
              value={bulkMoveState.studentIds}
              onChange={(event) => {
                const studentIds = Array.from(event.currentTarget.selectedOptions).map(
                  (option) => option.value,
                );
                setBulkMoveState((current) => ({ ...current, studentIds }));
              }}
              className="min-h-[136px] w-full rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            >
              {sourceStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.firstName} {student.lastName}
                </option>
              ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                if (readOnly) {
                  setError("Role preview is read-only.");
                  return;
                }
                setPendingKey("move");
                setError(null);
                setSuccess(null);
                startTransition(async () => {
                  try {
                    await runBulkOperation(
                      {
                        operation: "move_students",
                        sourceCohortId: bulkMoveState.sourceCohortId,
                        targetCohortId: bulkMoveState.targetCohortId,
                        studentIds: bulkMoveState.studentIds,
                      },
                      "Bulk student move completed.",
                    );
                  } catch (nextError) {
                    setError(nextError instanceof Error ? nextError.message : "Bulk move failed.");
                    setPendingKey(null);
                  }
                });
              }}
              disabled={pendingKey === "move" || readOnly}
              className="rounded-full bg-[color:var(--navy-strong)] px-4 py-2 text-sm font-semibold text-white"
            >
              {pendingKey === "move" ? "Moving..." : "Move students"}
            </button>
          </div>
        </div>

        <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Coverage</div>
          <div className="mt-2 text-sm text-[color:var(--muted)]">
            Add staff, TA, or instructor coverage to a cohort.
          </div>
          <div className="mt-4 space-y-3">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Cohort
              </span>
              <span className="text-sm text-[color:var(--muted)]">
                Choose the cohort that needs extra staff or TA coverage.
              </span>
              <select
              value={bulkCoverageState.cohortId}
              onChange={(event) => {
                const cohortId = event.currentTarget.value;
                setBulkCoverageState((current) => ({ ...current, cohortId }));
              }}
              className="w-full rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            >
              {sortedCohorts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Coverage users
              </span>
              <span className="text-sm text-[color:var(--muted)]">
                Pick the staff, TA, or instructor accounts to add to this cohort.
              </span>
              <select
              multiple
              value={bulkCoverageState.userIds}
              onChange={(event) => {
                const userIds = Array.from(event.currentTarget.selectedOptions).map(
                  (option) => option.value,
                );
                setBulkCoverageState((current) => ({ ...current, userIds }));
              }}
              className="min-h-[136px] w-full rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            >
              {coverageOptions.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} · {user.role}
                </option>
              ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                if (readOnly) {
                  setError("Role preview is read-only.");
                  return;
                }
                setPendingKey("coverage");
                setError(null);
                setSuccess(null);
                startTransition(async () => {
                  try {
                    await runBulkOperation(
                      {
                        operation: "assign_coverage",
                        cohortId: bulkCoverageState.cohortId,
                        userIds: bulkCoverageState.userIds,
                      },
                      "Coverage assignments updated.",
                    );
                  } catch (nextError) {
                    setError(nextError instanceof Error ? nextError.message : "Coverage update failed.");
                    setPendingKey(null);
                  }
                });
              }}
              disabled={pendingKey === "coverage" || readOnly}
              className="rounded-full bg-[color:var(--navy-strong)] px-4 py-2 text-sm font-semibold text-white"
            >
              {pendingKey === "coverage" ? "Saving..." : "Assign coverage"}
            </button>
          </div>
        </div>

        <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Attendance queue</div>
          <div className="mt-2 text-sm text-[color:var(--muted)]">
            Open follow-up tasks for missing or risky attendance.
          </div>
          <div className="mt-4 space-y-3">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Cohort
              </span>
              <span className="text-sm text-[color:var(--muted)]">
                Choose the cohort where attendance follow-up should be opened.
              </span>
              <select
              value={bulkAttendanceState.cohortId}
              onChange={(event) => {
                const cohortId = event.currentTarget.value;
                setBulkAttendanceState((current) => ({
                  ...current,
                  cohortId,
                  studentIds: [],
                }));
              }}
              className="w-full rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            >
              {sortedCohorts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Students
              </span>
              <span className="text-sm text-[color:var(--muted)]">
                Select the students who need attendance follow-up tasks.
              </span>
              <select
              multiple
              value={bulkAttendanceState.studentIds}
              onChange={(event) => {
                const studentIds = Array.from(event.currentTarget.selectedOptions).map(
                  (option) => option.value,
                );
                setBulkAttendanceState((current) => ({ ...current, studentIds }));
              }}
              className="min-h-[136px] w-full rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            >
              {attendanceStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.firstName} {student.lastName}
                </option>
              ))}
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Due by
              </span>
              <span className="text-sm text-[color:var(--muted)]">
                Optional deadline for the follow-up tasks.
              </span>
              <input
              value={bulkAttendanceState.dueAt}
              onChange={(event) => {
                const dueAt = event.currentTarget.value;
                setBulkAttendanceState((current) => ({ ...current, dueAt }));
              }}
              type="datetime-local"
              className="w-full rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                if (readOnly) {
                  setError("Role preview is read-only.");
                  return;
                }
                setPendingKey("attendance");
                setError(null);
                setSuccess(null);
                startTransition(async () => {
                  try {
                    await runBulkOperation(
                      {
                        operation: "attendance_follow_up",
                        cohortId: bulkAttendanceState.cohortId,
                        studentIds: bulkAttendanceState.studentIds,
                        dueAt: bulkAttendanceState.dueAt || null,
                      },
                      "Attendance follow-up tasks created.",
                    );
                  } catch (nextError) {
                    setError(nextError instanceof Error ? nextError.message : "Attendance follow-up failed.");
                    setPendingKey(null);
                  }
                });
              }}
              disabled={pendingKey === "attendance" || readOnly}
              className="rounded-full bg-[color:var(--navy-strong)] px-4 py-2 text-sm font-semibold text-white"
            >
              {pendingKey === "attendance" ? "Opening..." : "Open follow-up tasks"}
            </button>
          </div>
        </div>
      </section>

      {archivedCohorts.length > 0 ? (
        <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Archived cohorts</div>
          <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
            Closed cohort records
          </h3>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {archivedCohorts.map((item) => (
              <div
                key={item.id}
                className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
              >
                <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                  {item.name}
                </div>
                <div className="mt-2 text-sm text-[color:var(--muted)]">
                  {item.cadence} · {item.roomLabel}
                </div>
                <button
                  type="button"
                  onClick={() => handleArchiveState(item.id, false)}
                  disabled={pendingKey === `archive-${item.id}` || readOnly}
                  className={clsx(
                    "mt-4 rounded-full border px-4 py-2 text-sm font-semibold",
                    pendingKey === `archive-${item.id}` || readOnly
                      ? "cursor-not-allowed border-[color:var(--line)] bg-stone-100 text-[color:var(--muted)]"
                      : "border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] text-[color:var(--navy-strong)]",
                  )}
                >
                  {pendingKey === `archive-${item.id}` ? "Restoring..." : "Restore cohort"}
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
