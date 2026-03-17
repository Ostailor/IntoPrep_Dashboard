import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { sendBulkFamilyMessage } from "@/lib/admin-operations";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await sendBulkFamilyMessage({
      viewer: viewer.user,
      cohortId: body?.cohortId,
      familyIds: body?.familyIds,
      subject: body?.subject,
      body: body?.body,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bulk family message failed." },
      { status: 400 },
    );
  }
}
