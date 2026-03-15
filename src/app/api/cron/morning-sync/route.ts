import { NextRequest, NextResponse } from "next/server";
import { getGoogleFormsSyncSource, runGoogleFormsSync } from "@/lib/intake-sync";
import { getQuickBooksSyncSource, runQuickBooksSync } from "@/lib/billing-sync";
import {
  finalizeSyncRun,
  getNewYorkLocalDate,
  getNewYorkLocalHour,
  maybeSendSyncAlertEmail,
  resolveAutomationViewer,
  startSyncRun,
  upsertSyncJob,
} from "@/lib/sync-jobs";

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    return process.env.NODE_ENV !== "production";
  }

  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Not authorized for cron execution." }, { status: 401 });
  }

  const localDate = getNewYorkLocalDate();
  const localHour = getNewYorkLocalHour();
  const run = await startSyncRun({
    jobId: "sync-morning-ops",
    initiatedBy: "cron",
    runKey: localDate,
    summary: `Morning linked sync bundle started for ${localDate}.`,
  });

  if (!run) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `Morning linked sync already ran for ${localDate}.`,
    });
  }

  if (localHour !== 7) {
    const summary = `Skipped cron invocation because local New York time was ${localHour}:00, outside the 7 AM window.`;
    await upsertSyncJob({
      id: "sync-morning-ops",
      label: "Morning linked sync bundle",
      cadence: "Daily around 7:00 AM ET",
      status: "healthy",
      summary,
    });
    await finalizeSyncRun({
      run,
      status: "skipped",
      summary,
      metadata: {
        localDate,
        localHour,
      },
    });

    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: summary,
    });
  }

  try {
    const viewer = await resolveAutomationViewer();
    const outcomes: string[] = [];
    const statuses: Array<"healthy" | "warning" | "error"> = [];

    const [googleSource, billingSource] = await Promise.all([
      getGoogleFormsSyncSource(),
      getQuickBooksSyncSource(),
    ]);

    if (googleSource?.isActive) {
      try {
        const result = await runGoogleFormsSync({ viewer });
        const status =
          result.run.status === "completed"
            ? "healthy"
            : result.run.status === "partial"
              ? "warning"
              : "error";
        statuses.push(status);
        outcomes.push(`Google Forms: ${result.run.summary}`);
      } catch (error) {
        statuses.push("error");
        outcomes.push(
          `Google Forms: ${error instanceof Error ? error.message : "Sync failed."}`,
        );
      }
    } else {
      outcomes.push("Google Forms: skipped because no active linked source is configured.");
    }

    if (billingSource?.isActive) {
      try {
        const result = await runQuickBooksSync({ viewer });
        statuses.push(result.status);
        outcomes.push(`QuickBooks: ${result.summary}`);
      } catch (error) {
        statuses.push("error");
        outcomes.push(
          `QuickBooks: ${error instanceof Error ? error.message : "Sync failed."}`,
        );
      }
    } else {
      outcomes.push("QuickBooks: skipped because no active linked source is configured.");
    }

    const status =
      statuses.includes("error")
        ? "error"
        : statuses.includes("warning")
          ? "warning"
          : "healthy";
    const summary =
      statuses.length > 0
        ? `Morning linked sync bundle completed for ${localDate}.`
        : `Morning linked sync bundle checked in for ${localDate}; no active linked sources were configured.`;
    const notificationSent =
      status === "warning" || status === "error"
        ? await maybeSendSyncAlertEmail({
            label: "Morning linked sync bundle",
            status,
            summary,
            detailLines: outcomes,
          })
        : false;

    await upsertSyncJob({
      id: "sync-morning-ops",
      label: "Morning linked sync bundle",
      cadence: "Daily around 7:00 AM ET",
      status,
      summary,
    });
    await finalizeSyncRun({
      run,
      status,
      summary,
      metadata: {
        localDate,
        localHour,
        outcomes,
      },
      notificationSent,
    });

    return NextResponse.json({
      ok: true,
      status,
      summary,
      outcomes,
    });
  } catch (error) {
    const summary =
      error instanceof Error ? error.message : "Morning linked sync bundle failed.";
    const notificationSent = await maybeSendSyncAlertEmail({
      label: "Morning linked sync bundle",
      status: "error",
      summary,
      detailLines: [summary],
    });
    await upsertSyncJob({
      id: "sync-morning-ops",
      label: "Morning linked sync bundle",
      cadence: "Daily around 7:00 AM ET",
      status: "error",
      summary,
    });
    await finalizeSyncRun({
      run,
      status: "error",
      summary,
      metadata: {
        localDate,
        localHour,
        error: summary,
      },
      notificationSent,
    });

    return NextResponse.json({ error: summary }, { status: 500 });
  }
}
