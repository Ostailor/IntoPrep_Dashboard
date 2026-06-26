import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { persistAdminTask } from "@/lib/admin-operations";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const task = await persistAdminTask({
      viewer: viewer.user,
      taskType: body?.taskType,
      targetType: body?.targetType,
      targetId: body?.targetId,
      title: body?.title,
      details: body?.details,
      assignedTo: body?.assignedTo,
      dueAt: body?.dueAt,
      status: body?.status,
      comment: body?.comment,
      noteType: body?.noteType,
      lifecycleState: body?.lifecycleState,
    });
    return NextResponse.json({ ok: true, task });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Task save failed." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const task = await persistAdminTask({
      viewer: viewer.user,
      taskId: body?.taskId,
      taskType: body?.taskType,
      targetType: body?.targetType,
      targetId: body?.targetId,
      title: body?.title,
      details: body?.details,
      assignedTo: body?.assignedTo,
      dueAt: body?.dueAt,
      status: body?.status,
      comment: body?.comment,
      noteType: body?.noteType,
      lifecycleState: body?.lifecycleState,
    });
    return NextResponse.json({ ok: true, task });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Task update failed." },
      { status: 400 },
    );
  }
}
