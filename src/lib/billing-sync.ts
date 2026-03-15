import "server-only";

import { createHash } from "node:crypto";
import type { BillingSyncRun, BillingSyncSource, SyncStatus, User } from "@/lib/domain";
import { parseCsv } from "@/lib/intake-import";
import { normalizeSourceUrl } from "@/lib/intake-sync-shared";
import { canRunIntakeImports } from "@/lib/permissions";
import { assertWritesAllowed } from "@/lib/engineer-controls";
import {
  finalizeSyncRun,
  maybeSendSyncAlertEmail,
  startSyncRun,
  upsertSyncJob,
} from "@/lib/sync-jobs";
import type { Database } from "@/lib/supabase/database.types";
import { hasSupabaseServiceRole } from "@/lib/supabase/config";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type BillingSyncSourceRow = Database["public"]["Tables"]["billing_sync_sources"]["Row"];
type FamilyRow = Database["public"]["Tables"]["families"]["Row"];

interface ParsedQuickBooksRow {
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  dueDate: string | null;
  balanceDue: number | null;
  explicitStatus: string;
}

const quickBooksHeaderAliases = {
  invoiceNumber: ["invoice no", "invoice number", "invoice #", "doc number", "txn num", "no"],
  customerName: ["customer", "customer name", "display name", "name"],
  customerEmail: ["customer email", "email", "bill email", "billing email", "email address"],
  dueDate: ["due date", "duedate"],
  balanceDue: ["balance due", "balance", "amount due", "open balance"],
  explicitStatus: ["status", "invoice status", "txn status"],
} as const;

export const DEFAULT_BILLING_SOURCE_ID = "quickbooks-primary";

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s/#]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function resolveHeaderValue(row: Record<string, string>, aliases: readonly string[]) {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)];
    if (typeof value === "string" && value.trim().length > 0) {
      return normalizeText(value);
    }
  }

  return "";
}

function normalizeMoney(value: string) {
  if (!value) {
    return null;
  }

  const cleaned = value.replace(/[$,]/g, "").trim();

  if (cleaned.length === 0) {
    return null;
  }

  const isNegative = cleaned.startsWith("(") && cleaned.endsWith(")");
  const parsed = Number.parseFloat(cleaned.replace(/[()]/g, ""));

  if (Number.isNaN(parsed)) {
    return null;
  }

  return Math.round((isNegative ? -parsed : parsed) * 100) / 100;
}

function normalizeDate(value: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function buildInvoiceId(invoiceNumber: string, customerName: string, dueDate: string | null) {
  const digest = createHash("sha1")
    .update(`${invoiceNumber}|${customerName}|${dueDate ?? "na"}`)
    .digest("hex")
    .slice(0, 18);
  return `invoice-qbo-${digest}`;
}

function inferInvoiceStatus(
  explicitStatus: string,
  balanceDue: number | null,
  dueDate: string | null,
) {
  const normalizedStatus = normalizeHeader(explicitStatus);

  if (normalizedStatus.includes("paid")) {
    return "paid" as const;
  }

  if ((balanceDue ?? 0) <= 0) {
    return "paid" as const;
  }

  if (!dueDate) {
    return "pending" as const;
  }

  return dueDate < new Date().toISOString().slice(0, 10) ? "overdue" : "pending";
}

function findFamilyMatch(
  row: ParsedQuickBooksRow,
  familyByEmail: Map<string, Pick<FamilyRow, "id" | "family_name" | "email">>,
  families: Pick<FamilyRow, "id" | "family_name" | "email">[],
) {
  const directEmailMatch = row.customerEmail ? familyByEmail.get(row.customerEmail) : null;
  if (directEmailMatch) {
    return directEmailMatch;
  }

  const normalizedCustomer = normalizeHeader(row.customerName);
  if (!normalizedCustomer) {
    return null;
  }

  return (
    families.find((family) => {
      const normalizedFamily = normalizeHeader(family.family_name);
      return (
        normalizedCustomer === normalizedFamily ||
        normalizedCustomer.includes(normalizedFamily) ||
        normalizedFamily.includes(normalizedCustomer)
      );
    }) ?? null
  );
}

function summarizeQuickBooksRun({
  filename,
  importedCount,
  matchedCount,
  warningCount,
}: {
  filename: string;
  importedCount: number;
  matchedCount: number;
  warningCount: number;
}) {
  const importedLabel = importedCount === 1 ? "invoice row" : "invoice rows";
  const matchedLabel = matchedCount === 1 ? "invoice matched" : "invoices matched";
  const warningLabel = warningCount === 1 ? "warning" : "warnings";
  return `Processed ${importedCount} ${importedLabel} from ${filename}. ${matchedCount} ${matchedLabel}.${warningCount > 0 ? ` ${warningCount} ${warningLabel}.` : ""}`;
}

function parseQuickBooksRows(csvText: string) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    throw new Error("Add at least one QuickBooks invoice row.");
  }

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((header) => normalizeHeader(header));

  return dataRows.map((cells) => {
    const row = headers.reduce<Record<string, string>>((record, header, index) => {
      record[header] = cells[index] ?? "";
      return record;
    }, {});

    return {
      invoiceNumber: resolveHeaderValue(row, quickBooksHeaderAliases.invoiceNumber),
      customerName: resolveHeaderValue(row, quickBooksHeaderAliases.customerName),
      customerEmail: normalizeEmail(
        resolveHeaderValue(row, quickBooksHeaderAliases.customerEmail),
      ),
      dueDate: normalizeDate(resolveHeaderValue(row, quickBooksHeaderAliases.dueDate)),
      balanceDue: normalizeMoney(resolveHeaderValue(row, quickBooksHeaderAliases.balanceDue)),
      explicitStatus: resolveHeaderValue(row, quickBooksHeaderAliases.explicitStatus),
    } satisfies ParsedQuickBooksRow;
  });
}

