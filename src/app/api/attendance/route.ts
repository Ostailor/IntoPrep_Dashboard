import { NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { canEditAttendance, isAttendanceStatus } from "@/lib/attendance";
import { persistAttendanceStatus } from "@/lib/live-attendance";

export async function POST(request: Request) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!canEditAttendance(viewer.user.role)) {
    return NextResponse.json({ error: "You cannot edit attendance." }, { status: 403 });
  }

  const body = await request.json();
  const { sessionId, studentId, status } = body ?? {};

  if (
    typeof sessionId !== "string" ||
    typeof studentId !== "string" ||
    typeof status !== "string" ||
    !isAttendanceStatus(status)
  ) {
    return NextResponse.json({ error: "Invalid attendance payload." }, { status: 400 });
  }

  try {
    const result = await persistAttendanceStatus({
      viewer: viewer.user,
      sessionId,
      studentId,
      status,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Attendance update failed.",
      },
      { status: 400 },
    );
  }
}
