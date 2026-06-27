"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import type {
  AcademicNote,
  AdminTask,
  AdminSavedView,
  Assessment,
  AssessmentResult,
  AttendanceExceptionFlag,
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
  attendanceFlags: AttendanceExceptionFlag[];
  adminTasks: AdminTask[];
  assessments: Assessment[];
  results: AssessmentResult[];
  notes: AcademicNote[];
  savedViews: AdminSavedView[];
}

function formatDateTimeLocal(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function getTodaySessionWindow() {
  const start = new Date();
  start.setHours(16, 0, 0, 0);
  const end = new Date(start);
  end.setHours(17, 0, 0, 0);

  return {
    sessionStartAt: formatDateTimeLocal(start.toISOString()),
    sessionEndAt: formatDateTimeLocal(end.toISOString()),
  };
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
  attendanceFlags,
  adminTasks,
  assessments,
  results,
  notes,
  savedViews,
}: AdminCohortOperationsPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const readOnly = viewerMode === "live-role-preview";
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [forecastFilter, setForecastFilter] = useState(searchParams.get("forecast") ?? "all");
  const selectedCohortParam = searchParams.get("cohortId") ?? "";
  const sortedCohorts = useMemo(
    () => [...cohorts].sort((left, right) => left.name.localeCompare(right.name)),
    [cohorts],
  );
  const defaultCohort =
    sortedCohorts.find((item) => item.id === selectedCohortParam) ?? sortedCohorts[0];
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
  const [bulkAccessRemovalState, setBulkAccessRemovalState] = useState({
    userIds: [] as string[],
  });
  const [bulkAttendanceState, setBulkAttendanceState] = useState({
    cohortId: defaultCohort?.id ?? "",
    studentIds: [] as string[],
    dueAt: "",
  });
  const [selectedAttendanceStudentId, setSelectedAttendanceStudentId] = useState("");
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
  const coverageOptions = users.filter(
    (user) => user.role === "staff" || user.role === "ta" || user.role === "instructor",
  );
  const cohortAccessUsers = useMemo(
    () =>
      coverageOptions
        .filter((user) => user.assignedCohortIds.includes(bulkCoverageState.cohortId))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [bulkCoverageState.cohortId, coverageOptions],
  );
  const accessGrantOptions = useMemo(
    () =>
      coverageOptions
        .filter((user) => !user.assignedCohortIds.includes(bulkCoverageState.cohortId))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [bulkCoverageState.cohortId, coverageOptions],
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
    const cohortEnrollmentIds = enrollments
      .filter(
        (enrollment) =>
          enrollment.cohortId === bulkAttendanceState.cohortId &&
          enrollment.status === "active",
      )
      .map((enrollment) => enrollment.studentId);
    const cohortEnrollmentSet = new Set(cohortEnrollmentIds);
    const sessionIds = new Set(
      sessions
        .filter((session) => session.cohortId === bulkAttendanceState.cohortId)
        .map((session) => session.id),
    );
    const flaggedStudentIds = attendanceFlags
      .filter((flag) => sessionIds.has(flag.sessionId))
      .map((flag) => flag.studentId);
    const openAttendanceTaskStudentIds = adminTasks
      .filter(
        (task) =>
          task.taskType === "attendance_follow_up" &&
          task.targetType === "student" &&
          task.status !== "done" &&
          cohortEnrollmentSet.has(task.targetId),
      )
      .map((task) => task.targetId);
    const issueStudentIds = new Set([...flaggedStudentIds, ...openAttendanceTaskStudentIds]);

    return students
      .filter((student) => issueStudentIds.has(student.id) && cohortEnrollmentSet.has(student.id))
      .sort((left, right) => `${left.lastName} ${left.firstName}`.localeCompare(`${right.lastName} ${right.firstName}`));
  }, [adminTasks, attendanceFlags, bulkAttendanceState.cohortId, enrollments, sessions, students]);
  const selectedAttendanceStudent =
    attendanceStudents.find((student) => student.id === selectedAttendanceStudentId) ?? attendanceStudents[0] ?? null;
  const selectedAttendanceFlags = useMemo(() => {
    if (!selectedAttendanceStudent) {
      return [];
    }

    const sessionIds = new Set(
      sessions
        .filter((session) => session.cohortId === bulkAttendanceState.cohortId)
        .map((session) => session.id),
    );

    return attendanceFlags.filter(
      (flag) => flag.studentId === selectedAttendanceStudent.id && sessionIds.has(flag.sessionId),
    );
  }, [attendanceFlags, bulkAttendanceState.cohortId, selectedAttendanceStudent, sessions]);
  const selectedAttendanceTasks = useMemo(
    () =>
      selectedAttendanceStudent
        ? adminTasks.filter(
            (task) =>
              task.taskType === "attendance_follow_up" &&
              task.targetType === "student" &&
              task.targetId === selectedAttendanceStudent.id &&
              task.status !== "done",
          )
        : [],
    [adminTasks, selectedAttendanceStudent],
  );
  const selectedScoreResults = useMemo(
    () =>
      selectedAttendanceStudent
        ? results
            .filter((result) => result.studentId === selectedAttendanceStudent.id)
            .sort((left, right) => right.id.localeCompare(left.id))
        : [],
    [results, selectedAttendanceStudent],
  );
  const selectedStudentNotes = useMemo(
    () =>
      selectedAttendanceStudent
        ? notes
            .filter((note) => note.studentId === selectedAttendanceStudent.id)
            .slice(0, 3)
        : [],
    [notes, selectedAttendanceStudent],
  );
  const assessmentsById = useMemo(
    () => new Map(assessments.map((assessment) => [assessment.id, assessment])),
    [assessments],
  );
  const selectedRoster = useMemo(() => {
    const rosterIds = enrollments
      .filter((enrollment) => enrollment.cohortId === selectedCohortId && enrollment.status === "active")
      .map((enrollment) => enrollment.studentId);
    return students
      .filter((student) => rosterIds.includes(student.id))
      .sort((left, right) => `${left.lastName} ${left.firstName}`.localeCompare(`${right.lastName} ${right.firstName}`));
  }, [enrollments, selectedCohortId, students]);

  useEffect(() => {
    if (!selectedCohortParam || selectedCohortParam === selectedCohortId) {
      return;
    }

    const nextCohort = sortedCohorts.find((item) => item.id === selectedCohortParam);

    if (!nextCohort) {
      return;
    }

    const nextSession = sessions.find((session) => session.cohortId === nextCohort.id);
    setSelectedCohortId(nextCohort.id);
    setSelectedSessionId(nextSession?.id ?? "");
    setFormState({
      capacity: String(nextCohort.capacity ?? 0),
      cadence: nextCohort.cadence ?? "",
      roomLabel: nextCohort.roomLabel ?? "",
      sessionTitle: nextSession?.title ?? "",
      sessionStartAt: nextSession ? formatDateTimeLocal(nextSession.startAt) : "",
      sessionEndAt: nextSession ? formatDateTimeLocal(nextSession.endAt) : "",
      sessionMode: nextSession?.mode ?? "Hybrid",
      sessionRoomLabel: nextSession?.roomLabel ?? nextCohort.roomLabel ?? "",
    });
  }, [selectedCohortId, selectedCohortParam, sessions, sortedCohorts]);

  useEffect(() => {
    setBulkAttendanceState((current) => ({
      ...current,
      studentIds: current.studentIds.filter((studentId) =>
        attendanceStudents.some((student) => student.id === studentId),
      ),
    }));

    if (
      selectedAttendanceStudentId &&
      !attendanceStudents.some((student) => student.id === selectedAttendanceStudentId)
    ) {
      setSelectedAttendanceStudentId("");
    }
  }, [attendanceStudents, selectedAttendanceStudentId]);

  const updateFilters = (next: Record<string, string>) => {
    if (next.forecast) {
      setForecastFilter(next.forecast);
    }

    const params = new URLSearchParams(
      typeof window === "undefined" ? searchParams.toString() : window.location.search,
    );
    Object.entries(next).forEach(([key, value]) => {
      if (value === "all") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    window.history.replaceState(null, "", `${pathname}${params.size > 0 ? `?${params.toString()}` : ""}`);
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
              cohortId: selectedCohortId,
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

        setSuccess("Cohort and class details updated.");
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
                const nextCohortId =
                  typeof view.filterState.cohortId === "string" ? view.filterState.cohortId : selectedCohortId;
                const nextCohort = sortedCohorts.find((item) => item.id === nextCohortId);
                const nextSession = sessions.find((session) => session.cohortId === nextCohortId);
                if (nextCohort) {
                  setSelectedCohortId(nextCohortId);
                  setSelectedSessionId(nextSession?.id ?? "");
                  setFormState({
                    capacity: String(nextCohort.capacity ?? 0),
                    cadence: nextCohort.cadence ?? "",
                    roomLabel: nextCohort.roomLabel ?? "",
                    sessionTitle: nextSession?.title ?? "",
                    sessionStartAt: nextSession ? formatDateTimeLocal(nextSession.startAt) : "",
                    sessionEndAt: nextSession ? formatDateTimeLocal(nextSession.endAt) : "",
                    sessionMode: nextSession?.mode ?? "Hybrid",
                    sessionRoomLabel: nextSession?.roomLabel ?? nextCohort.roomLabel ?? "",
                  });
                }
                updateFilters({ forecast: nextForecast, cohortId: nextCohortId });
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
          Class schedule, rooming, and capacity
        </h3>
        <div className="mt-5 rounded-[1.5rem] border border-[color:var(--line)] bg-stone-50/80 px-4 py-3 text-sm text-[color:var(--muted)]">
          Cohort capacity is the max active roster size. Cadence is the meeting pattern. Room label
          is the default location for the cohort, while class room label is the location override
          for the selected class below.
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
                updateFilters({ cohortId: nextId });
                setSelectedSessionId(nextSession?.id ?? "");
                setFormState({
                  capacity: String(nextCohort?.capacity ?? 0),
                  cadence: nextCohort?.cadence ?? "",
                  roomLabel: nextCohort?.roomLabel ?? "",
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
              Class
            </span>
            <span className="text-sm text-[color:var(--muted)]">
              Choose the class schedule to adjust under the selected cohort.
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
              <option value="">Choose a class</option>
              {scopedSessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.title}
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
              Class name
            </span>
            <span className="text-sm text-[color:var(--muted)]">
              Name the selected class the way staff and families should recognize it.
            </span>
            <input
              value={formState.sessionTitle}
              onChange={(event) => {
                const sessionTitle = event.currentTarget.value;
                setFormState((current) => ({ ...current, sessionTitle }));
              }}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="Example: Digital SAT Tuesday class"
            />
          </label>
          <div className="flex flex-col justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setFormState((current) => ({
                  ...current,
                  ...getTodaySessionWindow(),
                }));
              }}
              disabled={readOnly}
              className="focus-ring rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm font-semibold text-[color:var(--navy-strong)] hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Use today
            </button>
          </div>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Class start
            </span>
            <span className="text-sm text-[color:var(--muted)]">
              Start time for the selected class.
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
              Class end
            </span>
            <span className="text-sm text-[color:var(--muted)]">
              End time for the selected class.
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
              Class mode
            </span>
            <span className="text-sm text-[color:var(--muted)]">
              Choose whether the class is in person, hybrid, or Zoom.
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
              Class room label
            </span>
            <span className="text-sm text-[color:var(--muted)]">
              Override the default cohort room for this specific class if needed.
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

      <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="section-kicker">Cohort roster</div>
            <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
              {cohort?.name ?? "Selected cohort"}
            </h3>
          </div>
          <div className="rounded-full border border-[color:var(--line)] bg-white/85 px-4 py-2 text-sm font-semibold text-[color:var(--navy-strong)]">
            {selectedRoster.length}/{cohort?.capacity ?? 0} active
          </div>
        </div>
        <div className="mt-5 max-h-[360px] overflow-y-auto rounded-[1.5rem] border border-[color:var(--line)] bg-white/70">
          {selectedRoster.length > 0 ? (
            selectedRoster.map((student) => (
              <div
                key={student.id}
                className="grid gap-3 border-t border-[color:var(--line)] px-4 py-3 text-sm first:border-t-0 md:grid-cols-[1.2fr_1fr_1fr]"
              >
                <div>
                  <div className="font-semibold text-[color:var(--navy-strong)]">
                    {student.firstName} {student.lastName}
                  </div>
                  <div className="mt-1 text-[color:var(--muted)]">Grade {student.gradeLevel}</div>
                </div>
                <div className="text-[color:var(--muted)]">{student.school}</div>
                <div>
                  <div className="font-semibold text-[color:var(--navy-strong)]">{student.targetTest}</div>
                  <div className="mt-1 text-[color:var(--muted)]">{student.focus}</div>
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-5 text-sm text-[color:var(--muted)]">
              No active students are assigned to this cohort yet.
            </div>
          )}
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
          <div className="section-kicker">Cohort access</div>
          <h3 className="display-font mt-2 text-2xl text-[color:var(--navy-strong)]">
            Add or remove team access
          </h3>
          <div className="mt-2 text-sm text-[color:var(--muted)]">
            Give specific instructors, TAs, and staff access to this cohort. This compartmentalizes roster,
            attendance, class notes, and family context to the team assigned to that cohort.
          </div>
          <div className="mt-4 space-y-3">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Cohort
              </span>
              <span className="text-sm text-[color:var(--muted)]">
                Choose the cohort whose access list you want to manage.
              </span>
              <select
              value={bulkCoverageState.cohortId}
              onChange={(event) => {
                const cohortId = event.currentTarget.value;
                setBulkCoverageState((current) => ({ ...current, cohortId }));
                setBulkAccessRemovalState({ userIds: [] });
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
                Add people
              </span>
              <span className="text-sm text-[color:var(--muted)]">
                Pick staff, TA, or instructor accounts that should be able to see this cohort.
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
              {accessGrantOptions.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} · {user.role}
                </option>
              ))}
              {accessGrantOptions.length === 0 ? (
                <option disabled>Everyone eligible already has access</option>
              ) : null}
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
                      "Cohort access granted.",
                    );
                  } catch (nextError) {
                    setError(nextError instanceof Error ? nextError.message : "Cohort access update failed.");
                    setPendingKey(null);
                  }
                });
              }}
              disabled={pendingKey === "coverage" || readOnly}
              className="rounded-full bg-[color:var(--navy-strong)] px-4 py-2 text-sm font-semibold text-white"
            >
              {pendingKey === "coverage" ? "Saving..." : "Grant cohort access"}
            </button>
            <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Current access
              </div>
              <div className="mt-3 space-y-2">
                {cohortAccessUsers.map((user) => (
                  <label
                    key={user.id}
                    className="flex items-start gap-3 rounded-2xl border border-[color:var(--line)] bg-white/90 px-3 py-2 text-sm text-[color:var(--navy-strong)]"
                  >
                    <input
                      type="checkbox"
                      checked={bulkAccessRemovalState.userIds.includes(user.id)}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setBulkAccessRemovalState((current) => ({
                          userIds: checked
                            ? [...current.userIds, user.id]
                            : current.userIds.filter((userId) => userId !== user.id),
                        }));
                      }}
                      disabled={readOnly}
                    />
                    <span>
                      <span className="font-semibold">{user.name}</span>
                      <span className="mt-1 block text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                        {user.role}
                      </span>
                    </span>
                  </label>
                ))}
                {cohortAccessUsers.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[color:var(--line)] bg-stone-50 px-3 py-3 text-sm text-[color:var(--muted)]">
                    No instructors, TAs, or staff are assigned to this cohort yet.
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (readOnly) {
                    setError("Role preview is read-only.");
                    return;
                  }
                  setPendingKey("remove-access");
                  setError(null);
                  setSuccess(null);
                  startTransition(async () => {
                    try {
                      await runBulkOperation(
                        {
                          operation: "remove_coverage",
                          cohortId: bulkCoverageState.cohortId,
                          userIds: bulkAccessRemovalState.userIds,
                        },
                        "Cohort access removed.",
                      );
                      setBulkAccessRemovalState({ userIds: [] });
                    } catch (nextError) {
                      setError(nextError instanceof Error ? nextError.message : "Cohort access removal failed.");
                      setPendingKey(null);
                    }
                  });
                }}
                disabled={pendingKey === "remove-access" || readOnly || bulkAccessRemovalState.userIds.length === 0}
                className={clsx(
                  "mt-3 rounded-full px-4 py-2 text-sm font-semibold text-white",
                  pendingKey === "remove-access" || readOnly || bulkAccessRemovalState.userIds.length === 0
                    ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
                    : "bg-[color:var(--navy-strong)] hover:opacity-90",
                )}
              >
                {pendingKey === "remove-access" ? "Removing..." : "Remove selected access"}
              </button>
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Attendance queue</div>
          <h3 className="display-font mt-2 text-2xl text-[color:var(--navy-strong)]">
            Students needing follow-up
          </h3>
          <div className="mt-2 text-sm text-[color:var(--muted)]">
            Only students with an attendance exception or an open attendance follow-up task show here. Click a name
            to review the same student context used by Student Directory.
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
                setSelectedAttendanceStudentId("");
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
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Issue students
              </span>
              <span className="text-sm text-[color:var(--muted)]">
                Select students to create follow-up tasks. Click a student name to inspect their profile context.
              </span>
              <div className="max-h-[220px] overflow-y-auto rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-2">
                {attendanceStudents.map((student) => {
                  const selected = bulkAttendanceState.studentIds.includes(student.id);
                  const focused = selectedAttendanceStudent?.id === student.id;
                  const cohortSessionIds = new Set(
                    sessions
                      .filter((session) => session.cohortId === bulkAttendanceState.cohortId)
                      .map((session) => session.id),
                  );
                  const issueCount =
                    attendanceFlags.filter(
                      (flag) => flag.studentId === student.id && cohortSessionIds.has(flag.sessionId),
                    ).length +
                    adminTasks.filter(
                      (task) =>
                        task.taskType === "attendance_follow_up" &&
                        task.targetType === "student" &&
                        task.targetId === student.id &&
                        task.status !== "done",
                    ).length;

                  return (
                    <div
                      key={student.id}
                      className={clsx(
                        "mb-2 rounded-2xl border bg-white/90 p-3 last:mb-0",
                        focused ? "border-[rgba(23,56,75,0.34)]" : "border-[color:var(--line)]",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) => {
                            const checked = event.currentTarget.checked;
                            setBulkAttendanceState((current) => ({
                              ...current,
                              studentIds: checked
                                ? [...current.studentIds, student.id]
                                : current.studentIds.filter((studentId) => studentId !== student.id),
                            }));
                          }}
                          disabled={readOnly}
                        />
                        <button
                          type="button"
                          onClick={() => setSelectedAttendanceStudentId(student.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="block font-semibold text-[color:var(--navy-strong)]">
                            {student.firstName} {student.lastName}
                          </span>
                          <span className="mt-1 block text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                            {issueCount} open signal{issueCount === 1 ? "" : "s"}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
                {attendanceStudents.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[color:var(--line)] bg-stone-50 px-3 py-3 text-sm text-[color:var(--muted)]">
                    No attendance issues are open for this cohort.
                  </div>
                ) : null}
              </div>
            </div>
            {selectedAttendanceStudent ? (
              <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  Student context
                </div>
                <div className="mt-2 text-base font-semibold text-[color:var(--navy-strong)]">
                  {selectedAttendanceStudent.firstName} {selectedAttendanceStudent.lastName}
                </div>
                <div className="mt-2 grid gap-2 text-sm text-[color:var(--muted)]">
                  <div>Grade {selectedAttendanceStudent.gradeLevel} · {selectedAttendanceStudent.school}</div>
                  <div>{selectedAttendanceStudent.targetTest} · {selectedAttendanceStudent.focus}</div>
                </div>
                <div className="mt-4 space-y-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                      Attendance signals
                    </div>
                    <div className="mt-2 space-y-2">
                      {selectedAttendanceFlags.map((flag) => (
                        <div key={flag.id} className="rounded-2xl border border-[color:var(--line)] bg-stone-50 px-3 py-2 text-sm text-[color:var(--muted)]">
                          <span className="font-semibold text-[color:var(--navy-strong)]">
                            {flag.flagType.replaceAll("_", " ")}
                          </span>
                          {flag.note ? ` · ${flag.note}` : ""}
                        </div>
                      ))}
                      {selectedAttendanceTasks.map((task) => (
                        <div key={task.id} className="rounded-2xl border border-[color:var(--line)] bg-stone-50 px-3 py-2 text-sm text-[color:var(--muted)]">
                          <span className="font-semibold text-[color:var(--navy-strong)]">{task.title}</span>
                          {task.dueAt ? ` · due ${new Date(task.dueAt).toLocaleDateString()}` : ""}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                      Score trend
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedScoreResults.slice(0, 4).map((result) => {
                        const assessment = assessmentsById.get(result.assessmentId);
                        return (
                          <span
                            key={result.id}
                            className="rounded-full border border-[color:var(--line)] bg-stone-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]"
                          >
                            {assessment?.title ?? "Assessment"}: {result.totalScore}
                          </span>
                        );
                      })}
                      {selectedScoreResults.length === 0 ? (
                        <span className="text-sm text-[color:var(--muted)]">No score results recorded yet.</span>
                      ) : null}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                      Internal notes
                    </div>
                    <div className="mt-2 space-y-2">
                      {selectedStudentNotes.map((note) => (
                        <div key={note.id} className="rounded-2xl border border-[color:var(--line)] bg-stone-50 px-3 py-2 text-sm text-[color:var(--muted)]">
                          {note.summary}
                        </div>
                      ))}
                      {selectedStudentNotes.length === 0 ? (
                        <div className="text-sm text-[color:var(--muted)]">No internal notes recorded yet.</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
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
