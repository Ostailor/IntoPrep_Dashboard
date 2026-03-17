"use client";

import { useMemo, useState } from "react";
import type { LiveSettingsAuditRow } from "@/lib/live-portal";

interface AccountAuditLogPanelProps {
  entries: LiveSettingsAuditRow[] | null;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function AccountAuditLogPanel({ entries }: AccountAuditLogPanelProps) {
  const [query, setQuery] = useState("");
  const [issueReference, setIssueReference] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [targetFilter, setTargetFilter] = useState("all");
  const [timeRangeFilter, setTimeRangeFilter] = useState("all");
  const [referenceNow, setReferenceNow] = useState(() => Date.now());

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const normalizedIssueReference = issueReference.trim().toLowerCase();
    const minimumTimestamp =
      timeRangeFilter === "24h"
        ? referenceNow - 24 * 60 * 60 * 1000
        : timeRangeFilter === "7d"
          ? referenceNow - 7 * 24 * 60 * 60 * 1000
          : timeRangeFilter === "30d"
            ? referenceNow - 30 * 24 * 60 * 60 * 1000
            : timeRangeFilter === "90d"
              ? referenceNow - 90 * 24 * 60 * 60 * 1000
              : null;

    return (entries ?? []).filter((entry) => {
      if (minimumTimestamp && Date.parse(entry.createdAt) < minimumTimestamp) {
        return false;
      }

      if (actionFilter !== "all" && entry.action !== actionFilter) {
        return false;
      }

      if (targetFilter !== "all" && (entry.targetType ?? "unknown") !== targetFilter) {
        return false;
      }

      if (
        normalizedIssueReference.length > 0 &&
        !(entry.issueReference ?? "").toLowerCase().includes(normalizedIssueReference)
      ) {
        return false;
      }

      if (normalizedQuery.length === 0) {
        return true;
      }

      return [entry.actorName, entry.summary, entry.targetLabel]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [actionFilter, entries, issueReference, query, referenceNow, targetFilter, timeRangeFilter]);

  return (
    <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
      <div className="section-kicker">Governance trail</div>
      <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
        Account audit log
      </h3>
      <p className="mt-3 text-sm text-[color:var(--muted)]">
        Recent account, role, suspension, and password-governance actions recorded in Supabase.
      </p>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
          placeholder="Search actor, summary, or target"
        />
        <input
          value={issueReference}
          onChange={(event) => setIssueReference(event.currentTarget.value)}
          className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
          placeholder="Issue reference"
        />
        <select
          value={actionFilter}
          onChange={(event) => setActionFilter(event.currentTarget.value)}
          className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
        >
          <option value="all">All actions</option>
          {Array.from(new Set((entries ?? []).map((entry) => entry.action))).map((action) => (
            <option key={action} value={action}>
              {action.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <select
          value={targetFilter}
          onChange={(event) => setTargetFilter(event.currentTarget.value)}
          className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
        >
          <option value="all">All targets</option>
          {Array.from(new Set((entries ?? []).map((entry) => entry.targetType ?? "unknown"))).map((target) => (
            <option key={target} value={target}>
              {target.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <select
          value={timeRangeFilter}
          onChange={(event) => {
            setTimeRangeFilter(event.currentTarget.value);
            setReferenceNow(Date.now());
          }}
          className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
        >
          <option value="all">All time</option>
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      {!entries || filteredEntries.length === 0 ? (
        <div className="mt-5 rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4 text-sm text-[color:var(--muted)]">
          No governance events matched the current filters.
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {filteredEntries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                  {entry.summary}
                </div>
                <div className="rounded-full border border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--navy-strong)]">
                  {formatTimestamp(entry.createdAt)}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                <span>{entry.actorName}</span>
                <span>{entry.action.replaceAll("_", " ")}</span>
                <span>{entry.targetLabel}</span>
                {entry.targetType ? <span>{entry.targetType.replaceAll("_", " ")}</span> : null}
                {entry.issueReference ? <span>{entry.issueReference}</span> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
