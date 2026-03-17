import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { persistSessionHandoffNote } from "@/lib/ta-operations";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await persistSessionHandoffNote({
      viewer: viewer.user,
      sessionId: body?.sessionId,
      body: body?.body,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Handoff note save failed." },
      { status: 400 },
    );
  }
}
