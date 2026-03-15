import { NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { getPermissionProfile } from "@/lib/permissions";
import { persistResource } from "@/lib/live-writes";

export async function POST(request: Request) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!getPermissionProfile(viewer.user.role).canPublishResources) {
    return NextResponse.json(
      { error: "You cannot publish cohort resources." },
      { status: 403 },
    );
  }

  const formData = await request.formData();
  const cohortId = formData.get("cohortId");
  const title = formData.get("title");
  const kind = formData.get("kind");
  const linkUrl = formData.get("linkUrl");
  const file = formData.get("file");

  if (
    typeof cohortId !== "string" ||
    typeof title !== "string" ||
    typeof kind !== "string"
  ) {
    return NextResponse.json({ error: "Invalid resource payload." }, { status: 400 });
  }

  try {
    const result = await persistResource({
      viewer: viewer.user,
      cohortId,
      title,
      kind,
      linkUrl: typeof linkUrl === "string" ? linkUrl : null,
      file: file instanceof File ? file : null,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Resource publish failed." },
      { status: 400 },
    );
  }
}
