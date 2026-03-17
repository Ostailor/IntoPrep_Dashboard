import { NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { canManageSyncSources } from "@/lib/permissions";
import { saveGoogleFormsSyncSource } from "@/lib/intake-sync";

export async function POST(request: Request) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!canManageSyncSources(viewer.user.role)) {
    return NextResponse.json(
      { error: "You cannot configure Google Forms sync." },
      { status: 403 },
    );
  }

  const body = await request.json();
  const { sourceUrl, label, cadence, isActive } = body ?? {};

  if (
    typeof sourceUrl !== "string" ||
    typeof label !== "string" ||
    typeof cadence !== "string" ||
    typeof isActive !== "boolean"
  ) {
    return NextResponse.json({ error: "Invalid Google Forms source payload." }, { status: 400 });
  }

  try {
    const source = await saveGoogleFormsSyncSource({
      viewer: viewer.user,
      sourceUrl,
      label,
      cadence,
      isActive,
    });

    return NextResponse.json({ source });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Google Forms source save failed.",
      },
      { status: 400 },
    );
  }
}
