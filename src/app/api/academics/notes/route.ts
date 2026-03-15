import { NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { getPermissionProfile } from "@/lib/permissions";
import { persistAcademicNote } from "@/lib/live-writes";

export async function POST(request: Request) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!getPermissionProfile(viewer.user.role).canWriteAcademicNotes) {
    return NextResponse.json({ error: "You cannot write academic notes." }, { status: 403 });
  }

  const body = await request.json();
  const { noteId, studentId, summary } = body ?? {};

  if (
    (noteId !== undefined && typeof noteId !== "string") ||
    typeof studentId !== "string" ||
    typeof summary !== "string"
  ) {
    return NextResponse.json({ error: "Invalid note payload." }, { status: 400 });
  }

  try {
    const result = await persistAcademicNote({
      viewer: viewer.user,
      noteId,
      studentId,
      summary,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Academic note save failed." },
      { status: 400 },
    );
  }
}
