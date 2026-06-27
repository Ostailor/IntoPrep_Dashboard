"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type {
  Assessment,
  AssessmentResult,
  Cohort,
  Enrollment,
  Family,
  ProgramTrack,
  Session,
  Student,
  UserRole,
} from "@/lib/domain";
import { TrendSparkline } from "@/components/portal/trend-sparkline";

type TrendMetric = "total" | "rw" | "math";
type TrendFilter = "all" | "declining" | "plateauing" | "increasing";

interface StudentCohortAssignmentPanelProps {
  viewerMode: "preview" | "live" | "live-role-preview";
  role: UserRole;
  currentDate: string;
  students: Student[];
  families: Family[];
  cohorts: Cohort[];
  sessions: Session[];
  enrollments: Enrollment[];
  assessments: Assessment[];
  results: AssessmentResult[];
}

type StudentFormState = {
  studentId: string | null;
  firstName: string;
  lastName: string;
  gradeLevel: string;
  school: string;
  targetTest: ProgramTrack;
  focus: string;
  guardianName: string;
  familyEmail: string;
  familyPhone: string;
  familyNotes: string;
};

type ScoreFormState = {
  studentId: string;
  cohortId: string;
  testTitle: string;
  testDate: string;
  rwScore: string;
  mathScore: string;
  totalScore: string;
};

function getDateOnly(value: string) {
  return value.slice(0, 10);
}

function formatClassDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

function metricScore(result: AssessmentResult, metric: TrendMetric) {
  if (metric === "total") {
    return result.totalScore;
  }

  const labels = metric === "rw" ? ["rw", "reading", "reading/writing"] : ["math", "mathematics"];
  const section = result.sectionScores.find((score) => labels.includes(score.label.toLowerCase()));
  return section?.score ?? null;
}

function getTrendToneLabel(points: { label: string; score: number }[]) {
  if (points.length < 2) {
    return "Plateauing";
  }

  const delta = points.at(-1)!.score - points[0]!.score;

  if (delta > 20) {
    return "Increasing";
  }

  if (delta < -20) {
    return "Declining";
  }

  return "Plateauing";
}

function getTrendFilterValue(points: { label: string; score: number }[]): Exclude<TrendFilter, "all"> {
  const tone = getTrendToneLabel(points).toLowerCase();
  return tone === "declining" || tone === "increasing" ? tone : "plateauing";
}

function emptyStudentForm(): StudentFormState {
  return {
    studentId: null,
    firstName: "",
    lastName: "",
    gradeLevel: "",
    school: "",
    targetTest: "SAT",
    focus: "",
    guardianName: "",
    familyEmail: "",
    familyPhone: "",
    familyNotes: "",
  };
}

