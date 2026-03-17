import { NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { persistSessionInstructionNote } from "@/lib/instructor-operations";

export async function POST(request: Request) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await request.json();
  const { noteId, sessionId, body: noteBody } = body ?? {};

  if (
    (noteId !== undefined && typeof noteId !== "string") ||
    typeof sessionId !== "string" ||
    typeof noteBody !== "string"
  ) {
    return NextResponse.json({ error: "Invalid session note payload." }, { status: 400 });
  }

  try {
    const result = await persistSessionInstructionNote({
      viewer: viewer.user,
      noteId,
      sessionId,
      body: noteBody,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Session note save failed." },
      { status: 400 },
    );
  }
}
