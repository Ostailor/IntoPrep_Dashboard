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
  return (
    <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
      <div className="section-kicker">Governance trail</div>
      <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
        Account audit log
      </h3>
      <p className="mt-3 text-sm text-[color:var(--muted)]">
        Recent account, role, suspension, and password-governance actions recorded in Supabase.
      </p>

      {!entries || entries.length === 0 ? (
        <div className="mt-5 rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4 text-sm text-[color:var(--muted)]">
          No governance events have been recorded yet.
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {entries.map((entry) => (
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
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
