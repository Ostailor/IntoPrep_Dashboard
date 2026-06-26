"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
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
  const [selectedCohortId, setSelectedCohortId] = useState(searchParams.get("cohortId") ?? cohorts[0]?.id ?? "");
  const selectedCohort = cohorts.find((cohort) => cohort.id === selectedCohortId) ?? cohorts[0];
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

  const replaceCohortUrl = (cohortId: string) => {
    const params = new URLSearchParams(
      typeof window === "undefined" ? searchParams.toString() : window.location.search,
    );
    if (cohortId) {
      params.set("cohortId", cohortId);
    } else {
      params.delete("cohortId");
    }
    window.history.replaceState(null, "", `${pathname}${params.size > 0 ? `?${params.toString()}` : ""}`);
  };

  useEffect(() => {
    const nextSession = sessions.find((session) => session.cohortId === selectedCohort?.id);
    const nextChecklist = sessionChecklists.find((entry) => entry.sessionId === nextSession?.id) ?? null;
    setSessionForm({
      sessionId: nextSession?.id ?? "",
      title: nextSession?.title ?? "",
      startAt: nextSession ? formatDateTimeLocal(nextSession.startAt) : "",
      endAt: nextSession ? formatDateTimeLocal(nextSession.endAt) : "",
      roomLabel: nextSession?.roomLabel ?? selectedCohort?.roomLabel ?? "",
      mode: nextSession?.mode ?? "Hybrid",
    });
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
    setMoveState({
      studentId: "",
      targetCohortId: cohorts.find((cohort) => cohort.id !== selectedCohort?.id)?.id ?? "",
    });
  }, [cohorts, selectedCohort?.id, selectedCohort?.roomLabel, sessionChecklists, sessions]);

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
          throw new Error(payload.error ?? "Class update failed.");
        }

        if (payload.updated === false && payload.warnings && payload.warnings.length > 0) {
          const confirmed = window.confirm(`Save with warnings?\n\n${payload.warnings.join("\n")}`);
          if (confirmed) {
            handleSessionSave(true);
          }
          return;
        }

        setSuccess("Class details updated.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Class update failed.");
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

        setSuccess("Class checklist updated.");
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
            const cohortId = event.currentTarget.value;
            setSelectedCohortId(cohortId);
            replaceCohortUrl(cohortId);
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
                if (typeof next === "string") {
                  setSelectedCohortId(next);
                  replaceCohortUrl(next);
                }
              }}
              className="rounded-full border border-[color:var(--line)] bg-white/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]"
            >
              {view.name}
            </button>
          ))}
        </div>
      ) : null}

      <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="section-kicker">Cohort roster</div>
            <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
              {selectedCohort?.name ?? "Selected cohort"}
            </h3>
          </div>
          <div className="rounded-full border border-[color:var(--line)] bg-white/85 px-4 py-2 text-sm font-semibold text-[color:var(--navy-strong)]">
            {sourceStudents.length}/{selectedCohort?.capacity ?? 0} active
          </div>
        </div>
        <div className="mt-5 max-h-[320px] overflow-y-auto rounded-[1.5rem] border border-[color:var(--line)] bg-white/70">
          {sourceStudents.length > 0 ? (
            sourceStudents.map((student) => (
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

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Class details</div>
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
              onChange={(event) => {
                const title = event.currentTarget.value;
                setSessionForm((current) => ({ ...current, title }));
              }}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="Class name"
              disabled={readOnly}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <input
                type="datetime-local"
                value={sessionForm.startAt}
                onChange={(event) => {
                  const startAt = event.currentTarget.value;
                  setSessionForm((current) => ({ ...current, startAt }));
                }}
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                disabled={readOnly}
              />
              <input
                type="datetime-local"
                value={sessionForm.endAt}
                onChange={(event) => {
                  const endAt = event.currentTarget.value;
                  setSessionForm((current) => ({ ...current, endAt }));
                }}
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                disabled={readOnly}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={sessionForm.roomLabel}
                onChange={(event) => {
                  const roomLabel = event.currentTarget.value;
                  setSessionForm((current) => ({ ...current, roomLabel }));
                }}
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                placeholder="Room"
                disabled={readOnly}
              />
              <select
                value={sessionForm.mode}
                onChange={(event) => {
                  const mode = event.currentTarget.value as "In person" | "Hybrid" | "Zoom";
                  setSessionForm((current) => ({
                    ...current,
                    mode,
                  }));
                }}
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
              {pendingKey === "session" ? "Saving..." : readOnly ? "Preview only" : "Save class"}
            </button>
          </div>
        </div>

        <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Prep and closeout checklist</div>
          <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
            Shared class checklist
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
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setChecklistState((current) => ({
                      ...current,
                      [key]: checked,
                    }));
                  }}
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
