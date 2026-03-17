import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { persistInstructorFollowUpFlag } from "@/lib/instructor-operations";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await persistInstructorFollowUpFlag({
      viewer: viewer.user,
      targetType: body?.targetType,
      targetId: body?.targetId,
      summary: body?.summary,
      note: body?.note,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Follow-up flag save failed." },
      { status: 400 },
    );
  }
}
