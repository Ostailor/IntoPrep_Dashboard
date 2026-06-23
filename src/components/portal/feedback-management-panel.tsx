"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, CircleDot, Clock, XCircle } from "lucide-react";
import type { FeedbackStatus, FeedbackSubmission } from "@/lib/domain";

const categoryLabels: Record<FeedbackSubmission["category"], string> = {
  addition: "Addition",
  bug: "Bug",
  confusing: "Confusing",
  other: "Other",
};

const statusLabels: Record<FeedbackStatus, string> = {
  new: "New",
  reviewed: "Reviewed",
  planned: "Planned",
  resolved: "Resolved",
  closed: "Closed",
};

const statusOptions: FeedbackStatus[] = ["new", "reviewed", "planned", "resolved", "closed"];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

function statusIcon(status: FeedbackStatus) {
  switch (status) {
    case "resolved":
      return CheckCircle2;
    case "closed":
      return XCircle;
    case "planned":
      return Clock;
    default:
      return CircleDot;
  }
}

export function FeedbackManagementPanel({
  submissions,
}: {
  submissions: FeedbackSubmission[];
}) {
  const [items, setItems] = useState(submissions);
  const [filter, setFilter] = useState<FeedbackStatus | "all">("all");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const visibleItems = useMemo(
    () => (filter === "all" ? items : items.filter((item) => item.status === filter)),
    [filter, items],
  );

  const updateStatus = async (feedbackId: string, status: FeedbackStatus) => {
    setSavingId(feedbackId);
    setError(null);

    try {
      const response = await fetch("/api/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId, status }),
      });
      const result = (await response.json()) as { error?: string; reviewedAt?: string | null };

      if (!response.ok) {
        throw new Error(result.error ?? "Feedback status could not be updated.");
      }

      setItems((current) =>
        current.map((item) =>
          item.id === feedbackId
            ? {
                ...item,
                status,
                reviewedAt: result.reviewedAt ?? null,
              }
            : item,
        ),
      );
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Feedback status could not be updated.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="glass-panel rounded-lg p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="section-kicker">User feedback</div>
          <h2 className="mt-2 text-xl font-semibold text-[color:var(--navy-strong)]">
            Requests and bug reports
          </h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
            Feedback submitted from the portal. Engineer users triage status updates here.
          </p>
        </div>
        <label className="min-w-40">
          <span className="sr-only">Filter feedback status</span>
          <select
            className="focus-ring w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-sm font-semibold text-[color:var(--navy-strong)]"
            value={filter}
            onChange={(event) => setFilter(event.currentTarget.value as FeedbackStatus | "all")}
          >
            <option value="all">All feedback</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {error}
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {visibleItems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[color:var(--line)] bg-white/75 p-6 text-sm text-[color:var(--muted)]">
            No feedback matches this view yet.
          </div>
        ) : (
          visibleItems.map((item) => {
            const Icon = statusIcon(item.status);

            return (
              <article key={item.id} className="rounded-lg border border-[color:var(--line)] bg-white/82 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[rgba(49,95,212,0.2)] bg-[rgba(49,95,212,0.08)] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--navy-strong)]">
                        {categoryLabels[item.category]}
                      </span>
                      <span className="rounded-full border border-[color:var(--line)] bg-stone-50 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                        {item.priority === "urgent" ? "Urgent" : "Normal"}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--line)] bg-white px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                        <Icon size={13} aria-hidden="true" />
                        {statusLabels[item.status]}
                      </span>
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-[color:var(--navy-strong)]">
                      {item.subject}
                    </h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[color:var(--muted)]">
                      {item.body}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold uppercase tracking-[0.1em] text-[color:var(--muted)]">
                      <span>
                        {item.reporterName} · {item.reporterRole}
                      </span>
                      <span>{formatDate(item.createdAt)}</span>
                      {item.pagePath ? <span>{item.pagePath}</span> : null}
                    </div>
                  </div>

                  <label className="min-w-40">
                    <span className="sr-only">Update feedback status</span>
                    <select
                      className="focus-ring w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-sm font-semibold text-[color:var(--navy-strong)] disabled:cursor-wait disabled:opacity-60"
                      value={item.status}
                      disabled={savingId === item.id}
                      onChange={(event) => updateStatus(item.id, event.currentTarget.value as FeedbackStatus)}
                    >
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {statusLabels[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
