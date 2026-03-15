import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { createEngineerSupportNote } from "@/lib/engineer-controls";
import type { EngineerSupportNote } from "@/lib/domain";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer || viewer.user.role !== "engineer") {
    return NextResponse.json({ error: "Engineer access is required." }, { status: 403 });
  }

  const body = await request.json();
  const { targetType, targetId, issueReference, body: noteBody } = body ?? {};

  if (
    typeof targetType !== "string" ||
    typeof targetId !== "string" ||
    typeof issueReference !== "string" ||
    typeof noteBody !== "string"
  ) {
    return NextResponse.json({ error: "Invalid support-note payload." }, { status: 400 });
  }

  try {
    await createEngineerSupportNote({
      viewer: viewer.user,
      targetType: targetType as EngineerSupportNote["targetType"],
      targetId,
      issueReference,
      body: noteBody,
    });

    return NextResponse.json({ ok: true });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Support note save failed." },
      { status: 400 },
    );
  }
}
