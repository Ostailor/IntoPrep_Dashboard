"use client";

import { startTransition, useState } from "react";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import type { Program } from "@/lib/domain";

interface AdminProgramArchivePanelProps {
  viewerMode: "preview" | "live" | "live-role-preview";
  programs: Program[];
  archivedPrograms: Program[];
}

export function AdminProgramArchivePanel({
  viewerMode,
  programs,
  archivedPrograms,
}: AdminProgramArchivePanelProps) {
  const router = useRouter();
  const readOnly = viewerMode === "live-role-preview";
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleArchiveState = (targetId: string, archived: boolean) => {
    if (readOnly) {
      setError("Role preview is read-only.");
      setSuccess(null);
      return;
    }

    setPendingKey(targetId);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/archive", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            targetType: "program",
            targetId,
            archived,
          }),
        });
        const payload = (await response.json()) as { error?: string; label?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Program archive update failed.");
        }

        setSuccess(`${payload.label ?? "Program"} ${archived ? "archived" : "restored"}.`);
        router.refresh();
      } catch (nextError) {
        setError(
          nextError instanceof Error ? nextError.message : "Program archive update failed.",
        );
      } finally {
        setPendingKey(null);
      }
    });
  };

  return (
    <section className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]">
      <div className="section-kicker">Program archive</div>
      <h3 className="display-font mt-2 text-3xl text-[color:var(--navy-strong)]">
        Close or restore program records
      </h3>
      <p className="mt-3 text-sm text-[color:var(--muted)]">
        Archive programs instead of deleting them. Programs with active cohorts must be cleared
        first.
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

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {programs.map((program) => (
          <div
            key={program.id}
            className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
          >
            <div className="text-base font-semibold text-[color:var(--navy-strong)]">
              {program.name}
            </div>
            <div className="mt-2 text-sm text-[color:var(--muted)]">
              {program.track} · {program.format}
            </div>
            <button
              type="button"
              onClick={() => handleArchiveState(program.id, true)}
              disabled={pendingKey === program.id || readOnly}
              className={clsx(
                "mt-4 rounded-full border px-4 py-2 text-sm font-semibold",
                pendingKey === program.id || readOnly
                  ? "cursor-not-allowed border-[color:var(--line)] bg-stone-100 text-[color:var(--muted)]"
                  : "border-amber-200 bg-amber-100 text-amber-800",
              )}
            >
              {pendingKey === program.id ? "Updating..." : "Archive program"}
            </button>
          </div>
        ))}
      </div>

      {archivedPrograms.length > 0 ? (
        <div className="mt-5 border-t border-[color:var(--line)] pt-5">
          <div className="section-kicker">Archived programs</div>
          <div className="mt-3 flex flex-wrap gap-3">
            {archivedPrograms.map((program) => (
              <button
                key={program.id}
                type="button"
                onClick={() => handleArchiveState(program.id, false)}
                disabled={pendingKey === program.id || readOnly}
                className={clsx(
                  "rounded-full border px-4 py-2 text-sm font-semibold",
                  pendingKey === program.id || readOnly
                    ? "cursor-not-allowed border-[color:var(--line)] bg-stone-100 text-[color:var(--muted)]"
                    : "border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] text-[color:var(--navy-strong)]",
                )}
              >
                {pendingKey === program.id ? "Restoring..." : `Restore ${program.name}`}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
