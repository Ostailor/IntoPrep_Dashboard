"use client";

import { useEffect, useEffectEvent, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type { PortalSection } from "@/lib/domain";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const sectionSyncTables: Record<PortalSection, string[]> = {
  dashboard: [
    "attendance_records",
    "assessment_results",
    "cohorts",
    "enrollments",
    "invoices",
    "intake_import_runs",
    "leads",
    "message_posts",
    "sessions",
    "sync_jobs",
  ],
  calendar: ["sessions", "cohorts", "enrollments", "attendance_records"],
  cohorts: ["cohorts", "sessions", "enrollments", "attendance_records", "assessment_results"],
  attendance: ["attendance_records", "sessions", "assessment_results"],
  students: ["students", "families", "enrollments", "assessment_results", "academic_notes"],
  families: ["families", "students", "academic_notes", "assessment_results"],
  programs: ["programs", "terms", "campuses", "cohorts", "sessions", "cohort_assignments"],
  academics: ["academic_notes", "assessment_results", "assessments", "resources", "enrollments"],
  messaging: ["message_threads", "message_posts"],
  billing: ["invoices", "billing_sync_sources", "sync_jobs"],
  integrations: ["sync_jobs", "intake_import_runs", "intake_sync_sources", "billing_sync_sources"],
  settings: ["profiles", "user_templates", "cohort_assignments", "account_audit_logs"],
};

function unique(values: string[]) {
  return Array.from(new Set(values));
}

export function PortalLiveSync({
  enabled,
  section,
}: {
  enabled: boolean;
  section: PortalSection;
}) {
  const router = useRouter();
  const refreshTimerRef = useRef<number | null>(null);
  const refreshIntervalRef = useRef<number | null>(null);
  const tables = useMemo(() => unique(sectionSyncTables[section] ?? []), [section]);

  const queueRefresh = useEffectEvent(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = window.setTimeout(() => {
      router.refresh();
    }, 350);
  });

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    const handleFocus = () => {
      queueRefresh();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        queueRefresh();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    refreshIntervalRef.current = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        queueRefresh();
      }
    }, 30000);

    let unsubscribeRealtime: (() => void) | null = null;

    try {
      const supabase = createSupabaseBrowserClient();
      const channel = supabase.channel(`portal-sync:${section}`);

      tables.forEach((table) => {
        channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table,
          },
          () => {
            queueRefresh();
          },
        );
      });

      channel.subscribe();
      unsubscribeRealtime = () => {
        void supabase.removeChannel(channel);
      };
    } catch {
      unsubscribeRealtime = null;
    }

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }

      if (refreshIntervalRef.current !== null) {
        window.clearInterval(refreshIntervalRef.current);
      }

      unsubscribeRealtime?.();
    };
  }, [enabled, section, tables]);

  return null;
}
