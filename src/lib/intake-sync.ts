import "server-only";

import type { IntakeSyncSource, SyncStatus, User } from "@/lib/domain";
import { normalizeSourceUrl } from "@/lib/intake-sync-shared";
import { canRunIntakeImports } from "@/lib/permissions";
import {
  finalizeSyncRun,
  maybeSendSyncAlertEmail,
  startSyncRun,
  upsertSyncJob,
} from "@/lib/sync-jobs";
import type { Database } from "@/lib/supabase/database.types";
import { hasSupabaseServiceRole } from "@/lib/supabase/config";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { importIntakeCsv, type IntakeImportResponse } from "@/lib/intake-import";

type IntakeSyncSourceRow = Database["public"]["Tables"]["intake_sync_sources"]["Row"];

export const DEFAULT_GOOGLE_FORMS_SOURCE_ID = "google-forms-primary";

function normalizeSyncStatus(value: string | null): SyncStatus | null {
  switch (value) {
    case "healthy":
    case "warning":
    case "error":
      return value;
    default:
      return null;
  }
}

function mapSourceRow(row: IntakeSyncSourceRow): IntakeSyncSource {
  return {
    id: row.id,
    label: row.label,
    sourceUrl: row.source_url,
    cadence: row.cadence,
    isActive: row.is_active,
    lastSyncedAt: row.last_synced_at,
    lastSyncStatus: normalizeSyncStatus(row.last_sync_status),
    lastSyncSummary: row.last_sync_summary,
  };
}

function makeSyncFilename() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `google-forms-sync-${stamp}.csv`;
}

async function setSourceStatus({
  sourceId,
  status,
  summary,
  viewerId,
  cadence,
}: {
  sourceId: string;
  status: SyncStatus;
  summary: string;
  viewerId: string;
  cadence: string;
}) {
  const serviceClient = createSupabaseServiceClient();
  const timestamp = new Date().toISOString();

  await Promise.all([
    serviceClient
      .from("intake_sync_sources")
      .update({
        last_synced_at: timestamp,
        last_sync_status: status,
        last_sync_summary: summary,
        updated_by: viewerId,
      })
      .eq("id", sourceId),
    upsertSyncJob({
      id: "sync-forms",
      label: "Google Forms registration import",
      cadence,
      status,
      lastRunAt: timestamp,
      summary,
    }),
  ]);
}

export async function saveGoogleFormsSyncSource({
  viewer,
  sourceUrl,
  label,
  cadence,
  isActive,
}: {
  viewer: User;
  sourceUrl: string;
  label: string;
  cadence: string;
  isActive: boolean;
}) {
  if (!hasSupabaseServiceRole()) {
    throw new Error("Supabase service-role access is required for sync configuration.");
  }

  if (!canRunIntakeImports(viewer.role)) {
    throw new Error("You cannot configure Google Forms sync.");
  }

  const normalizedLabel = label.trim() || "Google Forms linked responses sheet";
  const normalizedCadence = cadence.trim() || "Daily around 7:00 AM ET";
  const normalizedUrl = normalizeSourceUrl(sourceUrl, "Google Forms CSV sync");
  const serviceClient = createSupabaseServiceClient();

  const { data, error } = await serviceClient
    .from("intake_sync_sources")
    .upsert(
      {
        id: DEFAULT_GOOGLE_FORMS_SOURCE_ID,
        label: normalizedLabel,
        source_type: "google_forms_csv_url",
        source_url: normalizedUrl,
        cadence: normalizedCadence,
        is_active: isActive,
        created_by: viewer.id,
        updated_by: viewer.id,
      },
      { onConflict: "id" },
    )
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Google Forms sync source save failed.");
  }

  return mapSourceRow(data as IntakeSyncSourceRow);
}

export async function getGoogleFormsSyncSource() {
  if (!hasSupabaseServiceRole()) {
    return null;
  }

  const serviceClient = createSupabaseServiceClient();
  const { data } = await serviceClient
    .from("intake_sync_sources")
    .select("*")
    .eq("id", DEFAULT_GOOGLE_FORMS_SOURCE_ID)
    .maybeSingle();

  return data ? mapSourceRow(data as IntakeSyncSourceRow) : null;
}

export async function runGoogleFormsSync({
  viewer,
}: {
  viewer: User;
}): Promise<IntakeImportResponse & { source: IntakeSyncSource }> {
  if (!hasSupabaseServiceRole()) {
    throw new Error("Supabase service-role access is required for Google Forms sync.");
  }

  if (!canRunIntakeImports(viewer.role)) {
    throw new Error("You cannot run Google Forms sync.");
  }

  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("intake_sync_sources")
    .select("*")
    .eq("id", DEFAULT_GOOGLE_FORMS_SOURCE_ID)
    .maybeSingle();
  const source = data ? mapSourceRow(data as IntakeSyncSourceRow) : null;

  if (error) {
    throw new Error(error.message);
  }

  if (!source) {
    throw new Error("Configure a Google Forms sync source before running sync.");
  }

  if (!source.isActive) {
    throw new Error("The Google Forms sync source is currently paused.");
  }

  let response: Response;
  const logFetchFailure = async (summary: string) => {
    const run = await startSyncRun({
      jobId: "sync-forms",
      initiatedBy: "linked",
      summary: `Started intake import from ${source.sourceUrl}.`,
    });
    if (!run) {
      throw new Error("That intake sync is already running.");
    }
    const notificationSent = await maybeSendSyncAlertEmail({
      label: "Google Forms registration import",
      status: "error",
      summary,
      detailLines: [summary],
    });
    await finalizeSyncRun({
      run,
      status: "error",
      summary,
      metadata: {
        sourceUrl: source.sourceUrl,
        errorSamples: [summary],
      },
      notificationSent,
    });
  };

  try {
    response = await fetch(source.sourceUrl, {
      cache: "no-store",
      redirect: "follow",
    });
  } catch {
    const summary = "Could not reach the configured Google Forms CSV URL.";
    await setSourceStatus({
      sourceId: source.id,
      status: "error",
      summary,
      viewerId: viewer.id,
      cadence: source.cadence,
    });
    await logFetchFailure(summary);
    throw new Error(summary);
  }

  if (!response.ok) {
    const summary = `Google Forms sync failed with HTTP ${response.status}.`;
    await setSourceStatus({
      sourceId: source.id,
      status: "error",
      summary,
      viewerId: viewer.id,
      cadence: source.cadence,
    });
    await logFetchFailure(summary);
    throw new Error(summary);
  }

  const csvText = await response.text();

  if (csvText.trim().length === 0) {
    const summary = "The configured Google Forms CSV URL returned an empty file.";
    await setSourceStatus({
      sourceId: source.id,
      status: "error",
      summary,
      viewerId: viewer.id,
      cadence: source.cadence,
    });
    await logFetchFailure(summary);
    throw new Error(summary);
  }

  const result = await importIntakeCsv({
    viewer,
    csvText,
    filename: makeSyncFilename(),
    source: "Google Forms CSV",
    cadenceLabel: source.cadence,
  });

  await setSourceStatus({
    sourceId: source.id,
    status:
      result.run.status === "completed"
        ? "healthy"
        : result.run.status === "partial"
          ? "warning"
          : "error",
    summary: result.run.summary,
    viewerId: viewer.id,
    cadence: source.cadence,
  });

  return {
    ...result,
    source,
  };
}
