import { NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { getPermissionProfile } from "@/lib/permissions";
import { persistMessageReply } from "@/lib/live-writes";

export async function POST(request: Request) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!getPermissionProfile(viewer.user.role).canMessageFamilies) {
    return NextResponse.json({ error: "You cannot reply to threads." }, { status: 403 });
  }

  const body = await request.json();
  const { threadId, body: messageBody } = body ?? {};

  if (typeof threadId !== "string" || typeof messageBody !== "string") {
    return NextResponse.json({ error: "Invalid reply payload." }, { status: 400 });
  }

  try {
    const result = await persistMessageReply({
      viewer: viewer.user,
      threadId,
      body: messageBody,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reply failed." },
      { status: 400 },
    );
  }
}
