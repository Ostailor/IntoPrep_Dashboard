"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { Cohort, Enrollment, Session, SessionInstructionBlock, Student, User } from "@/lib/domain";

interface AdminSessionManagementPanelProps {
  viewerMode: "preview" | "live" | "live-role-preview";
  cohorts: Cohort[];
  sessions: Session[];
  instructionBlocks: SessionInstructionBlock[];
  students: Student[];
  enrollments: Enrollment[];
  users: User[];
  canManage: boolean;
  canManageRoster: boolean;
  canManageInstructionBlocks: boolean;
}

function formatDateTimeLocal(value: string) {
  const date = new Date(value);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00-04:00`));
}

function formatTimeRange(startAt: string, endAt: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });

  return `${formatter.format(new Date(startAt))} - ${formatter.format(new Date(endAt))}`;
}

function formatTimeInput(value: string) {
  return formatDateTimeLocal(value).slice(11, 16);
}

function classesOverlap(left: Session, right: Session) {
  return Date.parse(left.startAt) < Date.parse(right.endAt) && Date.parse(right.startAt) < Date.parse(left.endAt);
}

export function AdminSessionManagementPanel({
  viewerMode,
  cohorts,
  sessions,
  instructionBlocks,
  students,
  enrollments,
  users,
  canManage,
  canManageRoster,
  canManageInstructionBlocks,
}: AdminSessionManagementPanelProps) {
  const router = useRouter();
  const classReadOnly = viewerMode === "live-role-preview" || !canManage;
  const rosterReadOnly = viewerMode === "live-role-preview" || !canManageRoster;
  const instructionReadOnly = viewerMode === "live-role-preview" || !canManageInstructionBlocks;
  const [localSessions, setLocalSessions] = useState(sessions);
  const [localInstructionBlocks, setLocalInstructionBlocks] = useState(instructionBlocks);
  const [selectedSessionId, setSelectedSessionId] = useState(sessions[0]?.id ?? "");
  const [formState, setFormState] = useState(() => {
    const session = sessions[0];
    return {
      cohortId: session?.cohortId ?? cohorts[0]?.id ?? "",
      title: session?.title ?? "",
      startAt: session ? formatDateTimeLocal(session.startAt) : "",
      endAt: session ? formatDateTimeLocal(session.endAt) : "",
      mode: session?.mode ?? "Hybrid",
      roomLabel: session?.roomLabel ?? "",
    };
  });
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [warningMessages, setWarningMessages] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [sourceCohortFilter, setSourceCohortFilter] = useState("all");
  const [studentPlacementId, setStudentPlacementId] = useState("");
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showScheduleEditor, setShowScheduleEditor] = useState(false);
  const [instructionBlockForm, setInstructionBlockForm] = useState({
    blockId: "",
    title: "",
    instructorId: "",
    startTime: "",
    endTime: "",
  });

  const sortedCohorts = useMemo(
    () => [...cohorts].sort((left, right) => left.name.localeCompare(right.name)),
    [cohorts],
  );
  const sortedSessions = useMemo(
    () => [...localSessions].sort((left, right) => left.startAt.localeCompare(right.startAt)),
    [localSessions],
  );
  const selectedSession = sortedSessions.find((session) => session.id === selectedSessionId) ?? sortedSessions[0];
  const cohortById = useMemo(() => new Map(cohorts.map((cohort) => [cohort.id, cohort])), [cohorts]);
  const instructorOptions = useMemo(
    () =>
      users
        .filter((user) => user.role === "admin" || user.role === "staff" || user.role === "ta" || user.role === "instructor")
        .sort((left, right) => left.name.localeCompare(right.name)),
    [users],
  );
  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
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
  const rosterStudents = useMemo(() => {
    if (!selectedSession) {
      return [];
    }

    return students
      .filter((student) => activeEnrollmentByStudent.get(student.id)?.cohortId === selectedSession.cohortId)
      .sort((left, right) => `${left.lastName} ${left.firstName}`.localeCompare(`${right.lastName} ${right.firstName}`));
  }, [activeEnrollmentByStudent, selectedSession, students]);
  const placementCandidates = useMemo(() => {
    const normalizedSearch = studentSearch.trim().toLowerCase();

    return [...students]
      .sort((left, right) => `${left.lastName} ${left.firstName}`.localeCompare(`${right.lastName} ${right.firstName}`))
      .filter((student) => {
        const enrollment = activeEnrollmentByStudent.get(student.id);
        const studentName = `${student.firstName} ${student.lastName}`.toLowerCase();

        if (normalizedSearch && !studentName.includes(normalizedSearch)) {
          return false;
        }

        if (sourceCohortFilter === "none") {
          return !enrollment;
        }

        if (sourceCohortFilter !== "all") {
          return enrollment?.cohortId === sourceCohortFilter;
        }

        return true;
      });
  }, [activeEnrollmentByStudent, sourceCohortFilter, studentSearch, students]);
  const placementStudent = placementCandidates.find((student) => student.id === studentPlacementId) ?? null;
  const placementEnrollment = placementStudent ? activeEnrollmentByStudent.get(placementStudent.id) : null;
  const selectedInstructionBlocks = useMemo(
    () =>
      selectedSession
        ? localInstructionBlocks
            .filter((block) => block.sessionId === selectedSession.id)
            .sort((left, right) => left.startAt.localeCompare(right.startAt))
        : [],
    [localInstructionBlocks, selectedSession],
  );
  const overlappingClasses =
    placementEnrollment && selectedSession
      ? sessions.filter(
          (session) =>
            session.cohortId === placementEnrollment.cohortId &&
            session.id !== selectedSession.id &&
            classesOverlap(session, selectedSession),
        )
      : [];

  useEffect(() => {
    setLocalSessions(sessions);
  }, [sessions]);

  useEffect(() => {
    setLocalInstructionBlocks(instructionBlocks);
  }, [instructionBlocks]);

  useEffect(() => {
    if (!selectedSessionId || !sortedSessions.some((session) => session.id === selectedSessionId)) {
      setSelectedSessionId(sortedSessions[0]?.id ?? "");
    }
  }, [selectedSessionId, sortedSessions]);

  useEffect(() => {
    if (!selectedSession) {
      setFormState({
        cohortId: cohorts[0]?.id ?? "",
        title: "",
        startAt: "",
        endAt: "",
        mode: "Hybrid",
        roomLabel: "",
      });
      return;
    }

    setFormState({
      cohortId: selectedSession.cohortId,
      title: selectedSession.title,
      startAt: formatDateTimeLocal(selectedSession.startAt),
      endAt: formatDateTimeLocal(selectedSession.endAt),
      mode: selectedSession.mode,
      roomLabel: selectedSession.roomLabel,
    });
    setWarningMessages([]);
    setStudentPlacementId("");
    setShowAddStudent(false);
    setShowScheduleEditor(false);
    setInstructionBlockForm({
      blockId: "",
      title: "",
      instructorId: instructorOptions[0]?.id ?? "",
      startTime: formatTimeInput(selectedSession.startAt),
      endTime: formatTimeInput(selectedSession.endAt),
    });
  }, [cohorts, instructorOptions, selectedSession]);

  useEffect(() => {
    if (!studentPlacementId || !placementCandidates.some((student) => student.id === studentPlacementId)) {
      setStudentPlacementId(placementCandidates[0]?.id ?? "");
    }
  }, [placementCandidates, studentPlacementId]);

  const handleSave = (force = false) => {
    if (classReadOnly || !selectedSession) {
      setError(classReadOnly ? "This role cannot edit class details." : "Choose a class to edit.");
      setSuccess(null);
      return;
    }

    setPendingKey("save");
    setError(null);
    setSuccess(null);
    if (!force) {
      setWarningMessages([]);
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/sessions", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId: selectedSession.id,
            cohortId: formState.cohortId,
            title: formState.title,
            startAt: new Date(formState.startAt).toISOString(),
            endAt: new Date(formState.endAt).toISOString(),
            mode: formState.mode,
            roomLabel: formState.roomLabel,
            force,
          }),
        });
        const payload = (await response.json()) as {
          error?: string;
          warnings?: string[];
          updated?: boolean;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Class update failed.");
        }

        if (!force && payload.updated === false && payload.warnings && payload.warnings.length > 0) {
          setWarningMessages(payload.warnings);
          return;
        }

        setLocalSessions((current) =>
          current.map((session) =>
            session.id === selectedSession.id
              ? {
                  ...session,
                  cohortId: formState.cohortId,
                  title: formState.title.trim(),
                  startAt: new Date(formState.startAt).toISOString(),
                  endAt: new Date(formState.endAt).toISOString(),
                  mode: formState.mode as Session["mode"],
                  roomLabel: formState.roomLabel.trim(),
                }
              : session,
          ),
        );
        setWarningMessages([]);
        setSuccess("Class updated.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Class update failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const handleDelete = (targetSession = selectedSession) => {
    if (classReadOnly || !targetSession) {
      setError(classReadOnly ? "This role cannot delete classes." : "Choose a class to delete.");
      setSuccess(null);
      return;
    }

    const confirmed = window.confirm(`Delete ${targetSession.title}? This removes the scheduled class block.`);
    if (!confirmed) {
      return;
    }

    setPendingKey("delete");
    setError(null);
    setSuccess(null);
    setWarningMessages([]);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/sessions", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId: targetSession.id,
          }),
        });
        const payload = (await response.json()) as { error?: string; deleted?: boolean };

        if (!response.ok) {
          throw new Error(payload.error ?? "Class delete failed.");
        }

        setLocalSessions((current) => current.filter((session) => session.id !== targetSession.id));
        setSelectedSessionId("");
        setSuccess("Class deleted.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Class delete failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const handlePlaceStudent = () => {
    if (rosterReadOnly || !selectedSession || !placementStudent) {
      setError(rosterReadOnly ? "This role cannot change class rosters." : "Choose a class and student first.");
      setSuccess(null);
      return;
    }

    if (placementEnrollment?.cohortId === selectedSession.cohortId) {
      setSuccess(`${placementStudent.firstName} ${placementStudent.lastName} is already in this class cohort.`);
      setError(null);
      return;
    }

    const sourceCohort = placementEnrollment ? cohortById.get(placementEnrollment.cohortId) : null;
    const targetCohort = cohortById.get(selectedSession.cohortId);
    const conflictText =
      overlappingClasses.length > 0
        ? `\n\nThis student is scheduled in ${overlappingClasses.map((session) => session.title).join(", ")} at the same time. Move them out of ${sourceCohort?.name ?? "their current cohort"} and into ${targetCohort?.name ?? "this class cohort"}?`
        : sourceCohort
          ? `\n\nThis will remove the student from ${sourceCohort.name} and place them in ${targetCohort?.name ?? "the selected class cohort"}.`
          : "";
    const confirmed = window.confirm(
      `Place ${placementStudent.firstName} ${placementStudent.lastName} in ${selectedSession.title}?${conflictText}`,
    );

    if (!confirmed) {
      return;
    }

    setPendingKey("place-student");
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
            studentId: placementStudent.id,
            targetCohortId: selectedSession.cohortId,
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Student placement failed.");
        }

        setSuccess(`${placementStudent.firstName} ${placementStudent.lastName} was placed in ${selectedSession.title}.`);
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Student placement failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const handleRemoveStudent = (student: Student) => {
    if (rosterReadOnly || !selectedSession) {
      setError(rosterReadOnly ? "This role cannot change class rosters." : "Choose a class first.");
      setSuccess(null);
      return;
    }

    const confirmed = window.confirm(
      `Remove ${student.firstName} ${student.lastName} from ${selectedSession.title}? This removes the student from ${cohortById.get(selectedSession.cohortId)?.name ?? "the class cohort"} and they will no longer appear in classes for that cohort.`,
    );

    if (!confirmed) {
      return;
    }

    setPendingKey(`remove-student-${student.id}`);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/staff/cohorts/remove-student", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            studentId: student.id,
            cohortId: selectedSession.cohortId,
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Student removal failed.");
        }

        setSuccess(`${student.firstName} ${student.lastName} was removed from ${selectedSession.title}.`);
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Student removal failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const buildInstructionDateTime = (time: string) => {
    if (!selectedSession) {
      return "";
    }

    return new Date(`${formatDateTimeLocal(selectedSession.startAt).slice(0, 10)}T${time}`).toISOString();
  };

  const handleEditInstructionBlock = (block: SessionInstructionBlock) => {
    setShowScheduleEditor(true);
    setInstructionBlockForm({
      blockId: block.id,
      title: block.title,
      instructorId: block.instructorId,
      startTime: formatTimeInput(block.startAt),
      endTime: formatTimeInput(block.endAt),
    });
  };

  const handleSaveInstructionBlock = () => {
    if (instructionReadOnly || !selectedSession) {
      setError(instructionReadOnly ? "This role cannot edit teaching schedules." : "Choose a class first.");
      setSuccess(null);
      return;
    }

    setPendingKey("save-instruction-block");
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/calendar/instruction-blocks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            blockId: instructionBlockForm.blockId || null,
            sessionId: selectedSession.id,
            instructorId: instructionBlockForm.instructorId,
            title: instructionBlockForm.title,
            startAt: buildInstructionDateTime(instructionBlockForm.startTime),
            endAt: buildInstructionDateTime(instructionBlockForm.endTime),
          }),
        });
        const payload = (await response.json()) as { error?: string; blockId?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Teaching schedule update failed.");
        }

        setSuccess("Teaching schedule updated.");
        setInstructionBlockForm({
          blockId: "",
          title: "",
          instructorId: instructorOptions[0]?.id ?? "",
          startTime: formatTimeInput(selectedSession.startAt),
          endTime: formatTimeInput(selectedSession.endAt),
        });
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Teaching schedule update failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const handleDeleteInstructionBlock = (block: SessionInstructionBlock) => {
    if (instructionReadOnly) {
      setError("This role cannot edit teaching schedules.");
      setSuccess(null);
      return;
    }

    const confirmed = window.confirm(`Remove ${block.title} from the teaching schedule?`);

    if (!confirmed) {
      return;
    }

    setPendingKey(`delete-instruction-block-${block.id}`);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/calendar/instruction-blocks", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            blockId: block.id,
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Teaching schedule update failed.");
        }

        setSuccess("Teaching segment removed.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Teaching schedule update failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  return (
    <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
      <div className="section-kicker">Week view</div>
      <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
        Scheduled instruction blocks
      </h3>
      <p className="mt-2 text-sm leading-7 text-[color:var(--muted)]">
        Class timing, modality, and rooming for visible cohorts.
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

      <div className="mt-5 space-y-4">
        {sortedSessions.map((session) => {
          const cohort = cohorts.find((item) => item.id === session.cohortId);
          const selected = session.id === selectedSession?.id;

          return (
            <div
              key={session.id}
              className={clsx(
                "rounded-[1.5rem] border bg-white/75 p-4",
                selected ? "border-[rgba(23,56,75,0.35)]" : "border-[color:var(--line)]",
              )}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <button
                  type="button"
                  onClick={() => setSelectedSessionId(session.id)}
                  className="min-w-0 text-left"
                >
                  <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                    {session.title}
                  </div>
                  <div className="mt-1 text-sm text-[color:var(--muted)]">
                    {formatLongDate(session.startAt.slice(0, 10))} · {formatTimeRange(session.startAt, session.endAt)}
                  </div>
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-[color:var(--line)] bg-stone-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    {cohort?.name ?? "Unassigned cohort"}
                  </span>
                  <span className="rounded-full border border-[rgba(115,138,123,0.22)] bg-[rgba(115,138,123,0.12)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--sage)]">
                    {session.mode}
                  </span>
                  {canManage ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setSelectedSessionId(session.id)}
                        className="rounded-full border border-[color:var(--line)] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--navy-strong)]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(session)}
                        disabled={classReadOnly || pendingKey === "delete"}
                        className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
        {sortedSessions.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-[color:var(--line)] bg-white/70 p-4 text-sm text-[color:var(--muted)]">
            No instruction classes are scheduled for the current role scope.
          </div>
        ) : null}
      </div>

      {canManage && selectedSession ? (
        <div className="mt-5 rounded-[1.5rem] border border-[color:var(--line)] bg-stone-50/80 p-4">
          <div className="section-kicker">Edit selected class</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-2 md:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Class name
              </span>
              <input
                value={formState.title}
                onChange={(event) => {
                  const title = event.currentTarget.value;
                  setFormState((current) => ({ ...current, title }));
                }}
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                disabled={classReadOnly}
              />
            </label>
            <label className="flex flex-col gap-2 md:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Cohort
              </span>
              <select
                value={formState.cohortId}
                onChange={(event) => {
                  const cohortId = event.currentTarget.value;
                  const cohort = cohorts.find((item) => item.id === cohortId);
                  setFormState((current) => ({
                    ...current,
                    cohortId,
                    roomLabel: current.roomLabel || cohort?.roomLabel || "",
                  }));
                }}
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                disabled={classReadOnly}
              >
                {sortedCohorts.map((cohort) => (
                  <option key={cohort.id} value={cohort.id}>
                    {cohort.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Start
              </span>
              <input
                value={formState.startAt}
                onChange={(event) => {
                  const startAt = event.currentTarget.value;
                  setFormState((current) => ({ ...current, startAt }));
                }}
                type="datetime-local"
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                disabled={classReadOnly}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                End
              </span>
              <input
                value={formState.endAt}
                onChange={(event) => {
                  const endAt = event.currentTarget.value;
                  setFormState((current) => ({ ...current, endAt }));
                }}
                type="datetime-local"
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                disabled={classReadOnly}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Mode
              </span>
              <select
                value={formState.mode}
                onChange={(event) => {
                  const mode = event.currentTarget.value as Session["mode"];
                  setFormState((current) => ({ ...current, mode }));
                }}
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                disabled={classReadOnly}
              >
                <option value="In person">In person</option>
                <option value="Hybrid">Hybrid</option>
                <option value="Zoom">Zoom</option>
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                Room
              </span>
              <input
                value={formState.roomLabel}
                onChange={(event) => {
                  const roomLabel = event.currentTarget.value;
                  setFormState((current) => ({ ...current, roomLabel }));
                }}
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                disabled={classReadOnly}
              />
            </label>
          </div>

          {warningMessages.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-100/90 px-4 py-3 text-sm text-amber-900">
              <div className="font-semibold">Review before saving.</div>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {warningMessages.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => handleSave(warningMessages.length > 0)}
              disabled={classReadOnly || pendingKey === "save"}
              className="rounded-full bg-[color:var(--navy-strong)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pendingKey === "save"
                ? "Saving..."
                : classReadOnly
                  ? "Preview only"
                  : warningMessages.length > 0
                    ? "Save anyway"
                    : "Save class"}
            </button>
            <button
              type="button"
              onClick={() => handleDelete()}
              disabled={classReadOnly || pendingKey === "delete"}
              className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pendingKey === "delete" ? "Deleting..." : "Delete class"}
            </button>
          </div>
        </div>
      ) : null}

      {selectedSession ? (
        <>
          <div className="mt-5 rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="section-kicker">Class roster</div>
                <h4 className="mt-2 text-lg font-semibold text-[color:var(--navy-strong)]">
                  Students in this class
                </h4>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
                  Roster membership comes from {cohortById.get(selectedSession.cohortId)?.name ?? "the class cohort"}. Moving a student here removes them from their prior active cohort so they are not in two classes at the same time.
                </p>
              </div>
              {canManageRoster ? (
                <button
                  type="button"
                  onClick={() => setShowAddStudent((current) => !current)}
                  className="rounded-full bg-[color:var(--navy-strong)] px-4 py-2 text-sm font-semibold text-white"
                >
                  {showAddStudent ? "Close add student" : "Add student"}
                </button>
              ) : null}
            </div>

            <div className="mt-4 space-y-2">
              {rosterStudents.map((student) => (
                <div
                  key={student.id}
                  className="flex flex-col gap-2 rounded-2xl border border-[color:var(--line)] bg-stone-50/80 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="text-sm font-semibold text-[color:var(--navy-strong)]">
                      {student.firstName} {student.lastName}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--muted)]">
                      {student.school} · Grade {student.gradeLevel}
                    </div>
                  </div>
                  {canManageRoster ? (
                    <button
                      type="button"
                      onClick={() => handleRemoveStudent(student)}
                      disabled={rosterReadOnly || pendingKey === `remove-student-${student.id}`}
                      className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pendingKey === `remove-student-${student.id}` ? "Removing..." : "Remove"}
                    </button>
                  ) : null}
                </div>
              ))}
              {rosterStudents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[color:var(--line)] bg-stone-50/80 p-4 text-sm text-[color:var(--muted)]">
                  No students are in this class cohort yet.
                </div>
              ) : null}
            </div>

            {showAddStudent && canManageRoster ? (
              <div className="mt-4 rounded-2xl border border-[color:var(--line)] bg-stone-50/80 p-4">
                <div className="text-sm font-semibold text-[color:var(--navy-strong)]">
                  Add a student to this class
                </div>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
                  Search by student name, choose the current cohort filter, then place the student into this class cohort.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr] xl:grid-cols-[1fr_1fr_1.2fr_auto]">
                  <input
                    value={studentSearch}
                    onChange={(event) => setStudentSearch(event.currentTarget.value)}
                    className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                    placeholder="Search student name"
                    disabled={rosterReadOnly}
                  />
                  <select
                    value={sourceCohortFilter}
                    onChange={(event) => setSourceCohortFilter(event.currentTarget.value)}
                    className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                    disabled={rosterReadOnly}
                  >
                    <option value="all">All student cohorts</option>
                    <option value="none">No active cohort</option>
                    {sortedCohorts.map((cohort) => (
                      <option key={cohort.id} value={cohort.id}>
                        {cohort.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={studentPlacementId}
                    onChange={(event) => setStudentPlacementId(event.currentTarget.value)}
                    className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                    disabled={rosterReadOnly || placementCandidates.length === 0}
                  >
                    {placementCandidates.length === 0 ? <option value="">No matching students</option> : null}
                    {placementCandidates.map((student) => {
                      const enrollment = activeEnrollmentByStudent.get(student.id);
                      const cohort = enrollment ? cohortById.get(enrollment.cohortId) : null;

                      return (
                        <option key={student.id} value={student.id}>
                          {student.firstName} {student.lastName} · {cohort?.name ?? "No active cohort"}
                        </option>
                      );
                    })}
                  </select>
                  <button
                    type="button"
                    onClick={handlePlaceStudent}
                    disabled={rosterReadOnly || pendingKey === "place-student" || !placementStudent}
                    className="rounded-full bg-[color:var(--navy-strong)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pendingKey === "place-student" ? "Placing..." : rosterReadOnly ? "Preview only" : "Place student"}
                  </button>
                </div>
                {placementStudent && placementEnrollment?.cohortId === selectedSession.cohortId ? (
                  <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    {placementStudent.firstName} {placementStudent.lastName} is already in this class cohort and will appear on the roster.
                  </div>
                ) : null}
                {placementStudent && overlappingClasses.length > 0 ? (
                  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Schedule conflict: this student is already in {overlappingClasses.map((session) => session.title).join(", ")} at the same time. Placing them here will ask which cohort/class they should be removed from.
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-5 rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="section-kicker">Teaching schedule</div>
                <h4 className="mt-2 text-lg font-semibold text-[color:var(--navy-strong)]">
                  Instructor segments inside this class
                </h4>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
                  Segments must stay between {formatTimeRange(selectedSession.startAt, selectedSession.endAt)}.
                </p>
              </div>
              {canManageInstructionBlocks ? (
                <button
                  type="button"
                  onClick={() => setShowScheduleEditor((current) => !current)}
                  className="rounded-full bg-[color:var(--navy-strong)] px-4 py-2 text-sm font-semibold text-white"
                >
                  {showScheduleEditor ? "Close schedule editor" : "Edit schedule"}
                </button>
              ) : null}
            </div>

            <div className="mt-4 space-y-2">
              {selectedInstructionBlocks.map((block) => (
                <div
                  key={block.id}
                  className="flex flex-col gap-2 rounded-2xl border border-[color:var(--line)] bg-stone-50/80 p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="text-sm font-semibold text-[color:var(--navy-strong)]">{block.title}</div>
                    <div className="mt-1 text-xs text-[color:var(--muted)]">
                      {formatTimeRange(block.startAt, block.endAt)} · {block.instructorName ?? userById.get(block.instructorId)?.name ?? "Instructor"}
                    </div>
                  </div>
                  {canManageInstructionBlocks ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleEditInstructionBlock(block)}
                        disabled={instructionReadOnly}
                        className="rounded-full border border-[color:var(--line)] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--navy-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteInstructionBlock(block)}
                        disabled={instructionReadOnly || pendingKey === `delete-instruction-block-${block.id}`}
                        className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {pendingKey === `delete-instruction-block-${block.id}` ? "Removing..." : "Remove"}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
              {selectedInstructionBlocks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[color:var(--line)] bg-stone-50/80 p-4 text-sm text-[color:var(--muted)]">
                  No instructor segments have been added for this class yet.
                </div>
              ) : null}
            </div>

            {showScheduleEditor && canManageInstructionBlocks ? (
              <div className="mt-4 rounded-2xl border border-[color:var(--line)] bg-stone-50/80 p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-2 md:col-span-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                      What is being taught
                    </span>
                    <input
                      value={instructionBlockForm.title}
                      onChange={(event) => {
                        const title = event.currentTarget.value;
                        setInstructionBlockForm((current) => ({ ...current, title }));
                      }}
                      className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                      placeholder="Math review, reading drills, writing workshop"
                      disabled={instructionReadOnly}
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                      Instructor
                    </span>
                    <select
                      value={instructionBlockForm.instructorId}
                      onChange={(event) => {
                        const instructorId = event.currentTarget.value;
                        setInstructionBlockForm((current) => ({ ...current, instructorId }));
                      }}
                      className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                      disabled={instructionReadOnly}
                    >
                      {instructorOptions.length === 0 ? <option value="">No instructors available</option> : null}
                      {instructorOptions.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} · {user.role}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                        Start
                      </span>
                      <input
                        type="time"
                        value={instructionBlockForm.startTime}
                        min={formatTimeInput(selectedSession.startAt)}
                        max={formatTimeInput(selectedSession.endAt)}
                        onChange={(event) => {
                          const startTime = event.currentTarget.value;
                          setInstructionBlockForm((current) => ({ ...current, startTime }));
                        }}
                        className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                        disabled={instructionReadOnly}
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                        End
                      </span>
                      <input
                        type="time"
                        value={instructionBlockForm.endTime}
                        min={formatTimeInput(selectedSession.startAt)}
                        max={formatTimeInput(selectedSession.endAt)}
                        onChange={(event) => {
                          const endTime = event.currentTarget.value;
                          setInstructionBlockForm((current) => ({ ...current, endTime }));
                        }}
                        className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                        disabled={instructionReadOnly}
                      />
                    </label>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleSaveInstructionBlock}
                    disabled={instructionReadOnly || pendingKey === "save-instruction-block" || !instructionBlockForm.instructorId}
                    className="rounded-full bg-[color:var(--navy-strong)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pendingKey === "save-instruction-block"
                      ? "Saving..."
                      : instructionBlockForm.blockId
                        ? "Save segment"
                        : "Add segment"}
                  </button>
                  {instructionBlockForm.blockId ? (
                    <button
                      type="button"
                      onClick={() =>
                        setInstructionBlockForm({
                          blockId: "",
                          title: "",
                          instructorId: instructorOptions[0]?.id ?? "",
                          startTime: formatTimeInput(selectedSession.startAt),
                          endTime: formatTimeInput(selectedSession.endAt),
                        })
                      }
                      className="rounded-full border border-[color:var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--navy-strong)]"
                    >
                      New segment
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
