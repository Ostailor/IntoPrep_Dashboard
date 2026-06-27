import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { bulkAssignStudentsToCohort } from "@/lib/student-directory-writes";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await bulkAssignStudentsToCohort({
      viewer: viewer.user,
      studentIds: body?.studentIds,
      targetCohortId: body?.targetCohortId,
    });

    revalidateTag("portal-live", "max");

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bulk cohort assignment failed." },
      { status: 400 },
    );
  }
}
