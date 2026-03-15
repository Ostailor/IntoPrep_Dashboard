import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { grantSensitiveAccess, revokeSensitiveAccess } from "@/lib/engineer-controls";
import type { SensitiveScopeType } from "@/lib/domain";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer || viewer.user.role !== "engineer") {
    return NextResponse.json({ error: "Engineer access is required." }, { status: 403 });
  }

  const body = await request.json();
  const { scopeType, scopeId, reason, issueReference } = body ?? {};

  if (
    typeof scopeType !== "string" ||
    typeof scopeId !== "string" ||
    typeof reason !== "string" ||
    typeof issueReference !== "string"
  ) {
    return NextResponse.json({ error: "Invalid break-glass payload." }, { status: 400 });
  }

  try {
    const grantId = await grantSensitiveAccess({
      viewer: viewer.user,
      scopeType: scopeType as SensitiveScopeType,
      scopeId,
      reason,
      issueReference,
    });

    return NextResponse.json({ ok: true, grantId });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Break-glass request failed." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer || viewer.user.role !== "engineer") {
    return NextResponse.json({ error: "Engineer access is required." }, { status: 403 });
  }

  const body = await request.json();
  const { grantId } = body ?? {};

  if (typeof grantId !== "string") {
    return NextResponse.json({ error: "Grant id is required." }, { status: 400 });
  }

  try {
    await revokeSensitiveAccess({
      viewer: viewer.user,
      grantId,
    });

    return NextResponse.json({ ok: true, grantId });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Break-glass revoke failed." },
      { status: 400 },
    );
  }
}
