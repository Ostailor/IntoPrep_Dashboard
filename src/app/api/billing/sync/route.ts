import { NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { canRunIntakeImports } from "@/lib/permissions";
import { runQuickBooksSync } from "@/lib/billing-sync";

export async function POST() {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!canRunIntakeImports(viewer.user.role)) {
    return NextResponse.json({ error: "You cannot run QuickBooks sync." }, { status: 403 });
  }

  try {
    const result = await runQuickBooksSync({
      viewer: viewer.user,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "QuickBooks sync failed.",
      },
      { status: 400 },
    );
  }
}
