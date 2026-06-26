"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { Cohort, Enrollment, Student, UserRole } from "@/lib/domain";

interface StudentCohortAssignmentPanelProps {
  viewerMode: "preview" | "live" | "live-role-preview";
  role: UserRole;
  students: Student[];
  cohorts: Cohort[];
  enrollments: Enrollment[];
}

export function StudentCohortAssignmentPanel({
  viewerMode,
  role,
  students,
  cohorts,
  enrollments,
}: StudentCohortAssignmentPanelProps) {
  const router = useRouter();
  const readOnly = viewerMode === "live-role-preview";
  const canAssign = role === "admin" || role === "staff";
  const sortedStudents = useMemo(
    () => [...students].sort((left, right) => `${left.lastName} ${left.firstName}`.localeCompare(`${right.lastName} ${right.firstName}`)),
    [students],
  );
  const sortedCohorts = useMemo(
    () => [...cohorts].sort((left, right) => left.name.localeCompare(right.name)),
    [cohorts],
  );
  const [selectedStudentId, setSelectedStudentId] = useState(sortedStudents[0]?.id ?? "");
  const [targetCohortId, setTargetCohortId] = useState(sortedCohorts[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!canAssign || sortedStudents.length === 0 || sortedCohorts.length === 0) {
    return null;
  }

  const selectedStudent = sortedStudents.find((student) => student.id === selectedStudentId) ?? sortedStudents[0];
  const activeEnrollment = enrollments.find(
    (enrollment) => enrollment.studentId === selectedStudent?.id && enrollment.status === "active",
  );
  const currentCohort = sortedCohorts.find((cohort) => cohort.id === activeEnrollment?.cohortId);
  const targetCohort = sortedCohorts.find((cohort) => cohort.id === targetCohortId);

  const handleAssign = () => {
    if (readOnly) {
      setError("Role preview is read-only.");
      setSuccess(null);
      return;
    }

    if (!selectedStudent || !targetCohortId) {
      setError("Choose a student and target cohort.");
      setSuccess(null);
      return;
    }

    if (currentCohort?.id === targetCohortId) {
      setError("That student is already in the selected cohort.");
      setSuccess(null);
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/staff/cohorts/move-student", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            studentId: selectedStudent.id,
            targetCohortId,
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Cohort assignment failed.");
        }

        setSuccess(`${selectedStudent.firstName} ${selectedStudent.lastName} assigned to ${targetCohort?.name ?? "the selected cohort"}.`);
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Cohort assignment failed.");
      } finally {
        setPending(false);
      }
    });
  };

  return (
    <div className="mt-5 rounded-[1.75rem] border border-[color:var(--line)] bg-stone-50/80 p-5">
      <div className="section-kicker">Cohort placement</div>
      <h3 className="display-font mt-2 text-2xl text-[color:var(--navy-strong)]">
        Assign a student to a cohort
      </h3>
      <p className="mt-2 text-sm text-[color:var(--muted)]">
        Use this when placing students into MWF, Tue/Thu/Sat, Zoom, intensive, or level-specific cohorts.
      </p>
      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-100/90 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-100/90 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      ) : null}
      <div className="mt-5 grid gap-3 xl:grid-cols-[1.1fr_1fr_auto]">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
            Student
          </span>
          <select
            value={selectedStudent?.id ?? ""}
            onChange={(event) => {
              setSelectedStudentId(event.currentTarget.value);
              setSuccess(null);
              setError(null);
            }}
            className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            disabled={readOnly}
          >
            {sortedStudents.map((student) => (
              <option key={student.id} value={student.id}>
                {student.lastName}, {student.firstName} · Grade {student.gradeLevel}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
            Target cohort
          </span>
          <select
            value={targetCohortId}
            onChange={(event) => setTargetCohortId(event.currentTarget.value)}
            className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            disabled={readOnly}
          >
            {sortedCohorts.map((cohort) => (
              <option key={cohort.id} value={cohort.id}>
                {cohort.name} · {cohort.enrolled}/{cohort.capacity}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={handleAssign}
            disabled={pending || readOnly || !selectedStudent || !targetCohortId}
            className={clsx(
              "w-full rounded-full px-4 py-2 text-sm font-semibold text-white xl:w-auto",
              pending || readOnly || !selectedStudent || !targetCohortId
                ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
                : "bg-[color:var(--navy-strong)] hover:opacity-90",
            )}
          >
            {pending ? "Assigning..." : readOnly ? "Preview only" : "Assign"}
          </button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 text-sm text-[color:var(--muted)] md:grid-cols-3">
        <div className="rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 py-3">
          <div className="font-semibold text-[color:var(--navy-strong)]">Current cohort</div>
          <div className="mt-1">{currentCohort?.name ?? "No active cohort"}</div>
        </div>
        <div className="rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 py-3">
          <div className="font-semibold text-[color:var(--navy-strong)]">Student focus</div>
          <div className="mt-1">{selectedStudent?.focus ?? "Not selected"}</div>
        </div>
        <div className="rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 py-3">
          <div className="font-semibold text-[color:var(--navy-strong)]">Target room</div>
          <div className="mt-1">{targetCohort?.roomLabel ?? "Choose a cohort"}</div>
        </div>
      </div>
    </div>
  );
}
