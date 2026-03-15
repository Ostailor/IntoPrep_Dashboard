import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { updateSyncJobIncidentState } from "@/lib/engineer-controls";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer || viewer.user.role !== "engineer") {
    return NextResponse.json({ error: "Engineer access is required." }, { status: 403 });
  }

  const body = await request.json();
  const { jobId, ownerId, handoffNotes, mutedUntil, acknowledge, issueReference } = body ?? {};

  if (typeof jobId !== "string" || typeof issueReference !== "string") {
    return NextResponse.json({ error: "Invalid incident payload." }, { status: 400 });
  }

  try {
    await updateSyncJobIncidentState({
      viewer: viewer.user,
      jobId,
      ownerId: typeof ownerId === "string" ? ownerId : null,
      handoffNotes: typeof handoffNotes === "string" ? handoffNotes : null,
      mutedUntil: typeof mutedUntil === "string" ? mutedUntil : null,
      acknowledge: Boolean(acknowledge),
      issueReference,
    });

    return NextResponse.json({ ok: true });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Incident update failed." },
      { status: 400 },
    );
  }
}
