"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Bug, Lightbulb, MessageSquarePlus, X } from "lucide-react";

type FeedbackCategory = "addition" | "bug" | "confusing" | "other";
type FeedbackPriority = "normal" | "urgent";

const categoryOptions: {
  value: FeedbackCategory;
  label: string;
  detail: string;
}[] = [
  {
    value: "addition",
    label: "Addition",
    detail: "A new view, report, workflow, or admin control.",
  },
  {
    value: "bug",
    label: "Bug",
    detail: "Something is broken, slow, missing, or inaccurate.",
  },
  {
    value: "confusing",
    label: "Confusing",
    detail: "Something is hard to understand or easy to misuse.",
  },
  {
    value: "other",
    label: "Other",
    detail: "Anything else the team should know.",
  },
];

export function PortalFeedbackButton({
  userName,
  userRole,
}: {
  userName: string;
  userRole: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("addition");
  const [priority, setPriority] = useState<FeedbackPriority>("normal");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedCategory = useMemo(
    () => categoryOptions.find((option) => option.value === category) ?? categoryOptions[0],
    [category],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const resetForm = () => {
    setCategory("addition");
    setPriority("normal");
    setSubject("");
    setBody("");
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          priority,
          subject,
          body,
          pagePath: window.location.pathname + window.location.search,
        }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Feedback could not be sent.");
      }

      setMessage("Feedback sent. Engineer users can review it in Settings.");
      resetForm();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Feedback could not be sent.");
    } finally {
      setSaving(false);
    }
  };

  const dialog = open ? (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(8,41,52,0.35)] p-3 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        className="max-h-[calc(100vh-2rem)] w-[min(100%,44rem)] overflow-y-auto rounded-lg border border-[color:var(--line)] bg-white p-5 shadow-[0_24px_80px_rgba(8,41,52,0.28)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="section-kicker">Portal feedback</div>
            <h2 id="feedback-title" className="mt-2 text-xl font-semibold text-[color:var(--navy-strong)]">
              Send a request or report a bug
            </h2>
            <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
              Signed in as {userName} ({userRole}). Your role and current page are included automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="focus-ring rounded-lg border border-[color:var(--line)] p-2 text-[color:var(--muted)] hover:bg-stone-50"
            aria-label="Close feedback dialog"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {message ? (
          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            {error}
          </div>
        ) : null}

        <form className="mt-5 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="text-sm font-semibold text-[color:var(--navy-strong)]">
              What kind of feedback is this?
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {categoryOptions.map((option) => {
                const Icon = option.value === "bug" ? Bug : Lightbulb;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setCategory(option.value)}
                    className={
                      category === option.value
                        ? "focus-ring rounded-lg border border-[rgba(49,95,212,0.38)] bg-[rgba(49,95,212,0.1)] p-4 text-left"
                        : "focus-ring rounded-lg border border-[color:var(--line)] bg-stone-50 p-4 text-left hover:bg-white"
                    }
                    aria-pressed={category === option.value}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-[color:var(--navy-strong)]">
                      <Icon size={16} aria-hidden="true" />
                      {option.label}
                    </span>
                    <span className="mt-2 block text-xs leading-5 text-[color:var(--muted)]">
                      {option.detail}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-[color:var(--muted)]">{selectedCategory.detail}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <label className="block">
              <span className="text-sm font-semibold text-[color:var(--navy-strong)]">Subject</span>
              <input
                className="focus-ring mt-2 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2.5 text-sm"
                value={subject}
                onChange={(event) => setSubject(event.currentTarget.value)}
                maxLength={140}
                placeholder="Example: Add weekly attendance export"
                required
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-[color:var(--navy-strong)]">Priority</span>
              <select
                className="focus-ring mt-2 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2.5 text-sm"
                value={priority}
                onChange={(event) => setPriority(event.currentTarget.value as FeedbackPriority)}
              >
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-semibold text-[color:var(--navy-strong)]">Details</span>
            <textarea
              className="focus-ring mt-2 min-h-36 w-full resize-y rounded-lg border border-[color:var(--line)] bg-white px-3 py-3 text-sm leading-6"
              value={body}
              onChange={(event) => setBody(event.currentTarget.value)}
              maxLength={4000}
              placeholder="What happened, what should be added, or what would make this workflow easier?"
              required
            />
          </label>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="focus-ring rounded-lg border border-[color:var(--line)] px-4 py-2.5 text-sm font-semibold text-[color:var(--muted)] hover:bg-stone-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="focus-ring rounded-lg bg-[color:var(--navy)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[color:var(--navy-strong)] disabled:cursor-wait disabled:opacity-70"
            >
              {saving ? "Sending feedback..." : "Send feedback"}
            </button>
          </div>
        </form>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setMessage(null);
          setError(null);
        }}
        className="focus-ring inline-flex items-center justify-center gap-2 rounded-full border border-[rgba(49,95,212,0.22)] bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--navy-strong)] hover:bg-[rgba(49,95,212,0.08)]"
      >
        <MessageSquarePlus size={16} aria-hidden="true" />
        Feedback
      </button>

      {mounted && dialog ? createPortal(dialog, document.body) : null}
    </>
  );
}
