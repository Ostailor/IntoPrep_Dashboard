import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { reviewApprovalRequest } from "@/lib/admin-operations";

export async function PATCH(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    await reviewApprovalRequest({
      viewer: viewer.user,
      requestId: body?.requestId,
      status: body?.status,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Approval review failed." },
      { status: 400 },
    );
  }
}
