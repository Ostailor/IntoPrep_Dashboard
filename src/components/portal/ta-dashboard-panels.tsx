"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type {
  AdminAnnouncement,
  AdminTask,
  MessageThread,
  Session,
  SessionChecklist,
  SessionCoverageFlag,
  SessionHandoffNote,
  TaskActivity,
} from "@/lib/domain";
import type { StudentTrendRow } from "@/lib/portal";
import { TrendSparkline } from "@/components/portal/trend-sparkline";

interface TaDashboardPanelsProps {
  viewerMode: "preview" | "live" | "live-role-preview";
  tasks: AdminTask[];
  taskActivities: TaskActivity[];
  threads: MessageThread[];
  sessions: Session[];
  sessionChecklists: SessionChecklist[];
  handoffNotes: SessionHandoffNote[];
  coverageFlags: SessionCoverageFlag[];
  announcements: AdminAnnouncement[];
  trendRows: StudentTrendRow[];
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

export function TaDashboardPanels({
  viewerMode,
  tasks,
  taskActivities,
  threads,
  sessions,
  sessionChecklists,
  handoffNotes,
  coverageFlags,
  announcements,
  trendRows,
}: TaDashboardPanelsProps) {
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

  const checklistBySessionId = useMemo(
    () => new Map(sessionChecklists.map((checklist) => [checklist.sessionId, checklist])),
    [sessionChecklists],
  );

  const sessionsNeedingAttention = useMemo(() => {
    const now = Date.now();
    return sessions
      .filter((session) => {
        const checklist = checklistBySessionId.get(session.id);
        const sessionStart = Date.parse(session.startAt);
        const coverage = coverageFlags.find(
          (flag) => flag.sessionId === session.id && flag.status !== "clear",
        );

        if (coverage) {
          return true;
        }

        if (!checklist) {
          return true;
        }

        if (sessionStart > now) {
          return !(
            checklist.roomConfirmed &&
            checklist.rosterReviewed &&
            checklist.materialsReady
          );
        }

        return !(
          checklist.attendanceComplete &&
          checklist.scoresLoggedIfNeeded &&
          checklist.notesClosedOut
        );
      })
      .slice(0, 6);
  }, [checklistBySessionId, coverageFlags, sessions]);

  const recentHandoffs = handoffNotes.slice(0, 4);
  const unreadThreads = threads
    .filter((thread) => thread.unreadCount > 0)
    .sort((left, right) => right.lastMessageAt.localeCompare(left.lastMessageAt))
    .slice(0, 5);

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
        const response = await fetch("/api/ta/tasks", {
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
        setSuccess("Assigned task updated.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Task update failed.");
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

      <section className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Assigned queue</div>
          <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
            Today’s support tasks
          </h3>
          <div className="mt-5 space-y-4">
            {tasks.map((task) => {
              const draft = taskDrafts[task.id] ?? {
                status: task.status,
                body: "",
                noteType: "progress",
              };
              const activityRows = taskActivities.filter((activity) => activity.taskId === task.id).slice(0, 2);

              return (
                <div key={task.id} className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-base font-semibold text-[color:var(--navy-strong)]">{task.title}</div>
                      <div className="mt-1 text-sm text-[color:var(--muted)]">{task.details}</div>
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
                      className="rounded-full border border-[color:var(--line)] bg-white/90 px-4 py-2 text-sm text-[color:var(--navy-strong)]"
                      placeholder="Add a quick update for the queue."
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
                          className="rounded-[1.25rem] border border-[color:var(--line)] bg-[rgba(247,241,230,0.72)] px-4 py-3 text-sm text-[color:var(--muted)]"
                        >
                          <span className="font-semibold text-[color:var(--navy-strong)]">{activity.authorName}</span>{" "}
                          {activity.body}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-5">
          <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
            <div className="section-kicker">Session watch</div>
            <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
              Support attention
            </h3>
            <div className="mt-5 space-y-3">
              {sessionsNeedingAttention.map((session) => (
                <div key={session.id} className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
                  <div className="text-base font-semibold text-[color:var(--navy-strong)]">{session.title}</div>
                  <div className="mt-1 text-sm text-[color:var(--muted)]">
                    {formatDateTime(session.startAt)} · {session.roomLabel}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
            <div className="section-kicker">Family replies</div>
            <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
              Unread thread watch
            </h3>
            <div className="mt-5 space-y-3">
              {unreadThreads.map((thread) => (
                <div key={thread.id} className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-base font-semibold text-[color:var(--navy-strong)]">{thread.subject}</div>
                    <span className="rounded-full border border-[rgba(187,110,69,0.24)] bg-[rgba(187,110,69,0.12)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--copper)]">
                      {thread.unreadCount} unread
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-[color:var(--muted)]">{thread.lastMessagePreview}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Instructor context</div>
          <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
            Recent handoff notes
          </h3>
          <div className="mt-5 space-y-3">
            {recentHandoffs.map((note) => (
              <div key={note.id} className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
                <div className="text-sm font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  {note.authorName}
                </div>
                <div className="mt-2 text-sm text-[color:var(--muted)]">{note.body}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Read-only trends</div>
          <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
            Assigned student momentum
          </h3>
          <div className="mt-5 space-y-3">
            {trendRows.slice(0, 5).map((student) => (
              <div key={student.studentId} className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-[color:var(--navy-strong)]">{student.studentName}</div>
                    <div className="mt-1 text-sm text-[color:var(--muted)]">{student.focus}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-semibold text-[color:var(--navy-strong)]">
                      {student.latestScore ?? "—"}
                    </div>
                    <div className="text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                      {student.deltaFromPrevious && student.deltaFromPrevious >= 0 ? "+" : ""}
                      {student.deltaFromPrevious ?? 0} latest delta
                    </div>
                  </div>
                </div>
                <TrendSparkline className="mt-3" points={student.trend} tone="copper" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {announcements.length > 0 ? (
        <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Operations notices</div>
          <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
            Admin announcements
          </h3>
          <div className="mt-5 space-y-3">
            {announcements.map((announcement) => (
              <div key={announcement.id} className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
                <div className="text-base font-semibold text-[color:var(--navy-strong)]">{announcement.title}</div>
                <div className="mt-2 text-sm text-[color:var(--muted)]">{announcement.body}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
