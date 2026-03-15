import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { upsertFeatureFlag } from "@/lib/engineer-controls";
import type { UserRole } from "@/lib/domain";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer || viewer.user.role !== "engineer") {
    return NextResponse.json({ error: "Engineer access is required." }, { status: 403 });
  }

  const body = await request.json();
  const { key, description, enabledRoles } = body ?? {};

  if (
    typeof key !== "string" ||
    typeof description !== "string" ||
    !Array.isArray(enabledRoles)
  ) {
    return NextResponse.json({ error: "Invalid feature-flag payload." }, { status: 400 });
  }

  try {
    await upsertFeatureFlag({
      viewer: viewer.user,
      key,
      description,
      enabledRoles: enabledRoles as UserRole[],
    });

    return NextResponse.json({ ok: true });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Feature flag update failed." },
      { status: 400 },
    );
  }
}
