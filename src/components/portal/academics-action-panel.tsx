"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type {
  AcademicNote,
  Assessment,
  AssessmentResult,
  Cohort,
  Enrollment,
  Student,
  UserRole,
} from "@/lib/domain";
import { getPermissionProfile } from "@/lib/permissions";

interface AcademicsActionPanelProps {
  viewerRole: UserRole;
  currentDate: string;
  cohorts: Pick<Cohort, "id" | "name">[];
  students: Student[];
  enrollments: Enrollment[];
  assessments: Assessment[];
  results: AssessmentResult[];
  notes: AcademicNote[];
}

type FeedbackState = {
  tone: "error" | "success";
  message: string;
} | null;

function formatStudentLabel(student: Student) {
  return `${student.firstName} ${student.lastName}`;
}

export function AcademicsActionPanel({
  viewerRole,
  currentDate,
  cohorts,
  students,
  enrollments,
  assessments,
  results,
  notes,
}: AcademicsActionPanelProps) {
  const router = useRouter();
  const permissions = getPermissionProfile(viewerRole);
  const todayAssessments = useMemo(
    () => assessments.filter((assessment) => assessment.date === currentDate),
    [assessments, currentDate],
  );
  const [noteStudentId, setNoteStudentId] = useState(students[0]?.id ?? "");
  const [selectedNoteId, setSelectedNoteId] = useState("new");
  const [noteSummary, setNoteSummary] = useState("");
  const [resourceCohortId, setResourceCohortId] = useState(cohorts[0]?.id ?? "");
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceKind, setResourceKind] = useState<"Worksheet" | "Deck" | "Replay">("Worksheet");
  const [resourceLinkUrl, setResourceLinkUrl] = useState("");
  const [resourceFile, setResourceFile] = useState<File | null>(null);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState(todayAssessments[0]?.id ?? "");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [totalScore, setTotalScore] = useState("");
  const [sectionDraft, setSectionDraft] = useState<Record<string, string>>({});
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  useEffect(() => {
    if (!noteStudentId && students[0]?.id) {
      setNoteStudentId(students[0].id);
    }
  }, [noteStudentId, students]);

  const visibleNotes = useMemo(
    () => notes.filter((note) => note.studentId === noteStudentId),
    [noteStudentId, notes],
  );

  useEffect(() => {
    if (selectedNoteId !== "new" && !visibleNotes.some((note) => note.id === selectedNoteId)) {
      setSelectedNoteId("new");
    }
  }, [selectedNoteId, visibleNotes]);

  useEffect(() => {
    if (selectedNoteId === "new") {
      setNoteSummary("");
      return;
    }

    const selectedNote = visibleNotes.find((note) => note.id === selectedNoteId);
    setNoteSummary(selectedNote?.summary ?? "");
  }, [selectedNoteId, visibleNotes]);

  useEffect(() => {
    if (!resourceCohortId && cohorts[0]?.id) {
      setResourceCohortId(cohorts[0].id);
    }
  }, [cohorts, resourceCohortId]);

  useEffect(() => {
    if (!selectedAssessmentId && todayAssessments[0]?.id) {
      setSelectedAssessmentId(todayAssessments[0].id);
    }
  }, [selectedAssessmentId, todayAssessments]);

  const selectedAssessment = todayAssessments.find(
    (assessment) => assessment.id === selectedAssessmentId,
  );
  const eligibleStudents = useMemo(() => {
    if (!selectedAssessment) {
      return [];
    }

    const studentIds = enrollments
      .filter(
        (enrollment) =>
          enrollment.cohortId === selectedAssessment.cohortId && enrollment.status === "active",
      )
      .map((enrollment) => enrollment.studentId);

    return students.filter((student) => studentIds.includes(student.id));
  }, [enrollments, selectedAssessment, students]);

  useEffect(() => {
    if (!selectedStudentId || !eligibleStudents.some((student) => student.id === selectedStudentId)) {
      setSelectedStudentId(eligibleStudents[0]?.id ?? "");
    }
  }, [eligibleStudents, selectedStudentId]);

  useEffect(() => {
    if (!selectedAssessment || !selectedStudentId) {
      setTotalScore("");
      setSectionDraft({});
      return;
    }

    const existingResult = results.find(
      (result) =>
        result.assessmentId === selectedAssessment.id && result.studentId === selectedStudentId,
    );

    setTotalScore(existingResult ? String(existingResult.totalScore) : "");
    setSectionDraft(
      Object.fromEntries(
        selectedAssessment.sections.map((section) => [
          section.label,
          String(
            existingResult?.sectionScores.find(
              (entry) => entry.label === section.label,
            )?.score ?? "",
          ),
        ]),
      ),
    );
  }, [results, selectedAssessment, selectedStudentId]);

  const handleNoteSubmit = () => {
    if (noteStudentId.length === 0 || noteSummary.trim().length === 0) {
      setFeedback({ tone: "error", message: "Pick a student and add a note summary." });
      return;
    }

    setPendingKey("note");
    setFeedback(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/academics/notes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            noteId: selectedNoteId === "new" ? undefined : selectedNoteId,
            studentId: noteStudentId,
            summary: noteSummary.trim(),
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Academic note save failed.");
        }

        setFeedback({ tone: "success", message: "Coaching note saved." });
        setSelectedNoteId("new");
        setNoteSummary("");
        router.refresh();
      } catch (error) {
        setFeedback({
          tone: "error",
          message: error instanceof Error ? error.message : "Academic note save failed.",
        });
      } finally {
        setPendingKey(null);
      }
    });
  };

  const handleResourceSubmit = () => {
    if (resourceCohortId.length === 0 || resourceTitle.trim().length === 0) {
      setFeedback({ tone: "error", message: "Pick a cohort and add a resource title." });
      return;
    }

    setPendingKey("resource");
    setFeedback(null);

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("cohortId", resourceCohortId);
        formData.set("title", resourceTitle.trim());
        formData.set("kind", resourceKind);
        if (resourceLinkUrl.trim().length > 0) {
          formData.set("linkUrl", resourceLinkUrl.trim());
        }
        if (resourceFile) {
          formData.set("file", resourceFile);
        }

        const response = await fetch("/api/academics/resources", {
          method: "POST",
          body: formData,
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Resource publish failed.");
        }

        setFeedback({ tone: "success", message: "Resource published." });
        setResourceTitle("");
        setResourceKind("Worksheet");
        setResourceLinkUrl("");
        setResourceFile(null);
        router.refresh();
      } catch (error) {
        setFeedback({
          tone: "error",
          message: error instanceof Error ? error.message : "Resource publish failed.",
        });
      } finally {
        setPendingKey(null);
      }
    });
  };

  const handleScoreSubmit = () => {
    if (!selectedAssessment || selectedStudentId.length === 0 || totalScore.trim().length === 0) {
      setFeedback({
        tone: "error",
        message: "Pick today’s assessment, a student, and a total score.",
      });
      return;
    }

    const parsedTotalScore = Number(totalScore);
    const sectionScores = selectedAssessment.sections.map((section) => ({
      label: section.label,
      score: Number(sectionDraft[section.label] ?? ""),
    }));

    if (
      Number.isNaN(parsedTotalScore) ||
      sectionScores.some((entry) => Number.isNaN(entry.score))
    ) {
      setFeedback({
        tone: "error",
        message: "All score inputs must be numeric.",
      });
      return;
    }

    setPendingKey("score");
    setFeedback(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/academics/scores", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            assessmentId: selectedAssessment.id,
            studentId: selectedStudentId,
            totalScore: parsedTotalScore,
            sectionScores,
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Score update failed.");
        }

        setFeedback({ tone: "success", message: "Score saved." });
        router.refresh();
      } catch (error) {
        setFeedback({
          tone: "error",
          message: error instanceof Error ? error.message : "Score update failed.",
        });
      } finally {
        setPendingKey(null);
      }
    });
  };

  return (
    <div>
      <div className="section-kicker">Write actions</div>
      <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
        Live academic ops
      </h3>
      <p className="mt-3 text-sm text-[color:var(--muted)]">
        TAs and staff can save notes, publish support materials, and update same-day score releases
        for students inside their cohort scope.
      </p>

      {feedback ? (
        <div
          className={clsx(
            "mt-5 rounded-[1.5rem] border px-4 py-3 text-sm",
            feedback.tone === "success"
              ? "border-emerald-200 bg-emerald-100/90 text-emerald-800"
              : "border-rose-200 bg-rose-100/90 text-rose-800",
          )}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        {permissions.canWriteAcademicNotes ? (
          <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/80 p-4">
            <div className="text-base font-semibold text-[color:var(--navy-strong)]">
              Save coaching note
            </div>
            <div className="mt-3 grid gap-3">
              <select
                value={noteStudentId}
                onChange={(event) => {
                  setNoteStudentId(event.currentTarget.value);
                  setSelectedNoteId("new");
                }}
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)] outline-none"
              >
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {formatStudentLabel(student)}
                  </option>
                ))}
              </select>
              <select
                value={selectedNoteId}
                onChange={(event) => setSelectedNoteId(event.currentTarget.value)}
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)] outline-none"
              >
                <option value="new">Create new note</option>
                {visibleNotes.map((note) => (
                  <option key={note.id} value={note.id}>
                    {note.summary.slice(0, 72)}
                  </option>
                ))}
              </select>
              <textarea
                value={noteSummary}
                onChange={(event) => setNoteSummary(event.currentTarget.value)}
                className="min-h-[100px] rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)] outline-none"
                placeholder="Capture the coaching context, intervention, or next support move."
              />
              <button
                type="button"
                onClick={handleNoteSubmit}
                disabled={pendingKey === "note"}
                className={clsx(
                  "rounded-full px-4 py-2 text-sm font-semibold text-white",
                  pendingKey === "note"
                    ? "cursor-wait bg-[rgba(23,56,75,0.46)]"
                    : "bg-[color:var(--navy-strong)] hover:opacity-90",
                )}
              >
                {pendingKey === "note"
                  ? "Saving..."
                  : selectedNoteId === "new"
                    ? "Save note"
                    : "Update note"}
              </button>
            </div>
          </div>
        ) : null}

        {permissions.canPublishResources ? (
          <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/80 p-4">
            <div className="text-base font-semibold text-[color:var(--navy-strong)]">
              Publish resource
            </div>
            <div className="mt-3 grid gap-3">
              <select
                value={resourceCohortId}
                onChange={(event) => setResourceCohortId(event.currentTarget.value)}
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)] outline-none"
              >
                {cohorts.map((cohort) => (
                  <option key={cohort.id} value={cohort.id}>
                    {cohort.name}
                  </option>
                ))}
              </select>
              <input
                value={resourceTitle}
                onChange={(event) => setResourceTitle(event.currentTarget.value)}
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)] outline-none"
                placeholder="Math repair packet"
              />
              <select
                value={resourceKind}
                onChange={(event) =>
                  setResourceKind(event.currentTarget.value as "Worksheet" | "Deck" | "Replay")
                }
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)] outline-none"
              >
                <option value="Worksheet">Worksheet</option>
                <option value="Deck">Deck</option>
                <option value="Replay">Replay</option>
              </select>
              <input
                value={resourceLinkUrl}
                onChange={(event) => setResourceLinkUrl(event.currentTarget.value)}
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)] outline-none"
                placeholder="Optional link URL"
                type="url"
              />
              <input
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                onChange={(event) => setResourceFile(event.currentTarget.files?.[0] ?? null)}
                type="file"
              />
              <button
                type="button"
                onClick={handleResourceSubmit}
                disabled={pendingKey === "resource"}
                className={clsx(
                  "rounded-full px-4 py-2 text-sm font-semibold text-white",
                  pendingKey === "resource"
                    ? "cursor-wait bg-[rgba(23,56,75,0.46)]"
                    : "bg-[color:var(--navy-strong)] hover:opacity-90",
                )}
              >
                {pendingKey === "resource" ? "Publishing..." : "Publish resource"}
              </button>
            </div>
          </div>
        ) : null}

        {permissions.canManageScores ? (
          <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/80 p-4">
            <div className="text-base font-semibold text-[color:var(--navy-strong)]">
              Update today&apos;s scores
            </div>
            <div className="mt-2 text-sm text-[color:var(--muted)]">
              Score editing is limited to same-day assessments inside the cohorts you can support.
            </div>
            <div className="mt-3 grid gap-3">
              <select
                value={selectedAssessmentId}
                onChange={(event) => setSelectedAssessmentId(event.currentTarget.value)}
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)] outline-none"
              >
                {todayAssessments.map((assessment) => (
                  <option key={assessment.id} value={assessment.id}>
                    {assessment.title}
                  </option>
                ))}
              </select>
              <select
                value={selectedStudentId}
                onChange={(event) => setSelectedStudentId(event.currentTarget.value)}
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)] outline-none"
              >
                {eligibleStudents.map((student) => (
                  <option key={student.id} value={student.id}>
                    {formatStudentLabel(student)}
                  </option>
                ))}
              </select>
              <input
                value={totalScore}
                onChange={(event) => setTotalScore(event.currentTarget.value)}
                className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)] outline-none"
                inputMode="numeric"
                placeholder="Total score"
              />
              {selectedAssessment?.sections.map((section) => (
                <input
                  key={section.label}
                  value={sectionDraft[section.label] ?? ""}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setSectionDraft((current) => ({
                      ...current,
                      [section.label]: value,
                    }));
                  }}
                  className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)] outline-none"
                  inputMode="numeric"
                  placeholder={section.label}
                />
              ))}
              <button
                type="button"
                onClick={handleScoreSubmit}
                disabled={pendingKey === "score" || todayAssessments.length === 0}
                className={clsx(
                  "rounded-full px-4 py-2 text-sm font-semibold text-white",
                  pendingKey === "score" || todayAssessments.length === 0
                    ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
                    : "bg-[color:var(--navy-strong)] hover:opacity-90",
                )}
              >
                {pendingKey === "score" ? "Saving..." : "Save score"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
