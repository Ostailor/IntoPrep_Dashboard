"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { MessagePost, MessageThread, UserRole } from "@/lib/domain";
import { getPermissionProfile } from "@/lib/permissions";

interface MessagingReplyPanelProps {
  viewerRole: UserRole;
  threads: MessageThread[];
  threadPosts: Record<string, MessagePost[]>;
  readOnly?: boolean;
}

type FeedbackState = {
  tone: "error" | "success";
  message: string;
} | null;

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function MessagingReplyPanel({
  viewerRole,
  threads,
  threadPosts,
  readOnly = false,
}: MessagingReplyPanelProps) {
  const router = useRouter();
  const permissions = getPermissionProfile(viewerRole);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const orderedThreads = useMemo(
    () => [...threads].sort((left, right) => right.lastMessageAt.localeCompare(left.lastMessageAt)),
    [threads],
  );

  const handleReply = (threadId: string) => {
    if (readOnly) {
      setFeedback({ tone: "error", message: "Role preview is read-only." });
      return;
    }

    const draft = drafts[threadId]?.trim() ?? "";

    if (draft.length === 0) {
      setFeedback({ tone: "error", message: "Add a reply before sending." });
      return;
    }

    setPendingThreadId(threadId);
    setFeedback(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/messaging/reply", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            threadId,
            body: draft,
          }),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Reply failed.");
        }

        setDrafts((current) => ({
          ...current,
          [threadId]: "",
        }));
        setFeedback({ tone: "success", message: "Reply sent." });
        router.refresh();
      } catch (error) {
        setFeedback({
          tone: "error",
          message: error instanceof Error ? error.message : "Reply failed.",
        });
      } finally {
        setPendingThreadId(null);
      }
    });
  };

  return (
    <div className="space-y-4">
      {feedback ? (
        <div
          className={clsx(
            "rounded-[1.5rem] border px-4 py-3 text-sm",
            feedback.tone === "success"
              ? "border-emerald-200 bg-emerald-100/90 text-emerald-800"
              : "border-rose-200 bg-rose-100/90 text-rose-800",
          )}
        >
          {feedback.message}
        </div>
      ) : null}

      {orderedThreads.map((thread) => {
        const posts = threadPosts[thread.id] ?? [];
        const pending = pendingThreadId === thread.id;

        return (
          <div
            key={thread.id}
            className="glass-panel rounded-[2rem] border border-white/40 p-5 shadow-[var(--shadow)]"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="section-kicker">Assigned cohort thread</div>
                <h3 className="display-font mt-2 text-2xl text-[color:var(--navy-strong)]">
                  {thread.subject}
                </h3>
                {thread.category ? (
                  <div className="mt-3">
                    <span className="rounded-full border border-[rgba(115,138,123,0.22)] bg-[rgba(115,138,123,0.12)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--sage)]">
                      {thread.category.replaceAll("_", " ")}
                    </span>
                  </div>
                ) : null}
                <p className="mt-3 text-sm text-[color:var(--muted)]">{thread.lastMessagePreview}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-[color:var(--line)] bg-stone-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  {thread.participants.join(" · ")}
                </span>
                <span className="rounded-full border border-[rgba(187,110,69,0.24)] bg-[rgba(187,110,69,0.12)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--copper)]">
                  {thread.unreadCount} unread
                </span>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {(posts.length > 0 ? posts : [
                {
                  id: `${thread.id}-preview`,
                  threadId: thread.id,
                  authorId: null,
                  authorName: "Family",
                  body: thread.lastMessagePreview,
                  createdAt: thread.lastMessageAt,
                },
              ]).map((post) => (
                <div
                  key={post.id}
                  className="rounded-[1.5rem] border border-[color:var(--line)] bg-white/75 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-[color:var(--navy-strong)]">
                      {post.authorName}
                    </div>
                    <div className="text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                      {formatTimestamp(post.createdAt)}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-[color:var(--muted)]">{post.body}</div>
                </div>
              ))}
            </div>

            {permissions.canMessageFamilies ? (
              <div className="mt-5 space-y-3">
                {readOnly ? (
                  <div className="rounded-[1.25rem] border border-[rgba(23,56,75,0.14)] bg-[rgba(23,56,75,0.08)] px-4 py-3 text-sm text-[color:var(--navy-strong)]">
                    Role preview is read-only. Exit preview to reply in this thread.
                  </div>
                ) : null}
                <textarea
                  value={drafts[thread.id] ?? ""}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDrafts((current) => ({
                      ...current,
                      [thread.id]: value,
                    }));
                  }}
                  className="min-h-[96px] w-full rounded-[1.5rem] border border-[color:var(--line)] bg-white/90 px-4 py-3 text-sm text-[color:var(--navy-strong)] outline-none"
                  placeholder="Send a cohort-scoped follow-up to this family thread."
                  disabled={readOnly}
                />
                <button
                  type="button"
                  onClick={() => handleReply(thread.id)}
                  disabled={pending || readOnly}
                  className={clsx(
                    "rounded-full px-4 py-2 text-sm font-semibold text-white",
                    pending || readOnly
                      ? "cursor-not-allowed bg-[rgba(23,56,75,0.46)]"
                      : "bg-[color:var(--navy-strong)] hover:opacity-90",
                  )}
                >
                  {pending ? "Sending..." : readOnly ? "Preview only" : "Send reply"}
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
