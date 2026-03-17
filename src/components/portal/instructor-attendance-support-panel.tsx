"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type {
  InstructionalAccommodation,
  InstructorFollowUpFlag,
} from "@/lib/domain";
import type { SessionRosterRow } from "@/lib/portal";

interface InstructorAttendanceSupportPanelProps {
  viewerMode: "preview" | "live" | "live-role-preview";
  sessions: {
    id: string;
    title: string;
    timeLabel: string;
    roomLabel: string;
  }[];
  rosters: Record<string, SessionRosterRow[]>;
  accommodations: InstructionalAccommodation[];
  followUpFlags: InstructorFollowUpFlag[];
}

export function InstructorAttendanceSupportPanel({
  viewerMode,
  sessions,
  rosters,
  accommodations,
  followUpFlags,
}: InstructorAttendanceSupportPanelProps) {
  const router = useRouter();
  const readOnly = viewerMode === "live-role-preview";
  const [selectedSessionId, setSelectedSessionId] = useState(sessions[0]?.id ?? "");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [flagForm, setFlagForm] = useState({
    targetType: "student",
    targetId: rosters[sessions[0]?.id ?? ""]?.[0]?.studentId ?? "",
    summary: "",
    note: "",
  });

  useEffect(() => {
    if (!selectedSessionId || !sessions.some((session) => session.id === selectedSessionId)) {
      setSelectedSessionId(sessions[0]?.id ?? "");
    }
  }, [selectedSessionId, sessions]);

  const selectedRoster = useMemo(
    () => rosters[selectedSessionId] ?? [],
    [rosters, selectedSessionId],
  );
  const selectedFlags = useMemo(
    () =>
      followUpFlags.filter(
        (flag) =>
          flag.targetId === selectedSessionId ||
          selectedRoster.some((row) => row.studentId === flag.targetId),
      ),
    [followUpFlags, selectedRoster, selectedSessionId],
  );

  useEffect(() => {
    setFlagForm((current) => ({
      ...current,
      targetId:
        current.targetType === "session"
          ? selectedSessionId
          : selectedRoster[0]?.studentId ?? "",
    }));
  }, [selectedRoster, selectedSessionId]);

  const runFlagRequest = () => {
    if (readOnly) {
      setError("Role preview is read-only.");
      return;
    }

    setPendingKey("flag");
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/instructor/follow-up-flags", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(flagForm),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Follow-up flag save failed.");
        }

        setFlagForm((current) => ({
          ...current,
          summary: "",
          note: "",
        }));
        setSuccess("Follow-up flag added.");
        router.refresh();
      } catch (nextError) {
        setError(
          nextError instanceof Error ? nextError.message : "Follow-up flag save failed.",
        );
      } finally {
        setPendingKey(null);
      }
    });
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
        <div className="section-kicker">Classroom support</div>
        <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
          Accommodations and follow-up
        </h3>

        <div className="mt-5">
          <select
            value={selectedSessionId}
            onChange={(event) => setSelectedSessionId(event.currentTarget.value)}
            className="w-full rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title} · {session.timeLabel}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-5 space-y-3">
          {selectedRoster.map((row) => {
            const rowAccommodations = accommodations.filter(
              (item) => item.studentId === row.studentId,
            );

            return (
              <div
                key={row.studentId}
                className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
              >
                <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                  {row.studentName}
                </div>
                {rowAccommodations.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {rowAccommodations.map((accommodation) => (
                      <div
                        key={accommodation.id}
                        className="rounded-[1.25rem] border border-[rgba(23,56,75,0.12)] bg-[rgba(23,56,75,0.06)] px-4 py-3"
                      >
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                          {accommodation.title}
                        </div>
                        <div className="mt-2 text-sm text-[color:var(--navy-strong)]">
                          {accommodation.detail}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-[color:var(--muted)]">
                    No classroom accommodations are recorded for this student.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
        <div className="section-kicker">Internal flag</div>
        <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
          Needs follow-up
        </h3>

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

        <div className="mt-5 space-y-3">
          <select
            value={flagForm.targetType}
            onChange={(event) => {
              const nextTargetType = event.currentTarget.value;

              setFlagForm((current) => ({
                ...current,
                targetType: nextTargetType,
                targetId:
                  nextTargetType === "session"
                    ? selectedSessionId
                    : selectedRoster[0]?.studentId ?? "",
              }));
            }}
            className="w-full rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            disabled={readOnly}
          >
            <option value="student">Student follow-up</option>
            <option value="session">Session follow-up</option>
          </select>
          <select
            value={flagForm.targetId}
            onChange={(event) => {
              const nextTargetId = event.currentTarget.value;

              setFlagForm((current) => ({
                ...current,
                targetId: nextTargetId,
              }));
            }}
            className="w-full rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            disabled={readOnly}
          >
            {flagForm.targetType === "session" ? (
              <option value={selectedSessionId}>
                {sessions.find((session) => session.id === selectedSessionId)?.title ?? "Session"}
              </option>
            ) : (
              selectedRoster.map((row) => (
                <option key={row.studentId} value={row.studentId}>
                  {row.studentName}
                </option>
              ))
            )}
          </select>
          <input
            value={flagForm.summary}
            onChange={(event) => {
              const nextSummary = event.currentTarget.value;

              setFlagForm((current) => ({
                ...current,
                summary: nextSummary,
              }));
            }}
            className="w-full rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            placeholder="Short follow-up summary"
            disabled={readOnly}
          />
          <textarea
            value={flagForm.note}
            onChange={(event) => {
              const nextNote = event.currentTarget.value;

              setFlagForm((current) => ({
                ...current,
                note: nextNote,
              }));
            }}
            className="min-h-[120px] w-full rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            placeholder="Optional context for TA, staff, or admin."
            disabled={readOnly}
          />
          <button
            type="button"
            onClick={runFlagRequest}
            disabled={pendingKey === "flag" || readOnly}
            className={clsx(
              "rounded-full px-4 py-2 text-sm font-semibold text-white",
              pendingKey === "flag" || readOnly
                ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
                : "bg-[color:var(--navy-strong)] hover:opacity-90",
            )}
          >
            {pendingKey === "flag" ? "Saving..." : readOnly ? "Preview only" : "Create flag"}
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {selectedFlags.length === 0 ? (
            <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 px-4 py-5 text-sm text-[color:var(--muted)]">
              No open follow-up flags for this session yet.
            </div>
          ) : null}
          {selectedFlags.slice(0, 5).map((flag) => (
            <div
              key={flag.id}
              className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-[color:var(--navy-strong)]">
                  {flag.summary}
                </div>
                <span className="rounded-full border border-[rgba(23,56,75,0.16)] bg-[rgba(23,56,75,0.08)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--navy-strong)]">
                  {flag.status}
                </span>
              </div>
              {flag.note ? (
                <div className="mt-2 text-sm text-[color:var(--muted)]">{flag.note}</div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
