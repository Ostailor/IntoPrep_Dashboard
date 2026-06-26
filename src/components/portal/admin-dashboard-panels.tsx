"use client";

import Link from "next/link";
import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  ANNOUNCEMENT_CANCELLED_EVENT,
  getAnnouncementToneClass,
} from "@/components/portal/admin-announcement-notices";
import type {
  AdminEscalation,
  AdminAnnouncement,
  AdminSavedView,
  AdminTask,
  ApprovalRequest,
  CapacityForecastRow,
  SyncJob,
  TaskActivity,
} from "@/lib/domain";
import type { LiveSettingsUserRow } from "@/lib/live-portal";

interface AdminDashboardPanelsProps {
  viewerId: string;
  viewerMode: "preview" | "live" | "live-role-preview";
  tasks: AdminTask[];
  taskActivities: TaskActivity[];
  savedViews: AdminSavedView[];
  announcements: AdminAnnouncement[];
  capacityForecastRows: CapacityForecastRow[];
  users: LiveSettingsUserRow[] | null;
  syncJobs: SyncJob[];
  approvalRequests: ApprovalRequest[];
  escalations: AdminEscalation[];
}

type AnnouncementVisibleRole = "admin" | "staff" | "ta";
type AnnouncementVisibleRoles = Record<AnnouncementVisibleRole, boolean>;
type AnnouncementFormState = {
  title: string;
  body: string;
  tone: AdminAnnouncement["tone"];
  expiresAt: string;
  visibleRoles: AnnouncementVisibleRoles;
};
type TaskFormState = {
  title: string;
  taskType: string;
  targetType: string;
  targetId: string;
  assignedTo: string;
  dueAt: string;
  details: string;
};

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

