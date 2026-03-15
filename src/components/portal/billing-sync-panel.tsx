"use client";

import Link from "next/link";
import { startTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { BillingSyncRun, BillingSyncSource } from "@/lib/domain";

interface BillingSyncPanelProps {
  syncSource: BillingSyncSource | null;
}

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

export function BillingSyncPanel({ syncSource }: BillingSyncPanelProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [sourcePending, setSourcePending] = useState(false);
  const [syncPending, setSyncPending] = useState(false);
  const [importPending, setImportPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<BillingSyncRun | null>(null);
  const [sourceDraft, setSourceDraft] = useState({
    label: syncSource?.label ?? "QuickBooks invoice export",
    sourceUrl: syncSource?.sourceUrl ?? "",
    cadence: syncSource?.cadence ?? "Daily around 7:00 AM ET",
    isActive: syncSource?.isActive ?? true,
  });

  useEffect(() => {
    setSourceDraft({
      label: syncSource?.label ?? "QuickBooks invoice export",
      sourceUrl: syncSource?.sourceUrl ?? "",
      cadence: syncSource?.cadence ?? "Daily around 7:00 AM ET",
      isActive: syncSource?.isActive ?? true,
    });
  }, [syncSource]);

  const handleSourceSave = () => {
    setSourcePending(true);
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/billing/source", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(sourceDraft),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "QuickBooks source save failed.");
        }

        router.refresh();
      } catch (nextError) {
        setError(
          nextError instanceof Error ? nextError.message : "QuickBooks source save failed.",
        );
      } finally {
        setSourcePending(false);
      }
    });
  };

  const handleRunLinkedSync = () => {
    setSyncPending(true);
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/billing/sync", {
          method: "POST",
        });
        const payload = (await response.json()) as {
          error?: string;
          status?: BillingSyncRun["status"];
          summary?: string;
          importedCount?: number;
          matchedCount?: number;
          warningCount?: number;
          errorSamples?: string[];
        };

        if (!response.ok || !payload.status || !payload.summary) {
          throw new Error(payload.error ?? "QuickBooks sync failed.");
        }

        setLastRun({
          status: payload.status,
          summary: payload.summary,
          importedCount: payload.importedCount ?? 0,
          matchedCount: payload.matchedCount ?? 0,
          warningCount: payload.warningCount ?? 0,
          errorSamples: payload.errorSamples ?? [],
        });
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "QuickBooks sync failed.");
      } finally {
        setSyncPending(false);
      }
    });
  };

  const handleManualImport = () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a QuickBooks CSV export before starting the billing import.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    setImportPending(true);
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/billing/import", {
          method: "POST",
          body: formData,
        });
        const payload = (await response.json()) as {
          error?: string;
          run?: BillingSyncRun;
        };

        if (!response.ok || !payload.run) {
          throw new Error(payload.error ?? "QuickBooks import failed.");
        }

        setLastRun(payload.run);
        setSelectedFileName("");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "QuickBooks import failed.");
      } finally {
        setImportPending(false);
      }
    });
  };

  return (
    <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
      <div className="section-kicker">QuickBooks billing sync</div>
      <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
        Linked invoice snapshots and manual fallback
      </h3>
      <p className="mt-3 max-w-3xl text-sm text-[color:var(--muted)]">
        Save a linked QuickBooks invoice CSV URL for the morning automation bundle, or upload a
        manual CSV snapshot when finance exports it by hand.
      </p>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/70 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
            Linked source
          </div>
          <p className="mt-2 text-sm text-[color:var(--muted)]">
            The morning cron checks active linked sources around 7:00 AM Eastern and updates the
            billing snapshot automatically.
          </p>
          <div className="mt-4 grid gap-3">
            <input
              value={sourceDraft.label}
              onChange={(event) => {
                const label = event.currentTarget.value;
                setSourceDraft((current) => ({ ...current, label }));
              }}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="QuickBooks invoice export"
            />
            <input
              value={sourceDraft.sourceUrl}
              onChange={(event) => {
                const sourceUrl = event.currentTarget.value;
                setSourceDraft((current) => ({ ...current, sourceUrl }));
              }}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="https://example.com/quickbooks-invoices.csv"
              type="url"
            />
            <input
              value={sourceDraft.cadence}
              onChange={(event) => {
                const cadence = event.currentTarget.value;
                setSourceDraft((current) => ({ ...current, cadence }));
              }}
              className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="Daily around 7:00 AM ET"
            />
            <label className="flex items-center gap-3 rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]">
              <input
                checked={sourceDraft.isActive}
                onChange={(event) => {
                  const isActive = event.currentTarget.checked;
                  setSourceDraft((current) => ({ ...current, isActive }));
                }}
                type="checkbox"
              />
              <span>Source active</span>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSourceSave}
              disabled={sourcePending}
              className={clsx(
                "rounded-full px-4 py-2 text-sm font-semibold text-white",
                sourcePending
                  ? "cursor-wait bg-[rgba(23,56,75,0.56)]"
                  : "bg-[color:var(--navy-strong)] hover:opacity-90",
              )}
            >
              {sourcePending ? "Saving..." : "Save source"}
            </button>
            <button
              type="button"
              onClick={handleRunLinkedSync}
              disabled={
                syncPending ||
                sourceDraft.sourceUrl.trim().length === 0 ||
                !sourceDraft.isActive
              }
              className={clsx(
                "rounded-full border px-4 py-2 text-sm font-semibold",
                syncPending ||
                  sourceDraft.sourceUrl.trim().length === 0 ||
                  !sourceDraft.isActive
                  ? "cursor-not-allowed border-[rgba(23,56,75,0.2)] bg-[rgba(23,56,75,0.08)] text-[color:var(--muted)]"
                  : "border-[rgba(187,110,69,0.24)] bg-[rgba(187,110,69,0.12)] text-[color:var(--copper)] hover:opacity-90",
              )}
            >
              {syncPending ? "Syncing..." : "Run linked sync"}
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

        <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/70 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
            Manual CSV fallback
          </div>
          <p className="mt-2 text-sm text-[color:var(--muted)]">
            Upload a QuickBooks invoice export when finance sends a point-in-time snapshot instead
            of a linked file feed.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="mt-4 block w-full rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            onChange={(event) => setSelectedFileName(event.currentTarget.files?.[0]?.name ?? "")}
          />
          <div className="mt-2 text-sm text-[color:var(--muted)]">
            {selectedFileName || "No file selected yet."}
          </div>
          <button
            type="button"
            onClick={handleManualImport}
            disabled={importPending}
            className={clsx(
              "mt-4 rounded-full px-4 py-2 text-sm font-semibold text-white",
              importPending
                ? "cursor-wait bg-[rgba(23,56,75,0.56)]"
                : "bg-[color:var(--navy-strong)] hover:opacity-90",
            )}
          >
            {importPending ? "Importing..." : "Run manual billing import"}
          </button>

          <div className="mt-5 rounded-[1.25rem] border border-[color:var(--line)] bg-stone-50/90 p-3 text-sm text-[color:var(--muted)]">
            <div className="font-semibold text-[color:var(--navy-strong)]">Expected columns</div>
            <div className="mt-2">
              Include `Invoice Number`, `Customer Name`, `Customer Email`, `Balance Due`, and `Due Date`.
            </div>
            <Link
              href="/quickbooks-import-template.csv"
              className="mt-4 inline-flex rounded-full border border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] px-4 py-2 text-sm font-semibold text-[color:var(--navy-strong)]"
            >
              Download template CSV
            </Link>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-5 rounded-[1.5rem] border border-rose-200 bg-rose-100/90 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {lastRun ? (
        <div className="mt-5 rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold text-[color:var(--navy-strong)]">Latest billing sync</div>
            <span
              className={clsx(
                "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]",
                syncTone[lastRun.status],
              )}
            >
              {lastRun.status}
            </span>
          </div>
          <div className="mt-2 text-[color:var(--muted)]">{lastRun.summary}</div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-[color:var(--line)] bg-stone-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              {lastRun.importedCount} imported
            </span>
            <span className="rounded-full border border-[color:var(--line)] bg-stone-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              {lastRun.matchedCount} matched
            </span>
            <span className="rounded-full border border-[color:var(--line)] bg-stone-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              {lastRun.warningCount} warnings
            </span>
          </div>
          {lastRun.errorSamples.length > 0 ? (
            <div className="mt-3 space-y-1 text-xs text-amber-900">
              {lastRun.errorSamples.map((sample) => (
                <div key={sample}>{sample}</div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
