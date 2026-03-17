import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { runAdminBulkOperation } from "@/lib/admin-operations";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await runAdminBulkOperation({
      viewer: viewer.user,
      operation: body?.operation,
      sourceCohortId: body?.sourceCohortId,
      targetCohortId: body?.targetCohortId,
      cohortId: body?.cohortId,
      studentIds: body?.studentIds,
      userIds: body?.userIds,
      dueAt: body?.dueAt,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bulk operation failed." },
      { status: 400 },
    );
  }
}
