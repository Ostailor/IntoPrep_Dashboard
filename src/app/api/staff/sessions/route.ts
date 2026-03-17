import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { updateStaffSession } from "@/lib/staff-operations";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await updateStaffSession({
      viewer: viewer.user,
      sessionId: body?.sessionId,
      title: body?.title,
      startAt: body?.startAt,
      endAt: body?.endAt,
      roomLabel: body?.roomLabel,
      mode: body?.mode,
      force: Boolean(body?.force),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Session update failed." },
      { status: 400 },
    );
  }
}
