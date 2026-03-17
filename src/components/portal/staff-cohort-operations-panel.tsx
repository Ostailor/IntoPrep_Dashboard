"use client";

import { startTransition, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import type {
  AdminSavedView,
  Cohort,
  Enrollment,
  Session,
  SessionChecklist,
  Student,
} from "@/lib/domain";

interface StaffCohortOperationsPanelProps {
  viewerMode: "preview" | "live" | "live-role-preview";
  cohorts: Cohort[];
  sessions: Session[];
  students: Student[];
  enrollments: Enrollment[];
  sessionChecklists: SessionChecklist[];
  savedViews: AdminSavedView[];
}

function formatDateTimeLocal(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function StaffCohortOperationsPanel({
  viewerMode,
  cohorts,
  sessions,
  students,
  enrollments,
  sessionChecklists,
  savedViews,
}: StaffCohortOperationsPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const readOnly = viewerMode === "live-role-preview";
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const savedCohortViews = useMemo(
    () => savedViews.filter((view) => view.section === "cohorts"),
    [savedViews],
  );
  const cohortFilter = searchParams.get("cohortId") ?? cohorts[0]?.id ?? "";
  const selectedCohort = cohorts.find((cohort) => cohort.id === cohortFilter) ?? cohorts[0];
  const scopedSessions = useMemo(
    () => sessions.filter((session) => session.cohortId === selectedCohort?.id),
    [selectedCohort?.id, sessions],
  );
  const selectedSession = scopedSessions[0];
  const checklist = sessionChecklists.find((entry) => entry.sessionId === selectedSession?.id) ?? null;
  const [sessionForm, setSessionForm] = useState(() => ({
    sessionId: selectedSession?.id ?? "",
    title: selectedSession?.title ?? "",
    startAt: selectedSession ? formatDateTimeLocal(selectedSession.startAt) : "",
    endAt: selectedSession ? formatDateTimeLocal(selectedSession.endAt) : "",
    roomLabel: selectedSession?.roomLabel ?? selectedCohort?.roomLabel ?? "",
    mode: selectedSession?.mode ?? "Hybrid",
  }));
  const [checklistState, setChecklistState] = useState({
    roomConfirmed: checklist?.roomConfirmed ?? false,
    rosterReviewed: checklist?.rosterReviewed ?? false,
    materialsReady: checklist?.materialsReady ?? false,
    familyNoticeSentIfNeeded: checklist?.familyNoticeSentIfNeeded ?? false,
    attendanceComplete: checklist?.attendanceComplete ?? false,
    scoresLoggedIfNeeded: checklist?.scoresLoggedIfNeeded ?? false,
    followUpSentIfNeeded: checklist?.followUpSentIfNeeded ?? false,
    notesClosedOut: checklist?.notesClosedOut ?? false,
  });
  const [moveState, setMoveState] = useState({
    studentId: "",
    targetCohortId: cohorts.find((cohort) => cohort.id !== selectedCohort?.id)?.id ?? "",
  });

  const sourceStudents = useMemo(() => {
    const studentIds = enrollments
      .filter((enrollment) => enrollment.cohortId === selectedCohort?.id && enrollment.status === "active")
      .map((enrollment) => enrollment.studentId);
    return students.filter((student) => studentIds.includes(student.id));
  }, [enrollments, selectedCohort?.id, students]);

  const saveView = () => {
    if (readOnly) {
      setError("Role preview is read-only.");
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
        const response = await fetch("/api/staff/views", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            section: "cohorts",
            filterState: {
              cohortId: selectedCohort?.id ?? "",
            },
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Saved view failed.");
        }

        setSuccess("Personal cohort view saved.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Saved view failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const handleSessionSave = (force = false) => {
    if (readOnly) {
      setError("Role preview is read-only.");
      return;
    }

    setPendingKey("session");
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/staff/sessions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId: sessionForm.sessionId,
            title: sessionForm.title,
            startAt: new Date(sessionForm.startAt).toISOString(),
            endAt: new Date(sessionForm.endAt).toISOString(),
            roomLabel: sessionForm.roomLabel,
            mode: sessionForm.mode,
            force,
          }),
        });
        const payload = (await response.json()) as {
          error?: string;
          warnings?: string[];
          updated?: boolean;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Session update failed.");
        }

        if (payload.updated === false && payload.warnings && payload.warnings.length > 0) {
          const confirmed = window.confirm(`Save with warnings?\n\n${payload.warnings.join("\n")}`);
          if (confirmed) {
            handleSessionSave(true);
          }
          return;
        }

        setSuccess("Session details updated.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Session update failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const handleChecklistSave = () => {
    if (readOnly) {
      setError("Role preview is read-only.");
      return;
    }

    setPendingKey("checklist");
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/staff/checklists", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId: sessionForm.sessionId,
            checklist: checklistState,
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Checklist update failed.");
        }

        setSuccess("Session checklist updated.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Checklist update failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const handleMoveStudent = () => {
    if (readOnly) {
      setError("Role preview is read-only.");
      return;
    }

    setPendingKey("move");
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/staff/cohorts/move-student", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(moveState),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Enrollment move failed.");
        }

        setSuccess("Student moved to the new cohort.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Enrollment move failed.");
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

      <div className="flex flex-wrap gap-3">
        <select
          value={selectedCohort?.id ?? ""}
          onChange={(event) => {
            router.replace(`${pathname}?cohortId=${event.currentTarget.value}`);
          }}
          className="rounded-full border border-[color:var(--line)] bg-white px-4 py-2 text-sm text-[color:var(--navy-strong)]"
        >
          {cohorts.map((cohort) => (
            <option key={cohort.id} value={cohort.id}>
              {cohort.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={saveView}
          disabled={pendingKey === "save-view" || readOnly}
          className={clsx(
            "rounded-full border px-4 py-2 text-sm font-semibold",
            pendingKey === "save-view" || readOnly
              ? "cursor-not-allowed border-[color:var(--line)] bg-stone-100 text-[color:var(--muted)]"
              : "border-[rgba(187,110,69,0.24)] bg-[rgba(187,110,69,0.12)] text-[color:var(--copper)]",
          )}
        >
          Save view
        </button>
      </div>

      {savedCohortViews.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {savedCohortViews.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => {
                const next = view.filterState.cohortId;
                router.replace(`${pathname}${typeof next === "string" ? `?cohortId=${next}` : ""}`);
              }}
              className="rounded-full border border-[color:var(--line)] bg-white/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]"
            >
              {view.name}
            </button>
          ))}
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Session details</div>
          <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
            Day-to-day edits
          </h3>
          <div className="mt-5 grid gap-3">
            <select
              value={sessionForm.sessionId}
              onChange={(event) => {
                const nextSession = scopedSessions.find((session) => session.id === event.currentTarget.value);
                setSessionForm({
                  sessionId: nextSession?.id ?? "",
                  title: nextSession?.title ?? "",
                  startAt: nextSession ? formatDateTimeLocal(nextSession.startAt) : "",
                  endAt: nextSession ? formatDateTimeLocal(nextSession.endAt) : "",
                  roomLabel: nextSession?.roomLabel ?? selectedCohort?.roomLabel ?? "",
                  mode: nextSession?.mode ?? "Hybrid",
                });
                const nextChecklist = sessionChecklists.find((entry) => entry.sessionId === nextSession?.id) ?? null;
                setChecklistState({
                  roomConfirmed: nextChecklist?.roomConfirmed ?? false,
                  rosterReviewed: nextChecklist?.rosterReviewed ?? false,
                  materialsReady: nextChecklist?.materialsReady ?? false,
                  familyNoticeSentIfNeeded: nextChecklist?.familyNoticeSentIfNeeded ?? false,
                  attendanceComplete: nextChecklist?.attendanceComplete ?? false,
                  scoresLoggedIfNeeded: nextChecklist?.scoresLoggedIfNeeded ?? false,
                  followUpSentIfNeeded: nextChecklist?.followUpSentIfNeeded ?? false,
                  notesClosedOut: nextChecklist?.notesClosedOut ?? false,
                });
              }}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            >
              {scopedSessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.title}
                </option>
              ))}
            </select>
            <input
              value={sessionForm.title}
              onChange={(event) => setSessionForm((current) => ({ ...current, title: event.currentTarget.value }))}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="Session title"
              disabled={readOnly}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <input
                type="datetime-local"
                value={sessionForm.startAt}
                onChange={(event) => setSessionForm((current) => ({ ...current, startAt: event.currentTarget.value }))}
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                disabled={readOnly}
              />
              <input
                type="datetime-local"
                value={sessionForm.endAt}
                onChange={(event) => setSessionForm((current) => ({ ...current, endAt: event.currentTarget.value }))}
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                disabled={readOnly}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={sessionForm.roomLabel}
                onChange={(event) => setSessionForm((current) => ({ ...current, roomLabel: event.currentTarget.value }))}
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                placeholder="Room"
                disabled={readOnly}
              />
              <select
                value={sessionForm.mode}
                onChange={(event) =>
                  setSessionForm((current) => ({
                    ...current,
                    mode: event.currentTarget.value as "In person" | "Hybrid" | "Zoom",
                  }))
                }
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                disabled={readOnly}
              >
                <option value="In person">In person</option>
                <option value="Hybrid">Hybrid</option>
                <option value="Zoom">Zoom</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => handleSessionSave(false)}
              disabled={pendingKey === "session" || readOnly}
              className={clsx(
                "rounded-full px-4 py-2 text-sm font-semibold text-white",
                pendingKey === "session" || readOnly
                  ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
                  : "bg-[color:var(--navy-strong)] hover:opacity-90",
              )}
            >
              {pendingKey === "session" ? "Saving..." : readOnly ? "Preview only" : "Save session"}
            </button>
          </div>
        </div>

        <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Prep and closeout checklist</div>
          <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
            Shared session checklist
          </h3>
          <div className="mt-5 grid gap-3">
            {[
              ["roomConfirmed", "Room confirmed"],
              ["rosterReviewed", "Roster reviewed"],
              ["materialsReady", "Materials ready"],
              ["familyNoticeSentIfNeeded", "Family notice sent if needed"],
              ["attendanceComplete", "Attendance complete"],
              ["scoresLoggedIfNeeded", "Scores logged if needed"],
              ["followUpSentIfNeeded", "Follow-up sent if needed"],
              ["notesClosedOut", "Notes closed out"],
            ].map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-3 rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              >
                <input
                  checked={Boolean(checklistState[key as keyof typeof checklistState])}
                  onChange={(event) =>
                    setChecklistState((current) => ({
                      ...current,
                      [key]: event.currentTarget.checked,
                    }))
                  }
                  type="checkbox"
                  disabled={readOnly}
                />
                <span>{label}</span>
              </label>
            ))}
            <button
              type="button"
              onClick={handleChecklistSave}
              disabled={pendingKey === "checklist" || readOnly}
              className={clsx(
                "rounded-full px-4 py-2 text-sm font-semibold text-white",
                pendingKey === "checklist" || readOnly
                  ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
                  : "bg-[color:var(--copper)] hover:opacity-90",
              )}
            >
              {pendingKey === "checklist" ? "Saving..." : readOnly ? "Preview only" : "Save checklist"}
            </button>
          </div>
        </div>
      </section>

      <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
        <div className="section-kicker">Single student move</div>
        <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
          Update one cohort placement
        </h3>
        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <select
            value={moveState.studentId}
            onChange={(event) => setMoveState((current) => ({ ...current, studentId: event.currentTarget.value }))}
            className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            disabled={readOnly}
          >
            <option value="">Select a student</option>
            {sourceStudents.map((student) => (
              <option key={student.id} value={student.id}>
                {student.firstName} {student.lastName}
              </option>
            ))}
          </select>
          <select
            value={moveState.targetCohortId}
            onChange={(event) => setMoveState((current) => ({ ...current, targetCohortId: event.currentTarget.value }))}
            className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            disabled={readOnly}
          >
            {cohorts
              .filter((cohort) => cohort.id !== selectedCohort?.id)
              .map((cohort) => (
                <option key={cohort.id} value={cohort.id}>
                  {cohort.name}
                </option>
              ))}
          </select>
          <button
            type="button"
            onClick={handleMoveStudent}
            disabled={pendingKey === "move" || readOnly || !moveState.studentId}
            className={clsx(
              "rounded-full px-4 py-2 text-sm font-semibold text-white",
              pendingKey === "move" || readOnly || !moveState.studentId
                ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
                : "bg-[color:var(--navy-strong)] hover:opacity-90",
            )}
          >
            {pendingKey === "move" ? "Moving..." : readOnly ? "Preview only" : "Move student"}
          </button>
        </div>
      </section>
    </div>
  );
}
