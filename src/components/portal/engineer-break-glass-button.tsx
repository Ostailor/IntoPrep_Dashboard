"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { SensitiveScopeType } from "@/lib/domain";

interface EngineerBreakGlassButtonProps {
  scopeType: SensitiveScopeType;
  scopeId: string;
  label: string;
  className?: string;
}

export function EngineerBreakGlassButton({
  scopeType,
  scopeId,
  label,
  className,
}: EngineerBreakGlassButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGrant = () => {
    const issueReference = window.prompt(`Issue or ticket reference for ${label}:`);
    if (!issueReference || issueReference.trim().length === 0) {
      return;
    }

    const reason = window.prompt(`Why do you need temporary access to ${label}?`);
    if (!reason || reason.trim().length === 0) {
      return;
    }

    setPending(true);
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/engineer/break-glass", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            scopeType,
            scopeId,
            reason: reason.trim(),
            issueReference: issueReference.trim(),
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Break-glass access failed.");
        }

        router.refresh();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Break-glass access failed.");
      } finally {
        setPending(false);
      }
    });
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleGrant}
        disabled={pending}
        className={clsx(
          "rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em]",
          pending
            ? "cursor-wait border-[rgba(23,56,75,0.2)] bg-[rgba(23,56,75,0.08)] text-[color:var(--muted)]"
            : "border-[rgba(187,110,69,0.24)] bg-[rgba(187,110,69,0.12)] text-[color:var(--copper)] hover:opacity-90",
        )}
      >
        {pending ? "Opening..." : "Unlock for support"}
      </button>
      {error ? <div className="mt-2 text-xs text-rose-700">{error}</div> : null}
    </div>
  );
}
