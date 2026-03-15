import "server-only";

import { randomUUID } from "node:crypto";
import type { Json } from "@/lib/supabase/database.types";
import type { SyncStatus, User } from "@/lib/domain";
import { hasSupabaseServiceRole } from "@/lib/supabase/config";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const alertEmailFrom = process.env.SYNC_ALERT_EMAIL_FROM?.trim();
const alertEmailTo = process.env.SYNC_ALERT_EMAIL_TO?.trim();
const resendApiKey = process.env.RESEND_API_KEY?.trim();

export interface SyncRunHandle {
  id: string;
  jobId: string;
}

export function getNewYorkLocalDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(value);
}

export function getNewYorkLocalHour(value = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/New_York",
    }).format(value),
  );
}

export async function startSyncRun({
  jobId,
  initiatedBy,
  summary,
  runKey,
}: {
  jobId: string;
  initiatedBy: string;
  summary: string;
  runKey?: string;
}) {
  if (!hasSupabaseServiceRole()) {
    throw new Error("Supabase service role is not configured.");
  }

  const serviceClient = createSupabaseServiceClient();
  const runId = `sync-run-${randomUUID()}`;
  const payload = {
    id: runId,
    job_id: jobId,
    run_key: runKey ?? null,
    initiated_by: initiatedBy,
    status: "running",
    summary,
  };

  const query = serviceClient.from("sync_job_runs").insert(payload).select("id").single();
  const { data, error } = await query;

  if (runKey && error?.code === "23505") {
    return null;
  }

  if (error || !data) {
    throw new Error(error?.message ?? "Could not create a sync run.");
  }

  return {
    id: data.id,
    jobId,
  } satisfies SyncRunHandle;
}

export async function finalizeSyncRun({
  run,
  status,
  summary,
  metadata,
  notificationSent,
}: {
  run: SyncRunHandle;
  status: "running" | "skipped" | SyncStatus;
  summary: string;
  metadata?: Json;
  notificationSent?: boolean;
}) {
  if (!hasSupabaseServiceRole()) {
    return;
  }

  const serviceClient = createSupabaseServiceClient();
  await serviceClient
    .from("sync_job_runs")
    .update({
      status,
      summary,
      metadata: metadata ?? {},
      notification_sent: notificationSent ?? false,
      finished_at: new Date().toISOString(),
    })
    .eq("id", run.id);
}

export async function upsertSyncJob({
  id,
  label,
  cadence,
  status,
  summary,
  lastRunAt,
}: {
  id: string;
  label: string;
  cadence: string;
  status: SyncStatus;
  summary: string;
  lastRunAt?: string;
}) {
  if (!hasSupabaseServiceRole()) {
    throw new Error("Supabase service role is not configured.");
  }

  const serviceClient = createSupabaseServiceClient();
  const { error } = await serviceClient.from("sync_jobs").upsert({
    id,
    label,
    cadence,
    status,
    summary,
    last_run_at: lastRunAt ?? new Date().toISOString(),
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function resolveAutomationViewer() {
  if (!hasSupabaseServiceRole()) {
    throw new Error("Supabase service role is not configured.");
  }

  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("profiles")
    .select("id,full_name,role,title")
    .eq("account_status", "active")
    .in("role", ["engineer", "admin", "staff"])
    .order("created_at", { ascending: true })
    .limit(10);

  if (error || !data || data.length === 0) {
    throw new Error("No active engineer, admin, or staff profile is available for automation.");
  }

  const roleRank = {
    engineer: 0,
    admin: 1,
    staff: 2,
  } as const;
  const profile = [...data].sort(
    (left, right) =>
      (left.role in roleRank ? roleRank[left.role as keyof typeof roleRank] : 99) -
      (right.role in roleRank ? roleRank[right.role as keyof typeof roleRank] : 99),
  )[0];

  return {
    id: profile.id,
    name: profile.full_name ?? "IntoPrep Automation",
    role: profile.role,
    title: profile.title ?? "Automation",
    assignedCohortIds: [],
  } satisfies User;
}

async function resolveSyncAlertRecipients() {
  if (alertEmailTo && alertEmailTo.length > 0) {
    return alertEmailTo
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }

  if (!hasSupabaseServiceRole()) {
    return [];
  }

  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("profiles")
    .select("email")
    .eq("account_status", "active")
    .in("role", ["engineer", "admin"]);

  if (error) {
    return [];
  }

  return (data ?? [])
    .flatMap((profile) => (profile.email ? [profile.email.toLowerCase()] : []))
    .filter(Boolean);
}

export async function maybeSendSyncAlertEmail({
  label,
  status,
  summary,
  detailLines,
}: {
  label: string;
  status: Exclude<SyncStatus, "healthy">;
  summary: string;
  detailLines: string[];
}) {
  if (!resendApiKey || !alertEmailFrom) {
    return false;
  }

  const recipients = await resolveSyncAlertRecipients();

  if (recipients.length === 0) {
    return false;
  }

  const prefix = status === "error" ? "[IntoPrep Sync Error]" : "[IntoPrep Sync Warning]";
  const bodyLines = [summary, "", ...detailLines];
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: alertEmailFrom,
      to: recipients,
      subject: `${prefix} ${label}`,
      text: bodyLines.join("\n"),
    }),
  });

  return response.ok;
}
