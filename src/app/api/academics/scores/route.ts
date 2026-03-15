import { NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { getPermissionProfile } from "@/lib/permissions";
import { persistAssessmentResult } from "@/lib/live-writes";

export async function POST(request: Request) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!getPermissionProfile(viewer.user.role).canManageScores) {
    return NextResponse.json({ error: "You cannot manage scores." }, { status: 403 });
  }

  const body = await request.json();
  const { assessmentId, studentId, totalScore, sectionScores } = body ?? {};

  if (
    typeof assessmentId !== "string" ||
    typeof studentId !== "string" ||
    typeof totalScore !== "number"
  ) {
    return NextResponse.json({ error: "Invalid score payload." }, { status: 400 });
  }

  try {
    const result = await persistAssessmentResult({
      viewer: viewer.user,
      assessmentId,
      studentId,
      totalScore,
      sectionScores,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Score update failed." },
      { status: 400 },
    );
  }
}
