import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { runEngineerRepairAction } from "@/lib/engineer-controls";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer || viewer.user.role !== "engineer") {
    return NextResponse.json({ error: "Engineer access is required." }, { status: 403 });
  }

  const body = await request.json();
  const { action, targetId, issueReference } = body ?? {};

  if (
    typeof action !== "string" ||
    typeof targetId !== "string" ||
    typeof issueReference !== "string"
  ) {
    return NextResponse.json({ error: "Invalid repair-action payload." }, { status: 400 });
  }

  try {
    const summary = await runEngineerRepairAction({
      viewer: viewer.user,
      action:
        action === "replay_sync" ||
        action === "rerun_import" ||
        action === "rebuild_cohort" ||
        action === "rebuild_family"
          ? action
          : "retry_sync",
      targetId,
      issueReference,
    });

    return NextResponse.json({ ok: true, summary });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Repair action failed." },
      { status: 400 },
    );
  }
}