export function StudentCohortAssignmentPanel({
  viewerMode,
  role,
  currentDate,
  students,
  families,
  cohorts,
  sessions,
  enrollments,
  assessments,
  results,
}: StudentCohortAssignmentPanelProps) {
  const router = useRouter();
  const readOnly = viewerMode === "live-role-preview";
  const canEditStudents = role === "admin" || role === "staff";
  const canAssign = role === "admin" || role === "staff";
  const canLogScores = role === "admin" || role === "staff" || role === "ta";
  const [search, setSearch] = useState("");
  const [cohortFilter, setCohortFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [trendFilter, setTrendFilter] = useState<TrendFilter>("all");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [bulkCohortId, setBulkCohortId] = useState(cohorts[0]?.id ?? "");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [studentForm, setStudentForm] = useState<StudentFormState | null>(null);
  const [scoreForm, setScoreForm] = useState<ScoreFormState | null>(null);
  const [trendStudentId, setTrendStudentId] = useState<string | null>(null);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("total");

  const familyById = useMemo(() => new Map(families.map((family) => [family.id, family])), [families]);
  const cohortById = useMemo(() => new Map(cohorts.map((cohort) => [cohort.id, cohort])), [cohorts]);
  const assessmentById = useMemo(
    () => new Map(assessments.map((assessment) => [assessment.id, assessment])),
    [assessments],
  );
  const activeEnrollmentByStudent = useMemo(() => {
    const map = new Map<string, Enrollment>();
    enrollments
      .filter((enrollment) => enrollment.status === "active")
      .forEach((enrollment) => {
        if (!map.has(enrollment.studentId)) {
          map.set(enrollment.studentId, enrollment);
        }
      });
    return map;
  }, [enrollments]);
  const sessionsByCohort = useMemo(() => {
    const map = new Map<string, Session[]>();
    sessions.forEach((session) => {
      const existing = map.get(session.cohortId) ?? [];
      existing.push(session);
      map.set(session.cohortId, existing);
    });
    return map;
  }, [sessions]);
  const schools = useMemo(
    () => Array.from(new Set(students.map((student) => student.school).filter(Boolean))).sort(),
    [students],
  );
  const classOptions = useMemo(
    () => [...sessions].sort((left, right) => left.startAt.localeCompare(right.startAt)),
    [sessions],
  );

  const refreshDirectory = () => {
    router.refresh();
    window.setTimeout(() => window.location.reload(), 500);
  };

  const getStudentSessions = (studentId: string) => {
    const cohortIds = enrollments
      .filter((enrollment) => enrollment.studentId === studentId && enrollment.status === "active")
      .map((enrollment) => enrollment.cohortId);
    return cohortIds.flatMap((cohortId) => sessionsByCohort.get(cohortId) ?? []);
  };

  const getCurrentClasses = (studentId: string) =>
    getStudentSessions(studentId).filter(
      (session) => getDateOnly(session.startAt) <= currentDate && getDateOnly(session.endAt) >= currentDate,
    );

  const getPastClasses = (studentId: string) =>
    getStudentSessions(studentId)
      .filter((session) => getDateOnly(session.endAt) < currentDate)
      .sort((left, right) => right.endAt.localeCompare(left.endAt));

  const getTrendPoints = (studentId: string, metric: TrendMetric) =>
    results
      .filter((result) => result.studentId === studentId)
      .map((result) => {
        const assessment = assessmentById.get(result.assessmentId);
        const score = metricScore(result, metric);

        return assessment && score !== null
          ? {
              label: formatClassDate(`${assessment.date}T12:00:00-04:00`),
              score,
              date: assessment.date,
              assessment,
              result,
            }
          : null;
      })
      .filter((point): point is NonNullable<typeof point> => point !== null)
      .sort((left, right) => left.date.localeCompare(right.date));

  const filteredStudents = (() => {
    const normalizedSearch = search.trim().toLowerCase();

    return [...students]
      .sort((left, right) => `${left.lastName} ${left.firstName}`.localeCompare(`${right.lastName} ${right.firstName}`))
      .filter((student) => {
        const family = familyById.get(student.familyId);
        const enrollment = activeEnrollmentByStudent.get(student.id);
        const currentClasses = getCurrentClasses(student.id);
        const haystack = [
          student.firstName,
          student.lastName,
          student.school,
          student.gradeLevel,
          student.focus,
          family?.email,
          family?.phone,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (normalizedSearch && !haystack.includes(normalizedSearch)) {
          return false;
        }

        if (cohortFilter === "none" && enrollment) {
          return false;
        }

        if (cohortFilter !== "all" && cohortFilter !== "none" && enrollment?.cohortId !== cohortFilter) {
          return false;
        }

        if (classFilter === "none" && currentClasses.length > 0) {
          return false;
        }

        if (classFilter !== "all" && classFilter !== "none") {
          const classSession = sessions.find((session) => session.id === classFilter);
          if (!classSession || enrollment?.cohortId !== classSession.cohortId) {
            return false;
          }
        }

        if (schoolFilter !== "all" && student.school !== schoolFilter) {
          return false;
        }

        if (trendFilter !== "all" && getTrendFilterValue(getTrendPoints(student.id, "total")) !== trendFilter) {
          return false;
        }

        return true;
      });
  })();

  const openStudentForm = (student?: Student) => {
    if (!student) {
      setStudentForm(emptyStudentForm());
      return;
    }

    const family = familyById.get(student.familyId);
    setStudentForm({
      studentId: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      gradeLevel: student.gradeLevel,
      school: student.school,
      targetTest: student.targetTest,
      focus: student.focus,
      guardianName: family?.guardianNames[0] ?? "",
      familyEmail: family?.email ?? "",
      familyPhone: family?.phone ?? "",
      familyNotes: family?.notes ?? "",
    });
  };

  const submitStudentForm = () => {
    if (!studentForm || readOnly) {
      return;
    }

    setPendingKey("student-form");
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(studentForm),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Student update failed.");
        }

        setSuccess(studentForm.studentId ? "Student updated." : "Student added.");
        setStudentForm(null);
        refreshDirectory();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Student update failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const submitBulkAssignment = () => {
    if (readOnly || selectedStudentIds.length === 0 || !bulkCohortId) {
      return;
    }

    setPendingKey("bulk-cohort");
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/students/bulk-cohort", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentIds: selectedStudentIds,
            targetCohortId: bulkCohortId,
          }),
        });
        const payload = (await response.json()) as { assigned?: number; skipped?: number; error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Bulk cohort assignment failed.");
        }

        setSuccess(`${payload.assigned ?? 0} student${payload.assigned === 1 ? "" : "s"} assigned. ${payload.skipped ?? 0} already in cohort.`);
        setSelectedStudentIds([]);
        refreshDirectory();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Bulk cohort assignment failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const openScoreForm = (student: Student) => {
    const enrollment = activeEnrollmentByStudent.get(student.id);
    setScoreForm({
      studentId: student.id,
      cohortId: enrollment?.cohortId ?? cohorts[0]?.id ?? "",
      testTitle: "Practice Test",
      testDate: currentDate,
      rwScore: "",
      mathScore: "",
      totalScore: "",
    });
  };

  const submitScoreForm = () => {
    if (!scoreForm || readOnly) {
      return;
    }

    setPendingKey("score-form");
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/students/scores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...scoreForm,
            rwScore: Number(scoreForm.rwScore),
            mathScore: Number(scoreForm.mathScore),
            totalScore: Number(scoreForm.totalScore || Number(scoreForm.rwScore) + Number(scoreForm.mathScore)),
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Score update failed.");
        }

        setSuccess("Score logged.");
        setScoreForm(null);
        refreshDirectory();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Score update failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const trendStudent = trendStudentId ? students.find((student) => student.id === trendStudentId) : null;
  const trendPoints = trendStudent ? getTrendPoints(trendStudent.id, trendMetric) : [];
  const selectedTrendRows = trendStudent
    ? results
        .filter((result) => result.studentId === trendStudent.id)
        .map((result) => {
          const assessment = assessmentById.get(result.assessmentId);
          return assessment ? { assessment, result } : null;
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)
        .sort((left, right) => right.assessment.date.localeCompare(left.assessment.date))
    : [];

  return (
    <section className="glass-panel rounded-lg border border-[color:var(--line)] p-5 shadow-[var(--shadow)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="section-kicker">Student directory</div>
          <h3 className="mt-2 text-2xl font-semibold text-[color:var(--navy-strong)]">
            Student records and placement
          </h3>
          <p className="mt-2 max-w-3xl text-sm text-[color:var(--muted)]">
            Search students, filter by cohort, class, or school, update placement, and review score trends.
          </p>
        </div>
        {canEditStudents ? (
          <button
            type="button"
            onClick={() => openStudentForm()}
            disabled={readOnly}
            className="rounded-full bg-[color:var(--navy)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Add student
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
          {success}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr]">
        <label className="text-sm font-semibold text-[color:var(--navy-strong)]">
          Search
          <input
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Name, school, phone, email, focus"
            className="mt-2 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[rgba(23,56,75,0.12)]"
          />
        </label>
        <label className="text-sm font-semibold text-[color:var(--navy-strong)]">
          Cohort
          <select
            value={cohortFilter}
            onChange={(event) => setCohortFilter(event.currentTarget.value)}
            className="mt-2 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-sm"
          >
            <option value="all">All cohorts</option>
            <option value="none">No active cohort</option>
            {cohorts.map((cohort) => (
              <option key={cohort.id} value={cohort.id}>
                {cohort.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-[color:var(--navy-strong)]">
          Class
          <select
            value={classFilter}
            onChange={(event) => setClassFilter(event.currentTarget.value)}
            className="mt-2 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-sm"
          >
            <option value="all">All classes</option>
            <option value="none">Current class: None</option>
            {classOptions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title} · {formatClassDate(session.startAt)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-[color:var(--navy-strong)]">
          School
          <select
            value={schoolFilter}
            onChange={(event) => setSchoolFilter(event.currentTarget.value)}
            className="mt-2 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-sm"
          >
            <option value="all">All schools</option>
            {schools.map((school) => (
              <option key={school} value={school}>
                {school}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-[color:var(--navy-strong)]">
          Trend
          <select
            value={trendFilter}
            onChange={(event) => setTrendFilter(event.currentTarget.value as TrendFilter)}
            className="mt-2 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-sm"
          >
            <option value="all">All trends</option>
            <option value="declining">Declining</option>
            <option value="plateauing">Plateauing</option>
            <option value="increasing">Increasing</option>
          </select>
        </label>
      </div>

      {canAssign ? (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-[color:var(--line)] bg-stone-50/80 p-4 lg:flex-row lg:items-end">
          <div className="flex-1">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Bulk cohort assignment
            </div>
            <div className="mt-1 text-sm text-[color:var(--muted)]">
              {selectedStudentIds.length} selected from the filtered directory.
            </div>
          </div>
          <label className="min-w-[260px] text-sm font-semibold text-[color:var(--navy-strong)]">
            Target cohort
            <select
              value={bulkCohortId}
              onChange={(event) => setBulkCohortId(event.currentTarget.value)}
              className="mt-2 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-sm"
              disabled={readOnly}
            >
              {cohorts.map((cohort) => (
                <option key={cohort.id} value={cohort.id}>
                  {cohort.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={submitBulkAssignment}
            disabled={readOnly || pendingKey === "bulk-cohort" || selectedStudentIds.length === 0 || !bulkCohortId}
            className="rounded-full bg-[color:var(--navy-strong)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {pendingKey === "bulk-cohort" ? "Assigning..." : "Assign selected"}
          </button>
        </div>
      ) : null}

      <div className="mt-5 overflow-x-auto rounded-lg border border-[color:var(--line)]">
        <table className="min-w-[1180px] w-full border-collapse bg-white/75 text-sm">
          <thead className="bg-[rgba(23,56,75,0.06)] text-left text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
            <tr>
              {canAssign ? <th className="w-12 px-4 py-3">Select</th> : null}
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">School</th>
              <th className="px-4 py-3">Family phone</th>
              <th className="px-4 py-3">Cohort</th>
              <th className="px-4 py-3">Current class</th>
              <th className="px-4 py-3">Past classes</th>
              <th className="px-4 py-3">Trend</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((student) => {
              const family = familyById.get(student.familyId);
              const enrollment = activeEnrollmentByStudent.get(student.id);
              const cohort = enrollment ? cohortById.get(enrollment.cohortId) : null;
              const currentClasses = getCurrentClasses(student.id);
              const pastClasses = getPastClasses(student.id);
              const totalTrend = getTrendPoints(student.id, "total");
              const checked = selectedStudentIds.includes(student.id);

              return (
                <tr key={student.id} className="border-t border-[color:var(--line)] align-top">
                  {canAssign ? (
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          const isChecked = event.currentTarget.checked;
                          setSelectedStudentIds((current) =>
                            isChecked
                              ? Array.from(new Set([...current, student.id]))
                              : current.filter((id) => id !== student.id),
                          );
                        }}
                        className="h-4 w-4 rounded border-[color:var(--line)]"
                      />
                    </td>
                  ) : null}
                  <td className="px-4 py-4">
                    <div className="font-semibold text-[color:var(--navy-strong)]">
                      {student.firstName} {student.lastName}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--muted)]">
                      Grade {student.gradeLevel} · {student.targetTest} · {student.focus}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-[color:var(--muted)]">{student.school}</td>
                  <td className="px-4 py-4 text-[color:var(--muted)]">{family?.phone ?? "Restricted"}</td>
                  <td className="px-4 py-4 text-[color:var(--muted)]">{cohort?.name ?? "None"}</td>
                  <td className="px-4 py-4 text-[color:var(--muted)]">
                    {currentClasses.length > 0 ? currentClasses.map((session) => session.title).join(", ") : "None"}
                  </td>
                  <td className="max-w-[240px] px-4 py-4 text-[color:var(--muted)]">
                    {pastClasses.length > 0
                      ? pastClasses.slice(0, 3).map((session) => `${session.title} (${formatClassDate(session.endAt)})`).join(", ")
                      : "None"}
                  </td>
                  <td className="w-[210px] px-4 py-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                      {getTrendToneLabel(totalTrend)}
                    </div>
                    <TrendSparkline
                      points={totalTrend}
                      onClick={() => {
                        setTrendStudentId(student.id);
                        setTrendMetric("total");
                      }}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      {canEditStudents ? (
                        <button
                          type="button"
                          onClick={() => openStudentForm(student)}
                          className="rounded-full border border-[color:var(--line)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--navy-strong)]"
                        >
                          Edit
                        </button>
                      ) : null}
                      {canLogScores ? (
                        <button
                          type="button"
                          onClick={() => openScoreForm(student)}
                          className="rounded-full border border-[rgba(23,56,75,0.2)] bg-[rgba(23,56,75,0.08)] px-3 py-1.5 text-xs font-semibold text-[color:var(--navy-strong)]"
                        >
                          Log score
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredStudents.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-[color:var(--line)] p-5 text-sm text-[color:var(--muted)]">
          No students match the current filters.
        </div>
      ) : null}

      {studentForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.45)] p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="section-kicker">{studentForm.studentId ? "Edit student" : "Add student"}</div>
                <h3 className="mt-2 text-2xl font-semibold text-[color:var(--navy-strong)]">
                  Student profile
                </h3>
              </div>
              <button type="button" onClick={() => setStudentForm(null)} className="rounded-full border px-3 py-1 text-sm">
                Close
              </button>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {[
                ["First name", "firstName"],
                ["Last name", "lastName"],
                ["Grade", "gradeLevel"],
                ["School", "school"],
                ["Focus", "focus"],
                ["Guardian name", "guardianName"],
                ["Family email", "familyEmail"],
                ["Family phone", "familyPhone"],
              ].map(([label, field]) => (
                <label key={field} className="text-sm font-semibold text-[color:var(--navy-strong)]">
                  {label}
                  <input
                    value={String(studentForm[field as keyof StudentFormState] ?? "")}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setStudentForm((current) => current ? { ...current, [field]: value } : current);
                    }}
                    className="mt-2 w-full rounded-lg border border-[color:var(--line)] px-3 py-2 text-sm"
                  />
                </label>
              ))}
              <label className="text-sm font-semibold text-[color:var(--navy-strong)]">
                Target test
                <select
                  value={studentForm.targetTest}
                  onChange={(event) => {
                    const targetTest = event.currentTarget.value as ProgramTrack;
                    setStudentForm((current) => current ? { ...current, targetTest } : current);
                  }}
                  className="mt-2 w-full rounded-lg border border-[color:var(--line)] px-3 py-2 text-sm"
                >
                  <option value="SAT">SAT</option>
                  <option value="ACT">ACT</option>
                  <option value="Admissions">Admissions</option>
                  <option value="Support">Support</option>
                </select>
              </label>
              <label className="md:col-span-2 text-sm font-semibold text-[color:var(--navy-strong)]">
                Family notes
                <textarea
                  value={studentForm.familyNotes}
                  onChange={(event) => {
                    const familyNotes = event.currentTarget.value;
                    setStudentForm((current) => current ? { ...current, familyNotes } : current);
                  }}
                  className="mt-2 min-h-24 w-full rounded-lg border border-[color:var(--line)] px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setStudentForm(null)} className="rounded-full border px-4 py-2 text-sm font-semibold">
                Cancel
              </button>
              <button
                type="button"
                onClick={submitStudentForm}
                disabled={pendingKey === "student-form" || readOnly}
                className="rounded-full bg-[color:var(--navy)] px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
              >
                {pendingKey === "student-form" ? "Saving..." : "Save student"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {scoreForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.45)] p-4">
          <div className="w-full max-w-xl rounded-lg bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="section-kicker">Score entry</div>
                <h3 className="mt-2 text-2xl font-semibold text-[color:var(--navy-strong)]">Log student score</h3>
              </div>
              <button type="button" onClick={() => setScoreForm(null)} className="rounded-full border px-3 py-1 text-sm">
                Close
              </button>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold text-[color:var(--navy-strong)]">
                Cohort
                <select
                  value={scoreForm.cohortId}
                  onChange={(event) => {
                    const cohortId = event.currentTarget.value;
                    setScoreForm((current) => current ? { ...current, cohortId } : current);
                  }}
                  className="mt-2 w-full rounded-lg border border-[color:var(--line)] px-3 py-2 text-sm"
                >
                  {cohorts.map((cohort) => (
                    <option key={cohort.id} value={cohort.id}>
                      {cohort.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-[color:var(--navy-strong)]">
                Date
                <input
                  type="date"
                  value={scoreForm.testDate}
                  onChange={(event) => {
                    const testDate = event.currentTarget.value;
                    setScoreForm((current) => current ? { ...current, testDate } : current);
                  }}
                  className="mt-2 w-full rounded-lg border border-[color:var(--line)] px-3 py-2 text-sm"
                />
              </label>
              <label className="md:col-span-2 text-sm font-semibold text-[color:var(--navy-strong)]">
                Test
                <input
                  value={scoreForm.testTitle}
                  onChange={(event) => {
                    const testTitle = event.currentTarget.value;
                    setScoreForm((current) => current ? { ...current, testTitle } : current);
                  }}
                  className="mt-2 w-full rounded-lg border border-[color:var(--line)] px-3 py-2 text-sm"
                />
              </label>
              {[
                ["RW score", "rwScore"],
                ["Math score", "mathScore"],
                ["Total score", "totalScore"],
              ].map(([label, field]) => (
                <label key={field} className="text-sm font-semibold text-[color:var(--navy-strong)]">
                  {label}
                  <input
                    type="number"
                    value={scoreForm[field as keyof ScoreFormState]}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setScoreForm((current) => current ? { ...current, [field]: value } : current);
                    }}
                    className="mt-2 w-full rounded-lg border border-[color:var(--line)] px-3 py-2 text-sm"
                  />
                </label>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setScoreForm(null)} className="rounded-full border px-4 py-2 text-sm font-semibold">
                Cancel
              </button>
              <button
                type="button"
                onClick={submitScoreForm}
                disabled={pendingKey === "score-form" || readOnly || !scoreForm.cohortId}
                className="rounded-full bg-[color:var(--navy)] px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
              >
                {pendingKey === "score-form" ? "Saving..." : "Save score"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {trendStudent ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.45)] p-4">
          <div className="grid max-h-[90vh] w-full max-w-5xl gap-5 overflow-y-auto rounded-lg bg-white p-5 shadow-2xl lg:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="section-kicker">Score trend</div>
                  <h3 className="mt-2 text-2xl font-semibold text-[color:var(--navy-strong)]">
                    {trendStudent.firstName} {trendStudent.lastName}
                  </h3>
                </div>
                <button type="button" onClick={() => setTrendStudentId(null)} className="rounded-full border px-3 py-1 text-sm">
                  Close
                </button>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {[
                  ["total", "Total"],
                  ["rw", "RW"],
                  ["math", "Math"],
                ].map(([metric, label]) => (
                  <button
                    key={metric}
                    type="button"
                    onClick={() => setTrendMetric(metric as TrendMetric)}
                    className={clsx(
                      "rounded-full border px-4 py-2 text-sm font-semibold",
                      trendMetric === metric
                        ? "border-[rgba(23,56,75,0.3)] bg-[rgba(23,56,75,0.1)] text-[color:var(--navy-strong)]"
                        : "border-[color:var(--line)] text-[color:var(--muted)]",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-6 rounded-lg border border-[color:var(--line)] p-5">
                <div className="mb-3 text-sm font-semibold text-[color:var(--navy-strong)]">
                  {getTrendToneLabel(trendPoints)} {trendMetric.toUpperCase()} trend
                </div>
                <TrendSparkline points={trendPoints} className="[&_svg]:h-48" />
              </div>
            </div>
            <div className="rounded-lg border border-[color:var(--line)] p-4">
              <div className="text-sm font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Score history
              </div>
              <div className="mt-4 space-y-3">
                {selectedTrendRows.map(({ assessment, result }) => {
                  const rw = metricScore(result, "rw");
                  const math = metricScore(result, "math");
                  return (
                    <div key={result.id} className="rounded-lg border border-[color:var(--line)] bg-stone-50/80 p-3 text-sm">
                      <div className="font-semibold text-[color:var(--navy-strong)]">{assessment.title}</div>
                      <div className="mt-1 text-[color:var(--muted)]">{assessment.date}</div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                        <span>RW {rw ?? "-"}</span>
                        <span>Math {math ?? "-"}</span>
                        <span>Total {result.totalScore}</span>
                      </div>
                    </div>
                  );
                })}
                {selectedTrendRows.length === 0 ? (
                  <div className="text-sm text-[color:var(--muted)]">No scores recorded yet.</div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
