"use client";

import Link from "next/link";
import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type {
  AdminEscalation,
  AdminAnnouncement,
  AdminSavedView,
  AdminTask,
  ApprovalRequest,
  CapacityForecastRow,
  SyncJob,
} from "@/lib/domain";
import type { LiveSettingsUserRow } from "@/lib/live-portal";

interface AdminDashboardPanelsProps {
  viewerMode: "preview" | "live" | "live-role-preview";
  tasks: AdminTask[];
  savedViews: AdminSavedView[];
  announcements: AdminAnnouncement[];
  capacityForecastRows: CapacityForecastRow[];
  users: LiveSettingsUserRow[] | null;
  syncJobs: SyncJob[];
  approvalRequests: ApprovalRequest[];
  escalations: AdminEscalation[];
}

const taskTypeOptions = [
  { value: "billing_follow_up", label: "Billing follow-up" },
  { value: "family_communication", label: "Family communication" },
  { value: "attendance_follow_up", label: "Attendance follow-up" },
  { value: "score_cleanup", label: "Missing scores" },
  { value: "cohort_staffing", label: "Cohort staffing" },
] as const;

const targetTypeOptions = [
  { value: "invoice", label: "Invoice" },
  { value: "family", label: "Family" },
  { value: "cohort", label: "Cohort" },
  { value: "student", label: "Student" },
  { value: "user", label: "User" },
] as const;

function buildSavedViewHref(view: AdminSavedView) {
  const params = new URLSearchParams();

  Object.entries(view.filterState).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
      return;
    }

    params.set(key, String(value));
  });

  return `/${view.section}${params.size > 0 ? `?${params.toString()}` : ""}`;
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

