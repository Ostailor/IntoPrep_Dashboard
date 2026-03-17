import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { updateLeadOwnership } from "@/lib/staff-operations";

export async function PATCH(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    await updateLeadOwnership({
      viewer: viewer.user,
      leadId: body?.leadId,
      action: body?.action,
      stage: body?.stage,
      notes: body?.notes,
      followUpDueAt: body?.followUpDueAt,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lead update failed." },
      { status: 400 },
    );
  }
}
