import { NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { importIntakeCsv } from "@/lib/intake-import";
import { canRunIntakeImports } from "@/lib/permissions";

export async function POST(request: Request) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!canRunIntakeImports(viewer.user.role)) {
    return NextResponse.json({ error: "You cannot run intake imports." }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Attach a CSV file to import." }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json({ error: "Only CSV files are supported right now." }, { status: 400 });
  }

  const csvText = await file.text();

  try {
    const result = await importIntakeCsv({
      viewer: viewer.user,
      csvText,
      filename: file.name,
      source: "Google Forms CSV",
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Intake import failed.",
      },
      { status: 400 },
    );
  }
}
