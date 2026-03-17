"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { Cohort, Enrollment, Family, Student } from "@/lib/domain";

interface AdminMessagingBulkPanelProps {
  viewerMode: "preview" | "live" | "live-role-preview";
  cohorts: Cohort[];
  families: Family[];
  students: Student[];
  enrollments: Enrollment[];
}

export function AdminMessagingBulkPanel({
  viewerMode,
  cohorts,
  families,
  students,
  enrollments,
}: AdminMessagingBulkPanelProps) {
  const router = useRouter();
  const readOnly = viewerMode === "live-role-preview";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cohortId, setCohortId] = useState(cohorts[0]?.id ?? "");
  const [familyIds, setFamilyIds] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const visibleFamilies = useMemo(() => {
    const studentIds = enrollments
      .filter((enrollment) => enrollment.cohortId === cohortId && enrollment.status === "active")
      .map((enrollment) => enrollment.studentId);
    const cohortFamilyIds = new Set(
      students
        .filter((student) => studentIds.includes(student.id))
        .map((student) => student.familyId),
    );
    return families.filter((family) => cohortFamilyIds.has(family.id));
  }, [cohortId, enrollments, families, students]);

  const handleSend = () => {
    if (readOnly) {
      setError("Role preview is read-only.");
      setSuccess(null);
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/messaging/bulk", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cohortId,
            familyIds,
            subject,
            body,
          }),
        });
        const payload = (await response.json()) as { error?: string; sentCount?: number };
        if (!response.ok) {
          throw new Error(payload.error ?? "Bulk family message failed.");
        }
        setFamilyIds([]);
        setSubject("");
        setBody("");
        setSuccess(`Started ${payload.sentCount ?? 0} family threads.`);
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Bulk family message failed.");
      } finally {
        setPending(false);
      }
    });
  };

  return (
    <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
      <div className="section-kicker">Bulk messaging</div>
      <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
        Family outreach by cohort
      </h3>
      <p className="mt-3 text-sm text-[color:var(--muted)]">
        Open new family threads for a cohort update without sending one-off messages manually.
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
      <div className="mt-5 grid gap-3 md:grid-cols-[0.75fr_1.25fr]">
        <select
          value={cohortId}
          onChange={(event) => {
            const nextCohortId = event.currentTarget.value;
            setCohortId(nextCohortId);
            setFamilyIds([]);
          }}
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
          multiple
          value={familyIds}
          onChange={(event) => {
            const nextFamilyIds = Array.from(event.currentTarget.selectedOptions).map(
              (option) => option.value,
            );
            setFamilyIds(nextFamilyIds);
          }}
          className="min-h-[148px] rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
          disabled={readOnly}
        >
          {visibleFamilies.map((family) => (
            <option key={family.id} value={family.id}>
              {family.familyName} · {family.guardianNames.join(" / ")}
            </option>
          ))}
        </select>
      </div>
      <input
        value={subject}
        onChange={(event) => setSubject(event.currentTarget.value)}
        className="mt-3 w-full rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
        placeholder="Subject"
        disabled={readOnly}
      />
      <textarea
        value={body}
        onChange={(event) => setBody(event.currentTarget.value)}
        className="mt-3 min-h-[136px] w-full rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
        placeholder="Message body"
        disabled={readOnly}
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={pending || readOnly}
        className={clsx(
          "mt-4 rounded-full px-4 py-2 text-sm font-semibold text-white",
          pending || readOnly
            ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
            : "bg-[color:var(--navy-strong)] hover:opacity-90",
        )}
      >
        {pending ? "Starting..." : readOnly ? "Preview only" : "Start family threads"}
      </button>
    </section>
  );
}
