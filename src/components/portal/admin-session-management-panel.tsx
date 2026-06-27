"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { Cohort, Session } from "@/lib/domain";

interface AdminSessionManagementPanelProps {
  viewerMode: "preview" | "live" | "live-role-preview";
  cohorts: Cohort[];
  sessions: Session[];
  canManage: boolean;
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

export function AdminSessionManagementPanel({
  viewerMode,
  cohorts,
  sessions,
  canManage,
}: AdminSessionManagementPanelProps) {
  const router = useRouter();
  const readOnly = viewerMode === "live-role-preview" || !canManage;
  const [localSessions, setLocalSessions] = useState(sessions);
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

  const sortedCohorts = useMemo(
    () => [...cohorts].sort((left, right) => left.name.localeCompare(right.name)),
    [cohorts],
  );
  const sortedSessions = useMemo(
    () => [...localSessions].sort((left, right) => left.startAt.localeCompare(right.startAt)),
    [localSessions],
  );
  const selectedSession = sortedSessions.find((session) => session.id === selectedSessionId) ?? sortedSessions[0];

  useEffect(() => {
    setLocalSessions(sessions);
  }, [sessions]);

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
  }, [cohorts, selectedSession]);

  const handleSave = (force = false) => {
    if (readOnly || !selectedSession) {
      setError(readOnly ? "Role preview is read-only." : "Choose a class to edit.");
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
    if (readOnly || !targetSession) {
      setError(readOnly ? "Role preview is read-only." : "Choose a class to delete.");
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
                        disabled={readOnly || pendingKey === "delete"}
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
                disabled={readOnly}
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
                disabled={readOnly}
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
                disabled={readOnly}
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
                disabled={readOnly}
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
                disabled={readOnly}
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
                disabled={readOnly}
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
              disabled={readOnly || pendingKey === "save"}
              className="rounded-full bg-[color:var(--navy-strong)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pendingKey === "save"
                ? "Saving..."
                : readOnly
                  ? "Preview only"
                  : warningMessages.length > 0
                    ? "Save anyway"
                    : "Save class"}
            </button>
            <button
              type="button"
              onClick={() => handleDelete()}
              disabled={readOnly || pendingKey === "delete"}
              className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pendingKey === "delete" ? "Deleting..." : "Delete class"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
