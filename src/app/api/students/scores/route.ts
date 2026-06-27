import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
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
    });

    revalidateTag("portal-live", { expire: 0 });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Score update failed." },
      { status: 400 },
    );
  }
}
