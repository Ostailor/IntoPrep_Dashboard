import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { upsertMaintenanceBanner } from "@/lib/engineer-controls";
import type { MaintenanceBanner } from "@/lib/domain";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer || viewer.user.role !== "engineer") {
    return NextResponse.json({ error: "Engineer access is required." }, { status: 403 });
  }

  const body = await request.json();
  const { id, message, tone, issueReference, ownerId, expiresAt } = body ?? {};

  if (
    typeof message !== "string" ||
    typeof tone !== "string" ||
    typeof issueReference !== "string"
  ) {
    return NextResponse.json({ error: "Invalid maintenance-banner payload." }, { status: 400 });
  }

  try {
    await upsertMaintenanceBanner({
      viewer: viewer.user,
      id: typeof id === "string" ? id : undefined,
      message,
      tone: tone as MaintenanceBanner["tone"],
      issueReference,
      ownerId: typeof ownerId === "string" ? ownerId : null,
      expiresAt: typeof expiresAt === "string" ? expiresAt : null,
    });

    return NextResponse.json({ ok: true });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Banner update failed." },
      { status: 400 },
    );
  }
}