function formatDateTimeLocal(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const timezoneOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function createDefaultTaskForm(): TaskFormState {
  return {
    title: "",
    taskType: "family_communication",
    targetType: "cohort",
    targetId: "",
    assignedTo: "",
    dueAt: "",
    details: "",
  };
}

function createTaskFormFromTask(task: AdminTask): TaskFormState {
  return {
    title: task.title,
    taskType: task.taskType,
    targetType: task.targetType,
    targetId: task.targetId,
    assignedTo: task.assignedTo ?? "",
    dueAt: formatDateTimeLocal(task.dueAt),
    details: task.details ?? "",
  };
}

function getTaskStatusClass(status: AdminTask["status"]) {
  switch (status) {
    case "done":
      return "border-emerald-200 bg-emerald-100 text-emerald-800";
    case "in_progress":
      return "border-sky-200 bg-sky-100 text-sky-800";
    default:
      return "border-[color:var(--line)] bg-stone-50 text-[color:var(--muted)]";
  }
}

function createDefaultAnnouncementVisibleRoles(): AnnouncementVisibleRoles {
  return {
    admin: true,
    staff: true,
    ta: true,
  };
}

function normalizeAnnouncementVisibleRoles(
  value?: Partial<AnnouncementVisibleRoles> | null,
): AnnouncementVisibleRoles {
  return {
    admin: Boolean(value?.admin),
    staff: Boolean(value?.staff),
    ta: Boolean(value?.ta),
  };
}

function createAnnouncementFormFromAnnouncement(
  announcement: AdminAnnouncement,
): AnnouncementFormState {
  const visibleRoles = new Set(announcement.visibleRoles);

  return {
    title: announcement.title,
    body: announcement.body,
    tone: announcement.tone,
    expiresAt: formatDateTimeLocal(announcement.expiresAt),
    visibleRoles: {
      admin: visibleRoles.has("admin"),
      staff: visibleRoles.has("staff"),
      ta: visibleRoles.has("ta"),
    },
  };
}

function createDefaultAnnouncementForm(): AnnouncementFormState {
  return {
    title: "",
    body: "",
    tone: "warning",
    expiresAt: "",
    visibleRoles: createDefaultAnnouncementVisibleRoles(),
  };
}

export function AdminDashboardPanels({
  viewerId,
  viewerMode,
  tasks,
  taskActivities,
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
  const [taskForm, setTaskForm] = useState<TaskFormState>(createDefaultTaskForm);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [openedTaskId, setOpenedTaskId] = useState<string | null>(null);
  const [localTasks, setLocalTasks] = useState<AdminTask[]>([]);
  const [localTaskActivities, setLocalTaskActivities] = useState<TaskActivity[]>([]);
  const [hiddenTaskIds, setHiddenTaskIds] = useState<Set<string>>(() => new Set());
  const [taskCommentDrafts, setTaskCommentDrafts] = useState<Record<string, string>>({});
  const [announcementForm, setAnnouncementForm] = useState<AnnouncementFormState>(
    createDefaultAnnouncementForm,
  );
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null);
  const [localAnnouncements, setLocalAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [cancelledAnnouncementIds, setCancelledAnnouncementIds] = useState<Set<string>>(
    () => new Set(),
  );
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
  const mergedTasks = useMemo(() => {
    const taskById = new Map<string, AdminTask>();

    tasks.forEach((task) => taskById.set(task.id, task));
    localTasks.forEach((task) => taskById.set(task.id, task));

    return Array.from(taskById.values())
      .filter((task) => !hiddenTaskIds.has(task.id))
      .sort((left, right) => {
        if (left.status === "done" && right.status !== "done") {
          return -1;
        }

        if (left.status !== "done" && right.status === "done") {
          return 1;
        }

        if (!left.dueAt && right.dueAt) {
          return 1;
        }

        if (left.dueAt && !right.dueAt) {
          return -1;
        }

        return (left.dueAt ?? left.createdAt).localeCompare(right.dueAt ?? right.createdAt);
      });
  }, [hiddenTaskIds, localTasks, tasks]);
  const taskActivitiesByTaskId = useMemo(() => {
    const next = new Map<string, TaskActivity[]>();

    [...localTaskActivities, ...taskActivities].forEach((activity) => {
      next.set(activity.taskId, [...(next.get(activity.taskId) ?? []), activity]);
    });

    return next;
  }, [localTaskActivities, taskActivities]);
  const mergedAnnouncements = useMemo(() => {
    const announcementById = new Map<string, AdminAnnouncement>();

    announcements.forEach((announcement) => {
      announcementById.set(announcement.id, announcement);
    });
    localAnnouncements.forEach((announcement) => {
      announcementById.set(announcement.id, announcement);
    });

    return Array.from(announcementById.values()).sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    );
  }, [announcements, localAnnouncements]);
  const visibleAnnouncements = useMemo(
    () =>
      mergedAnnouncements.filter(
        (announcement) => announcement.isActive && !cancelledAnnouncementIds.has(announcement.id),
      ),
    [mergedAnnouncements, cancelledAnnouncementIds],
  );

  const resetTaskForm = () => {
    setTaskForm(createDefaultTaskForm());
    setEditingTaskId(null);
  };

  const beginTaskEdit = (task: AdminTask) => {
    setTaskForm(createTaskFormFromTask(task));
    setEditingTaskId(task.id);
    setOpenedTaskId(task.id);
    setError(null);
    setSuccess(null);
  };

  const upsertLocalTask = (task: AdminTask) => {
    setLocalTasks((current) => [
      task,
      ...current.filter((candidate) => candidate.id !== task.id),
    ]);
    setHiddenTaskIds((current) => {
      const next = new Set(current);
      next.delete(task.id);
      return next;
    });
  };

  const sendTaskUpdate = ({
    task,
    status,
    comment,
    successMessage,
    hideAfterSave = false,
    lifecycleState,
  }: {
    task: AdminTask;
    status: AdminTask["status"];
    comment?: string | null;
    successMessage: string;
    hideAfterSave?: boolean;
    lifecycleState?: "closed" | "cancelled" | null;
  }) => {
    if (readOnly) {
      setError("Role preview is read-only.");
      setSuccess(null);
      return;
    }

    const pendingKey = `task-${task.id}-${status}`;
    setPending(pendingKey);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/tasks", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            taskId: task.id,
            taskType: task.taskType,
            targetType: task.targetType,
            targetId: task.targetId,
            title: task.title,
            details: task.details,
            assignedTo: task.assignedTo,
            dueAt: task.dueAt,
            status,
            comment,
            noteType: "progress",
            lifecycleState,
          }),
        });
        const payload = (await response.json()) as { error?: string; task?: AdminTask };

        if (!response.ok) {
          throw new Error(payload.error ?? "Task update failed.");
        }

        if (payload.task) {
          upsertLocalTask(payload.task);
        }

        if (comment?.trim()) {
          setLocalTaskActivities((current) => [
            {
              id: `local-${task.id}-${Date.now()}`,
              taskId: task.id,
              authorId: viewerId,
              authorName: "You",
              body: comment.trim(),
              noteType: "progress",
              statusFrom: task.status,
              statusTo: status,
              createdAt: new Date().toISOString(),
            },
            ...current,
          ]);
        }

        if (hideAfterSave) {
          setHiddenTaskIds((current) => {
            const next = new Set(current);
            next.add(task.id);
            return next;
          });
          if (openedTaskId === task.id) {
            setOpenedTaskId(null);
          }
        }

        setTaskCommentDrafts((current) => ({ ...current, [task.id]: "" }));
        setSuccess(successMessage);
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Task update failed.");
      } finally {
        setPending(null);
      }
    });
  };

  const handleTaskSave = () => {
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
          method: editingTaskId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            taskId: editingTaskId,
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
        const payload = (await response.json()) as { error?: string; task?: AdminTask };

        if (!response.ok) {
          throw new Error(payload.error ?? "Task create failed.");
        }

        if (payload.task) {
          upsertLocalTask(payload.task);
        }
        resetTaskForm();
        setSuccess(editingTaskId ? "Operational task updated." : "Operational task created.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Task create failed.");
      } finally {
        setPending(null);
      }
    });
  };

  const resetAnnouncementForm = () => {
    setAnnouncementForm(createDefaultAnnouncementForm());
    setEditingAnnouncementId(null);
  };

  const beginAnnouncementEdit = (announcement: AdminAnnouncement) => {
    setAnnouncementForm(createAnnouncementFormFromAnnouncement(announcement));
    setEditingAnnouncementId(announcement.id);
    setError(null);
    setSuccess(null);
  };

  const handleAnnouncementSave = () => {
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
        const visibleRoles = (["admin", "staff", "ta"] as const).filter((role) =>
          normalizeAnnouncementVisibleRoles(announcementForm.visibleRoles)[role],
        );
        const response = await fetch("/api/admin/announcements", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            announcementId: editingAnnouncementId,
            title: announcementForm.title,
            body: announcementForm.body,
            tone: announcementForm.tone,
            expiresAt: announcementForm.expiresAt || null,
            visibleRoles,
            isActive: true,
          }),
        });
        const payload = (await response.json()) as {
          announcement?: AdminAnnouncement;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Announcement save failed.");
        }

        if (payload.announcement) {
          setLocalAnnouncements((current) => [
            payload.announcement as AdminAnnouncement,
            ...current.filter((announcement) => announcement.id !== payload.announcement?.id),
          ]);
        }
        resetAnnouncementForm();
        setSuccess(
          editingAnnouncementId
            ? "Internal operations announcement updated."
            : "Internal operations announcement posted.",
        );
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Announcement save failed.");
      } finally {
        setPending(null);
      }
    });
  };

  const handleAnnouncementCancel = (announcement: AdminAnnouncement) => {
    if (readOnly) {
      setError("Role preview is read-only.");
      setSuccess(null);
      return;
    }

    const pendingKey = `announcement-cancel-${announcement.id}`;
    setPending(pendingKey);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/announcements", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            announcementId: announcement.id,
            title: announcement.title,
            body: announcement.body,
            tone: announcement.tone,
            expiresAt: announcement.expiresAt ?? null,
            visibleRoles: announcement.visibleRoles,
            isActive: false,
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Announcement cancel failed.");
        }

        if (editingAnnouncementId === announcement.id) {
          resetAnnouncementForm();
        }

        setLocalAnnouncements((current) =>
          current.filter((localAnnouncement) => localAnnouncement.id !== announcement.id),
        );
        setCancelledAnnouncementIds((current) => {
          const next = new Set(current);
          next.add(announcement.id);
          return next;
        });
        window.dispatchEvent(
          new CustomEvent(ANNOUNCEMENT_CANCELLED_EVENT, {
            detail: { announcementId: announcement.id },
          }),
        );
        setSuccess("Internal operations announcement cancelled for everyone.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Announcement cancel failed.");
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
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Task title
            </span>
            <span className="text-sm text-[color:var(--muted)]">
              Short queue label the assignee will recognize immediately.
            </span>
            <input
              value={taskForm.title}
              onChange={(event) => {
                const title = event.currentTarget.value;
                setTaskForm((current) => ({ ...current, title }));
              }}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="Example: Follow up on March tuition reminder"
              disabled={readOnly}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Target ID
            </span>
            <span className="text-sm text-[color:var(--muted)]">
              Internal record id for the invoice, family, cohort, student, or user this task belongs to.
            </span>
            <input
              value={taskForm.targetId}
              onChange={(event) => {
                const targetId = event.currentTarget.value;
                setTaskForm((current) => ({ ...current, targetId }));
              }}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="Example: invoice_123 or family_456"
              disabled={readOnly}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Task type
            </span>
            <span className="text-sm text-[color:var(--muted)]">
              Choose the kind of operational follow-up this work belongs to.
            </span>
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
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Target type
            </span>
            <span className="text-sm text-[color:var(--muted)]">
              Tell the queue whether the target id points to an invoice, family, cohort, student, or user.
            </span>
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
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Assign to
            </span>
            <span className="text-sm text-[color:var(--muted)]">
              Pick the teammate who should own this next, or leave it unassigned for later.
            </span>
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
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Due by
            </span>
            <span className="text-sm text-[color:var(--muted)]">
              Optional deadline for the follow-up.
            </span>
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
          </label>
        </div>
        <label className="mt-3 flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
            Assignee notes
          </span>
          <span className="text-sm text-[color:var(--muted)]">
            Include the context, blocker, or next step the assignee needs before they open the record.
          </span>
          <textarea
            value={taskForm.details}
            onChange={(event) => {
              const details = event.currentTarget.value;
              setTaskForm((current) => ({ ...current, details }));
            }}
            className="min-h-[104px] w-full rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            placeholder="Example: Call the guardian, confirm the missed session makeup date, and note the answer in billing follow-up."
            disabled={readOnly}
          />
        </label>
        <button
          type="button"
          onClick={handleTaskSave}
          disabled={pending === "task" || readOnly}
          className={clsx(
            "mt-4 rounded-full px-4 py-2 text-sm font-semibold text-white",
            pending === "task" || readOnly
              ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
              : "bg-[color:var(--navy-strong)] hover:opacity-90",
          )}
        >
          {pending === "task"
            ? "Saving..."
            : readOnly
              ? "Preview only"
              : editingTaskId
                ? "Save task"
                : "Create task"}
        </button>
        {editingTaskId ? (
          <button
            type="button"
            onClick={resetTaskForm}
            disabled={pending === "task" || readOnly}
            className="ml-2 rounded-full border border-[color:var(--line)] bg-white/90 px-4 py-2 text-sm font-semibold text-[color:var(--navy-strong)]"
          >
            Clear edit
          </button>
        ) : null}

        <div className="thin-scrollbar mt-5 max-h-[560px] space-y-3 overflow-y-auto pr-1">
          {mergedTasks.length === 0 ? (
            <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4 text-sm text-[color:var(--muted)]">
              No active tasks are waiting on admin review or teammate follow-up.
            </div>
          ) : null}
          {mergedTasks.map((task) => {
            const isOpen = openedTaskId === task.id;
            const activityRows = taskActivitiesByTaskId.get(task.id) ?? [];
            const commentDraft = taskCommentDrafts[task.id] ?? "";

            return (
            <div
              key={task.id}
              className={clsx(
                "rounded-[1.5rem] border p-4",
                task.status === "done"
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-[color:var(--line)] bg-white/75",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                    {task.title}
                  </div>
                  <div className="mt-1 text-sm text-[color:var(--muted)]">
                    {task.assignedToName ?? "Unassigned"} · {task.taskType.replaceAll("_", " ")}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={clsx(
                      "rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]",
                      getTaskStatusClass(task.status),
                    )}
                  >
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

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setOpenedTaskId(isOpen ? null : task.id)}
                  className="rounded-full border border-[color:var(--line)] bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--navy-strong)]"
                >
                  {isOpen ? "Close panel" : "Open task"}
                </button>
                <button
                  type="button"
                  onClick={() => beginTaskEdit(task)}
                  disabled={pending !== null || readOnly}
                  className="rounded-full border border-[color:var(--line)] bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--navy-strong)]"
                >
                  Edit
                </button>
                {task.status === "done" ? (
                  <button
                    type="button"
                    onClick={() =>
                      sendTaskUpdate({
                        task,
                        status: "done",
                        comment: "Admin reviewed and closed the completed task.",
                        lifecycleState: "closed",
                        successMessage: "Task closed and removed from active queues.",
                        hideAfterSave: true,
                      })
                    }
                    disabled={pending !== null || readOnly}
                    className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white"
                  >
                    Close completed
                  </button>
                ) : null}
                {task.status === "done" ? (
                  <button
                    type="button"
                    onClick={() =>
                      sendTaskUpdate({
                        task,
                        status: "open",
                        comment: "Admin reopened the task for additional follow-up.",
                        lifecycleState: null,
                        successMessage: "Task reopened for the assignee.",
                      })
                    }
                    disabled={pending !== null || readOnly}
                    className="rounded-full border border-sky-200 bg-sky-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-sky-800"
                  >
                    Reopen
                  </button>
                ) : null}
                {task.status !== "done" ? (
                  <button
                    type="button"
                    onClick={() =>
                      sendTaskUpdate({
                        task,
                        status: "done",
                        comment: "Admin cancelled the task before completion.",
                        lifecycleState: "cancelled",
                        successMessage: "Task cancelled and removed from active queues.",
                        hideAfterSave: true,
                      })
                    }
                    disabled={pending !== null || readOnly}
                    className="rounded-full border border-rose-200 bg-rose-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-rose-700"
                  >
                    Cancel task
                  </button>
                ) : null}
              </div>

              {isOpen ? (
                <div className="mt-4 space-y-3 rounded-[1.25rem] border border-[color:var(--line)] bg-white/70 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    Task conversation
                  </div>
                  {activityRows.length === 0 ? (
                    <div className="text-sm text-[color:var(--muted)]">
                      No comments yet. Add a note for the assignee or wait for their update.
                    </div>
                  ) : null}
                  {activityRows.map((activity) => (
                    <div key={activity.id} className="rounded-2xl border border-[color:var(--line)] bg-stone-50 px-4 py-3 text-sm text-[color:var(--muted)]">
                      <span className="font-semibold text-[color:var(--navy-strong)]">{activity.authorName}</span>
                      {" · "}
                      {activity.noteType.replaceAll("_", " ")}
                      {" · "}
                      {formatDateTime(activity.createdAt)}
                      <div className="mt-1 text-[color:var(--navy-strong)]">{activity.body}</div>
                    </div>
                  ))}
                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                    <input
                      value={commentDraft}
                      onChange={(event) => {
                        const body = event.currentTarget.value;
                        setTaskCommentDrafts((current) => ({ ...current, [task.id]: body }));
                      }}
                      className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                      placeholder="Add a note or instruction for this task."
                      disabled={readOnly}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        sendTaskUpdate({
                          task,
                          status: task.status,
                          comment: commentDraft,
                          successMessage: "Task comment added.",
                        })
                      }
                      disabled={pending !== null || readOnly || commentDraft.trim().length < 6}
                      className="rounded-full bg-[color:var(--navy-strong)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[rgba(23,56,75,0.46)]"
                    >
                      Add comment
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            );
          })}
        </div>
      </section>

      <div className="space-y-5">
        <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Saved views</div>
          <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
            Reopen common queues
          </h3>
          <p className="mt-3 text-sm text-[color:var(--muted)]">
            Saved views are shortcuts back to filtered operational pages, such as a billing follow-up
            list or cohort capacity watch. They appear here after an admin saves a filter set from a
            page that supports saved views.
          </p>
          <div className="thin-scrollbar mt-5 max-h-[280px] space-y-3 overflow-y-auto pr-1">
            {savedViews.length === 0 ? (
              <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4 text-sm text-[color:var(--muted)]">
                No saved views yet. Use this area once recurring admin filters are saved.
              </div>
            ) : null}
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
          <p className="mt-3 text-sm text-[color:var(--muted)]">
            Staff escalations are requests from staff, TAs, or instructors when they need admin
            approval, a blocker acknowledged, or a decision that their role cannot make.
          </p>
          <div className="thin-scrollbar mt-5 max-h-[360px] space-y-3 overflow-y-auto pr-1">
            {approvalRequests.length === 0 && escalations.length === 0 ? (
              <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4 text-sm text-[color:var(--muted)]">
                No escalations or approvals are waiting right now.
              </div>
            ) : null}
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
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Announcement title
              </span>
              <span className="text-sm text-[color:var(--muted)]">
                Short headline staff and TAs will see first.
              </span>
              <input
                value={announcementForm.title}
                onChange={(event) => {
                  const title = event.currentTarget.value;
                  setAnnouncementForm((current) => ({ ...current, title }));
                }}
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                placeholder="Example: Wednesday room changes"
                disabled={readOnly}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Announcement body
              </span>
              <span className="text-sm text-[color:var(--muted)]">
                Explain what changed, who is affected, and what action the team should take.
              </span>
              <textarea
                value={announcementForm.body}
                onChange={(event) => {
                  const body = event.currentTarget.value;
                  setAnnouncementForm((current) => ({ ...current, body }));
                }}
                className="min-h-[104px] rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                placeholder="Example: SAT groups in Room B will meet upstairs today. Update signs before 3:30 PM."
                disabled={readOnly}
              />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  Notice tone
                </span>
                <span className="text-sm text-[color:var(--muted)]">
                  Use warning for time-sensitive changes and info for routine updates.
                </span>
                <select
                  value={announcementForm.tone}
                  onChange={(event) => {
                    const tone = event.currentTarget.value as AdminAnnouncement["tone"];
                    setAnnouncementForm((current) => ({ ...current, tone }));
                  }}
                  className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                  disabled={readOnly}
                >
                  <option value="warning">Warning</option>
                  <option value="info">Info</option>
                </select>
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  Remove after
                </span>
                <span className="text-sm text-[color:var(--muted)]">
                  Optional time when the notice should disappear automatically.
                </span>
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
              </label>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-[color:var(--muted)]">
              {(["admin", "staff", "ta"] as const).map((role) => (
                <label
                  key={role}
                  className="flex items-center gap-2 rounded-full border border-[color:var(--line)] bg-white/90 px-3 py-2"
                >
                  <input
                    checked={normalizeAnnouncementVisibleRoles(announcementForm.visibleRoles)[role]}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setAnnouncementForm((current) => ({
                        ...current,
                        visibleRoles: {
                          ...normalizeAnnouncementVisibleRoles(current.visibleRoles),
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
              onClick={handleAnnouncementSave}
              disabled={pending === "announcement" || readOnly}
              className={clsx(
                "rounded-full px-4 py-2 text-sm font-semibold text-white",
                pending === "announcement" || readOnly
                  ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
                  : "bg-[color:var(--navy-strong)] hover:opacity-90",
              )}
            >
              {pending === "announcement"
                ? editingAnnouncementId
                  ? "Saving..."
                  : "Posting..."
                : readOnly
                  ? "Preview only"
                  : editingAnnouncementId
                    ? "Save announcement"
                    : "Post announcement"}
            </button>
            {editingAnnouncementId ? (
              <button
                type="button"
                onClick={resetAnnouncementForm}
                disabled={pending === "announcement" || readOnly}
                className="rounded-full border border-[color:var(--line)] bg-white/90 px-4 py-2 text-sm font-semibold text-[color:var(--navy-strong)]"
              >
                Clear edit
              </button>
            ) : null}
          </div>

          {visibleAnnouncements.length > 0 ? (
            <div className="mt-5 space-y-3">
              {visibleAnnouncements.map((announcement) => (
                <div
                  key={announcement.id}
                  className={clsx(
                    "rounded-[1.5rem] border px-4 py-4 text-sm",
                    getAnnouncementToneClass(announcement.tone),
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold">{announcement.title}</div>
                      <div className="mt-2 leading-6">{announcement.body}</div>
                      <div className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] opacity-70">
                        {announcement.createdByName ?? "Unknown creator"} ·{" "}
                        {announcement.visibleRoles.join(", ")}
                      </div>
                    </div>
                    <div className="rounded-full border border-current/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]">
                      {announcement.tone}
                    </div>
                  </div>
                  {announcement.createdBy === viewerId ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => beginAnnouncementEdit(announcement)}
                        disabled={pending !== null || readOnly}
                        className="rounded-full border border-current/20 bg-white/55 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAnnouncementCancel(announcement)}
                        disabled={pending === `announcement-cancel-${announcement.id}` || readOnly}
                        className="rounded-full border border-current/20 bg-white/55 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em]"
                      >
                        {pending === `announcement-cancel-${announcement.id}`
                          ? "Cancelling..."
                          : "Cancel for everyone"}
                      </button>
                    </div>
                  ) : null}
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
