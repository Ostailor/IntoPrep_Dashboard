"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type {
  AcademicNote,
  InstructionalAccommodation,
  InstructorFollowUpFlag,
  SessionInstructionNote,
  Student,
} from "@/lib/domain";
import type { StudentTrendRow } from "@/lib/portal";
import { TrendSparkline } from "@/components/portal/trend-sparkline";

interface InstructorAcademicsPanelProps {
  viewerMode: "preview" | "live" | "live-role-preview";
  viewerId: string;
  students: Student[];
  sessions: {
    id: string;
    title: string;
    cohortId: string;
  }[];
  notes: AcademicNote[];
  sessionNotes: SessionInstructionNote[];
  accommodations: InstructionalAccommodation[];
  followUpFlags: InstructorFollowUpFlag[];
  trendRows: StudentTrendRow[];
}

function formatSavedTimestamp() {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

function autosaveToneClass(state: "idle" | "saving" | "saved" | "error") {
  if (state === "error") {
    return "text-rose-700";
  }

  if (state === "saved") {
    return "text-emerald-700";
  }

  return "text-[color:var(--muted)]";
}

export function InstructorAcademicsPanel({
  viewerMode,
  viewerId,
  students,
  sessions,
  notes,
  sessionNotes,
  accommodations,
  followUpFlags,
  trendRows,
}: InstructorAcademicsPanelProps) {
  const router = useRouter();
  const readOnly = viewerMode === "live-role-preview";
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id ?? "");
  const [selectedStudentNoteId, setSelectedStudentNoteId] = useState("new");
  const [studentNoteSummary, setStudentNoteSummary] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState(sessions[0]?.id ?? "");
  const [selectedSessionNoteId, setSelectedSessionNoteId] = useState("new");
  const [sessionNoteBody, setSessionNoteBody] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [studentAutosave, setStudentAutosave] = useState({
    tone: "idle" as "idle" | "saving" | "saved" | "error",
    message: "Student notes save after you pause typing.",
  });
  const [sessionAutosave, setSessionAutosave] = useState({
    tone: "idle" as "idle" | "saving" | "saved" | "error",
    message: "Session notes save after you pause typing.",
  });
  const [studentDirty, setStudentDirty] = useState(false);
  const [sessionDirty, setSessionDirty] = useState(false);

  useEffect(() => {
    if (!selectedStudentId || !students.some((student) => student.id === selectedStudentId)) {
      setSelectedStudentId(students[0]?.id ?? "");
    }
  }, [selectedStudentId, students]);

  useEffect(() => {
    if (!selectedSessionId || !sessions.some((session) => session.id === selectedSessionId)) {
      setSelectedSessionId(sessions[0]?.id ?? "");
    }
  }, [selectedSessionId, sessions]);

  const visibleStudentNotes = useMemo(
    () => notes.filter((note) => note.studentId === selectedStudentId),
    [notes, selectedStudentId],
  );
  const editableStudentNotes = useMemo(
    () => visibleStudentNotes.filter((note) => note.authorId === viewerId),
    [viewerId, visibleStudentNotes],
  );
  const visibleSessionNotes = useMemo(
    () => sessionNotes.filter((note) => note.sessionId === selectedSessionId),
    [selectedSessionId, sessionNotes],
  );
  const editableSessionNotes = useMemo(
    () => visibleSessionNotes.filter((note) => note.authorId === viewerId),
    [viewerId, visibleSessionNotes],
  );
  const selectedTrend = useMemo(
    () => trendRows.find((row) => row.studentId === selectedStudentId) ?? null,
    [selectedStudentId, trendRows],
  );
  const selectedAccommodations = useMemo(
    () => accommodations.filter((item) => item.studentId === selectedStudentId),
    [accommodations, selectedStudentId],
  );
  const selectedFlags = useMemo(
    () =>
      followUpFlags.filter(
        (flag) =>
          flag.targetId === selectedStudentId || flag.targetId === selectedSessionId,
      ),
    [followUpFlags, selectedSessionId, selectedStudentId],
  );

  useEffect(() => {
    if (selectedStudentNoteId !== "new" && !editableStudentNotes.some((note) => note.id === selectedStudentNoteId)) {
      setSelectedStudentNoteId("new");
    }
  }, [editableStudentNotes, selectedStudentNoteId]);

  useEffect(() => {
    if (selectedSessionNoteId !== "new" && !editableSessionNotes.some((note) => note.id === selectedSessionNoteId)) {
      setSelectedSessionNoteId("new");
    }
  }, [editableSessionNotes, selectedSessionNoteId]);

  useEffect(() => {
    if (selectedStudentNoteId === "new" || studentDirty) {
      return;
    }

    const note = editableStudentNotes.find((entry) => entry.id === selectedStudentNoteId);
    if (!note) {
      return;
    }

    setStudentNoteSummary(note.summary);
  }, [editableStudentNotes, selectedStudentNoteId, studentDirty]);

  useEffect(() => {
    if (selectedStudentNoteId === "new") {
      setStudentNoteSummary("");
      setStudentDirty(false);
      setStudentAutosave({
        tone: "idle",
        message: "Student notes save after you pause typing.",
      });
    }
  }, [selectedStudentNoteId]);

  useEffect(() => {
    if (selectedSessionNoteId === "new" || sessionDirty) {
      return;
    }

    const note = editableSessionNotes.find((entry) => entry.id === selectedSessionNoteId);
    if (!note) {
      return;
    }

    setSessionNoteBody(note.body);
  }, [editableSessionNotes, selectedSessionNoteId, sessionDirty]);

  useEffect(() => {
    if (selectedSessionNoteId === "new") {
      setSessionNoteBody("");
      setSessionDirty(false);
      setSessionAutosave({
        tone: "idle",
        message: "Session notes save after you pause typing.",
      });
    }
  }, [selectedSessionNoteId]);

  useEffect(() => {
    if (readOnly || !studentDirty || studentNoteSummary.trim().length < 8) {
      return;
    }

    const timeout = window.setTimeout(() => {
      startTransition(async () => {
        setPendingKey("student-note");
        setStudentAutosave({ tone: "saving", message: "Saving student note..." });
        setError(null);

        try {
          const response = await fetch("/api/academics/notes", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              noteId: selectedStudentNoteId === "new" ? undefined : selectedStudentNoteId,
              studentId: selectedStudentId,
              summary: studentNoteSummary.trim(),
            }),
          });
          const payload = (await response.json()) as { error?: string; noteId?: string };

          if (!response.ok) {
            throw new Error(payload.error ?? "Student note save failed.");
          }

          if (payload.noteId) {
            setSelectedStudentNoteId(payload.noteId);
          }

          setStudentDirty(false);
          setStudentAutosave({
            tone: "saved",
            message: `Saved ${formatSavedTimestamp()}`,
          });
          router.refresh();
        } catch (nextError) {
          setStudentAutosave({
            tone: "error",
            message:
              nextError instanceof Error ? nextError.message : "Student note save failed.",
          });
          setError(
            nextError instanceof Error ? nextError.message : "Student note save failed.",
          );
        } finally {
          setPendingKey(null);
        }
      });
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [
    readOnly,
    router,
    selectedStudentId,
    selectedStudentNoteId,
    studentDirty,
    studentNoteSummary,
  ]);

  useEffect(() => {
    if (readOnly || !sessionDirty || sessionNoteBody.trim().length < 8) {
      return;
    }

    const timeout = window.setTimeout(() => {
      startTransition(async () => {
        setPendingKey("session-note");
        setSessionAutosave({ tone: "saving", message: "Saving session note..." });
        setError(null);

        try {
          const response = await fetch("/api/academics/session-notes", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              noteId: selectedSessionNoteId === "new" ? undefined : selectedSessionNoteId,
              sessionId: selectedSessionId,
              body: sessionNoteBody.trim(),
            }),
          });
          const payload = (await response.json()) as { error?: string; noteId?: string };

          if (!response.ok) {
            throw new Error(payload.error ?? "Session note save failed.");
          }

          if (payload.noteId) {
            setSelectedSessionNoteId(payload.noteId);
          }

          setSessionDirty(false);
          setSessionAutosave({
            tone: "saved",
            message: `Saved ${formatSavedTimestamp()}`,
          });
          router.refresh();
        } catch (nextError) {
          setSessionAutosave({
            tone: "error",
            message:
              nextError instanceof Error ? nextError.message : "Session note save failed.",
          });
          setError(
            nextError instanceof Error ? nextError.message : "Session note save failed.",
          );
        } finally {
          setPendingKey(null);
        }
      });
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [
    readOnly,
    router,
    selectedSessionId,
    selectedSessionNoteId,
    sessionDirty,
    sessionNoteBody,
  ]);

  return (
    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="space-y-5">
        {error ? (
          <div className="rounded-[1.5rem] border border-rose-200 bg-rose-100/90 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Student notes</div>
          <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
            Instructional history
          </h3>

          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
            <select
              value={selectedStudentId}
              onChange={(event) => setSelectedStudentId(event.currentTarget.value)}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            >
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.firstName} {student.lastName}
                </option>
              ))}
            </select>
            <select
              value={selectedStudentNoteId}
              onChange={(event) => {
                setSelectedStudentNoteId(event.currentTarget.value);
                setStudentDirty(false);
              }}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              disabled={readOnly}
            >
              <option value="new">New note</option>
              {editableStudentNotes.map((note) => (
                <option key={note.id} value={note.id}>
                  {note.summary.slice(0, 48)}
                </option>
              ))}
            </select>
          </div>

          <textarea
            value={studentNoteSummary}
            onChange={(event) => {
              setStudentNoteSummary(event.currentTarget.value);
              setStudentDirty(true);
              setStudentAutosave({
                tone: "idle",
                message: "Student notes save after you pause typing.",
              });
            }}
            className="mt-4 min-h-[150px] w-full rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            placeholder="Capture instructional context for this student."
            disabled={readOnly}
          />
          <div
            className={clsx(
              "mt-3 text-sm",
              autosaveToneClass(studentAutosave.tone),
            )}
          >
            {pendingKey === "student-note" ? "Saving student note..." : studentAutosave.message}
          </div>

          <div className="mt-5 space-y-3">
            {visibleStudentNotes.map((note) => (
              <div
                key={note.id}
                className="rounded-[1.25rem] border border-[color:var(--line)] bg-white/75 p-4"
              >
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  {note.authorName ?? "IntoPrep Team"}
                </div>
                <div className="mt-2 text-sm text-[color:var(--navy-strong)]">{note.summary}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Session notes</div>
          <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
            Class block memory
          </h3>

          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
            <select
              value={selectedSessionId}
              onChange={(event) => setSelectedSessionId(event.currentTarget.value)}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.title}
                </option>
              ))}
            </select>
            <select
              value={selectedSessionNoteId}
              onChange={(event) => {
                setSelectedSessionNoteId(event.currentTarget.value);
                setSessionDirty(false);
              }}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              disabled={readOnly}
            >
              <option value="new">New session note</option>
              {editableSessionNotes.map((note) => (
                <option key={note.id} value={note.id}>
                  {note.body.slice(0, 48)}
                </option>
              ))}
            </select>
          </div>

          <textarea
            value={sessionNoteBody}
            onChange={(event) => {
              setSessionNoteBody(event.currentTarget.value);
              setSessionDirty(true);
              setSessionAutosave({
                tone: "idle",
                message: "Session notes save after you pause typing.",
              });
            }}
            className="mt-4 min-h-[140px] w-full rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            placeholder="Capture what the teaching team should remember about this session."
            disabled={readOnly}
          />
          <div
            className={clsx(
              "mt-3 text-sm",
              autosaveToneClass(sessionAutosave.tone),
            )}
          >
            {pendingKey === "session-note" ? "Saving session note..." : sessionAutosave.message}
          </div>

          <div className="mt-5 space-y-3">
            {visibleSessionNotes.map((note) => (
              <div
                key={note.id}
                className="rounded-[1.25rem] border border-[color:var(--line)] bg-white/75 p-4"
              >
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  {note.authorName}
                </div>
                <div className="mt-2 text-sm text-[color:var(--navy-strong)]">{note.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Read-only trend</div>
          <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
            Student pulse
          </h3>
          {selectedTrend ? (
            <div className="mt-5 rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                    {selectedTrend.studentName}
                  </div>
                  <div className="mt-1 text-sm text-[color:var(--muted)]">{selectedTrend.focus}</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-semibold text-[color:var(--navy-strong)]">
                    {selectedTrend.latestScore ?? "—"}
                  </div>
                  <div className="text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    {selectedTrend.deltaFromPrevious && selectedTrend.deltaFromPrevious >= 0 ? "+" : ""}
                    {selectedTrend.deltaFromPrevious ?? 0} latest delta
                  </div>
                </div>
              </div>
              <TrendSparkline className="mt-3" points={selectedTrend.trend} tone="navy" />
            </div>
          ) : (
            <div className="mt-5 rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 px-4 py-5 text-sm text-[color:var(--muted)]">
              No trend history is available for the selected student yet.
            </div>
          )}
        </div>

        <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Classroom supports</div>
          <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
            Accommodations
          </h3>
          <div className="mt-5 space-y-3">
            {selectedAccommodations.length === 0 ? (
              <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 px-4 py-5 text-sm text-[color:var(--muted)]">
                No classroom accommodations are recorded for this student.
              </div>
            ) : null}
            {selectedAccommodations.map((accommodation) => (
              <div
                key={accommodation.id}
                className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
              >
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  {accommodation.title}
                </div>
                <div className="mt-2 text-sm text-[color:var(--navy-strong)]">
                  {accommodation.detail}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Open flags</div>
          <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
            Follow-up status
          </h3>
          <div className="mt-5 space-y-3">
            {selectedFlags.length === 0 ? (
              <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 px-4 py-5 text-sm text-[color:var(--muted)]">
                No follow-up flags are open for this student or session.
              </div>
            ) : null}
            {selectedFlags.map((flag) => (
              <div
                key={flag.id}
                className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-[color:var(--navy-strong)]">
                    {flag.summary}
                  </div>
                  <span className="rounded-full border border-[rgba(23,56,75,0.16)] bg-[rgba(23,56,75,0.08)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--navy-strong)]">
                    {flag.status}
                  </span>
                </div>
                {flag.note ? (
                  <div className="mt-2 text-sm text-[color:var(--muted)]">{flag.note}</div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