function mapBillingSourceRow(row: BillingSyncSourceRow): BillingSyncSource {
  return {
    id: row.id,
    label: row.label,
    sourceUrl: row.source_url,
    cadence: row.cadence,
    isActive: row.is_active,
    lastSyncedAt: row.last_synced_at,
    lastSyncStatus:
      row.last_sync_status === "healthy" ||
      row.last_sync_status === "warning" ||
      row.last_sync_status === "error"
        ? row.last_sync_status
        : null,
    lastSyncSummary: row.last_sync_summary,
    controlState:
      row.control_state === "active" ||
      row.control_state === "paused" ||
      row.control_state === "maintenance"
        ? row.control_state
        : "active",
    ownerId: row.owner_id,
    ownerName: null,
    handoffNotes: row.handoff_notes,
    changedAt: row.changed_at,
    runbookUrl: row.runbook_url,
  };
}

async function setBillingSourceStatus({
  sourceId,
  viewerId,
  cadence,
  status,
  summary,
}: {
  sourceId: string;
  viewerId: string;
  cadence: string;
  status: SyncStatus;
  summary: string;
}) {
  const serviceClient = createSupabaseServiceClient();
  const timestamp = new Date().toISOString();

  await Promise.all([
    serviceClient
      .from("billing_sync_sources")
      .update({
        last_synced_at: timestamp,
        last_sync_status: status,
        last_sync_summary: summary,
        updated_by: viewerId,
      })
      .eq("id", sourceId),
    upsertSyncJob({
      id: "sync-quickbooks",
      label: "QuickBooks invoice snapshot",
      cadence,
      status,
      summary,
      lastRunAt: timestamp,
    }),
  ]);
}

export async function saveQuickBooksSyncSource({
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
    throw new Error("Supabase service-role access is required for QuickBooks sync.");
  }

  if (!canRunIntakeImports(viewer.role)) {
    throw new Error("You cannot configure QuickBooks sync.");
  }

  await assertWritesAllowed("integration_writes");

  const normalizedUrl = normalizeSourceUrl(sourceUrl, "QuickBooks CSV sync");
  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("billing_sync_sources")
    .upsert(
      {
        id: DEFAULT_BILLING_SOURCE_ID,
        label: label.trim() || "QuickBooks invoice export",
        source_type: "quickbooks_csv_url",
        source_url: normalizedUrl,
        cadence: cadence.trim() || "Daily around 7:00 AM ET",
        is_active: isActive,
        control_state: isActive ? "active" : "paused",
        created_by: viewer.id,
        updated_by: viewer.id,
        changed_by: viewer.id,
        changed_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "QuickBooks sync source save failed.");
  }

  return mapBillingSourceRow(data as BillingSyncSourceRow);
}

