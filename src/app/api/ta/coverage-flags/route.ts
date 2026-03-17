import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { persistSessionCoverageFlag } from "@/lib/ta-operations";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    await persistSessionCoverageFlag({
      viewer: viewer.user,
      sessionId: body?.sessionId,
      status: body?.status,
      note: body?.note,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Coverage update failed." },
      { status: 400 },
    );
  }
}
