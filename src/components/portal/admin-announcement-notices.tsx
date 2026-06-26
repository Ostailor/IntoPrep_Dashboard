"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import type { AdminAnnouncement } from "@/lib/domain";

export const ANNOUNCEMENT_CANCELLED_EVENT = "intoprep:announcement-cancelled";

export function getAnnouncementToneClass(tone: AdminAnnouncement["tone"]) {
  return tone === "warning"
    ? "border-amber-200 bg-amber-100 text-amber-900"
    : "border-sky-200 bg-sky-100 text-sky-900";
}

function getStorageKey(viewerId: string) {
  return `intoprep:dismissed-announcements:${viewerId}`;
}

function readDismissedIds(viewerId: string) {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(getStorageKey(viewerId)) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

export function AdminAnnouncementNotices({
  announcements,
  viewerId,
  className,
}: {
  announcements: AdminAnnouncement[];
  viewerId: string;
  className?: string;
}) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setDismissedIds(readDismissedIds(viewerId));
  }, [viewerId]);

  useEffect(() => {
    const handleCancelledAnnouncement = (event: Event) => {
      const announcementId = (event as CustomEvent<{ announcementId?: string }>).detail
        ?.announcementId;

      if (!announcementId) {
        return;
      }

      setDismissedIds((current) => {
        const next = new Set(current);
        next.add(announcementId);
        return next;
      });
    };

    window.addEventListener(ANNOUNCEMENT_CANCELLED_EVENT, handleCancelledAnnouncement);
    return () => {
      window.removeEventListener(ANNOUNCEMENT_CANCELLED_EVENT, handleCancelledAnnouncement);
    };
  }, []);

  const visibleAnnouncements = useMemo(
    () => announcements.filter((announcement) => !dismissedIds.has(announcement.id)),
    [announcements, dismissedIds],
  );

  const dismissAnnouncement = (announcementId: string) => {
    setDismissedIds((current) => {
      const next = new Set(current);
      next.add(announcementId);
      window.localStorage.setItem(getStorageKey(viewerId), JSON.stringify(Array.from(next)));
      return next;
    });
  };

  if (visibleAnnouncements.length === 0) {
    return null;
  }

  return (
    <div className={clsx("space-y-3", className)}>
      {visibleAnnouncements.map((announcement) => (
        <div
          key={announcement.id}
          className={clsx(
            "rounded-lg border px-5 py-4 text-sm shadow-[var(--shadow)]",
            getAnnouncementToneClass(announcement.tone),
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="font-semibold">{announcement.title}</div>
              <div className="mt-1 leading-6">{announcement.body}</div>
            </div>
            <button
              type="button"
              onClick={() => dismissAnnouncement(announcement.id)}
              className="focus-ring rounded-lg border border-current/20 p-1.5 opacity-80 hover:opacity-100"
              aria-label={`Dismiss ${announcement.title}`}
              title="Dismiss announcement"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
