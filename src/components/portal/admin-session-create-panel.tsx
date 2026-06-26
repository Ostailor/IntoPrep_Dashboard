"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Cohort } from "@/lib/domain";

interface AdminSessionCreatePanelProps {
  viewerMode: "preview" | "live" | "live-role-preview";
  cohorts: Cohort[];
}

function formatDateTimeLocal(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function getDefaultSessionWindow() {
  const start = new Date();
  start.setHours(16, 0, 0, 0);
  const end = new Date(start);
  end.setHours(17, 0, 0, 0);

  return {
    startAt: formatDateTimeLocal(start.toISOString()),
    endAt: formatDateTimeLocal(end.toISOString()),
  };
}

export function AdminSessionCreatePanel({ viewerMode, cohorts }: AdminSessionCreatePanelProps) {
  const router = useRouter();
  const readOnly = viewerMode === "live-role-preview";
  const sortedCohorts = useMemo(
    () => [...cohorts].sort((left, right) => left.name.localeCompare(right.name)),
    [cohorts],
  );
  const defaultCohort = sortedCohorts[0];
  const defaultWindow = useMemo(() => getDefaultSessionWindow(), []);
  const [formState, setFormState] = useState(() => ({
    cohortId: defaultCohort?.id ?? "",
    title: "",
    startAt: defaultWindow.startAt,
    endAt: defaultWindow.endAt,
    mode: "Hybrid",
    roomLabel: defaultCohort?.roomLabel ?? "",
  }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [warningMessages, setWarningMessages] = useState<string[]>([]);

  const selectedCohort = sortedCohorts.find((cohort) => cohort.id === formState.cohortId);

  const handleCreate = (force = false) => {
    if (readOnly) {
      setError("Role preview is read-only.");
      setSuccess(null);
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);
    if (!force) {
      setWarningMessages([]);
    }

    startTransition(async () => {
      try {
        const startDate = new Date(formState.startAt);
        const endDate = new Date(formState.endAt);

        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
          throw new Error("Session start and end times are required.");
        }

        const response = await fetch("/api/admin/sessions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...formState,
            startAt: startDate.toISOString(),
            endAt: endDate.toISOString(),
            force,
          }),
        });
        const payload = (await response.json()) as {
          error?: string;
          warnings?: string[];
          created?: boolean;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Session create failed.");
        }

        if (!force && payload.created === false && payload.warnings && payload.warnings.length > 0) {
          setWarningMessages(payload.warnings);
          return;
        }

        const nextWindow = getDefaultSessionWindow();
        setSuccess("Instruction session created.");
        setWarningMessages([]);
        setFormState((current) => ({
          ...current,
          title: "",
          startAt: nextWindow.startAt,
          endAt: nextWindow.endAt,
        }));
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Session create failed.");
      } finally {
        setPending(false);
      }
    });
  };

  return (
    <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
      <div className="section-kicker">Create session</div>
      <h3 className="display-font mt-2 text-2xl text-[color:var(--navy-strong)]">
        Add instruction to the calendar
      </h3>
      <p className="mt-2 text-sm text-[color:var(--muted)]">
        New sessions inherit the selected cohort demo/main partition and appear on the calendar after save.
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
      {warningMessages.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-100/90 px-4 py-3 text-sm text-amber-900">
          <div className="font-semibold">Review before creating.</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {warningMessages.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
            Cohort
          </span>
          <select
            value={formState.cohortId}
            onChange={(event) => {
              const cohortId = event.currentTarget.value;
              const cohort = sortedCohorts.find((item) => item.id === cohortId);
              setFormState((current) => ({
                ...current,
                cohortId,
                roomLabel: cohort?.roomLabel ?? "",
              }));
            }}
            className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            disabled={readOnly || sortedCohorts.length === 0}
          >
            {sortedCohorts.length === 0 ? <option value="">No cohorts available</option> : null}
            {sortedCohorts.map((cohort) => (
              <option key={cohort.id} value={cohort.id}>
                {cohort.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
            Session title
          </span>
          <input
            value={formState.title}
            onChange={(event) => setFormState((current) => ({ ...current, title: event.currentTarget.value }))}
            className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            placeholder="Example: SAT Math strategy"
            disabled={readOnly}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Start
            </span>
            <input
              value={formState.startAt}
              onChange={(event) => setFormState((current) => ({ ...current, startAt: event.currentTarget.value }))}
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
              onChange={(event) => setFormState((current) => ({ ...current, endAt: event.currentTarget.value }))}
              type="datetime-local"
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              disabled={readOnly}
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Mode
            </span>
            <select
              value={formState.mode}
              onChange={(event) => setFormState((current) => ({ ...current, mode: event.currentTarget.value }))}
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
              onChange={(event) => setFormState((current) => ({ ...current, roomLabel: event.currentTarget.value }))}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder={selectedCohort?.roomLabel ?? "Room or Zoom label"}
              disabled={readOnly}
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => handleCreate(warningMessages.length > 0)}
          disabled={pending || readOnly || !formState.cohortId}
          className="w-full rounded-full bg-[color:var(--navy-strong)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending
            ? "Creating..."
            : readOnly
              ? "Preview only"
              : warningMessages.length > 0
                ? "Create anyway"
                : "Create session"}
        </button>
      </div>
    </section>
  );
}
