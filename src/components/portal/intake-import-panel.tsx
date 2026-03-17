"use client";

import Link from "next/link";
import { startTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { ImportRun, IntakeSyncSource } from "@/lib/domain";

interface IntakeImportPanelProps {
  recentRuns: ImportRun[];
  syncSource: IntakeSyncSource | null;
  readOnly?: boolean;
  canManageSource?: boolean;
}

const statusTone = {
  completed: "border-emerald-200 bg-emerald-100 text-emerald-800",
  partial: "border-amber-200 bg-amber-100 text-amber-800",
  failed: "border-rose-200 bg-rose-100 text-rose-800",
} as const;

const syncTone = {
  healthy: "border-emerald-200 bg-emerald-100 text-emerald-800",
  warning: "border-amber-200 bg-amber-100 text-amber-800",
  error: "border-rose-200 bg-rose-100 text-rose-800",
} as const;

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

export function IntakeImportPanel({
  recentRuns,
  syncSource,
  readOnly = false,
  canManageSource = true,
}: IntakeImportPanelProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [pending, setPending] = useState(false);
  const [syncPending, setSyncPending] = useState(false);
  const [sourcePending, setSourcePending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<ImportRun | null>(null);
  const [sourceDraft, setSourceDraft] = useState({
    label: syncSource?.label ?? "Google Forms linked responses sheet",
    sourceUrl: syncSource?.sourceUrl ?? "",
    cadence: syncSource?.cadence ?? "Daily around 7:00 AM ET",
    isActive: syncSource?.isActive ?? true,
  });

  useEffect(() => {
    setSourceDraft({
      label: syncSource?.label ?? "Google Forms linked responses sheet",
      sourceUrl: syncSource?.sourceUrl ?? "",
      cadence: syncSource?.cadence ?? "Daily around 7:00 AM ET",
      isActive: syncSource?.isActive ?? true,
    });
  }, [syncSource]);

  const handleSubmit = () => {
    if (readOnly) {
      setError("Role preview is read-only.");
      return;
    }

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a CSV export before starting the intake import.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    setPending(true);
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/intake/import", {
          method: "POST",
          body: formData,
        });
        const payload = (await response.json()) as {
          error?: string;
          run?: ImportRun;
        };

        if (!response.ok || !payload.run) {
          throw new Error(payload.error ?? "Import failed.");
        }

        setLastRun(payload.run);
        setSelectedFileName("");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Import failed.");
      } finally {
        setPending(false);
      }
    });
  };

  const handleSourceSave = () => {
    if (readOnly) {
      setError("Role preview is read-only.");
      return;
    }

    if (!canManageSource) {
      setError("Only admin and engineer can change linked-source settings.");
      return;
    }

    setSourcePending(true);
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/intake/source", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(sourceDraft),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Google Forms source save failed.");
        }

        router.refresh();
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Google Forms source save failed.",
        );
      } finally {
        setSourcePending(false);
      }
    });
  };

  const handleRunLinkedSync = () => {
    if (readOnly) {
      setError("Role preview is read-only.");
      return;
    }

    setSyncPending(true);
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/intake/sync", {
          method: "POST",
        });
        const payload = (await response.json()) as {
          error?: string;
          run?: ImportRun;
        };

        if (!response.ok || !payload.run) {
          throw new Error(payload.error ?? "Google Forms sync failed.");
        }

        setLastRun(payload.run);
        router.refresh();
      } catch (nextError) {
        setError(
          nextError instanceof Error ? nextError.message : "Google Forms sync failed.",
        );
      } finally {
        setSyncPending(false);
      }
    });
  };

  return (
    <section className="grid gap-5 xl:grid-cols-[1.15fr_1fr]">
      <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
        <div className="section-kicker">Google Forms intake</div>
        <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
          Linked sync and manual fallback
        </h3>
        <p className="mt-3 max-w-3xl text-sm text-[color:var(--muted)]">
          Save the CSV export URL from the Google Sheet linked to your Google Form responses, then
          pull it directly into the existing intake pipeline. Manual CSV upload stays available as a
          fallback when Google-side sharing is unavailable.
        </p>

        <div className="mt-5 rounded-[1.5rem] border border-[color:var(--line)] bg-white/70 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
            Linked source
          </div>
          {readOnly ? (
            <div className="mt-3 rounded-[1.25rem] border border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] px-4 py-3 text-sm text-[color:var(--navy-strong)]">
              Role preview is read-only. Exit preview to save sources or run intake actions.
            </div>
          ) : !canManageSource ? (
            <div className="mt-3 rounded-[1.25rem] border border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] px-4 py-3 text-sm text-[color:var(--navy-strong)]">
              Staff can run imports here, but only admin and engineer can change linked-source settings.
            </div>
          ) : null}
          <p className="mt-2 text-sm text-[color:var(--muted)]">
            Use the linked responses-sheet CSV export URL. The morning cron checks active linked
            sources around 7:00 AM Eastern, and the importer still expects the same Google Forms
            columns as the manual CSV path.
          </p>
          <div className="mt-4 grid gap-3">
            <input
              value={sourceDraft.label}
              onChange={(event) => {
                const label = event.currentTarget.value;
                setSourceDraft((current) => ({ ...current, label }));
              }}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="Google Forms linked responses sheet"
              disabled={readOnly || !canManageSource}
            />
            <input
              value={sourceDraft.sourceUrl}
              onChange={(event) => {
                const sourceUrl = event.currentTarget.value;
                setSourceDraft((current) => ({ ...current, sourceUrl }));
              }}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="https://docs.google.com/spreadsheets/d/.../export?format=csv"
              type="url"
              disabled={readOnly || !canManageSource}
            />
            <input
              value={sourceDraft.cadence}
              onChange={(event) => {
                const cadence = event.currentTarget.value;
                setSourceDraft((current) => ({ ...current, cadence }));
              }}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="Daily around 7:00 AM ET"
              disabled={readOnly || !canManageSource}
            />
            <label className="flex items-center gap-3 rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]">
              <input
                checked={sourceDraft.isActive}
                onChange={(event) => {
                  const isActive = event.currentTarget.checked;
                  setSourceDraft((current) => ({ ...current, isActive }));
                }}
                type="checkbox"
                disabled={readOnly || !canManageSource}
              />
              <span>Source active</span>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSourceSave}
              disabled={sourcePending || readOnly || !canManageSource}
              className={clsx(
                "rounded-full px-4 py-2 text-sm font-semibold text-white",
                sourcePending
                  ? "cursor-wait bg-[rgba(23,56,75,0.56)]"
                  : "bg-[color:var(--navy-strong)] hover:opacity-90",
              )}
            >
              {sourcePending ? "Saving..." : readOnly ? "Preview only" : "Save source"}
            </button>
            <button
              type="button"
              onClick={handleRunLinkedSync}
              disabled={
                syncPending ||
                sourceDraft.sourceUrl.trim().length === 0 ||
                !sourceDraft.isActive ||
                readOnly
              }
              className={clsx(
                "rounded-full border px-4 py-2 text-sm font-semibold",
                syncPending ||
                  sourceDraft.sourceUrl.trim().length === 0 ||
                  !sourceDraft.isActive ||
                  readOnly
                  ? "cursor-not-allowed border-[rgba(23,56,75,0.2)] bg-[rgba(23,56,75,0.08)] text-[color:var(--muted)]"
                  : "border-[rgba(187,110,69,0.24)] bg-[rgba(187,110,69,0.12)] text-[color:var(--copper)] hover:opacity-90",
              )}
            >
              {syncPending ? "Syncing..." : readOnly ? "Preview only" : "Run linked sync"}
            </button>
          </div>
          {syncSource ? (
            <div className="mt-4 rounded-[1.25rem] border border-[color:var(--line)] bg-stone-50/90 p-3 text-sm text-[color:var(--muted)]">
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-[color:var(--navy-strong)]">{syncSource.label}</div>
                {syncSource.lastSyncStatus ? (
                  <span
                    className={clsx(
                      "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]",
                      syncTone[syncSource.lastSyncStatus],
                    )}
                  >
                    {syncSource.lastSyncStatus}
                  </span>
                ) : null}
              </div>
              <div className="mt-2">{syncSource.cadence}</div>
              {syncSource.lastSyncedAt ? (
                <div className="mt-2">Last linked sync: {formatDateTime(syncSource.lastSyncedAt)}</div>
              ) : null}
              {syncSource.lastSyncSummary ? (
                <div className="mt-2">{syncSource.lastSyncSummary}</div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mt-5 rounded-[1.5rem] border border-[color:var(--line)] bg-white/70 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
            Expected columns
          </div>
          <p className="mt-2 text-sm text-[color:var(--muted)]">
            `Guardian Email`, `Guardian Name`, and a student name are required. Optional columns
            like `Stage`, `Preferred Campus`, `Cohort Name`, and `Notes` improve enrollment
            matching and run quality.
          </p>
          <Link
            href="/intake-import-template.csv"
            className="mt-4 inline-flex rounded-full border border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] px-4 py-2 text-sm font-semibold text-[color:var(--navy-strong)]"
          >
            Download template CSV
          </Link>
        </div>

        <div className="mt-5 rounded-[1.5rem] border border-[color:var(--line)] bg-white/70 p-4">
          <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
            Manual CSV fallback
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="mt-3 block w-full rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            onChange={(event) => setSelectedFileName(event.currentTarget.files?.[0]?.name ?? "")}
            disabled={readOnly}
          />
          <div className="mt-2 text-sm text-[color:var(--muted)]">
            {selectedFileName || "No file selected yet."}
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending || readOnly}
            className={clsx(
              "mt-4 rounded-full px-4 py-2 text-sm font-semibold text-white",
              pending || readOnly
                ? "cursor-not-allowed bg-[rgba(23,56,75,0.56)]"
                : "bg-[color:var(--navy-strong)] hover:opacity-90",
            )}
          >
            {pending ? "Importing..." : readOnly ? "Preview only" : "Run manual intake import"}
          </button>
        </div>

        {error ? (
          <div className="mt-5 rounded-[1.5rem] border border-rose-200 bg-rose-100/90 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        {lastRun ? (
          <div className="mt-5 rounded-[1.5rem] border border-emerald-200 bg-emerald-100/90 p-4 text-sm text-emerald-900">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold">Latest import completed</div>
              <span
                className={clsx(
                  "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]",
                  statusTone[lastRun.status],
                )}
              >
                {lastRun.status}
              </span>
            </div>
            <div className="mt-2">{lastRun.summary}</div>
            {lastRun.errorSamples.length > 0 ? (
              <div className="mt-3 space-y-1 text-xs text-amber-900">
                {lastRun.errorSamples.map((sample) => (
                  <div key={sample}>{sample}</div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
        <div className="section-kicker">Recent runs</div>
        <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
          Import audit trail
        </h3>
        <p className="mt-3 text-sm text-[color:var(--muted)]">
          Every linked sync and fallback upload is logged with counts, status, and sample errors so
          staff can review what actually landed in Supabase.
        </p>

        <div className="mt-5 space-y-3">
          {recentRuns.length > 0 ? (
            recentRuns.map((run) => (
              <div
                key={run.id}
                className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                      {run.filename}
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                      {run.source} · {formatDateTime(run.startedAt)}
                    </div>
                  </div>
                  <span
                    className={clsx(
                      "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]",
                      statusTone[run.status],
                    )}
                  >
                    {run.status}
                  </span>
                </div>
                <div className="mt-3 text-sm text-[color:var(--muted)]">{run.summary}</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-[color:var(--line)] bg-stone-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    {run.importedCount} rows
                  </span>
                  <span className="rounded-full border border-[color:var(--line)] bg-stone-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    {run.enrollmentCount} enrollments
                  </span>
                  <span className="rounded-full border border-[color:var(--line)] bg-stone-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    {run.errorCount} errors
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4 text-sm text-[color:var(--muted)]">
              No intake imports have been logged yet.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
