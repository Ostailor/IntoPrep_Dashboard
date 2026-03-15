import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { canRevokeSessions } from "@/lib/permissions";
import { revokeUserSession } from "@/lib/engineer-controls";
import type { Database } from "@/lib/supabase/database.types";
import { hasSupabaseServiceRole } from "@/lib/supabase/config";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!canRevokeSessions(viewer.user.role)) {
    return NextResponse.json({ error: "You cannot revoke active sessions." }, { status: 403 });
  }

  if (!hasSupabaseServiceRole()) {
    return NextResponse.json({ error: "Supabase service-role access is required." }, { status: 500 });
  }

  const body = await request.json();
  const { userId, issueReference } = body ?? {};

  if (typeof userId !== "string" || typeof issueReference !== "string") {
    return NextResponse.json({ error: "Invalid session revoke payload." }, { status: 400 });
  }

  if (userId === viewer.user.id) {
    return NextResponse.json({ error: "You cannot revoke your own session." }, { status: 403 });
  }

  const serviceClient = createSupabaseServiceClient();
  const { data, error } = await serviceClient
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  const targetProfile = (data ?? null) as ProfileRow | null;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!targetProfile || targetProfile.deleted_at) {
    return NextResponse.json({ error: "That account could not be found." }, { status: 404 });
  }

  if (targetProfile.role === "engineer") {
    return NextResponse.json({ error: "Engineer sessions cannot be revoked from the dashboard." }, { status: 403 });
  }

  try {
    await revokeUserSession({
      viewer: viewer.user,
      targetProfile,
      issueReference,
    });
  } catch (routeError) {
    return NextResponse.json(
      { error: routeError instanceof Error ? routeError.message : "Session revoke failed." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    userId: targetProfile.id,
  });
}
