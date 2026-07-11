"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { Family, FamilyContactEvent, MessageThread, Student } from "@/lib/domain";

interface TaFamilySupportPanelProps {
  viewerMode: "preview" | "live" | "live-role-preview";
  families: Family[];
  students: Student[];
  threads: MessageThread[];
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

function getFamilyStudents(family: Family, students: Student[]) {
  return students.filter((student) => student.familyId === family.id);
}

function getFamilySearchLabel(family: Family, students: Student[]) {
  const studentNames = getFamilyStudents(family, students)
    .map((student) => `${student.firstName} ${student.lastName}`)
    .join(", ");
  const parentNames = [family.parent1Name, family.parent2Name]
    .filter((name): name is string => Boolean(name?.trim()))
    .join(" / ");

  return [studentNames || family.familyName, parentNames || family.guardianNames.join(" / ")]
    .filter(Boolean)
    .join(" / ");
}

export function TaFamilySupportPanel({
  viewerMode,
  families,
  students,
  threads,
  contactEvents,
}: TaFamilySupportPanelProps) {
  const router = useRouter();
  const readOnly = viewerMode === "live-role-preview";
  const [selectedFamilyId, setSelectedFamilyId] = useState(families[0]?.id ?? "");
  const [familySearch, setFamilySearch] = useState("");
  const [familySearchOpen, setFamilySearchOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    contactSource: "phone",
    summary: "",
    outcome: "",
    contactAt: "",
  });
  const filteredFamilies = useMemo(() => {
    const normalizedSearch = familySearch.trim().toLowerCase();

    if (!normalizedSearch) {
      return families;
    }

    return families.filter((family) => {
      const familyStudents = getFamilyStudents(family, students);
      const haystack = [
        family.familyName,
        family.parent1Name,
        family.parent2Name,
        family.parent1Email,
        family.parent2Email,
        ...family.guardianNames,
        ...familyStudents.map((student) => `${student.firstName} ${student.lastName}`),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [families, familySearch, students]);
  const selectedFamily = families.find((family) => family.id === selectedFamilyId) ?? families[0] ?? null;
  const selectedStudents = selectedFamily ? getFamilyStudents(selectedFamily, students) : [];
  const selectedEvents = selectedFamily
    ? contactEvents.filter((event) => event.familyId === selectedFamily.id)
    : [];
  const selectedThreads = selectedFamily
    ? threads.filter((thread) => thread.familyId === selectedFamily.id)
    : [];

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
        const response = await fetch("/api/ta/families/contact-history", {
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
        setSuccess("Family outreach note logged.");
        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Contact history update failed.");
      } finally {
        setPending(false);
      }
    });
  };

  return (
    <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
        <div className="section-kicker">Family context</div>
        <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
          Outreach timeline
        </h3>
        <div className="mt-5 flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
            Family
          </span>
          <span className="text-sm text-[color:var(--muted)]">
            Search by student name or parent name, then click the family row to review context logs.
          </span>
          <span className="relative">
            <input
              value={familySearch}
              onChange={(event) => {
                setFamilySearch(event.currentTarget.value);
                setFamilySearchOpen(true);
              }}
              onFocus={() => setFamilySearchOpen(true)}
              className="w-full rounded-2xl border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
              placeholder="Search student or parent name"
            />
            {familySearchOpen ? (
              <span className="absolute left-0 right-0 top-full z-30 mt-2 block max-h-80 overflow-auto rounded-2xl border border-[color:var(--line)] bg-white p-2 shadow-xl">
                {filteredFamilies.map((family) => {
                  const selected = family.id === selectedFamilyId;

                  return (
                    <button
                      key={family.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setSelectedFamilyId(family.id);
                        setFamilySearch(getFamilySearchLabel(family, students));
                        setFamilySearchOpen(false);
                      }}
                      className={clsx(
                        "block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold",
                        selected
                          ? "bg-[rgba(23,56,75,0.08)] text-[color:var(--navy-strong)]"
                          : "text-[color:var(--muted)] hover:bg-stone-50",
                      )}
                    >
                      {getFamilySearchLabel(family, students)}
                    </button>
                  );
                })}
                {filteredFamilies.length === 0 ? (
                  <span className="block rounded-xl border border-dashed border-[color:var(--line)] px-3 py-2 text-sm text-[color:var(--muted)]">
                    No matching families.
                  </span>
                ) : null}
              </span>
            ) : null}
          </span>
        </div>
      </div>

      <div className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
        <div className="section-kicker">Selected family</div>
        <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
          {selectedFamily ? getFamilySearchLabel(selectedFamily, students) : "No family selected"}
        </h3>
        {selectedFamily ? (
          <>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {selectedStudents.map((student) => (
                <div key={student.id} className="rounded-2xl border border-[color:var(--line)] bg-white/75 p-4">
                  <div className="text-sm font-semibold text-[color:var(--navy-strong)]">
                    {student.firstName} {student.lastName}
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--muted)]">
                    {student.school} · Grade {student.gradeLevel}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 space-y-3">
              {selectedEvents.map((event) => (
                <div key={event.id} className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-base font-semibold text-[color:var(--navy-strong)]">{event.summary}</div>
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
              {selectedEvents.length === 0 ? (
                <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4 text-sm text-[color:var(--muted)]">
                  No contact history is logged for this family yet.
                </div>
              ) : null}
            </div>
            {selectedThreads.length > 0 ? (
              <div className="mt-5 rounded-[1.5rem] border border-[color:var(--line)] bg-stone-50/80 p-4 text-sm text-[color:var(--muted)]">
                {selectedThreads.reduce((sum, thread) => sum + thread.unreadCount, 0)} unread family thread item(s).
              </div>
            ) : null}
            <div className="mt-5 rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4">
              <div className="section-kicker">New outreach note</div>
              <h4 className="mt-2 text-lg font-semibold text-[color:var(--navy-strong)]">
                Log TA follow-up
              </h4>
              <p className="mt-2 text-sm text-[color:var(--muted)]">
                Add call, text, email, or meeting outcomes for the staff handoff.
              </p>
              {error ? (
                <div className="mt-4 rounded-[1.5rem] border border-rose-200 bg-rose-100/90 px-4 py-3 text-sm text-rose-800">
                  {error}
                </div>
              ) : null}
              {success ? (
                <div className="mt-4 rounded-[1.5rem] border border-emerald-200 bg-emerald-100/90 px-4 py-3 text-sm text-emerald-800">
                  {success}
                </div>
              ) : null}
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <select
                  value={formState.contactSource}
                  onChange={(event) => {
                    const contactSource = event.currentTarget.value;
                    setFormState((current) => ({
                      ...current,
                      contactSource,
                    }));
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
                    setFormState((current) => ({
                      ...current,
                      contactAt,
                    }));
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
                  setFormState((current) => ({
                    ...current,
                    summary,
                  }));
                }}
                className="mt-3 min-h-[104px] w-full rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                placeholder="What was discussed?"
                disabled={readOnly}
              />
              <textarea
                value={formState.outcome}
                onChange={(event) => {
                  const outcome = event.currentTarget.value;
                  setFormState((current) => ({
                    ...current,
                    outcome,
                  }));
                }}
                className="mt-3 min-h-[104px] w-full rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)]"
                placeholder="What happens next?"
                disabled={readOnly}
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={pending || readOnly || !selectedFamily}
                className={clsx(
                  "mt-4 rounded-full px-4 py-2 text-sm font-semibold text-white",
                  pending || readOnly || !selectedFamily
                    ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
                    : "bg-[color:var(--navy-strong)] hover:opacity-90",
                )}
              >
                {pending ? "Saving..." : readOnly ? "Preview only" : "Log outreach note"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
