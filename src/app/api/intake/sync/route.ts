import { NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { canRunIntakeImports } from "@/lib/permissions";
import { runGoogleFormsSync } from "@/lib/intake-sync";

export async function POST() {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!canRunIntakeImports(viewer.user.role)) {
    return NextResponse.json({ error: "You cannot run Google Forms sync." }, { status: 403 });
  }

  try {
    const result = await runGoogleFormsSync({
      viewer: viewer.user,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Google Forms sync failed.",
      },
      { status: 400 },
    );
  }
}