export async function getQuickBooksSyncSource() {
  if (!hasSupabaseServiceRole()) {
    return null;
  }

  const serviceClient = createSupabaseServiceClient();
  const { data } = await serviceClient
    .from("billing_sync_sources")
    .select("*")
    .eq("id", DEFAULT_BILLING_SOURCE_ID)
    .maybeSingle();

  return data ? mapBillingSourceRow(data as BillingSyncSourceRow) : null;
}

export async function importQuickBooksCsv({
  viewer,
  csvText,
  filename,
  initiatedBy,
  cadenceLabel,
}: {
  viewer: User;
  csvText: string;
  filename: string;
  initiatedBy: "manual" | "linked" | "cron";
  cadenceLabel: string;
}): Promise<BillingSyncRun> {
  if (!hasSupabaseServiceRole()) {
    throw new Error("Supabase service-role access is required for QuickBooks sync.");
  }

  if (!canRunIntakeImports(viewer.role)) {
    throw new Error("You cannot run QuickBooks sync.");
  }

  await assertWritesAllowed("integration_writes");

  const run = await startSyncRun({
    jobId: "sync-quickbooks",
    initiatedBy,
    summary: `Started QuickBooks sync from ${filename}.`,
  });
  if (!run) {
    throw new Error("That QuickBooks sync is already running.");
  }

  try {
    const parsedRows = parseQuickBooksRows(csvText);
    const validRows = parsedRows.filter(
      (row) => row.customerName.length > 0 && (row.balanceDue !== null || row.explicitStatus.length > 0),
    );

    if (validRows.length === 0) {
      throw new Error("No valid QuickBooks invoice rows were found.");
    }

    const serviceClient = createSupabaseServiceClient();
    const { data: familiesData, error: familyError } = await serviceClient
      .from("families")
      .select("id,family_name,email");

    if (familyError) {
      throw new Error(familyError.message);
    }

    const families = (familiesData ?? []) as Pick<FamilyRow, "id" | "family_name" | "email">[];
    const familyByEmail = new Map(
      families.map((family) => [family.email.toLowerCase(), family]),
    );

    const invoiceUpserts = new Map<string, Database["public"]["Tables"]["invoices"]["Insert"]>();
    const warnings: string[] = [];

    validRows.forEach((row, index) => {
      const family = findFamilyMatch(row, familyByEmail, families);

      if (!family) {
        warnings.push(
          `Row ${index + 2}: could not match ${row.customerName || row.customerEmail || "invoice"} to a family.`,
        );
        return;
      }

      const invoiceId = buildInvoiceId(
        row.invoiceNumber || family.id,
        row.customerName || family.family_name,
        row.dueDate,
      );
      const balanceDue = Math.max(0, Math.round((row.balanceDue ?? 0)));
      const status = inferInvoiceStatus(row.explicitStatus, row.balanceDue, row.dueDate);

      invoiceUpserts.set(invoiceId, {
        id: invoiceId,
        family_id: family.id,
        amount_due: balanceDue,
        due_date: row.dueDate ?? new Date().toISOString().slice(0, 10),
        status,
        source: "QuickBooks",
      });
    });

    if (invoiceUpserts.size === 0) {
      throw new Error("No QuickBooks invoice rows could be matched to IntoPrep families.");
    }

    const { error: invoiceError } = await serviceClient
      .from("invoices")
      .upsert(Array.from(invoiceUpserts.values()));

    if (invoiceError) {
      throw new Error(invoiceError.message);
    }

    const status: SyncStatus = warnings.length > 0 ? "warning" : "healthy";
    const summary = summarizeQuickBooksRun({
      filename,
      importedCount: validRows.length,
      matchedCount: invoiceUpserts.size,
      warningCount: warnings.length,
    });
    await upsertSyncJob({
      id: "sync-quickbooks",
      label: "QuickBooks invoice snapshot",
      cadence: cadenceLabel,
      status,
      summary,
    });
    const notificationSent =
      status === "warning"
        ? await maybeSendSyncAlertEmail({
            label: "QuickBooks invoice snapshot",
            status,
            summary,
            detailLines: warnings.length > 0 ? warnings : [summary],
          })
        : false;
    await finalizeSyncRun({
      run,
      status,
      summary,
      metadata: {
        filename,
        importedCount: validRows.length,
        matchedCount: invoiceUpserts.size,
        warningCount: warnings.length,
        errorSamples: warnings.slice(0, 5),
      },
      notificationSent,
    });

    return {
      status,
      summary,
      importedCount: validRows.length,
      matchedCount: invoiceUpserts.size,
      warningCount: warnings.length,
      errorSamples: warnings.slice(0, 5),
    };
  } catch (error) {
    const summary = error instanceof Error ? error.message : "QuickBooks sync failed.";
    const notificationSent = await maybeSendSyncAlertEmail({
      label: "QuickBooks invoice snapshot",
      status: "error",
      summary,
      detailLines: [summary],
    });
    await upsertSyncJob({
      id: "sync-quickbooks",
      label: "QuickBooks invoice snapshot",
      cadence: cadenceLabel,
      status: "error",
      summary,
    });
    await finalizeSyncRun({
      run,
      status: "error",
      summary,
      metadata: {
        filename,
        importedCount: 0,
        matchedCount: 0,
        warningCount: 0,
        errorSamples: [summary],
      },
      notificationSent,
    });
    throw error;
  }
}

