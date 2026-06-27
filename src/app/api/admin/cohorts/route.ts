import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { createAdminCohort } from "@/lib/admin-operations";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await createAdminCohort({
      viewer: viewer.user,
      name: body?.name,
      cadence: body?.cadence,
      cohortMode: body?.cohortMode,
      startDate: body?.startDate,
      endDate: body?.endDate,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cohort creation failed." },
      { status: 400 },
    );
  }
}
