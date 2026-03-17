import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { deleteOutreachTemplate, persistOutreachTemplate } from "@/lib/staff-operations";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await persistOutreachTemplate({
      viewer: viewer.user,
      templateId: body?.templateId,
      title: body?.title,
      category: body?.category,
      subject: body?.subject,
      body: body?.body,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Template save failed." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    await deleteOutreachTemplate({
      viewer: viewer.user,
      templateId: body?.templateId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Template delete failed." },
      { status: 400 },
    );
  }
}
