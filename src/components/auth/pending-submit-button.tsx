"use client";

import { useFormStatus } from "react-dom";

interface PendingSubmitButtonProps {
  idleLabel: string;
  pendingLabel: string;
  className: string;
}

export function PendingSubmitButton({
  idleLabel,
  pendingLabel,
  className,
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-70`}
    >
      <span aria-live="polite">{pending ? pendingLabel : idleLabel}</span>
    </button>
  );
}
