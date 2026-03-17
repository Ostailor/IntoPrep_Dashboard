import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { persistStaffBillingFollowUp } from "@/lib/staff-operations";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    await persistStaffBillingFollowUp({
      viewer: viewer.user,
      invoiceId: body?.invoiceId,
      followUpState: body?.followUpState,
      body: body?.body,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Billing follow-up failed." },
      { status: 400 },
    );
  }
}
