import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { revalidatePortalLiveCache } from "@/lib/cache-invalidation";
import { removeStudentFromCohort } from "@/lib/staff-operations";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    await removeStudentFromCohort({
      viewer: viewer.user,
      studentId: body?.studentId,
      cohortId: body?.cohortId,
    });
    revalidatePortalLiveCache();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Student removal failed." },
      { status: 400 },
    );
  }
}
