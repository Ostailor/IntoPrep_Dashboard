import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { revalidatePortalLiveCache } from "@/lib/cache-invalidation";
import { persistStudentDirectoryScore } from "@/lib/student-directory-writes";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await persistStudentDirectoryScore({
      viewer: viewer.user,
      studentId: body?.studentId,
      cohortId: body?.cohortId,
      testTitle: body?.testTitle,
      testDate: body?.testDate,
      rwScore: body?.rwScore,
      mathScore: body?.mathScore,
      totalScore: body?.totalScore,
      notes: body?.notes,
    });

    revalidatePortalLiveCache();

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Score update failed." },
      { status: 400 },
    );
  }
}