export function AdminDashboardPanels({
  viewerMode,
  tasks,
  savedViews,
  announcements,
  capacityForecastRows,
  users,
  syncJobs,
  approvalRequests,
  escalations,
}: AdminDashboardPanelsProps) {
  const router = useRouter();
  const readOnly = viewerMode === "live-role-preview";
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState({
    title: "",
    taskType: "family_communication",
    targetType: "cohort",
    targetId: "",
    assignedTo: "",
    dueAt: "",
    details: "",
  });
  const [announcementForm, setAnnouncementForm] = useState({
    title: "",
    body: "",
    tone: "warning",
    expiresAt: "",
    visibleRoles: {
      admin: true,
      staff: true,
      ta: true,
    },
  });
  const [reviewPendingId, setReviewPendingId] = useState<string | null>(null);

  const assignableUsers = useMemo(
    () =>
      (users ?? []).filter(
        (user) =>
          user.role === "staff" || user.role === "ta" || user.role === "instructor",
      ),
    [users],
  );
  const onboardingRows = useMemo(
    () =>
      (users ?? []).filter((user) => user.role !== "engineer").sort((left, right) => {
        if (!left.lastSignedInAt && right.lastSignedInAt) {
          return -1;
        }

        if (left.lastSignedInAt && !right.lastSignedInAt) {
          return 1;
        }

        return left.name.localeCompare(right.name);
      }),
    [users],
  );

  const handleTaskCreate = () => {
    if (readOnly) {
      setError("Role preview is read-only.");
      setSuccess(null);
      return;
    }

    setPending("task");
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/tasks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: taskForm.title,
            taskType: taskForm.taskType,
            targetType: taskForm.targetType,
            targetId: taskForm.targetId,
            assignedTo: taskForm.assignedTo || null,
            dueAt: taskForm.dueAt || null,
            details: taskForm.details || null,
            status: "open",
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Task create failed.");
        }

        setTaskForm({
          title: "",
          taskType: "family_communication",
          targetType: "cohort",
          targetId: "",
          assignedTo: "",
          dueAt: "",
          details: "",
        });
        setSuccess("Operational task created.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Task create failed.");
      } finally {
        setPending(null);
      }
    });
  };

  const handleAnnouncementCreate = () => {
    if (readOnly) {
      setError("Role preview is read-only.");
      setSuccess(null);
      return;
    }

    setPending("announcement");
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const visibleRoles = (["admin", "staff", "ta"] as const).filter(
          (role) => announcementForm.visibleRoles[role],
        );
        const response = await fetch("/api/admin/announcements", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: announcementForm.title,
            body: announcementForm.body,
            tone: announcementForm.tone,
            expiresAt: announcementForm.expiresAt || null,
            visibleRoles,
            isActive: true,
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Announcement save failed.");
        }

        setAnnouncementForm({
          title: "",
          body: "",
          tone: "warning",
          expiresAt: "",
          visibleRoles: {
            admin: true,
            staff: true,
            ta: true,
          },
        });
        setSuccess("Internal operations announcement posted.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Announcement save failed.");
      } finally {
        setPending(null);
      }
    });
  };

  const handleApprovalReview = (requestId: string, status: "approved" | "rejected") => {
    if (readOnly) {
      setError("Role preview is read-only.");
      setSuccess(null);
      return;
    }

    setReviewPendingId(requestId);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/approvals", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requestId,
            status,
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Approval review failed.");
        }

        setSuccess(`Approval request ${status}.`);
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Approval review failed.");
      } finally {
        setReviewPendingId(null);
      }
    });
  };

  const handleEscalationUpdate = (escalationId: string, status: "acknowledged" | "closed") => {
    if (readOnly) {
      setError("Role preview is read-only.");
      setSuccess(null);
      return;
    }

    setReviewPendingId(escalationId);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/escalations", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            escalationId,
            status,
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Escalation update failed.");
        }

        setSuccess(`Escalation marked ${status}.`);
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Escalation update failed.");
      } finally {
        setReviewPendingId(null);
      }
    });
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
        <div className="section-kicker">Operations tasking</div>
        <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
          Follow-up queue
        </h3>
        <p className="mt-3 text-sm text-[color:var(--muted)]">
          Keep billing, classroom, and family work assigned with due dates so the next handoff is
          clear.
        </p>

        {error ? (
          <div className="mt-5 rounded-[1.5rem] border border-rose-200 bg-rose-100/90 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="mt-5 rounded-[1.5rem] border border-emerald-200 bg-emerald-100/90 px-4 py-3 text-sm text-emerald-800">
            {success}
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <input
            value={taskForm.title}
            onChange={(event) => {
              const title = event.currentTarget.value;
              setTaskForm((current) => ({ ...current, title }));
            }}
            className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            placeholder="Task title"
            disabled={readOnly}
          />
          <input
            value={taskForm.targetId}
            onChange={(event) => {
              const targetId = event.currentTarget.value;
              setTaskForm((current) => ({ ...current, targetId }));
            }}
            className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            placeholder="Target ID"
            disabled={readOnly}
          />
          <select
            value={taskForm.taskType}
            onChange={(event) => {
              const taskType = event.currentTarget.value;
              setTaskForm((current) => ({ ...current, taskType }));
            }}
            className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            disabled={readOnly}
          >
            {taskTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={taskForm.targetType}
            onChange={(event) => {
              const targetType = event.currentTarget.value;
              setTaskForm((current) => ({ ...current, targetType }));
            }}
            className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            disabled={readOnly}
          >
            {targetTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={taskForm.assignedTo}
            onChange={(event) => {
              const assignedTo = event.currentTarget.value;
              setTaskForm((current) => ({ ...current, assignedTo }));
            }}
            className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            disabled={readOnly}
          >
            <option value="">Assign later</option>
            {assignableUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} · {user.role}
              </option>
            ))}
          </select>
          <input
            value={taskForm.dueAt}
            onChange={(event) => {
              const dueAt = event.currentTarget.value;
              setTaskForm((current) => ({ ...current, dueAt }));
            }}
            type="datetime-local"
            className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            disabled={readOnly}
          />
        </div>
        <textarea
          value={taskForm.details}
          onChange={(event) => {
            const details = event.currentTarget.value;
            setTaskForm((current) => ({ ...current, details }));
          }}
          className="mt-3 min-h-[104px] w-full rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
          placeholder="Add the follow-up context the assignee needs."
          disabled={readOnly}
        />
        <button
          type="button"
          onClick={handleTaskCreate}
          disabled={pending === "task" || readOnly}
          className={clsx(
            "mt-4 rounded-full px-4 py-2 text-sm font-semibold text-white",
            pending === "task" || readOnly
              ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
              : "bg-[color:var(--navy-strong)] hover:opacity-90",
          )}
        >
          {pending === "task" ? "Saving..." : readOnly ? "Preview only" : "Create task"}
        </button>

        <div className="mt-5 space-y-3">
          {tasks.slice(0, 6).map((task) => (
            <div
              key={task.id}
              className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                    {task.title}
                  </div>
                  <div className="mt-1 text-sm text-[color:var(--muted)]">
                    {task.assignedToName ?? "Unassigned"} · {task.taskType.replaceAll("_", " ")}
                  </div>
                </div>
                <div className="text-right">
                  <div className="rounded-full border border-[color:var(--line)] bg-stone-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    {task.status.replaceAll("_", " ")}
                  </div>
                  <div className="mt-2 text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    {formatDateTime(task.dueAt)}
                  </div>
                </div>
              </div>
              {task.details ? (
                <div className="mt-3 text-sm text-[color:var(--muted)]">{task.details}</div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <div className="space-y-5">
        <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Saved views</div>
          <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
            Reopen common queues
          </h3>
          <div className="mt-5 space-y-3">
            {savedViews.map((view) => (
              <Link
                key={view.id}
                href={buildSavedViewHref(view)}
                className="block rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4 hover:bg-white"
              >
                <div className="text-base font-semibold text-[color:var(--navy-strong)]">{view.name}</div>
                <div className="mt-1 text-sm text-[color:var(--muted)]">
                  {view.section} · updated {formatDateTime(view.updatedAt)}
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Staff escalations</div>
          <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
            Pending requests and blockers
          </h3>
          <div className="mt-5 space-y-3">
            {approvalRequests.slice(0, 4).map((request) => (
              <div key={request.id} className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                      {request.requestType.replaceAll("_", " ")}
                    </div>
                    <div className="mt-1 text-sm text-[color:var(--muted)]">
                      {request.requestedByName} · {request.targetId}
                    </div>
                  </div>
                  <div className="rounded-full border border-[color:var(--line)] bg-stone-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    {request.status}
                  </div>
                </div>
                <div className="mt-3 text-sm text-[color:var(--muted)]">{request.reason}</div>
                {request.status === "pending" ? (
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleApprovalReview(request.id, "approved")}
                      disabled={reviewPendingId === request.id || readOnly}
                      className="rounded-full bg-[color:var(--navy-strong)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApprovalReview(request.id, "rejected")}
                      disabled={reviewPendingId === request.id || readOnly}
                      className="rounded-full border border-rose-200 bg-rose-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-rose-700"
                    >
                      Reject
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
            {escalations.slice(0, 4).map((escalation) => (
              <div key={escalation.id} className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                      {escalation.sourceType.replaceAll("_", " ")}
                    </div>
                    <div className="mt-1 text-sm text-[color:var(--muted)]">
                      {escalation.createdByName} · {escalation.sourceId}
                    </div>
                  </div>
                  <div className="rounded-full border border-[color:var(--line)] bg-stone-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    {escalation.status}
                  </div>
                </div>
                <div className="mt-3 text-sm text-[color:var(--muted)]">{escalation.reason}</div>
                {escalation.status !== "closed" ? (
                  <div className="mt-4 flex gap-2">
                    {escalation.status === "open" ? (
                      <button
                        type="button"
                        onClick={() => handleEscalationUpdate(escalation.id, "acknowledged")}
                        disabled={reviewPendingId === escalation.id || readOnly}
                        className="rounded-full bg-[color:var(--copper)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white"
                      >
                        Acknowledge
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleEscalationUpdate(escalation.id, "closed")}
                      disabled={reviewPendingId === escalation.id || readOnly}
                      className="rounded-full border border-[color:var(--line)] bg-stone-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--navy-strong)]"
                    >
                      Close
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Internal notice</div>
          <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
            Staff and TA announcement
          </h3>
          <div className="mt-5 grid gap-3">
            <input
              value={announcementForm.title}
              onChange={(event) => {
                const title = event.currentTarget.value;
                setAnnouncementForm((current) => ({ ...current, title }));
              }}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="Announcement title"
              disabled={readOnly}
            />
            <textarea
              value={announcementForm.body}
              onChange={(event) => {
                const body = event.currentTarget.value;
                setAnnouncementForm((current) => ({ ...current, body }));
              }}
              className="min-h-[104px] rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="Share the internal operations update."
              disabled={readOnly}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <select
                value={announcementForm.tone}
                onChange={(event) => {
                  const tone = event.currentTarget.value;
                  setAnnouncementForm((current) => ({ ...current, tone }));
                }}
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                disabled={readOnly}
              >
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
              <input
                value={announcementForm.expiresAt}
                onChange={(event) => {
                  const expiresAt = event.currentTarget.value;
                  setAnnouncementForm((current) => ({ ...current, expiresAt }));
                }}
                type="datetime-local"
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                disabled={readOnly}
              />
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-[color:var(--muted)]">
              {(["admin", "staff", "ta"] as const).map((role) => (
                <label
                  key={role}
                  className="flex items-center gap-2 rounded-full border border-[color:var(--line)] bg-white/90 px-3 py-2"
                >
                  <input
                    checked={announcementForm.visibleRoles[role]}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setAnnouncementForm((current) => ({
                        ...current,
                        visibleRoles: {
                          ...current.visibleRoles,
                          [role]: checked,
                        },
                      }));
                    }}
                    type="checkbox"
                    disabled={readOnly}
                  />
                  {role}
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={handleAnnouncementCreate}
              disabled={pending === "announcement" || readOnly}
              className={clsx(
                "rounded-full px-4 py-2 text-sm font-semibold text-white",
                pending === "announcement" || readOnly
                  ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
                  : "bg-[color:var(--navy-strong)] hover:opacity-90",
              )}
            >
              {pending === "announcement" ? "Posting..." : readOnly ? "Preview only" : "Post announcement"}
            </button>
          </div>

          {announcements.length > 0 ? (
            <div className="mt-5 space-y-3">
              {announcements.map((announcement) => (
                <div
                  key={announcement.id}
                  className={clsx(
                    "rounded-[1.5rem] border px-4 py-4 text-sm",
                    announcement.tone === "warning"
                      ? "border-amber-200 bg-amber-100/90 text-amber-800"
                      : "border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] text-[color:var(--navy-strong)]",
                  )}
                >
                  <div className="font-semibold">{announcement.title}</div>
                  <div className="mt-2">{announcement.body}</div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Onboarding</div>
          <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
            User setup watch
          </h3>
          <div className="mt-5 space-y-3">
            {onboardingRows.slice(0, 6).map((user) => (
              <div
                key={user.id}
                className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                      {user.name}
                    </div>
                    <div className="mt-1 text-sm text-[color:var(--muted)]">
                      {user.role} · {user.email ?? "No email synced"}
                    </div>
                  </div>
                  <div className="text-right text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    {user.accountStatus}
                  </div>
                </div>
                <div className="mt-3 text-sm text-[color:var(--muted)]">
                  {user.lastSignedInAt
                    ? `Last sign-in ${formatDateTime(user.lastSignedInAt)}`
                    : "Has not signed in yet."}
                  {user.mustChangePassword ? " Password change still required." : ""}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Capacity forecasting</div>
          <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
            Cohorts needing attention
          </h3>
          <div className="mt-5 space-y-3">
            {capacityForecastRows.slice(0, 5).map((row) => (
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
          <div className="mt-5 rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4 text-sm text-[color:var(--muted)]">
            {syncJobs.filter((job) => job.status !== "healthy").length} sync items still need
            review before the next operations cycle.
          </div>
        </section>
      </div>
    </div>
  );
}
