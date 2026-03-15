"use client";

import { startTransition, useEffect, useState } from "react";
import clsx from "clsx";
import { ATTENDANCE_STATUSES, type AttendanceStatus, type UserRole } from "@/lib/domain";
import type { SessionRosterRow } from "@/lib/portal";
import { TrendSparkline } from "@/components/portal/trend-sparkline";

interface AttendanceBoardProps {
  role: UserRole;
  sessions: {
    id: string;
    title: string;
    timeLabel: string;
    roomLabel: string;
  }[];
  rosters: Record<string, SessionRosterRow[]>;
  persistence?: {
    enabled: boolean;
    endpoint: string;
  };
}

const statusTone = {
  present: "bg-emerald-100 text-emerald-800 border-emerald-200",
  tardy: "bg-amber-100 text-amber-800 border-amber-200",
  absent: "bg-rose-100 text-rose-800 border-rose-200",
} as const;

export function AttendanceBoard({
  role,
  sessions,
  rosters,
  persistence,
}: AttendanceBoardProps) {
  const [selectedSessionId, setSelectedSessionId] = useState(sessions[0]?.id ?? "");
  const [attendanceMap, setAttendanceMap] = useState<Record<string, Record<string, AttendanceStatus>>>(() =>
    Object.fromEntries(
      sessions.map((session) => [
        session.id,
        Object.fromEntries(
          (rosters[session.id] ?? []).map((row) => [row.studentId, row.attendance]),
        ),
      ]),
    ),
  );
  const [saveState, setSaveState] = useState<{
    key: string | null;
    error: string | null;
  }>({
    key: null,
    error: null,
  });

  useEffect(() => {
    if (!selectedSessionId || !sessions.some((session) => session.id === selectedSessionId)) {
      setSelectedSessionId(sessions[0]?.id ?? "");
    }
  }, [selectedSessionId, sessions]);

  useEffect(() => {
    setAttendanceMap(
      Object.fromEntries(
        sessions.map((session) => [
          session.id,
          Object.fromEntries(
            (rosters[session.id] ?? []).map((row) => [row.studentId, row.attendance]),
          ),
        ]),
      ),
    );
  }, [rosters, sessions]);

  const selectedRows = rosters[selectedSessionId] ?? [];
  const selectedSession = sessions.find((session) => session.id === selectedSessionId);
  const statusCounts = ATTENDANCE_STATUSES.reduce(
    (counts, status) => ({
      ...counts,
      [status]: selectedRows.filter(
        (row) => (attendanceMap[selectedSessionId]?.[row.studentId] ?? row.attendance) === status,
      ).length,
    }),
    { present: 0, absent: 0, tardy: 0 },
  );

  const handleStatusChange = (studentId: string, nextStatus: AttendanceStatus) => {
    const previousStatus =
      attendanceMap[selectedSessionId]?.[studentId] ??
      selectedRows.find((row) => row.studentId === studentId)?.attendance ??
      "present";

    setAttendanceMap((current) => ({
      ...current,
      [selectedSessionId]: {
        ...current[selectedSessionId],
        [studentId]: nextStatus,
      },
    }));

    if (!persistence?.enabled) {
      return;
    }

    const saveKey = `${selectedSessionId}:${studentId}`;
    setSaveState({
      key: saveKey,
      error: null,
    });

    startTransition(async () => {
      try {
        const response = await fetch(persistence.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId: selectedSessionId,
            studentId,
            status: nextStatus,
          }),
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Attendance update failed.");
        }

        setSaveState({
          key: null,
          error: null,
        });
      } catch (error) {
        setAttendanceMap((current) => ({
          ...current,
          [selectedSessionId]: {
            ...current[selectedSessionId],
            [studentId]: previousStatus,
          },
        }));

        setSaveState({
          key: null,
          error: error instanceof Error ? error.message : "Attendance update failed.",
        });
      }
    });
  };

  return (
    <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
      <div className="flex flex-col gap-4 border-b border-[color:var(--line)] pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="section-kicker">Live capture</div>
          <h3 className="display-font text-2xl text-[color:var(--navy-strong)]">
            Attendance control room
          </h3>
          <p className="mt-2 max-w-3xl text-sm text-[color:var(--muted)]">
            {role === "instructor"
              ? "Instructor access is limited to roster names, attendance state, same-day scores, and read-only trends."
              : "TA, staff, and admin access adds family contact context and broader academic support signals."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
          <span className="rounded-full border border-[color:var(--line)] bg-white/70 px-3 py-2">
            Present {statusCounts.present}
          </span>
          <span className="rounded-full border border-[color:var(--line)] bg-white/70 px-3 py-2">
            Tardy {statusCounts.tardy}
          </span>
          <span className="rounded-full border border-[color:var(--line)] bg-white/70 px-3 py-2">
            Absent {statusCounts.absent}
          </span>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => setSelectedSessionId(session.id)}
            className={clsx(
              "rounded-2xl border px-4 py-3 text-left",
              session.id === selectedSessionId
                ? "border-[rgba(187,110,69,0.34)] bg-[rgba(187,110,69,0.14)] text-[color:var(--navy-strong)]"
                : "border-[color:var(--line)] bg-white/60 text-[color:var(--muted)] hover:bg-white/80",
            )}
          >
            <div className="text-sm font-semibold">{session.title}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.14em]">{session.timeLabel}</div>
          </button>
        ))}
      </div>

      {selectedSession ? (
        <div className="mt-6 rounded-[1.75rem] border border-[color:var(--line)] bg-white/70 p-4 lg:p-5">
          <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-lg font-semibold text-[color:var(--navy-strong)]">
                {selectedSession.title}
              </div>
              <div className="text-sm text-[color:var(--muted)]">
                {selectedSession.timeLabel} · {selectedSession.roomLabel}
              </div>
            </div>
            <div
              className={clsx(
                "rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em]",
                persistence?.enabled
                  ? "border-[rgba(45,125,99,0.25)] bg-[rgba(45,125,99,0.12)] text-emerald-800"
                  : "border-[rgba(115,138,123,0.25)] bg-[rgba(115,138,123,0.12)] text-[color:var(--sage)]",
              )}
            >
              {persistence?.enabled ? "Saving to Supabase" : "Prototype interaction only"}
            </div>
          </div>

          {saveState.error ? (
            <div className="mb-4 rounded-[1.25rem] border border-rose-200 bg-rose-100/90 px-4 py-3 text-sm text-rose-800">
              {saveState.error}
            </div>
          ) : null}

          <div className="space-y-3">
            {selectedRows.map((row) => {
              const currentStatus = attendanceMap[selectedSessionId]?.[row.studentId] ?? row.attendance;
              const saveKey = `${selectedSessionId}:${row.studentId}`;
              return (
                <div
                  key={row.studentId}
                  className="grid gap-4 rounded-[1.5rem] border border-[color:var(--line)] bg-[rgba(255,255,255,0.78)] p-4 lg:grid-cols-[minmax(0,1.7fr)_auto_minmax(0,1fr)] lg:items-center"
                >
                  <div>
                    <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                      {row.studentName}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-[color:var(--muted)]">
                      {row.school && <span>{row.school}</span>}
                      {row.gradeLevel && <span>Grade {row.gradeLevel}</span>}
                      {row.familyEmail && <span>{row.familyEmail}</span>}
                      {row.familyPhone && <span>{row.familyPhone}</span>}
                    </div>
                    {row.latestAssessment ? (
                      <div className="mt-3 text-sm text-[color:var(--navy)]">
                        <span className="font-semibold">{row.latestAssessment.title}</span>
                        <span className="mx-2 text-[color:var(--muted)]">·</span>
                        <span>{row.latestAssessment.totalScore}</span>
                        <span className="mx-2 text-[color:var(--muted)]">·</span>
                        <span
                          className={clsx(
                            "font-semibold",
                            row.latestAssessment.deltaFromPrevious >= 0
                              ? "text-emerald-700"
                              : "text-rose-700",
                          )}
                        >
                          {row.latestAssessment.deltaFromPrevious >= 0 ? "+" : ""}
                          {row.latestAssessment.deltaFromPrevious}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {ATTENDANCE_STATUSES.map((status) => (
                      <button
                        key={status}
                        type="button"
                        aria-pressed={currentStatus === status}
                        onClick={() => handleStatusChange(row.studentId, status)}
                        disabled={saveState.key === saveKey}
                        className={clsx(
                          "rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em]",
                          saveState.key === saveKey && "cursor-wait opacity-70",
                          currentStatus === status
                            ? statusTone[status]
                            : "border-[color:var(--line)] bg-white text-[color:var(--muted)] hover:bg-stone-50",
                        )}
                      >
                        {status}
                      </button>
                    ))}
                  </div>

                  <div className="rounded-[1.25rem] border border-[color:var(--line)] bg-[rgba(247,241,230,0.75)] p-3">
                    <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                      <span>Trend</span>
                      <span className={clsx("rounded-full border px-2 py-1", statusTone[currentStatus])}>
                        {saveState.key === saveKey ? "saving" : currentStatus}
                      </span>
                    </div>
                    <TrendSparkline
                      points={row.trend}
                      tone={role === "instructor" ? "navy" : "copper"}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
