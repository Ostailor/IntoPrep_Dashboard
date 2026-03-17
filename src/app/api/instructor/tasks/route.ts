import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { persistStaffTaskUpdate } from "@/lib/staff-operations";

export async function PATCH(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await persistStaffTaskUpdate({
      viewer: viewer.user,
      taskId: body?.taskId,
      status: body?.status,
      body: body?.body,
      noteType: body?.noteType,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Task update failed." },
      { status: 400 },
    );
  }
}
