import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { updateAdminCohortOperation } from "@/lib/admin-operations";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await updateAdminCohortOperation({
      viewer: viewer.user,
      cohortId: body?.cohortId,
      capacity: typeof body?.capacity === "number" ? body.capacity : undefined,
      cadence: body?.cadence,
      roomLabel: body?.roomLabel,
      leadInstructorId: body?.leadInstructorId,
      sessionId: body?.sessionId,
      sessionTitle: body?.sessionTitle,
      sessionStartAt: body?.sessionStartAt,
      sessionEndAt: body?.sessionEndAt,
      sessionMode: body?.sessionMode,
      sessionRoomLabel: body?.sessionRoomLabel,
      force: Boolean(body?.force),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cohort update failed." },
      { status: 400 },
    );
  }
}
