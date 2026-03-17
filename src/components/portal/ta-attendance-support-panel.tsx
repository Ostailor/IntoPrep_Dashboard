"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type {
  AttendanceExceptionFlag,
  SessionChecklist,
  SessionCoverageFlag,
  SessionHandoffNote,
} from "@/lib/domain";
import type { SessionRosterRow } from "@/lib/portal";

interface TaAttendanceSupportPanelProps {
  viewerMode: "preview" | "live" | "live-role-preview";
  sessions: {
    id: string;
    title: string;
    timeLabel: string;
    roomLabel: string;
  }[];
  rosters: Record<string, SessionRosterRow[]>;
  sessionChecklists: SessionChecklist[];
  handoffNotes: SessionHandoffNote[];
  exceptionFlags: AttendanceExceptionFlag[];
  coverageFlags: SessionCoverageFlag[];
}

export function TaAttendanceSupportPanel({
  viewerMode,
  sessions,
  rosters,
  sessionChecklists,
  handoffNotes,
  exceptionFlags,
  coverageFlags,
}: TaAttendanceSupportPanelProps) {
  const router = useRouter();
  const readOnly = viewerMode === "live-role-preview";
  const [selectedSessionId, setSelectedSessionId] = useState(sessions[0]?.id ?? "");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedSessionId || !sessions.some((session) => session.id === selectedSessionId)) {
      setSelectedSessionId(sessions[0]?.id ?? "");
    }
  }, [selectedSessionId, sessions]);

  const selectedChecklist = useMemo(
    () => sessionChecklists.find((checklist) => checklist.sessionId === selectedSessionId) ?? null,
    [selectedSessionId, sessionChecklists],
  );
  const selectedRoster = useMemo(
    () => rosters[selectedSessionId] ?? [],
    [rosters, selectedSessionId],
  );
  const selectedCoverage = useMemo(
    () =>
      coverageFlags.find((flag) => flag.sessionId === selectedSessionId && flag.status !== "clear") ?? null,
    [coverageFlags, selectedSessionId],
  );
  const selectedNotes = useMemo(
    () => handoffNotes.filter((note) => note.sessionId === selectedSessionId).slice(0, 3),
    [handoffNotes, selectedSessionId],
  );
  const selectedFlags = useMemo(
    () => exceptionFlags.filter((flag) => flag.sessionId === selectedSessionId).slice(0, 5),
    [exceptionFlags, selectedSessionId],
  );

  const [checklistState, setChecklistState] = useState({
    roomConfirmed: selectedChecklist?.roomConfirmed ?? false,
    rosterReviewed: selectedChecklist?.rosterReviewed ?? false,
    materialsReady: selectedChecklist?.materialsReady ?? false,
    familyNoticeSentIfNeeded: selectedChecklist?.familyNoticeSentIfNeeded ?? false,
    attendanceComplete: selectedChecklist?.attendanceComplete ?? false,
    scoresLoggedIfNeeded: selectedChecklist?.scoresLoggedIfNeeded ?? false,
    followUpSentIfNeeded: selectedChecklist?.followUpSentIfNeeded ?? false,
    notesClosedOut: selectedChecklist?.notesClosedOut ?? false,
  });
  const [handoffBody, setHandoffBody] = useState("");
  const [flagForm, setFlagForm] = useState({
    studentId: selectedRoster[0]?.studentId ?? "",
    flagType: "late_pattern",
    note: "",
  });
  const [coverageForm, setCoverageForm] = useState({
    status: selectedCoverage?.status ?? "availability_change",
    note: selectedCoverage?.note ?? "",
  });

  useEffect(() => {
    setChecklistState({
      roomConfirmed: selectedChecklist?.roomConfirmed ?? false,
      rosterReviewed: selectedChecklist?.rosterReviewed ?? false,
      materialsReady: selectedChecklist?.materialsReady ?? false,
      familyNoticeSentIfNeeded: selectedChecklist?.familyNoticeSentIfNeeded ?? false,
      attendanceComplete: selectedChecklist?.attendanceComplete ?? false,
      scoresLoggedIfNeeded: selectedChecklist?.scoresLoggedIfNeeded ?? false,
      followUpSentIfNeeded: selectedChecklist?.followUpSentIfNeeded ?? false,
      notesClosedOut: selectedChecklist?.notesClosedOut ?? false,
    });
    setFlagForm((current) => ({
      ...current,
      studentId: selectedRoster[0]?.studentId ?? "",
    }));
    setCoverageForm({
      status: selectedCoverage?.status ?? "availability_change",
      note: selectedCoverage?.note ?? "",
    });
  }, [selectedChecklist, selectedCoverage, selectedRoster]);

  const checklistItems = useMemo(
    () => [
      ["roomConfirmed", "Room confirmed"],
      ["rosterReviewed", "Roster reviewed"],
      ["materialsReady", "Materials ready"],
      ["familyNoticeSentIfNeeded", "Family notice sent if needed"],
      ["attendanceComplete", "Attendance complete"],
      ["scoresLoggedIfNeeded", "Scores logged if needed"],
      ["followUpSentIfNeeded", "Follow-up sent if needed"],
      ["notesClosedOut", "Notes closed out"],
    ] as const,
    [],
  );

  const runRequest = (key: string, request: Promise<Response>, successMessage: string, onSuccess?: () => void) => {
    if (readOnly) {
      setError("Role preview is read-only.");
      return;
    }

    setPendingKey(key);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await request;
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Save failed.");
        }

        onSuccess?.();
        setSuccess(successMessage);
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Save failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
        <div className="section-kicker">TA support tools</div>
        <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
          Session prep and handoff
        </h3>

        <div className="mt-5">
          <select
            value={selectedSessionId}
            onChange={(event) => setSelectedSessionId(event.currentTarget.value)}
            className="w-full rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title} · {session.timeLabel}
              </option>
            ))}
          </select>
        </div>

        {error ? (
          <div className="mt-4 rounded-[1.25rem] border border-rose-200 bg-rose-100/90 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="mt-4 rounded-[1.25rem] border border-emerald-200 bg-emerald-100/90 px-4 py-3 text-sm text-emerald-800">
            {success}
          </div>
        ) : null}

        <div className="mt-5 rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
          <div className="text-sm font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
            Shared session checklist
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {checklistItems.map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]">
                <input
                  type="checkbox"
                  checked={checklistState[key]}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setChecklistState((current) => ({
                      ...current,
                      [key]: checked,
                    }));
                  }}
                  disabled={readOnly}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              runRequest(
                "checklist",
                fetch("/api/ta/checklists", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    sessionId: selectedSessionId,
                    checklist: checklistState,
                  }),
                }),
                "Session checklist updated.",
              )
            }
            disabled={pendingKey === "checklist" || readOnly}
            className={clsx(
              "mt-4 rounded-full px-4 py-2 text-sm font-semibold text-white",
              pendingKey === "checklist" || readOnly
                ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
                : "bg-[color:var(--navy-strong)] hover:opacity-90",
            )}
          >
            {pendingKey === "checklist" ? "Saving..." : readOnly ? "Preview only" : "Save checklist"}
          </button>
        </div>

        <div className="mt-5 rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
          <div className="text-sm font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
            Instructor handoff
          </div>
          <textarea
            value={handoffBody}
            onChange={(event) => setHandoffBody(event.currentTarget.value)}
            className="mt-4 min-h-[120px] w-full rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            placeholder="Add a short note the instructor should see before or after the session."
            disabled={readOnly}
          />
          <button
            type="button"
            onClick={() =>
              runRequest(
                "handoff",
                fetch("/api/ta/handoff-notes", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    sessionId: selectedSessionId,
                    body: handoffBody,
                  }),
                }),
                "Handoff note added.",
                () => setHandoffBody(""),
              )
            }
            disabled={pendingKey === "handoff" || readOnly}
            className={clsx(
              "mt-4 rounded-full px-4 py-2 text-sm font-semibold text-white",
              pendingKey === "handoff" || readOnly
                ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
                : "bg-[color:var(--copper)] hover:opacity-90",
            )}
          >
            {pendingKey === "handoff" ? "Saving..." : readOnly ? "Preview only" : "Add handoff note"}
          </button>

          {selectedNotes.length > 0 ? (
            <div className="mt-4 space-y-2">
              {selectedNotes.map((note) => (
                <div key={note.id} className="rounded-[1.25rem] border border-[color:var(--line)] bg-[rgba(247,241,230,0.72)] px-4 py-3 text-sm text-[color:var(--muted)]">
                  <span className="font-semibold text-[color:var(--navy-strong)]">{note.authorName}</span>{" "}
                  {note.body}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-5">
        <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Attendance exceptions</div>
          <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
            Flag support blockers
          </h3>
          <div className="mt-5 grid gap-3">
            <select
              value={flagForm.studentId}
              onChange={(event) =>
                setFlagForm((current) => ({ ...current, studentId: event.currentTarget.value }))
              }
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            >
              {selectedRoster.map((row) => (
                <option key={row.studentId} value={row.studentId}>
                  {row.studentName}
                </option>
              ))}
            </select>
            <select
              value={flagForm.flagType}
              onChange={(event) =>
                setFlagForm((current) => ({ ...current, flagType: event.currentTarget.value }))
              }
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            >
              <option value="late_pattern">Late pattern</option>
              <option value="missing_guardian_reply">Missing guardian reply</option>
              <option value="needs_staff_follow_up">Needs staff follow-up</option>
            </select>
            <textarea
              value={flagForm.note}
              onChange={(event) =>
                setFlagForm((current) => ({ ...current, note: event.currentTarget.value }))
              }
              className="min-h-[110px] rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="Explain what needs attention."
              disabled={readOnly}
            />
            <button
              type="button"
              onClick={() =>
                runRequest(
                  "flag",
                  fetch("/api/ta/attendance-flags", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      sessionId: selectedSessionId,
                      studentId: flagForm.studentId,
                      flagType: flagForm.flagType,
                      note: flagForm.note,
                    }),
                  }),
                  "Attendance exception flagged.",
                  () => setFlagForm((current) => ({ ...current, note: "" })),
                )
              }
              disabled={pendingKey === "flag" || readOnly}
              className={clsx(
                "rounded-full px-4 py-2 text-sm font-semibold text-white",
                pendingKey === "flag" || readOnly
                  ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
                  : "bg-[color:var(--navy-strong)] hover:opacity-90",
              )}
            >
              {pendingKey === "flag" ? "Saving..." : readOnly ? "Preview only" : "Add exception flag"}
            </button>
          </div>

          {selectedFlags.length > 0 ? (
            <div className="mt-5 space-y-2">
              {selectedFlags.map((flag) => (
                <div key={flag.id} className="rounded-[1.25rem] border border-[color:var(--line)] bg-white/75 px-4 py-3 text-sm text-[color:var(--muted)]">
                  <div className="font-semibold text-[color:var(--navy-strong)]">{flag.flagType.replaceAll("_", " ")}</div>
                  <div className="mt-1">{flag.note}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Coverage marker</div>
          <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
            Sub or availability change
          </h3>
          <div className="mt-5 grid gap-3">
            <select
              value={coverageForm.status}
              onChange={(event) =>
                setCoverageForm((current) => ({
                  ...current,
                  status: event.currentTarget.value as SessionCoverageFlag["status"],
                }))
              }
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            >
              <option value="availability_change">Availability change</option>
              <option value="needs_substitute">Needs substitute</option>
              <option value="clear">Clear issue</option>
            </select>
            <textarea
              value={coverageForm.note}
              onChange={(event) =>
                setCoverageForm((current) => ({ ...current, note: event.currentTarget.value }))
              }
              className="min-h-[110px] rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="Describe the coverage issue or resolution."
              disabled={readOnly}
            />
            <button
              type="button"
              onClick={() =>
                runRequest(
                  "coverage",
                  fetch("/api/ta/coverage-flags", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      sessionId: selectedSessionId,
                      status: coverageForm.status,
                      note: coverageForm.note,
                    }),
                  }),
                  "Coverage marker updated.",
                )
              }
              disabled={pendingKey === "coverage" || readOnly}
              className={clsx(
                "rounded-full px-4 py-2 text-sm font-semibold text-white",
                pendingKey === "coverage" || readOnly
                  ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
                  : "bg-[color:var(--copper)] hover:opacity-90",
              )}
            >
              {pendingKey === "coverage" ? "Saving..." : readOnly ? "Preview only" : "Save coverage marker"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
