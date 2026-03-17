"use client";

import { startTransition, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import type { AdminSavedView, BillingFollowUpNote } from "@/lib/domain";
import { formatMoney } from "@/lib/portal";

interface BillingRow {
  invoiceId: string;
  familyName: string;
  amountDue: number | null;
  dueDate: string;
  status: "paid" | "pending" | "overdue";
  source: "QuickBooks" | "Manual";
  followUpState: "open" | "in_progress" | "resolved";
  lastFollowUpAt?: string | null;
  lastFollowUpByName?: string | null;
  sensitiveAccessGranted: boolean;
}

interface AdminBillingPanelProps {
  viewerMode: "preview" | "live" | "live-role-preview";
  rows: BillingRow[];
  notes: BillingFollowUpNote[];
  savedViews: AdminSavedView[];
}

function formatDate(value?: string | null) {
  if (!value) {
    return "No follow-up yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

export function AdminBillingPanel({
  viewerMode,
  rows,
  notes,
  savedViews,
}: AdminBillingPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const readOnly = viewerMode === "live-role-preview";
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const statusFilter = searchParams.get("status") ?? "all";
  const followUpFilter = searchParams.get("followUpState") ?? "all";
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (statusFilter !== "all" && row.status !== statusFilter) {
          return false;
        }

        if (followUpFilter !== "all" && row.followUpState !== followUpFilter) {
          return false;
        }

        return true;
      }),
    [followUpFilter, rows, statusFilter],
  );
  const billingSavedViews = useMemo(
    () => savedViews.filter((view) => view.section === "billing"),
    [savedViews],
  );

  const updateFilters = (next: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([key, value]) => {
      if (value === "all" || value.length === 0) {
        params.delete(key);
        return;
      }

      params.set(key, value);
    });
    router.replace(`${pathname}${params.size > 0 ? `?${params.toString()}` : ""}`);
  };

  const handleFollowUpSave = (row: BillingRow, followUpState: BillingRow["followUpState"]) => {
    if (readOnly) {
      setError("Role preview is read-only.");
      setSuccess(null);
      return;
    }

    setPendingKey(row.invoiceId);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/billing/follow-up", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            invoiceId: row.invoiceId,
            followUpState,
            body: noteDrafts[row.invoiceId] ?? "",
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Billing follow-up failed.");
        }

        setSuccess(`${row.familyName} billing follow-up updated.`);
        setNoteDrafts((current) => ({
          ...current,
          [row.invoiceId]: "",
        }));
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Billing follow-up failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const handleExport = () => {
    if (readOnly) {
      setError("Role preview is read-only.");
      setSuccess(null);
      return;
    }

    setPendingKey("export");
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/billing/export");

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "intoprep-billing-follow-up.csv";
        anchor.click();
        URL.revokeObjectURL(url);
        setSuccess("Billing follow-up export downloaded.");
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Billing export failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const handleSaveView = () => {
    if (readOnly) {
      setError("Role preview is read-only.");
      setSuccess(null);
      return;
    }

    const name = window.prompt("Name this billing view:");
    if (!name) {
      return;
    }

    setPendingKey("view");
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/views", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            section: "billing",
            filterState: {
              status: statusFilter,
              followUpState: followUpFilter,
            },
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Saved view failed.");
        }

        setSuccess("Billing view saved.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Saved view failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  return (
    <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
      <div className="section-kicker">Billing follow-up</div>
      <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
        Internal tuition follow-up
      </h3>
      <p className="mt-3 max-w-3xl text-sm text-[color:var(--muted)]">
        Manage internal follow-up notes and queue state here. QuickBooks and manual payment status
        remain the source of truth.
      </p>

      {error ? (
        <div className="mt-5 rounded-[1.5rem] border border-rose-200 bg-rose-100/90 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mt-5 rounded-[1.5rem] border border-emerald-200 bg-emerald-100/90 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(event) => updateFilters({ status: event.currentTarget.value })}
          className="rounded-full border border-[color:var(--line)] bg-white px-4 py-2 text-sm text-[color:var(--navy-strong)]"
        >
          <option value="all">All invoice states</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
          <option value="paid">Paid</option>
        </select>
        <select
          value={followUpFilter}
          onChange={(event) => updateFilters({ followUpState: event.currentTarget.value })}
          className="rounded-full border border-[color:var(--line)] bg-white px-4 py-2 text-sm text-[color:var(--navy-strong)]"
        >
          <option value="all">All follow-up states</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
        </select>
        <button
          type="button"
          onClick={handleSaveView}
          disabled={pendingKey === "view" || readOnly}
          className={clsx(
            "rounded-full border px-4 py-2 text-sm font-semibold",
            pendingKey === "view" || readOnly
              ? "cursor-not-allowed border-[color:var(--line)] bg-stone-100 text-[color:var(--muted)]"
              : "border-[rgba(187,110,69,0.24)] bg-[rgba(187,110,69,0.12)] text-[color:var(--copper)]",
          )}
        >
          Save view
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={pendingKey === "export" || readOnly}
          className={clsx(
            "rounded-full px-4 py-2 text-sm font-semibold text-white",
            pendingKey === "export" || readOnly
              ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
              : "bg-[color:var(--navy-strong)] hover:opacity-90",
          )}
        >
          {pendingKey === "export" ? "Exporting..." : "Export CSV"}
        </button>
      </div>

      {billingSavedViews.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {billingSavedViews.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => {
                const next: Record<string, string> = {};
                Object.entries(view.filterState).forEach(([key, value]) => {
                  next[key] = Array.isArray(value) ? value[0] ?? "" : String(value);
                });
                updateFilters(next);
              }}
              className="rounded-full border border-[color:var(--line)] bg-white/80 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]"
            >
              {view.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        {filteredRows.map((row) => {
          const rowNotes = notes.filter((note) => note.invoiceId === row.invoiceId);

          return (
            <div
              key={row.invoiceId}
              className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-lg font-semibold text-[color:var(--navy-strong)]">
                    {row.familyName}
                  </div>
                  <div className="mt-1 text-sm text-[color:var(--muted)]">
                    {typeof row.amountDue === "number" ? formatMoney(row.amountDue) : "Protected"} ·
                    due {row.dueDate} · {row.source}
                  </div>
                  <div className="mt-2 text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    Last follow-up {formatDate(row.lastFollowUpAt)}
                    {row.lastFollowUpByName ? ` · ${row.lastFollowUpByName}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["open", "in_progress", "resolved"] as const).map((state) => (
                    <button
                      key={state}
                      type="button"
                      onClick={() => handleFollowUpSave(row, state)}
                      disabled={pendingKey === row.invoiceId || readOnly}
                      className={clsx(
                        "rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em]",
                        row.followUpState === state
                          ? "border-[rgba(23,56,75,0.18)] bg-[rgba(23,56,75,0.08)] text-[color:var(--navy-strong)]"
                          : "border-[color:var(--line)] bg-white text-[color:var(--muted)]",
                      )}
                    >
                      {state.replaceAll("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={noteDrafts[row.invoiceId] ?? ""}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value;
                  setNoteDrafts((current) => ({
                    ...current,
                    [row.invoiceId]: nextValue,
                  }));
                }}
                className="mt-4 min-h-[96px] w-full rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                placeholder="Add internal reconciliation or follow-up note."
                disabled={readOnly}
              />
              {rowNotes.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {rowNotes.slice(0, 3).map((note) => (
                    <div
                      key={note.id}
                      className="rounded-[1.25rem] border border-[color:var(--line)] bg-stone-50 px-4 py-3 text-sm text-[color:var(--muted)]"
                    >
                      <div>{note.body}</div>
                      <div className="mt-2 text-xs uppercase tracking-[0.14em]">
                        {note.authorName} · {formatDate(note.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
