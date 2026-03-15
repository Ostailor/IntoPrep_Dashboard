import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { setChangeFreeze } from "@/lib/engineer-controls";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer || viewer.user.role !== "engineer") {
    return NextResponse.json({ error: "Engineer access is required." }, { status: 403 });
  }

  const body = await request.json();
  const { enabled, scope, reason, issueReference, expiresAt } = body ?? {};

  if (
    typeof enabled !== "boolean" ||
    typeof scope !== "string" ||
    typeof reason !== "string" ||
    typeof issueReference !== "string"
  ) {
    return NextResponse.json({ error: "Invalid change-freeze payload." }, { status: 400 });
  }

  try {
    await setChangeFreeze({
      viewer: viewer.user,
      enabled,
      scope,
      reason,
      issueReference,
      expiresAt: typeof expiresAt === "string" ? expiresAt : null,
    });

    return NextResponse.json({ ok: true });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Change freeze update failed." },
      { status: 400 },
    );
  }
}
