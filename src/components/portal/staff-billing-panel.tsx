"use client";

import { startTransition, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import type { AdminSavedView, AdminTask, BillingFollowUpNote } from "@/lib/domain";
import { formatMoney } from "@/lib/portal";

interface BillingRow {
  invoiceId: string;
  familyName: string;
  amountDue: number | null;
  dueDate: string;
  status: "paid" | "pending" | "overdue";
  source: "QuickBooks" | "Manual";
  followUpState: "open" | "in_progress" | "resolved";
}

interface StaffBillingPanelProps {
  viewerMode: "preview" | "live" | "live-role-preview";
  rows: BillingRow[];
  tasks: AdminTask[];
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

export function StaffBillingPanel({
  viewerMode,
  rows,
  tasks,
  notes,
  savedViews,
}: StaffBillingPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const readOnly = viewerMode === "live-role-preview";
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const followUpFilter = searchParams.get("followUpState") ?? "all";
  const assignedTasks = useMemo(
    () => tasks.filter((task) => task.taskType === "billing_follow_up"),
    [tasks],
  );
  const visibleRows = useMemo(
    () =>
      assignedTasks
        .map((task) =>
          rows.find(
            (row) =>
              row.invoiceId === task.targetId ||
              notes.some((note) => note.invoiceId === row.invoiceId && note.familyId === task.targetId),
          ) ?? null,
        )
        .filter((row): row is BillingRow => row !== null)
        .filter((row) => (followUpFilter === "all" ? true : row.followUpState === followUpFilter)),
    [assignedTasks, followUpFilter, notes, rows],
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
      } else {
        params.set(key, value);
      }
    });
    router.replace(`${pathname}${params.size > 0 ? `?${params.toString()}` : ""}`);
  };

  const saveView = () => {
    if (readOnly) {
      setError("Role preview is read-only.");
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
        const response = await fetch("/api/staff/views", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            section: "billing",
            filterState: {
              followUpState: followUpFilter,
            },
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Saved view failed.");
        }

        setSuccess("Personal billing view saved.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Saved view failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  const handleFollowUpSave = (row: BillingRow, followUpState: BillingRow["followUpState"]) => {
    if (readOnly) {
      setError("Role preview is read-only.");
      return;
    }

    setPendingKey(row.invoiceId);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/staff/billing/follow-up", {
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

        setNoteDrafts((current) => ({
          ...current,
          [row.invoiceId]: "",
        }));
        setSuccess(`${row.familyName} follow-up updated.`);
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Billing follow-up failed.");
      } finally {
        setPendingKey(null);
      }
    });
  };

  return (
    <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
      <div className="section-kicker">Assigned billing follow-up</div>
      <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
        Your tuition queue
      </h3>
      <p className="mt-3 max-w-3xl text-sm text-[color:var(--muted)]">
        Billing stays writable only for invoices assigned to you through the operations task queue.
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
          onClick={saveView}
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
      </div>

      {billingSavedViews.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {billingSavedViews.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => {
                const params = new URLSearchParams();
                Object.entries(view.filterState).forEach(([key, value]) => {
                  if (Array.isArray(value)) {
                    value.forEach((item) => params.append(key, item));
                  } else {
                    params.set(key, String(value));
                  }
                });
                router.replace(`${pathname}${params.size > 0 ? `?${params.toString()}` : ""}`);
              }}
              className="rounded-full border border-[color:var(--line)] bg-white/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]"
            >
              {view.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        {visibleRows.map((row) => {
          const relatedNotes = notes.filter((note) => note.invoiceId === row.invoiceId).slice(0, 3);

          return (
            <div key={row.invoiceId} className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-base font-semibold text-[color:var(--navy-strong)]">{row.familyName}</div>
                  <div className="mt-1 text-sm text-[color:var(--muted)]">
                    Due {formatDate(row.dueDate)} · {row.source}
                  </div>
                </div>
                <div className="text-right text-sm text-[color:var(--muted)]">
                  {typeof row.amountDue === "number" ? formatMoney(row.amountDue) : "Protected"}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {(["open", "in_progress", "resolved"] as const).map((state) => (
                  <button
                    key={`${row.invoiceId}-${state}`}
                    type="button"
                    onClick={() => handleFollowUpSave(row, state)}
                    disabled={pendingKey === row.invoiceId || readOnly}
                    className={clsx(
                      "rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em]",
                      row.followUpState === state
                        ? "border-[rgba(23,56,75,0.16)] bg-[rgba(23,56,75,0.08)] text-[color:var(--navy-strong)]"
                        : "border-[color:var(--line)] bg-stone-50 text-[color:var(--muted)]",
                    )}
                  >
                    {state.replaceAll("_", " ")}
                  </button>
                ))}
              </div>

              <textarea
                value={noteDrafts[row.invoiceId] ?? ""}
                onChange={(event) =>
                  setNoteDrafts((current) => ({
                    ...current,
                    [row.invoiceId]: event.currentTarget.value,
                  }))
                }
                className="mt-3 min-h-[96px] w-full rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                placeholder="Add the follow-up outcome or next step"
                disabled={readOnly}
              />

              <div className="mt-4 space-y-2">
                {relatedNotes.map((note) => (
                  <div key={note.id} className="rounded-2xl border border-[color:var(--line)] bg-stone-50 px-4 py-3 text-sm text-[color:var(--muted)]">
                    <span className="font-semibold text-[color:var(--navy-strong)]">{note.authorName}</span>
                    {" · "}
                    {formatDate(note.createdAt)}
                    <div className="mt-1">{note.body}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {visibleRows.length === 0 ? (
          <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4 text-sm text-[color:var(--muted)]">
            No billing follow-up is assigned to you right now.
          </div>
        ) : null}
      </div>
    </section>
  );
}
