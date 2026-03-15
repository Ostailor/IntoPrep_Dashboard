"use client";

import {
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
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

type AutosaveState = {
  tone: "idle" | "saving" | "saved" | "error";
  message: string;
};

function formatStudentLabel(student: Student) {
  return `${student.firstName} ${student.lastName}`;
}

function formatSavedTimestamp() {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

function autosaveToneClass(state: AutosaveState["tone"]) {
  if (state === "error") {
    return "text-rose-700";
  }

  if (state === "saved") {
    return "text-emerald-700";
  }

  return "text-[color:var(--muted)]";
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
  const [noteDirty, setNoteDirty] = useState(false);
  const [scoreDirty, setScoreDirty] = useState(false);
  const [noteAutosave, setNoteAutosave] = useState<AutosaveState>({
    tone: "idle",
    message: "Notes save automatically after you pause typing.",
  });
  const [scoreAutosave, setScoreAutosave] = useState<AutosaveState>({
    tone: "idle",
    message: "Score changes autosave after a short pause.",
  });
  const noteTimeoutRef = useRef<number | null>(null);
  const scoreTimeoutRef = useRef<number | null>(null);

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
    if (selectedNoteId !== "new") {
      return;
    }

    setNoteSummary("");
    setNoteDirty(false);
    setNoteAutosave({
      tone: "idle",
      message: "Notes save automatically after you pause typing.",
    });
  }, [selectedNoteId]);

  useEffect(() => {
    if (selectedNoteId === "new" || noteDirty) {
      return;
    }

    const selectedNote = visibleNotes.find((note) => note.id === selectedNoteId);
    if (!selectedNote) {
      return;
    }

    setNoteSummary(selectedNote.summary);
    setNoteAutosave({
      tone: "idle",
      message: "Notes save automatically after you pause typing.",
    });
  }, [noteDirty, selectedNoteId, visibleNotes]);

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
    if (
      !selectedStudentId ||
      !eligibleStudents.some((student) => student.id === selectedStudentId)
    ) {
      setSelectedStudentId(eligibleStudents[0]?.id ?? "");
    }
  }, [eligibleStudents, selectedStudentId]);

  useEffect(() => {
    if (!selectedAssessment || !selectedStudentId) {
      setTotalScore("");
      setSectionDraft({});
      setScoreDirty(false);
      setScoreAutosave({
        tone: "idle",
        message: "Score changes autosave after a short pause.",
      });
      return;
    }

    if (scoreDirty) {
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
            existingResult?.sectionScores.find((entry) => entry.label === section.label)?.score ??
              "",
          ),
        ]),
      ),
    );
    setScoreDirty(false);
    setScoreAutosave({
      tone: "idle",
      message: "Score changes autosave after a short pause.",
    });
  }, [results, scoreDirty, selectedAssessment, selectedStudentId]);

  const saveNote = async (mode: "autosave" | "manual") => {
    if (noteStudentId.length === 0 || noteSummary.trim().length === 0) {
      if (mode === "manual") {
        setFeedback({ tone: "error", message: "Pick a student and add a note summary." });
      } else {
        setNoteAutosave({
          tone: "idle",
          message: "Autosave waits until the note has text.",
        });
      }
      return;
    }

    setPendingKey("note");
    if (mode === "manual") {
      setFeedback(null);
    }
    setNoteAutosave({
      tone: "saving",
      message: "Saving note...",
    });

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
      const payload = (await response.json()) as { error?: string; noteId?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Academic note save failed.");
      }

      if (payload.noteId) {
        setSelectedNoteId(payload.noteId);
      }

      setNoteDirty(false);
      setNoteAutosave({
        tone: "saved",
        message: `Saved ${formatSavedTimestamp()}`,
      });

      if (mode === "manual") {
        setFeedback({ tone: "success", message: "Coaching note saved." });
        router.refresh();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Academic note save failed.";
      setNoteAutosave({
        tone: "error",
        message,
      });

      if (mode === "manual") {
        setFeedback({
          tone: "error",
          message,
        });
      }
    } finally {
      setPendingKey(null);
    }
  };

  const handleNoteSubmit = () => {
    startTransition(() => {
      void saveNote("manual");
    });
  };

  const triggerNoteAutosave = useEffectEvent(() => {
    startTransition(() => {
      void saveNote("autosave");
    });
  });

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

  const saveScore = async (mode: "autosave" | "manual") => {
    if (!selectedAssessment || selectedStudentId.length === 0 || totalScore.trim().length === 0) {
      if (mode === "manual") {
        setFeedback({
          tone: "error",
          message: "Pick today’s assessment, a student, and a total score.",
        });
      } else {
        setScoreAutosave({
          tone: "idle",
          message: "Autosave waits until the score fields are complete.",
        });
      }
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
      const message = "All score inputs must be numeric.";

      if (mode === "manual") {
        setFeedback({
          tone: "error",
          message,
        });
      } else {
        setScoreAutosave({
          tone: "error",
          message,
        });
      }
      return;
    }

    setPendingKey("score");
    if (mode === "manual") {
      setFeedback(null);
    }
    setScoreAutosave({
      tone: "saving",
      message: "Saving score...",
    });

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

      setScoreDirty(false);
      setScoreAutosave({
        tone: "saved",
        message: `Saved ${formatSavedTimestamp()}`,
      });

      if (mode === "manual") {
        setFeedback({ tone: "success", message: "Score saved." });
        router.refresh();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Score update failed.";
      setScoreAutosave({
        tone: "error",
        message,
      });

      if (mode === "manual") {
        setFeedback({
          tone: "error",
          message,
        });
      }
    } finally {
      setPendingKey(null);
    }
  };

  const handleScoreSubmit = () => {
    startTransition(() => {
      void saveScore("manual");
    });
  };

  const triggerScoreAutosave = useEffectEvent(() => {
    startTransition(() => {
      void saveScore("autosave");
    });
  });

  useEffect(() => {
    if (!permissions.canWriteAcademicNotes || !noteDirty || pendingKey === "note") {
      return;
    }

    if (noteTimeoutRef.current !== null) {
      window.clearTimeout(noteTimeoutRef.current);
    }

    noteTimeoutRef.current = window.setTimeout(() => {
      triggerNoteAutosave();
    }, 900);

    return () => {
      if (noteTimeoutRef.current !== null) {
        window.clearTimeout(noteTimeoutRef.current);
      }
    };
  }, [
    noteDirty,
    noteStudentId,
    noteSummary,
    pendingKey,
    permissions.canWriteAcademicNotes,
    selectedNoteId,
  ]);

  useEffect(() => {
    if (!permissions.canManageScores || !scoreDirty || pendingKey === "score") {
      return;
    }

    if (scoreTimeoutRef.current !== null) {
      window.clearTimeout(scoreTimeoutRef.current);
    }

    scoreTimeoutRef.current = window.setTimeout(() => {
      triggerScoreAutosave();
    }, 1200);

    return () => {
      if (scoreTimeoutRef.current !== null) {
        window.clearTimeout(scoreTimeoutRef.current);
      }
    };
  }, [
    pendingKey,
    permissions.canManageScores,
    scoreDirty,
    sectionDraft,
    selectedAssessmentId,
    selectedStudentId,
    totalScore,
  ]);

  useEffect(() => {
    return () => {
      if (noteTimeoutRef.current !== null) {
        window.clearTimeout(noteTimeoutRef.current);
      }

      if (scoreTimeoutRef.current !== null) {
        window.clearTimeout(scoreTimeoutRef.current);
      }
    };
  }, []);

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
            <div className={clsx("mt-2 text-sm", autosaveToneClass(noteAutosave.tone))}>
              {noteAutosave.message}
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
                onChange={(event) => {
                  setNoteDirty(false);
                  setSelectedNoteId(event.currentTarget.value);
                }}
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
                onChange={(event) => {
                  setNoteSummary(event.currentTarget.value);
                  setNoteDirty(true);
                  setNoteAutosave({
                    tone: "idle",
                    message: "Changes queued. Saving automatically...",
                  });
                }}
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
                {pendingKey === "note" ? "Saving..." : "Save now"}
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
            <div className={clsx("mt-2 text-sm", autosaveToneClass(scoreAutosave.tone))}>
              {scoreAutosave.message}
            </div>
            <div className="mt-3 grid gap-3">
              <select
                value={selectedAssessmentId}
                onChange={(event) => {
                  setScoreDirty(false);
                  setSelectedAssessmentId(event.currentTarget.value);
                }}
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
                onChange={(event) => {
                  setScoreDirty(false);
                  setSelectedStudentId(event.currentTarget.value);
                }}
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
                onChange={(event) => {
                  setTotalScore(event.currentTarget.value);
                  setScoreDirty(true);
                  setScoreAutosave({
                    tone: "idle",
                    message: "Changes queued. Saving automatically...",
                  });
                }}
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
                    setScoreDirty(true);
                    setScoreAutosave({
                      tone: "idle",
                      message: "Changes queued. Saving automatically...",
                    });
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
                {pendingKey === "score" ? "Saving..." : "Save now"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
