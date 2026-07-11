import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { revalidatePortalLiveCache } from "@/lib/cache-invalidation";
import {
  deleteSessionInstructionBlock,
  persistSessionInstructionBlock,
} from "@/lib/session-instruction-blocks";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await persistSessionInstructionBlock({
      viewer: viewer.user,
      blockId: body?.blockId,
      sessionId: body?.sessionId,
      instructorId: body?.instructorId,
      title: body?.title,
      startAt: body?.startAt,
      endAt: body?.endAt,
    });
    revalidatePortalLiveCache();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Teaching schedule update failed." },
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
    await deleteSessionInstructionBlock({
      viewer: viewer.user,
      blockId: body?.blockId,
    });
    revalidatePortalLiveCache();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Teaching schedule update failed." },
      { status: 400 },
    );
  }
}
