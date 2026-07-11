import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { revalidatePortalLiveCache } from "@/lib/cache-invalidation";
import {
  STUDENT_DIRECTORY_REQUEST_LIMITS,
  upsertStudentDirectoryRecord,
  validateStudentDirectoryRequestPayload,
} from "@/lib/student-directory-writes";

function requestTooLargeResponse() {
  return NextResponse.json(
    { error: "Student update request is too large." },
    { status: 413 },
  );
}

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const claimedContentLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(claimedContentLength) &&
    claimedContentLength > STUDENT_DIRECTORY_REQUEST_LIMITS.contentLength
  ) {
    return requestTooLargeResponse();
  }

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > STUDENT_DIRECTORY_REQUEST_LIMITS.contentLength) {
      return requestTooLargeResponse();
    }

    const body = JSON.parse(rawBody) as Record<string, unknown>;
    validateStudentDirectoryRequestPayload({
      externalId: body?.externalId,
      customFields: body?.customFields,
    });

    const result = await upsertStudentDirectoryRecord({
      viewer: viewer.user,
      studentId:
        typeof body?.studentId === "string" || body?.studentId === null
          ? body.studentId
          : undefined,
      firstName: body?.firstName,
      lastName: body?.lastName,
      gradeLevel: body?.gradeLevel,
      school: body?.school,
      targetTest: body?.targetTest,
      focus: body?.focus,
      parent1Name: body?.parent1Name,
      parent1Email: body?.parent1Email,
      parent1Phone: body?.parent1Phone,
      parent2Name: body?.parent2Name,
      parent2Email: body?.parent2Email,
      parent2Phone: body?.parent2Phone,
      studentEmail: body?.studentEmail,
      studentPhone: body?.studentPhone,
      externalId: body?.externalId,
      customFields: body?.customFields,
      guardianName: body?.guardianName,
      familyEmail: body?.familyEmail,
      familyPhone: body?.familyPhone,
      familyNotes: body?.familyNotes,
    });

    revalidatePortalLiveCache();

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Student update failed." },
      { status: 400 },
    );
  }
}