export async function runQuickBooksSync({
  viewer,
}: {
  viewer: User;
}): Promise<BillingSyncRun & { source: BillingSyncSource }> {
  if (!hasSupabaseServiceRole()) {
    throw new Error("Supabase service-role access is required for QuickBooks sync.");
  }

  if (!canRunIntakeImports(viewer.role)) {
    throw new Error("You cannot run QuickBooks sync.");
  }

  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("billing_sync_sources")
    .select("*")
    .eq("id", DEFAULT_BILLING_SOURCE_ID)
    .maybeSingle();
  const source = data ? mapBillingSourceRow(data as BillingSyncSourceRow) : null;

  if (error) {
    throw new Error(error.message);
  }

  if (!source) {
    throw new Error("Configure a QuickBooks sync source before running sync.");
  }

  if (!source.isActive || source.controlState === "paused") {
    throw new Error("The QuickBooks sync source is currently paused.");
  }

  if (source.controlState === "maintenance") {
    throw new Error("The QuickBooks sync source is currently in maintenance mode.");
  }

  let response: Response;
  const logFetchFailure = async (summary: string) => {
    const run = await startSyncRun({
      jobId: "sync-quickbooks",
      initiatedBy: "linked",
      summary: `Started QuickBooks sync from ${source.sourceUrl}.`,
    });
    if (!run) {
      throw new Error("That QuickBooks sync is already running.");
    }
    const notificationSent = await maybeSendSyncAlertEmail({
      label: "QuickBooks invoice snapshot",
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
    const summary = "Could not reach the configured QuickBooks CSV URL.";
    await setBillingSourceStatus({
      sourceId: source.id,
      viewerId: viewer.id,
      cadence: source.cadence,
      status: "error",
      summary,
    });
    await logFetchFailure(summary);
    throw new Error(summary);
  }

  if (!response.ok) {
    const summary = `QuickBooks sync failed with HTTP ${response.status}.`;
    await setBillingSourceStatus({
      sourceId: source.id,
      viewerId: viewer.id,
      cadence: source.cadence,
      status: "error",
      summary,
    });
    await logFetchFailure(summary);
    throw new Error(summary);
  }

  const csvText = await response.text();
  if (csvText.trim().length === 0) {
    const summary = "The configured QuickBooks CSV URL returned an empty file.";
    await setBillingSourceStatus({
      sourceId: source.id,
      viewerId: viewer.id,
      cadence: source.cadence,
      status: "error",
      summary,
    });
    await logFetchFailure(summary);
    throw new Error(summary);
  }

  const filename = `quickbooks-sync-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
  const result = await importQuickBooksCsv({
    viewer,
    csvText,
    filename,
    initiatedBy: "linked",
    cadenceLabel: source.cadence,
  });

  await setBillingSourceStatus({
    sourceId: source.id,
    viewerId: viewer.id,
    cadence: source.cadence,
    status: result.status,
    summary: result.summary,
  });

  return {
    ...result,
    source,
  };
}
