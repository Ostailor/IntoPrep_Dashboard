"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type {
  AdminEscalation,
  AdminTask,
  ApprovalRequest,
  Invoice,
  Lead,
  Session,
  SessionChecklist,
  SyncJob,
  TaskActivity,
} from "@/lib/domain";

interface StaffDashboardPanelsProps {
  viewerMode: "preview" | "live" | "live-role-preview";
  tasks: AdminTask[];
  taskActivities: TaskActivity[];
  leads: Lead[];
  threads: Array<{
    id: string;
    subject: string;
    lastMessageAt: string;
    unreadCount: number;
  }>;
  syncJobs: SyncJob[];
  sessions: Session[];
  sessionChecklists: SessionChecklist[];
  invoices: Invoice[];
  approvalRequests: ApprovalRequest[];
  escalations: AdminEscalation[];
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

function formatDateTimeLocal(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function StaffDashboardPanels({
  viewerMode,
  tasks,
  taskActivities,
  leads,
  threads,
  syncJobs,
  sessions,
  sessionChecklists,
  invoices,
  approvalRequests,
  escalations,
}: StaffDashboardPanelsProps) {
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
  const [leadDrafts, setLeadDrafts] = useState<Record<string, { stage: string; notes: string; followUpDueAt: string }>>(
    Object.fromEntries(
      leads.map((lead) => [
        lead.id,
        {
          stage: lead.stage,
          notes: lead.notes ?? "",
          followUpDueAt: formatDateTimeLocal(lead.followUpDueAt),
        },
      ]),
    ),
  );
  const [approvalForm, setApprovalForm] = useState({
    requestType: "bulk_cohort_move",
    targetType: "cohort",
    targetId: "",
    reason: "",
    handoffNote: "",
  });
  const [escalationForm, setEscalationForm] = useState({
    sourceType: "task",
    sourceId: tasks[0]?.id ?? leads[0]?.id ?? "",
    reason: "",
    handoffNote: "",
  });

  const checklistBySessionId = useMemo(
    () => new Map(sessionChecklists.map((checklist) => [checklist.sessionId, checklist])),
    [sessionChecklists],
  );

  const overdueRows = useMemo(() => {
    const now = Date.now();
    const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
    const taskRows = tasks
      .filter((task) => task.dueAt && task.status !== "done" && Date.parse(task.dueAt) < now)
      .map((task) => ({
        id: task.id,
        label: task.title,
        detail: `Assigned task overdue since ${formatDateTime(task.dueAt)}`,
      }));
    const billingRows = tasks
      .filter((task) => task.taskType === "billing_follow_up" && task.status !== "done")
      .flatMap((task) => {
        const invoice = invoiceById.get(task.targetId);
        return invoice && Date.parse(invoice.dueDate) < now && invoice.followUpState !== "resolved"
          ? [
              {
                id: `invoice-${invoice.id}`,
                label: `Billing follow-up for ${invoice.id}`,
                detail: `Invoice due ${formatDateTime(invoice.dueDate)} is still unresolved.`,
              },
            ]
          : [];
      });
    const leadRows = leads
      .filter((lead) => lead.ownerId && lead.followUpDueAt && Date.parse(lead.followUpDueAt) < now)
      .map((lead) => ({
        id: lead.id,
        label: lead.studentName,
        detail: `Lead follow-up overdue since ${formatDateTime(lead.followUpDueAt)}.`,
      }));
    const threadRows = threads
      .filter((thread) => thread.unreadCount > 0 && now - Date.parse(thread.lastMessageAt) > 24 * 60 * 60 * 1000)
      .map((thread) => ({
        id: thread.id,
        label: thread.subject,
        detail: `Unread family thread waiting since ${formatDateTime(thread.lastMessageAt)}.`,
      }));

    return [...taskRows, ...billingRows, ...leadRows, ...threadRows].slice(0, 10);
  }, [invoices, leads, tasks, threads]);

  const sessionsNeedingAttention = useMemo(() => {
    const now = Date.now();

    return sessions
      .filter((session) => {
        const checklist = checklistBySessionId.get(session.id);
        const sessionStart = Date.parse(session.startAt);

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
          checklist.notesClosedOut &&
          checklist.followUpSentIfNeeded
        );
      })
      .slice(0, 6);
  }, [checklistBySessionId, sessions]);

  const handleTaskUpdate = (taskId: string) => {
    if (readOnly) {
      setError("Role preview is read-only.");
      return;
    }

    const taskDraft = taskDrafts[taskId];
    if (!taskDraft) {
      return;
    }

    setPendingKey(taskId);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/staff/tasks", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            taskId,
            status: taskDraft.status,
            body: taskDraft.body,
            noteType: taskDraft.noteType,
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

  const handleLeadAction = (leadId: string, action: "claim" | "release" | "update") => {
    if (readOnly) {
      setError("Role preview is read-only.");
      return;
    }

    const leadDraft = leadDrafts[leadId];
    setPendingKey(`lead-${leadId}`);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/staff/leads", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            leadId,
            action,
            stage: leadDraft?.stage,
            notes: leadDraft?.notes,
            followUpDueAt: leadDraft?.followUpDueAt
              ? new Date(leadDraft.followUpDueAt).toISOString()
              : null,
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Lead update failed.");
        }

        setSuccess(action === "claim" ? "Lead claimed." : action === "release" ? "Lead released." : "Lead updated.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Lead update failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const handleApprovalSubmit = () => {
    if (readOnly) {
      setError("Role preview is read-only.");
      return;
    }

    setPendingKey("approval");
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/staff/approvals", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(approvalForm),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Approval request failed.");
        }

        setApprovalForm({
          requestType: "bulk_cohort_move",
          targetType: "cohort",
          targetId: "",
          reason: "",
          handoffNote: "",
        });
        setSuccess("Approval request sent to admin.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Approval request failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const handleEscalationSubmit = () => {
    if (readOnly) {
      setError("Role preview is read-only.");
      return;
    }

    setPendingKey("escalation");
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/staff/escalations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(escalationForm),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Escalation failed.");
        }

        setEscalationForm((current) => ({
          ...current,
          reason: "",
          handoffNote: "",
        }));
        setSuccess("Escalation sent to admin.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Escalation failed.");
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

      <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Assigned tasks</div>
          <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
            Work queue
          </h3>
          <p className="mt-3 text-sm text-[color:var(--muted)]">
            Update only work assigned to you. Progress, handoff, and blocker notes stay on the task timeline.
          </p>
          <div className="mt-5 space-y-4">
            {tasks.map((task) => {
              const taskDraft = taskDrafts[task.id];
              const activityRows = taskActivities.filter((activity) => activity.taskId === task.id).slice(0, 2);

              return (
                <div
                  key={task.id}
                  className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-base font-semibold text-[color:var(--navy-strong)]">{task.title}</div>
                      <div className="mt-1 text-sm text-[color:var(--muted)]">{task.details ?? "No extra details."}</div>
                    </div>
                    <div className="rounded-full border border-[color:var(--line)] bg-stone-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                      {formatDateTime(task.dueAt)}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-[0.6fr_0.6fr_1.2fr_auto]">
                    <select
                      value={taskDraft?.status ?? task.status}
                      onChange={(event) =>
                        setTaskDrafts((current) => ({
                          ...current,
                          [task.id]: {
                            ...(current[task.id] ?? { body: "", noteType: "progress" }),
                            status: event.currentTarget.value,
                          },
                        }))
                      }
                      className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                      disabled={readOnly}
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In progress</option>
                      <option value="done">Done</option>
                    </select>
                    <select
                      value={taskDraft?.noteType ?? "progress"}
                      onChange={(event) =>
                        setTaskDrafts((current) => ({
                          ...current,
                          [task.id]: {
                            ...(current[task.id] ?? { body: "", status: task.status }),
                            noteType: event.currentTarget.value,
                          },
                        }))
                      }
                      className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                      disabled={readOnly}
                    >
                      <option value="progress">Progress</option>
                      <option value="handoff">Handoff</option>
                      <option value="blocker">Blocker</option>
                    </select>
                    <input
                      value={taskDraft?.body ?? ""}
                      onChange={(event) =>
                        setTaskDrafts((current) => ({
                          ...current,
                          [task.id]: {
                            ...(current[task.id] ?? { status: task.status, noteType: "progress" }),
                            body: event.currentTarget.value,
                          },
                        }))
                      }
                      className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                      placeholder="Add a progress, handoff, or blocker note"
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
                  <div className="mt-4 space-y-2">
                    {activityRows.map((activity) => (
                      <div key={activity.id} className="rounded-2xl border border-[color:var(--line)] bg-stone-50 px-4 py-3 text-sm text-[color:var(--muted)]">
                        <span className="font-semibold text-[color:var(--navy-strong)]">{activity.authorName}</span>
                        {" · "}
                        {activity.noteType.replaceAll("_", " ")}
                        {" · "}
                        {formatDateTime(activity.createdAt)}
                        <div className="mt-1">{activity.body}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {tasks.length === 0 ? (
              <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4 text-sm text-[color:var(--muted)]">
                No assigned tasks are open right now.
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-5">
          <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
            <div className="section-kicker">Overdue queue</div>
            <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
              What slipped
            </h3>
            <div className="mt-5 space-y-3">
              {overdueRows.map((row) => (
                <div key={row.id} className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
                  <div className="text-base font-semibold text-[color:var(--navy-strong)]">{row.label}</div>
                  <div className="mt-2 text-sm text-[color:var(--muted)]">{row.detail}</div>
                </div>
              ))}
              {overdueRows.length === 0 ? (
                <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4 text-sm text-[color:var(--muted)]">
                  No overdue items in your queue right now.
                </div>
              ) : null}
            </div>
          </div>

          <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
            <div className="section-kicker">Session watch</div>
            <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
              Prep and closeout
            </h3>
            <div className="mt-5 space-y-3">
              {sessionsNeedingAttention.map((session) => (
                <div key={session.id} className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
                  <div className="text-base font-semibold text-[color:var(--navy-strong)]">{session.title}</div>
                  <div className="mt-2 text-sm text-[color:var(--muted)]">{formatDateTime(session.startAt)} · {session.roomLabel}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Claimed leads</div>
          <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
            Intake follow-up
          </h3>
          <div className="mt-5 space-y-4">
            {leads.slice(0, 8).map((lead) => {
              const leadDraft = leadDrafts[lead.id];
              const owned = Boolean(lead.ownerId);

              return (
                <div key={lead.id} className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-base font-semibold text-[color:var(--navy-strong)]">{lead.studentName}</div>
                      <div className="mt-1 text-sm text-[color:var(--muted)]">
                        {lead.guardianName} · {lead.targetProgram}
                      </div>
                    </div>
                    <div className="rounded-full border border-[color:var(--line)] bg-stone-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                      {lead.ownerName ?? "Unowned"}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <select
                      value={leadDraft?.stage ?? lead.stage}
                      onChange={(event) =>
                        setLeadDrafts((current) => ({
                          ...current,
                          [lead.id]: {
                            ...(current[lead.id] ?? { notes: "", followUpDueAt: "" }),
                            stage: event.currentTarget.value,
                          },
                        }))
                      }
                      className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                      disabled={readOnly}
                    >
                      <option value="inquiry">Inquiry</option>
                      <option value="assessment">Assessment</option>
                      <option value="registered">Registered</option>
                      <option value="waitlist">Waitlist</option>
                    </select>
                    <input
                      type="datetime-local"
                      value={leadDraft?.followUpDueAt ?? ""}
                      onChange={(event) =>
                        setLeadDrafts((current) => ({
                          ...current,
                          [lead.id]: {
                            ...(current[lead.id] ?? { notes: "", stage: lead.stage }),
                            followUpDueAt: event.currentTarget.value,
                          },
                        }))
                      }
                      className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                      disabled={readOnly}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleLeadAction(lead.id, owned ? "release" : "claim")}
                        disabled={pendingKey === `lead-${lead.id}` || readOnly}
                        className={clsx(
                          "rounded-full border px-4 py-2 text-sm font-semibold",
                          pendingKey === `lead-${lead.id}` || readOnly
                            ? "cursor-not-allowed border-[color:var(--line)] bg-stone-100 text-[color:var(--muted)]"
                            : "border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] text-[color:var(--navy-strong)]",
                        )}
                      >
                        {owned ? "Release" : "Claim"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLeadAction(lead.id, "update")}
                        disabled={pendingKey === `lead-${lead.id}` || readOnly || !owned}
                        className={clsx(
                          "rounded-full px-4 py-2 text-sm font-semibold text-white",
                          pendingKey === `lead-${lead.id}` || readOnly || !owned
                            ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
                            : "bg-[color:var(--navy-strong)] hover:opacity-90",
                        )}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={leadDraft?.notes ?? ""}
                    onChange={(event) =>
                      setLeadDrafts((current) => ({
                        ...current,
                        [lead.id]: {
                          ...(current[lead.id] ?? { stage: lead.stage, followUpDueAt: "" }),
                          notes: event.currentTarget.value,
                        },
                      }))
                    }
                    className="mt-3 min-h-[92px] w-full rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                    placeholder="Lead follow-up notes"
                    disabled={readOnly || !owned}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-5">
          <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
            <div className="section-kicker">Approval request</div>
            <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
              Ask admin for a decision
            </h3>
            <div className="mt-5 grid gap-3">
              <select
                value={approvalForm.requestType}
                onChange={(event) =>
                  setApprovalForm((current) => ({ ...current, requestType: event.currentTarget.value }))
                }
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                disabled={readOnly}
              >
                <option value="bulk_cohort_move">Bulk cohort move</option>
                <option value="staffing_change">Staffing change</option>
                <option value="archive_restore">Archive or restore</option>
                <option value="billing_export">Billing export</option>
                <option value="source_configuration">Source configuration</option>
              </select>
              <input
                value={approvalForm.targetId}
                onChange={(event) =>
                  setApprovalForm((current) => ({ ...current, targetId: event.currentTarget.value }))
                }
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                placeholder="Target id"
                disabled={readOnly}
              />
              <textarea
                value={approvalForm.reason}
                onChange={(event) =>
                  setApprovalForm((current) => ({ ...current, reason: event.currentTarget.value }))
                }
                className="min-h-[90px] rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                placeholder="Why does this need admin approval?"
                disabled={readOnly}
              />
              <button
                type="button"
                onClick={handleApprovalSubmit}
                disabled={pendingKey === "approval" || readOnly}
                className={clsx(
                  "rounded-full px-4 py-2 text-sm font-semibold text-white",
                  pendingKey === "approval" || readOnly
                    ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
                    : "bg-[color:var(--navy-strong)] hover:opacity-90",
                )}
              >
                {pendingKey === "approval" ? "Sending..." : readOnly ? "Preview only" : "Send request"}
              </button>
              <div className="space-y-2">
                {approvalRequests.slice(0, 4).map((request) => (
                  <div key={request.id} className="rounded-2xl border border-[color:var(--line)] bg-stone-50 px-4 py-3 text-sm text-[color:var(--muted)]">
                    <span className="font-semibold text-[color:var(--navy-strong)]">{request.requestType.replaceAll("_", " ")}</span>
                    {" · "}
                    {request.status}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
            <div className="section-kicker">Escalate to admin</div>
            <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
              Hand off a blocker
            </h3>
            <div className="mt-5 grid gap-3">
              <select
                value={escalationForm.sourceType}
                onChange={(event) =>
                  setEscalationForm((current) => ({ ...current, sourceType: event.currentTarget.value }))
                }
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                disabled={readOnly}
              >
                <option value="task">Task</option>
                <option value="lead">Lead</option>
                <option value="billing_follow_up">Billing follow-up</option>
                <option value="family">Family</option>
                <option value="thread">Thread</option>
                <option value="cohort">Cohort</option>
                <option value="session">Session</option>
              </select>
              <input
                value={escalationForm.sourceId}
                onChange={(event) =>
                  setEscalationForm((current) => ({ ...current, sourceId: event.currentTarget.value }))
                }
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                placeholder="Source id"
                disabled={readOnly}
              />
              <textarea
                value={escalationForm.reason}
                onChange={(event) =>
                  setEscalationForm((current) => ({ ...current, reason: event.currentTarget.value }))
                }
                className="min-h-[90px] rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                placeholder="Why is this blocked?"
                disabled={readOnly}
              />
              <button
                type="button"
                onClick={handleEscalationSubmit}
                disabled={pendingKey === "escalation" || readOnly}
                className={clsx(
                  "rounded-full px-4 py-2 text-sm font-semibold text-white",
                  pendingKey === "escalation" || readOnly
                    ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
                    : "bg-[color:var(--copper)] hover:opacity-90",
                )}
              >
                {pendingKey === "escalation" ? "Sending..." : readOnly ? "Preview only" : "Escalate"}
              </button>
              <div className="space-y-2">
                {escalations.slice(0, 4).map((escalation) => (
                  <div key={escalation.id} className="rounded-2xl border border-[color:var(--line)] bg-stone-50 px-4 py-3 text-sm text-[color:var(--muted)]">
                    <span className="font-semibold text-[color:var(--navy-strong)]">{escalation.sourceType.replaceAll("_", " ")}</span>
                    {" · "}
                    {escalation.status}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
            <div className="section-kicker">Routine import watch</div>
            <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
              Sync health
            </h3>
            <div className="mt-5 space-y-3">
              {syncJobs.slice(0, 4).map((job) => (
                <div key={job.id} className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
                  <div className="text-base font-semibold text-[color:var(--navy-strong)]">{job.label}</div>
                  <div className="mt-1 text-sm text-[color:var(--muted)]">{job.summary}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
