"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  ATTENDANCE_STATUSES,
  type AttendanceExceptionFlag,
  type AttendanceStatus,
  type InstructionalAccommodation,
  type SessionCoverageFlag,
  type SessionHandoffNote,
  type UserRole,
} from "@/lib/domain";
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
  handoffNotes?: SessionHandoffNote[];
  exceptionFlags?: AttendanceExceptionFlag[];
  coverageFlags?: SessionCoverageFlag[];
  instructionalAccommodations?: InstructionalAccommodation[];
}

const statusTone = {
  present: "bg-emerald-100 text-emerald-800 border-emerald-200",
  tardy: "bg-amber-100 text-amber-800 border-amber-200",
  absent: "bg-rose-100 text-rose-800 border-rose-200",
} as const;

type PracticeTestFormState = {
  studentId: string;
  cohortId: string;
  testTitle: string;
  testDate: string;
  rwScore: string;
  mathScore: string;
  totalScore: string;
  notes: string;
};

function getTodayInputDate() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date());
}

export function AttendanceBoard({
  role,
  sessions,
  rosters,
  persistence,
  handoffNotes = [],
  exceptionFlags = [],
  coverageFlags = [],
  instructionalAccommodations = [],
}: AttendanceBoardProps) {
  const router = useRouter();
  const canManagePracticeTests = role === "admin" || role === "staff" || role === "ta";
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
  const [expandedTrendStudentId, setExpandedTrendStudentId] = useState<string | null>(null);
  const [selectedPracticeTestId, setSelectedPracticeTestId] = useState<string | null>(null);
  const [practiceTestForm, setPracticeTestForm] = useState<PracticeTestFormState | null>(null);
  const [practiceTestSaveState, setPracticeTestSaveState] = useState<{
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
  const selectedHandoffNotes = handoffNotes
    .filter((note) => note.sessionId === selectedSessionId)
    .slice(0, 3);
  const selectedCoverageFlag =
    coverageFlags.find((flag) => flag.sessionId === selectedSessionId && flag.status !== "clear") ?? null;
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

  const openPracticeTestForm = (row: SessionRosterRow) => {
    setExpandedTrendStudentId(row.studentId);
    setSelectedPracticeTestId(null);
    setPracticeTestSaveState({ key: null, error: null });
    setPracticeTestForm({
      studentId: row.studentId,
      cohortId: row.cohortId,
      testTitle: "Practice Test",
      testDate: getTodayInputDate(),
      rwScore: "",
      mathScore: "",
      totalScore: "",
      notes: "",
    });
  };

  const submitPracticeTestForm = () => {
    if (!practiceTestForm || !canManagePracticeTests) {
      return;
    }

    const saveKey = `practice-test:${practiceTestForm.studentId}`;
    const rwScore = Number(practiceTestForm.rwScore);
    const mathScore = Number(practiceTestForm.mathScore);
    const totalScore = Number(practiceTestForm.totalScore || rwScore + mathScore);

    setPracticeTestSaveState({
      key: saveKey,
      error: null,
    });

    startTransition(async () => {
      try {
        const response = await fetch("/api/students/scores", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...practiceTestForm,
            rwScore,
            mathScore,
            totalScore,
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Practice test update failed.");
        }

        setPracticeTestForm(null);
        setPracticeTestSaveState({
          key: null,
          error: null,
        });
        router.refresh();
      } catch (error) {
        setPracticeTestSaveState({
          key: null,
          error: error instanceof Error ? error.message : "Practice test update failed.",
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
              ? "Instructor access is limited to attendance, classroom accommodations, internal handoff context, and read-only student trends."
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

      {sessions.length === 0 ? (
        <div className="mt-5 rounded-[1.5rem] border border-dashed border-[color:var(--line)] bg-white/70 p-4 text-sm text-[color:var(--muted)]">
          No classes are scheduled for attendance today.
        </div>
      ) : null}

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
          </div>

          {selectedCoverageFlag ? (
            <div className="mb-4 rounded-[1.25rem] border border-amber-200 bg-amber-100/90 px-4 py-3 text-sm text-amber-900">
              Coverage watch: {selectedCoverageFlag.note}
            </div>
          ) : null}

          {selectedHandoffNotes.length > 0 ? (
            <div className="mb-4 space-y-2">
              {selectedHandoffNotes.map((note) => (
                <div
                  key={note.id}
                  className="rounded-[1.25rem] border border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                >
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    Handoff from {note.authorName}
                  </div>
                  <div className="mt-2">{note.body}</div>
                </div>
              ))}
            </div>
          ) : null}

          {saveState.error ? (
            <div className="mb-4 rounded-[1.25rem] border border-rose-200 bg-rose-100/90 px-4 py-3 text-sm text-rose-800">
              {saveState.error}
            </div>
          ) : null}
          {practiceTestSaveState.error ? (
            <div className="mb-4 rounded-[1.25rem] border border-rose-200 bg-rose-100/90 px-4 py-3 text-sm text-rose-800">
              {practiceTestSaveState.error}
            </div>
          ) : null}

          <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
            {selectedRows.map((row) => {
              const currentStatus = attendanceMap[selectedSessionId]?.[row.studentId] ?? row.attendance;
              const saveKey = `${selectedSessionId}:${row.studentId}`;
              const rowFlags = exceptionFlags
                .filter((flag) => flag.sessionId === selectedSessionId && flag.studentId === row.studentId)
                .slice(0, 3);
              const rowAccommodations = instructionalAccommodations.filter(
                (item) => item.studentId === row.studentId,
              );
              const isTrendExpanded = expandedTrendStudentId === row.studentId;
              const rowPracticeTests = row.practiceTests ?? [];
              const selectedPracticeTest =
                rowPracticeTests.find((test) => test.resultId === selectedPracticeTestId) ?? null;
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
                    {rowFlags.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {rowFlags.map((flag) => (
                          <span
                            key={flag.id}
                            className="rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-800"
                            title={flag.note}
                          >
                            {flag.flagType.replaceAll("_", " ")}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {role === "instructor" && rowAccommodations.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {rowAccommodations.map((accommodation) => (
                          <span
                            key={accommodation.id}
                            className="rounded-full border border-[rgba(23,56,75,0.16)] bg-[rgba(23,56,75,0.08)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--navy-strong)]"
                            title={accommodation.detail}
                          >
                            {accommodation.title}
                          </span>
                        ))}
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
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedTrendStudentId(isTrendExpanded ? null : row.studentId);
                        setSelectedPracticeTestId(null);
                        setPracticeTestForm(null);
                      }}
                      className="mb-2 flex w-full items-center justify-between text-left text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]"
                    >
                      <span>Trend</span>
                      <span className={clsx("rounded-full border px-2 py-1", statusTone[currentStatus])}>
                        {saveState.key === saveKey ? "saving" : currentStatus}
                      </span>
                    </button>
                    <TrendSparkline
                      points={row.trend}
                    />
                  </div>
                  {isTrendExpanded ? (
                    <div className="space-y-4 rounded-[1.25rem] border border-[color:var(--line)] bg-white/85 p-4 lg:col-span-3">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-[color:var(--navy-strong)]">
                            Practice test history
                          </div>
                          <div className="mt-1 text-xs text-[color:var(--muted)]">
                            Click a test to view section scores and notes.
                          </div>
                        </div>
                        {canManagePracticeTests ? (
                          <button
                            type="button"
                            onClick={() => openPracticeTestForm(row)}
                            className="rounded-full bg-[color:var(--navy)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white"
                          >
                            Add test
                          </button>
                        ) : null}
                      </div>

                      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
                        <div className="space-y-2">
                          {rowPracticeTests.map((test) => (
                            <button
                              key={test.resultId}
                              type="button"
                              onClick={() => {
                                setSelectedPracticeTestId(test.resultId);
                                setPracticeTestForm(null);
                              }}
                              className={clsx(
                                "w-full rounded-lg border px-3 py-2 text-left text-sm",
                                selectedPracticeTestId === test.resultId
                                  ? "border-[rgba(23,56,75,0.34)] bg-[rgba(23,56,75,0.08)]"
                                  : "border-[color:var(--line)] bg-white hover:bg-stone-50",
                              )}
                            >
                              <div className="font-semibold text-[color:var(--navy-strong)]">{test.title}</div>
                              <div className="mt-1 text-xs text-[color:var(--muted)]">
                                {test.date} · Total {test.totalScore} · {test.deltaFromPrevious >= 0 ? "+" : ""}
                                {test.deltaFromPrevious}
                              </div>
                            </button>
                          ))}
                          {rowPracticeTests.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-[color:var(--line)] p-3 text-sm text-[color:var(--muted)]">
                              No practice tests recorded.
                            </div>
                          ) : null}
                        </div>

                        <div className="rounded-lg border border-[color:var(--line)] bg-stone-50/80 p-3">
                          {selectedPracticeTest ? (
                            <div className="text-sm">
                              <div className="font-semibold text-[color:var(--navy-strong)]">
                                {selectedPracticeTest.title}
                              </div>
                              <div className="mt-1 text-[color:var(--muted)]">{selectedPracticeTest.date}</div>
                              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                                {selectedPracticeTest.sectionScores.map((section) => (
                                  <div key={section.label} className="rounded-lg border border-[color:var(--line)] bg-white p-2">
                                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                                      {section.label}
                                    </div>
                                    <div className="mt-1 font-semibold text-[color:var(--navy-strong)]">
                                      {section.score}
                                    </div>
                                  </div>
                                ))}
                                <div className="rounded-lg border border-[color:var(--line)] bg-white p-2">
                                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                                    Total
                                  </div>
                                  <div className="mt-1 font-semibold text-[color:var(--navy-strong)]">
                                    {selectedPracticeTest.totalScore}
                                  </div>
                                </div>
                              </div>
                              <div className="mt-4 rounded-lg border border-[color:var(--line)] bg-white p-3">
                                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                                  Notes
                                </div>
                                <div className="mt-2 text-[color:var(--navy-strong)]">
                                  {selectedPracticeTest.notes || "No notes recorded."}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm text-[color:var(--muted)]">
                              Select a practice test to see notes.
                            </div>
                          )}
                        </div>
                      </div>

                      {practiceTestForm?.studentId === row.studentId ? (
                        <div className="rounded-lg border border-[color:var(--line)] bg-stone-50/80 p-4">
                          <div className="grid gap-3 md:grid-cols-2">
                            <label className="text-sm font-semibold text-[color:var(--navy-strong)]">
                              Test
                              <input
                                value={practiceTestForm.testTitle}
                                onChange={(event) => {
                                  const testTitle = event.currentTarget.value;
                                  setPracticeTestForm((current) => current ? { ...current, testTitle } : current);
                                }}
                                className="mt-2 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="text-sm font-semibold text-[color:var(--navy-strong)]">
                              Date
                              <input
                                type="date"
                                value={practiceTestForm.testDate}
                                onChange={(event) => {
                                  const testDate = event.currentTarget.value;
                                  setPracticeTestForm((current) => current ? { ...current, testDate } : current);
                                }}
                                className="mt-2 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-sm"
                              />
                            </label>
                            {[
                              ["RW score", "rwScore"],
                              ["Math score", "mathScore"],
                              ["Total score", "totalScore"],
                            ].map(([label, field]) => (
                              <label key={field} className="text-sm font-semibold text-[color:var(--navy-strong)]">
                                {label}
                                <input
                                  type="number"
                                  value={practiceTestForm[field as keyof PracticeTestFormState]}
                                  onChange={(event) => {
                                    const value = event.currentTarget.value;
                                    setPracticeTestForm((current) => current ? { ...current, [field]: value } : current);
                                  }}
                                  className="mt-2 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-sm"
                                />
                              </label>
                            ))}
                            <label className="text-sm font-semibold text-[color:var(--navy-strong)] md:col-span-2">
                              Notes
                              <textarea
                                value={practiceTestForm.notes}
                                onChange={(event) => {
                                  const notes = event.currentTarget.value;
                                  setPracticeTestForm((current) => current ? { ...current, notes } : current);
                                }}
                                className="mt-2 min-h-24 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-sm"
                              />
                            </label>
                          </div>
                          <div className="mt-4 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setPracticeTestForm(null)}
                              className="rounded-full border border-[color:var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--navy-strong)]"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={submitPracticeTestForm}
                              disabled={practiceTestSaveState.key === `practice-test:${row.studentId}`}
                              className="rounded-full bg-[color:var(--navy)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:bg-slate-300"
                            >
                              {practiceTestSaveState.key === `practice-test:${row.studentId}` ? "Saving..." : "Save test"}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
