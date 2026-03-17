import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { setOperationalRecordArchived } from "@/lib/admin-operations";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await setOperationalRecordArchived({
      viewer: viewer.user,
      targetType: body?.targetType,
      targetId: body?.targetId,
      archived: Boolean(body?.archived),
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Archive update failed." },
      { status: 400 },
    );
  }
}
