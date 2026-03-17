"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type {
  AdminTask,
  InstructorFollowUpFlag,
  Session,
  Student,
  TaskActivity,
} from "@/lib/domain";

interface InstructorDashboardPanelsProps {
  viewerMode: "preview" | "live" | "live-role-preview";
  tasks: AdminTask[];
  taskActivities: TaskActivity[];
  followUpFlags: InstructorFollowUpFlag[];
  sessions: Session[];
  students: Student[];
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "No due date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

export function InstructorDashboardPanels({
  viewerMode,
  tasks,
  taskActivities,
  followUpFlags,
  sessions,
  students,
}: InstructorDashboardPanelsProps) {
  const router = useRouter();
  const readOnly = viewerMode === "live-role-preview";
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, { status: string; body: string; noteType: string }>>(
    Object.fromEntries(
      tasks.map((task) => [
        task.id,
        {
          status: task.status,
          body: "",
          noteType: "progress",
        },
      ]),
    ),
  );

  const studentNameById = useMemo(
    () =>
      new Map(
        students.map((student) => [student.id, `${student.firstName} ${student.lastName}`]),
      ),
    [students],
  );
  const sessionTitleById = useMemo(
    () => new Map(sessions.map((session) => [session.id, session.title])),
    [sessions],
  );

  const handleTaskUpdate = (taskId: string) => {
    if (readOnly) {
      setError("Role preview is read-only.");
      return;
    }

    const draft = taskDrafts[taskId];
    if (!draft) {
      return;
    }

    setPendingKey(taskId);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/instructor/tasks", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            taskId,
            status: draft.status,
            body: draft.body,
            noteType: draft.noteType,
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Task update failed.");
        }

        setTaskDrafts((current) => ({
          ...current,
          [taskId]: {
            ...current[taskId],
            body: "",
          },
        }));
        setSuccess("Assigned teaching task updated.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Task update failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
        <div className="section-kicker">Assigned work</div>
        <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
          Teaching queue
        </h3>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          Instructors can update only their assigned tasks and internal progress notes.
        </p>

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

        <div className="mt-5 space-y-4">
          {tasks.length === 0 ? (
            <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 px-4 py-5 text-sm text-[color:var(--muted)]">
              No assigned instructor tasks are open right now.
            </div>
          ) : null}
          {tasks.map((task) => {
            const draft = taskDrafts[task.id] ?? {
              status: task.status,
              body: "",
              noteType: "progress",
            };
            const activityRows = taskActivities
              .filter((activity) => activity.taskId === task.id)
              .slice(0, 2);

            return (
              <div
                key={task.id}
                className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                      {task.title}
                    </div>
                    <div className="mt-1 text-sm text-[color:var(--muted)]">
                      {task.details}
                    </div>
                  </div>
                  <span className="rounded-full border border-[color:var(--line)] bg-stone-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    {formatDateTime(task.dueAt)}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-[auto_auto_minmax(0,1fr)_auto]">
                  <select
                    value={draft.status}
                    onChange={(event) =>
                      setTaskDrafts((current) => ({
                        ...current,
                        [task.id]: {
                          ...draft,
                          status: event.currentTarget.value,
                        },
                      }))
                    }
                    className="rounded-full border border-[color:var(--line)] bg-white/90 px-4 py-2 text-sm text-[color:var(--navy-strong)]"
                    disabled={readOnly}
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="done">Done</option>
                  </select>
                  <select
                    value={draft.noteType}
                    onChange={(event) =>
                      setTaskDrafts((current) => ({
                        ...current,
                        [task.id]: {
                          ...draft,
                          noteType: event.currentTarget.value,
                        },
                      }))
                    }
                    className="rounded-full border border-[color:var(--line)] bg-white/90 px-4 py-2 text-sm text-[color:var(--navy-strong)]"
                    disabled={readOnly}
                  >
                    <option value="progress">Progress</option>
                    <option value="handoff">Handoff</option>
                    <option value="blocker">Blocker</option>
                  </select>
                  <input
                    value={draft.body}
                    onChange={(event) =>
                      setTaskDrafts((current) => ({
                        ...current,
                        [task.id]: {
                          ...draft,
                          body: event.currentTarget.value,
                        },
                      }))
                    }
                    className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-2 text-sm text-[color:var(--navy-strong)]"
                    placeholder="Add a teaching update."
                    disabled={readOnly}
                  />
                  <button
                    type="button"
                    onClick={() => handleTaskUpdate(task.id)}
                    disabled={pendingKey === task.id || readOnly}
                    className={clsx(
                      "rounded-full px-4 py-2 text-sm font-semibold text-white",
                      pendingKey === task.id || readOnly
                        ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
                        : "bg-[color:var(--navy-strong)] hover:opacity-90",
                    )}
                  >
                    {pendingKey === task.id ? "Saving..." : readOnly ? "Preview only" : "Update"}
                  </button>
                </div>

                {activityRows.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {activityRows.map((activity) => (
                      <div
                        key={activity.id}
                        className="rounded-[1.25rem] border border-[rgba(23,56,75,0.12)] bg-[rgba(23,56,75,0.06)] px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                      >
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                          {activity.noteType} · {activity.authorName}
                        </div>
                        <div className="mt-2">{activity.body}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
        <div className="section-kicker">Follow-up watch</div>
        <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
          Open teaching flags
        </h3>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          Flags you create here stay internal and surface to TA, staff, and admin operations views.
        </p>

        <div className="mt-5 space-y-3">
          {followUpFlags.length === 0 ? (
            <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 px-4 py-5 text-sm text-[color:var(--muted)]">
              No open instructor follow-up flags yet.
            </div>
          ) : null}
          {followUpFlags.slice(0, 6).map((flag) => (
            <div
              key={flag.id}
              className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                  {flag.summary}
                </div>
                <span className="rounded-full border border-[rgba(23,56,75,0.16)] bg-[rgba(23,56,75,0.08)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--navy-strong)]">
                  {flag.status}
                </span>
              </div>
              <div className="mt-2 text-sm text-[color:var(--muted)]">
                {flag.targetType === "student"
                  ? studentNameById.get(flag.targetId) ?? flag.targetId
                  : sessionTitleById.get(flag.targetId) ?? flag.targetId}
              </div>
              {flag.note ? (
                <div className="mt-3 text-sm text-[color:var(--navy-strong)]">{flag.note}</div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
