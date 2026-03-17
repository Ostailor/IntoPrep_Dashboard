"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { Family, FamilyContactEvent } from "@/lib/domain";

interface AdminFamilyOpsPanelProps {
  viewerMode: "preview" | "live" | "live-role-preview";
  families: Family[];
  contactEvents: FamilyContactEvent[];
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

export function AdminFamilyOpsPanel({
  viewerMode,
  families,
  contactEvents,
}: AdminFamilyOpsPanelProps) {
  const router = useRouter();
  const readOnly = viewerMode === "live-role-preview";
  const [selectedFamilyId, setSelectedFamilyId] = useState(families[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    contactSource: "phone",
    summary: "",
    outcome: "",
    contactAt: "",
  });
  const visibleEvents = useMemo(
    () =>
      contactEvents.filter((event) => event.familyId === selectedFamilyId),
    [contactEvents, selectedFamilyId],
  );
  const selectedFamily = families.find((family) => family.id === selectedFamilyId) ?? families[0];

  const handleSave = () => {
    if (readOnly) {
      setError("Role preview is read-only.");
      setSuccess(null);
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/families/contact-history", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            familyId: selectedFamilyId,
            contactSource: formState.contactSource,
            summary: formState.summary,
            outcome: formState.outcome,
            contactAt: formState.contactAt || null,
          }),
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Contact history update failed.");
        }
        setFormState({
          contactSource: "phone",
          summary: "",
          outcome: "",
          contactAt: "",
        });
        setSuccess("Family contact history updated.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Contact history update failed.");
      } finally {
        setPending(false);
      }
    });
  };

  return (
    <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
      <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
        <div className="section-kicker">Parent contact history</div>
        <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
          Outreach timeline
        </h3>
        <div className="mt-5">
          <select
            value={selectedFamilyId}
            onChange={(event) => setSelectedFamilyId(event.currentTarget.value)}
            className="w-full rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
          >
            {families.map((family) => (
              <option key={family.id} value={family.id}>
                {family.familyName}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-5 space-y-3">
          {visibleEvents.map((event) => (
            <div
              key={event.id}
              className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-base font-semibold text-[color:var(--navy-strong)]">
                  {event.summary}
                </div>
                <div className="text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  {event.contactSource.replaceAll("_", " ")}
                </div>
              </div>
              <div className="mt-2 text-sm text-[color:var(--muted)]">{event.outcome}</div>
              <div className="mt-3 text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                {event.actorName} · {formatDateTime(event.contactAt)}
              </div>
            </div>
          ))}
          {visibleEvents.length === 0 ? (
            <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4 text-sm text-[color:var(--muted)]">
              No contact history is logged for this family yet.
            </div>
          ) : null}
        </div>
      </div>

      <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
        <div className="section-kicker">New outreach note</div>
        <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
          Log the follow-up outcome
        </h3>
        <p className="mt-3 text-sm text-[color:var(--muted)]">
          Keep the family handoff clean for anyone who picks up the next outreach step.
        </p>
        {selectedFamily ? (
          <div className="mt-5 rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4 text-sm text-[color:var(--muted)]">
            {selectedFamily.guardianNames.join(" · ")} · {selectedFamily.email}
          </div>
        ) : null}
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
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <select
            value={formState.contactSource}
            onChange={(event) => {
              const contactSource = event.currentTarget.value;
              setFormState((current) => ({ ...current, contactSource }));
            }}
            className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            disabled={readOnly}
          >
            <option value="phone">Phone</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="meeting">Meeting</option>
            <option value="portal_message">Portal message</option>
          </select>
          <input
            value={formState.contactAt}
            onChange={(event) => {
              const contactAt = event.currentTarget.value;
              setFormState((current) => ({ ...current, contactAt }));
            }}
            type="datetime-local"
            className="rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
            disabled={readOnly}
          />
        </div>
        <textarea
          value={formState.summary}
          onChange={(event) => {
            const summary = event.currentTarget.value;
            setFormState((current) => ({ ...current, summary }));
          }}
          className="mt-3 min-h-[104px] w-full rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
          placeholder="What was discussed?"
          disabled={readOnly}
        />
        <textarea
          value={formState.outcome}
          onChange={(event) => {
            const outcome = event.currentTarget.value;
            setFormState((current) => ({ ...current, outcome }));
          }}
          className="mt-3 min-h-[104px] w-full rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
          placeholder="What happens next?"
          disabled={readOnly}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || readOnly}
          className={clsx(
            "mt-4 rounded-full px-4 py-2 text-sm font-semibold text-white",
            pending || readOnly
              ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
              : "bg-[color:var(--navy-strong)] hover:opacity-90",
          )}
        >
          {pending ? "Saving..." : readOnly ? "Preview only" : "Log contact update"}
        </button>
      </div>
    </section>
  );
}
