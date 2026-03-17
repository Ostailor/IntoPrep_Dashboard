import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { createAdminEscalation } from "@/lib/staff-operations";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await createAdminEscalation({
      viewer: viewer.user,
      sourceType: body?.sourceType,
      sourceId: body?.sourceId,
      reason: body?.reason,
      handoffNote: body?.handoffNote,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Escalation failed." },
      { status: 400 },
    );
  }
}
