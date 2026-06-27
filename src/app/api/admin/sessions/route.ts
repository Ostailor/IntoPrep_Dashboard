import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { createAdminSession, deleteAdminSession, updateAdminSession } from "@/lib/admin-operations";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await createAdminSession({
      viewer: viewer.user,
      cohortId: body?.cohortId,
      title: body?.title,
      startAt: body?.startAt,
      endAt: body?.endAt,
      sessions: body?.sessions,
      roomLabel: body?.roomLabel,
      mode: body?.mode,
      force: Boolean(body?.force),
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Class create failed." },
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
    const result = await updateAdminSession({
      viewer: viewer.user,
      sessionId: body?.sessionId,
      cohortId: body?.cohortId,
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
      { error: error instanceof Error ? error.message : "Class update failed." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await deleteAdminSession({
      viewer: viewer.user,
      sessionId: body?.sessionId,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Class delete failed." },
      { status: 400 },
    );
  }
}
