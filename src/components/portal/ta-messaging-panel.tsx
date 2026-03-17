"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { Cohort, Enrollment, Family, Student } from "@/lib/domain";

interface TaMessagingPanelProps {
  viewerMode: "preview" | "live" | "live-role-preview";
  cohorts: Cohort[];
  families: Family[];
  students: Student[];
  enrollments: Enrollment[];
}

export function TaMessagingPanel({
  viewerMode,
  cohorts,
  families,
  students,
  enrollments,
}: TaMessagingPanelProps) {
  const router = useRouter();
  const readOnly = viewerMode === "live-role-preview";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [threadForm, setThreadForm] = useState({
    cohortId: cohorts[0]?.id ?? "",
    familyId: "",
    category: "attendance",
    subject: "",
    body: "",
  });

  const familyOptions = useMemo(() => {
    const studentIds = enrollments
      .filter((enrollment) => enrollment.cohortId === threadForm.cohortId && enrollment.status === "active")
      .map((enrollment) => enrollment.studentId);
    const familyIds = students
      .filter((student) => studentIds.includes(student.id))
      .map((student) => student.familyId);

    return families.filter((family) => familyIds.includes(family.id));
  }, [enrollments, families, students, threadForm.cohortId]);

  const handleCreate = () => {
    if (readOnly) {
      setError("Role preview is read-only.");
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/ta/messaging/thread", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(threadForm),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Thread create failed.");
        }

        setThreadForm((current) => ({
          ...current,
          subject: "",
          body: "",
        }));
        setSuccess("Family thread started.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Thread create failed.");
      } finally {
        setPending(false);
      }
    });
  };

  return (
    <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
      <div className="section-kicker">New family thread</div>
      <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
        Start a support-scoped conversation
      </h3>
      <p className="mt-3 max-w-3xl text-sm text-[color:var(--muted)]">
        TA threads must stay inside assigned cohorts and use a support category guardrail.
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

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
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
          <option value="">Choose family</option>
          {familyOptions.map((family) => (
            <option key={family.id} value={family.id}>
              {family.familyName} family
            </option>
          ))}
        </select>
        <select
          value={threadForm.category}
          onChange={(event) =>
            setThreadForm((current) => ({ ...current, category: event.currentTarget.value }))
          }
          className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
          disabled={readOnly}
        >
          <option value="attendance">Attendance</option>
          <option value="scheduling">Scheduling</option>
          <option value="academic_follow_up">Academic follow-up</option>
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
      </div>

      <textarea
        value={threadForm.body}
        onChange={(event) =>
          setThreadForm((current) => ({ ...current, body: event.currentTarget.value }))
        }
        className="mt-4 min-h-[140px] w-full rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
        placeholder="Write a family-ready update for this cohort support issue."
        disabled={readOnly}
      />

      <button
        type="button"
        onClick={handleCreate}
        disabled={pending || readOnly}
        className={clsx(
          "mt-4 rounded-full px-4 py-2 text-sm font-semibold text-white",
          pending || readOnly
            ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
            : "bg-[color:var(--navy-strong)] hover:opacity-90",
        )}
      >
        {pending ? "Starting..." : readOnly ? "Preview only" : "Start thread"}
      </button>
    </div>
  );
}
