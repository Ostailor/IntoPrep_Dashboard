import { NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { getPermissionProfile } from "@/lib/permissions";
import { persistCohortAssignments } from "@/lib/live-writes";

export async function POST(request: Request) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!getPermissionProfile(viewer.user.role).canManageRoles) {
    return NextResponse.json(
      { error: "You cannot manage cohort assignments." },
      { status: 403 },
    );
  }

  const body = await request.json();
  const { userId, cohortIds } = body ?? {};

  if (typeof userId !== "string" || !Array.isArray(cohortIds)) {
    return NextResponse.json({ error: "Invalid assignment payload." }, { status: 400 });
  }

  try {
    const result = await persistCohortAssignments({
      viewer: viewer.user,
      targetUserId: userId,
      cohortIds: cohortIds.filter((value): value is string => typeof value === "string"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Cohort assignment update failed.",
      },
      { status: 400 },
    );
  }
}
