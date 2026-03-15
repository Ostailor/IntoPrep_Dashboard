import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { updateIntegrationControlState } from "@/lib/engineer-controls";
import type { IntegrationControlState } from "@/lib/domain";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer || viewer.user.role !== "engineer") {
    return NextResponse.json({ error: "Engineer access is required." }, { status: 403 });
  }

  const body = await request.json();
  const { sourceType, sourceId, controlState, ownerId, handoffNotes, issueReference } = body ?? {};

  if (
    typeof sourceType !== "string" ||
    typeof sourceId !== "string" ||
    typeof controlState !== "string" ||
    typeof issueReference !== "string"
  ) {
    return NextResponse.json({ error: "Invalid integration-control payload." }, { status: 400 });
  }

  try {
    await updateIntegrationControlState({
      viewer: viewer.user,
      sourceType: sourceType === "billing" ? "billing" : "intake",
      sourceId,
      controlState: controlState as IntegrationControlState,
      ownerId: typeof ownerId === "string" ? ownerId : null,
      handoffNotes: typeof handoffNotes === "string" ? handoffNotes : null,
      issueReference,
    });

    return NextResponse.json({ ok: true });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Integration control update failed." },
      { status: 400 },
    );
  }
}
