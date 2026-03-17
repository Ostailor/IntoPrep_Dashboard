import { NextRequest, NextResponse } from "next/server";
import { deleteAdminSavedView, persistAdminSavedView } from "@/lib/admin-operations";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const viewId = await persistAdminSavedView({
      viewer: viewer.user,
      viewId: body?.viewId,
      name: body?.name,
      section: body?.section,
      filterState: body?.filterState,
    });
    return NextResponse.json({ ok: true, viewId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Saved view failed." },
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
    await deleteAdminSavedView({
      viewer: viewer.user,
      viewId: body?.viewId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Saved view delete failed." },
      { status: 400 },
    );
  }
}
