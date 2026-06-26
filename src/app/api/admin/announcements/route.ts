import { NextRequest, NextResponse } from "next/server";
import { persistAdminAnnouncement } from "@/lib/admin-operations";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const announcement = await persistAdminAnnouncement({
      viewer: viewer.user,
      announcementId: body?.announcementId,
      title: body?.title,
      body: body?.body,
      tone: body?.tone,
      visibleRoles: body?.visibleRoles,
      expiresAt: body?.expiresAt,
      isActive: body?.isActive,
    });
    return NextResponse.json({ ok: true, announcement });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Announcement save failed." },
      { status: 400 },
    );
  }
}
