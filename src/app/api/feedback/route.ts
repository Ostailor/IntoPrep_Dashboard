import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { submitFeedback, updateFeedbackStatus } from "@/lib/feedback";

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const feedbackId = await submitFeedback({
      viewer: viewer.user,
      email: viewer.email,
      category: body?.category,
      priority: body?.priority,
      subject: body?.subject,
      body: body?.body,
      pagePath: body?.pagePath,
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({ ok: true, feedbackId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Feedback could not be saved." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await updateFeedbackStatus({
      viewer: viewer.user,
      feedbackId: body?.feedbackId,
      status: body?.status,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Feedback update failed." },
      { status: 400 },
    );
  }
}
