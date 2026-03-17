"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { Cohort, Enrollment, Family, OutreachTemplate, Student } from "@/lib/domain";

interface StaffMessagingPanelProps {
  viewerMode: "preview" | "live" | "live-role-preview";
  cohorts: Cohort[];
  families: Family[];
  students: Student[];
  enrollments: Enrollment[];
  templates: OutreachTemplate[];
}

export function StaffMessagingPanel({
  viewerMode,
  cohorts,
  families,
  students,
  enrollments,
  templates,
}: StaffMessagingPanelProps) {
  const router = useRouter();
  const readOnly = viewerMode === "live-role-preview";
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [threadForm, setThreadForm] = useState({
    cohortId: cohorts[0]?.id ?? "",
    familyId: "",
    subject: "",
    body: "",
    templateId: "",
  });
  const [templateForm, setTemplateForm] = useState({
    title: "",
    category: "general",
    subject: "",
    body: "",
  });

  const visibleFamilies = useMemo(() => {
    const studentIds = enrollments
      .filter((enrollment) => enrollment.cohortId === threadForm.cohortId && enrollment.status === "active")
      .map((enrollment) => enrollment.studentId);
    const cohortFamilyIds = new Set(
      students
        .filter((student) => studentIds.includes(student.id))
        .map((student) => student.familyId),
    );

    return families.filter((family) => cohortFamilyIds.has(family.id));
  }, [enrollments, families, students, threadForm.cohortId]);

  const applyTemplate = (templateId: string) => {
    const template = templates.find((entry) => entry.id === templateId);
    if (!template) {
      return;
    }

    setThreadForm((current) => ({
      ...current,
      templateId,
      subject: template.subject,
      body: template.body,
    }));
  };

  const handleThreadCreate = () => {
    if (readOnly) {
      setError("Role preview is read-only.");
      return;
    }

    setPendingKey("thread");
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/staff/messaging/thread", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cohortId: threadForm.cohortId,
            familyId: threadForm.familyId,
            subject: threadForm.subject,
            body: threadForm.body,
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Thread create failed.");
        }

        setThreadForm((current) => ({
          ...current,
          familyId: "",
          subject: "",
          body: "",
          templateId: "",
        }));
        setSuccess("One-off family thread started.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Thread create failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const handleTemplateSave = () => {
    if (readOnly) {
      setError("Role preview is read-only.");
      return;
    }

    setPendingKey("template");
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/staff/templates", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(templateForm),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Template save failed.");
        }

        setTemplateForm({
          title: "",
          category: "general",
          subject: "",
          body: "",
        });
        setSuccess("Personal outreach template saved.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Template save failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const handleTemplateDelete = (templateId: string) => {
    if (readOnly) {
      setError("Role preview is read-only.");
      return;
    }

    setPendingKey(templateId);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/staff/templates", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            templateId,
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Template delete failed.");
        }

        setSuccess("Template removed.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Template delete failed.");
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

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">One-off family thread</div>
          <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
            Start a direct outreach thread
          </h3>
          <div className="mt-5 grid gap-3">
            <select
              value={threadForm.cohortId}
              onChange={(event) =>
                setThreadForm((current) => ({
                  ...current,
                  cohortId: event.currentTarget.value,
                  familyId: "",
                }))
              }
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              disabled={readOnly}
            >
              {cohorts.map((cohort) => (
                <option key={cohort.id} value={cohort.id}>
                  {cohort.name}
                </option>
              ))}
            </select>
            <select
              value={threadForm.familyId}
              onChange={(event) =>
                setThreadForm((current) => ({ ...current, familyId: event.currentTarget.value }))
              }
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              disabled={readOnly}
            >
              <option value="">Select a family</option>
              {visibleFamilies.map((family) => (
                <option key={family.id} value={family.id}>
                  {family.familyName} · {family.guardianNames.join(" / ")}
                </option>
              ))}
            </select>
            <select
              value={threadForm.templateId}
              onChange={(event) => applyTemplate(event.currentTarget.value)}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              disabled={readOnly}
            >
              <option value="">No template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.title}
                </option>
              ))}
            </select>
            <input
              value={threadForm.subject}
              onChange={(event) =>
                setThreadForm((current) => ({ ...current, subject: event.currentTarget.value }))
              }
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="Subject"
              disabled={readOnly}
            />
            <textarea
              value={threadForm.body}
              onChange={(event) =>
                setThreadForm((current) => ({ ...current, body: event.currentTarget.value }))
              }
              className="min-h-[140px] rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="Message body"
              disabled={readOnly}
            />
            <button
              type="button"
              onClick={handleThreadCreate}
              disabled={pendingKey === "thread" || readOnly}
              className={clsx(
                "rounded-full px-4 py-2 text-sm font-semibold text-white",
                pendingKey === "thread" || readOnly
                  ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
                  : "bg-[color:var(--navy-strong)] hover:opacity-90",
              )}
            >
              {pendingKey === "thread" ? "Starting..." : readOnly ? "Preview only" : "Start thread"}
            </button>
          </div>
        </div>

        <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
          <div className="section-kicker">Personal templates</div>
          <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
            Reusable outreach drafts
          </h3>
          <div className="mt-5 grid gap-3">
            <input
              value={templateForm.title}
              onChange={(event) =>
                setTemplateForm((current) => ({ ...current, title: event.currentTarget.value }))
              }
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="Template title"
              disabled={readOnly}
            />
            <select
              value={templateForm.category}
              onChange={(event) =>
                setTemplateForm((current) => ({ ...current, category: event.currentTarget.value }))
              }
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              disabled={readOnly}
            >
              <option value="general">General</option>
              <option value="schedule_change">Schedule change</option>
              <option value="missed_attendance">Missed attendance</option>
              <option value="score_follow_up">Score follow-up</option>
              <option value="billing_handoff">Billing handoff</option>
            </select>
            <input
              value={templateForm.subject}
              onChange={(event) =>
                setTemplateForm((current) => ({ ...current, subject: event.currentTarget.value }))
              }
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="Subject"
              disabled={readOnly}
            />
            <textarea
              value={templateForm.body}
              onChange={(event) =>
                setTemplateForm((current) => ({ ...current, body: event.currentTarget.value }))
              }
              className="min-h-[124px] rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="Template body"
              disabled={readOnly}
            />
            <button
              type="button"
              onClick={handleTemplateSave}
              disabled={pendingKey === "template" || readOnly}
              className={clsx(
                "rounded-full px-4 py-2 text-sm font-semibold text-white",
                pendingKey === "template" || readOnly
                  ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
                  : "bg-[color:var(--copper)] hover:opacity-90",
              )}
            >
              {pendingKey === "template" ? "Saving..." : readOnly ? "Preview only" : "Save template"}
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {templates.map((template) => (
              <div key={template.id} className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-[color:var(--navy-strong)]">{template.title}</div>
                    <div className="mt-1 text-sm text-[color:var(--muted)]">{template.subject}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTemplateDelete(template.id)}
                    disabled={pendingKey === template.id || readOnly}
                    className="rounded-full border border-rose-200 bg-rose-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-rose-700"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-3 text-sm text-[color:var(--muted)]">{template.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
