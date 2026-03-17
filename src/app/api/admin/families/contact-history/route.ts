import { NextRequest, NextResponse } from "next/server";
import { persistFamilyContactEvent } from "@/lib/admin-operations";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    await persistFamilyContactEvent({
      viewer: viewer.user,
      familyId: body?.familyId,
      contactSource: body?.contactSource,
      summary: body?.summary,
      outcome: body?.outcome,
      contactAt: body?.contactAt,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Contact history update failed." },
      { status: 400 },
    );
  }
}
