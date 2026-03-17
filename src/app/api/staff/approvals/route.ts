import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { persistApprovalRequest } from "@/lib/staff-operations";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await persistApprovalRequest({
      viewer: viewer.user,
      requestId: body?.requestId,
      requestType: body?.requestType,
      targetType: body?.targetType,
      targetId: body?.targetId,
      reason: body?.reason,
      handoffNote: body?.handoffNote,
      status: body?.status,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Approval request failed." },
      { status: 400 },
    );
  }
}
