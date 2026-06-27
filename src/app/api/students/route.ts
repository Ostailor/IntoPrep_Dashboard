import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { upsertStudentDirectoryRecord } from "@/lib/student-directory-writes";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await upsertStudentDirectoryRecord({
      viewer: viewer.user,
      studentId: body?.studentId,
      firstName: body?.firstName,
      lastName: body?.lastName,
      gradeLevel: body?.gradeLevel,
      school: body?.school,
      targetTest: body?.targetTest,
      focus: body?.focus,
      guardianName: body?.guardianName,
      familyEmail: body?.familyEmail,
      familyPhone: body?.familyPhone,
      familyNotes: body?.familyNotes,
    });

    revalidateTag("portal-live", { expire: 0 });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Student update failed." },
      { status: 400 },
    );
  }
}
