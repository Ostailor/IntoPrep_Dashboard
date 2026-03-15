import { NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { importQuickBooksCsv } from "@/lib/billing-sync";
import { canRunIntakeImports } from "@/lib/permissions";

export async function POST(request: Request) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!canRunIntakeImports(viewer.user.role)) {
    return NextResponse.json({ error: "You cannot import QuickBooks billing snapshots." }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Attach a CSV file before running billing import." }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "The QuickBooks CSV file is empty." }, { status: 400 });
  }

  const csvText = await file.text();

  try {
    const run = await importQuickBooksCsv({
      viewer: viewer.user,
      csvText,
      filename: file.name || "quickbooks-export.csv",
      initiatedBy: "manual",
      cadenceLabel: "Manual CSV snapshot",
    });

    return NextResponse.json({ run });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "QuickBooks import failed.",
      },
      { status: 400 },
    );
  }
}
