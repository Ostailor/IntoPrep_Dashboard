"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";

interface AdminCohortOperationsPanelProps {
  viewerMode: "preview" | "live" | "live-role-preview";
}

function getDefaultDateRange() {
  const start = new Date();
  const end = new Date(start);
  end.setMonth(end.getMonth() + 4);

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export function AdminCohortOperationsPanel({ viewerMode }: AdminCohortOperationsPanelProps) {
  const router = useRouter();
  const readOnly = viewerMode === "live-role-preview";
  const defaultDates = getDefaultDateRange();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    name: "",
    cadence: "",
    cohortMode: "In person",
    startDate: defaultDates.startDate,
    endDate: defaultDates.endDate,
  });

  const handleCreate = () => {
    setPending(true);
    setError(null);
    setSuccess(null);

    fetch("/api/admin/cohorts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formState.name.trim(),
        cadence: formState.cadence.trim(),
        cohortMode: formState.cohortMode,
        startDate: formState.startDate,
        endDate: formState.endDate,
      }),
    })
      .then(async (response) => {
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to create cohort.");
        }

        setSuccess("Cohort created. Add its classes in Instruction Calendar.");
        setFormState((current) => ({
          ...current,
          name: "",
          cadence: "",
        }));
        startTransition(() => router.refresh());
      })
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "Unable to create cohort.");
      })
      .finally(() => setPending(false));
  };

  return (
    <section className="glass-panel rounded-lg border border-[color:var(--line)] p-5 shadow-[var(--shadow)]">
      <div className="section-kicker">Cohort map</div>
      <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-2xl font-semibold text-[color:var(--navy-strong)]">Create a cohort</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--muted)]">
            Cohort Map only creates the cohort shell. Create the individual classes, class dates,
            instructors, rooms, Zoom accounts, and student-facing schedules in Instruction Calendar.
          </p>
        </div>
        <span className="w-fit rounded-full border border-[color:var(--line)] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
          Cohort setup
        </span>
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

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <label className="text-sm font-semibold text-[color:var(--navy-strong)]">
          Cohort
          <input
            value={formState.name}
            onChange={(event) => {
              const name = event.currentTarget.value;
              setFormState((current) => ({ ...current, name }));
            }}
            placeholder="MWF_InPerson_2026"
            className="mt-2 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-sm text-[color:var(--navy-strong)] outline-none transition focus:border-[color:var(--navy)] focus:ring-2 focus:ring-[rgba(17,69,84,0.12)]"
          />
        </label>
        <label className="text-sm font-semibold text-[color:var(--navy-strong)]">
          Cadence
          <input
            value={formState.cadence}
            onChange={(event) => {
              const cadence = event.currentTarget.value;
              setFormState((current) => ({ ...current, cadence }));
            }}
            placeholder="MWF, TThS, intensive, or custom"
            className="mt-2 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-sm text-[color:var(--navy-strong)] outline-none transition focus:border-[color:var(--navy)] focus:ring-2 focus:ring-[rgba(17,69,84,0.12)]"
          />
        </label>
        <label className="text-sm font-semibold text-[color:var(--navy-strong)]">
          Cohort mode
          <select
            value={formState.cohortMode}
            onChange={(event) => {
              const cohortMode = event.currentTarget.value;
              setFormState((current) => ({ ...current, cohortMode }));
            }}
            className="mt-2 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-sm text-[color:var(--navy-strong)] outline-none transition focus:border-[color:var(--navy)] focus:ring-2 focus:ring-[rgba(17,69,84,0.12)]"
          >
            <option value="In person">In person</option>
            <option value="Hybrid">Hybrid</option>
            <option value="Zoom">Zoom</option>
          </select>
        </label>
        <div className="text-sm font-semibold text-[color:var(--navy-strong)]">
          Dates
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
              Start date
              <input
                type="date"
                value={formState.startDate}
                onChange={(event) => {
                  const startDate = event.currentTarget.value;
                  setFormState((current) => ({ ...current, startDate }));
                }}
                className="mt-2 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-[color:var(--navy-strong)] outline-none transition focus:border-[color:var(--navy)] focus:ring-2 focus:ring-[rgba(17,69,84,0.12)]"
              />
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
              End date
              <input
                type="date"
                value={formState.endDate}
                onChange={(event) => {
                  const endDate = event.currentTarget.value;
                  setFormState((current) => ({ ...current, endDate }));
                }}
                className="mt-2 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-[color:var(--navy-strong)] outline-none transition focus:border-[color:var(--navy)] focus:ring-2 focus:ring-[rgba(17,69,84,0.12)]"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleCreate}
          disabled={
            readOnly ||
            pending ||
            !formState.name.trim() ||
            !formState.cadence.trim() ||
            !formState.startDate ||
            !formState.endDate
          }
          className={clsx(
            "rounded-full px-4 py-2 text-sm font-semibold transition",
            readOnly || pending
              ? "cursor-not-allowed border border-[color:var(--line)] bg-slate-100 text-[color:var(--muted)]"
              : "bg-[color:var(--navy)] text-white hover:bg-[color:var(--navy-strong)]",
          )}
        >
          {pending ? "Creating..." : "Create cohort"}
        </button>
        {readOnly ? (
          <span className="text-sm text-[color:var(--muted)]">Role preview cannot create cohorts.</span>
        ) : null}
      </div>
    </section>
  );
}
