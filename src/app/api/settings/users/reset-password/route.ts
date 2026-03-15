import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { recordAccountAuditLog } from "@/lib/account-governance";
import { canSendPasswordResetForRole, getPermissionProfile } from "@/lib/permissions";
import { hasSupabaseServiceRole } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export async function POST(request: NextRequest) {
  const viewer = await getAuthenticatedViewerForRequest();

  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!getPermissionProfile(viewer.user.role).canManageRoles) {
    return NextResponse.json({ error: "You cannot send password reset links." }, { status: 403 });
  }

  if (!hasSupabaseServiceRole()) {
    return NextResponse.json({ error: "Supabase service-role access is required." }, { status: 500 });
  }

  const body = await request.json();
  const { userId } = body ?? {};

  if (typeof userId !== "string") {
    return NextResponse.json({ error: "Invalid password reset payload." }, { status: 400 });
  }

  if (userId === viewer.user.id) {
    return NextResponse.json(
      { error: "Use the forgot-password flow for your own account." },
      { status: 403 },
    );
  }

  const serviceClient = createSupabaseServiceClient();
  const { data: targetProfileData } = await serviceClient
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  const targetProfile = (targetProfileData ?? null) as ProfileRow | null;

  if (!targetProfile || !targetProfile.email) {
    return NextResponse.json({ error: "That user profile could not be found." }, { status: 404 });
  }

  if (!canSendPasswordResetForRole(viewer.user.role, targetProfile.role)) {
    return NextResponse.json(
      { error: "Your role cannot reset that account password." },
      { status: 403 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const redirectTo = new URL("/auth/confirm?next=/reset-password", request.nextUrl.origin).toString();
  const { error: resetError } = await supabase.auth.resetPasswordForEmail(targetProfile.email, {
    redirectTo,
  });

  if (resetError) {
    return NextResponse.json({ error: resetError.message }, { status: 400 });
  }

  const [profileUpdate, templateUpdate] = await Promise.all([
    serviceClient
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", targetProfile.id),
    serviceClient
      .from("user_templates")
      .update({ must_change_password: true })
      .eq("email", targetProfile.email.toLowerCase()),
  ]);

  if (profileUpdate.error) {
    return NextResponse.json({ error: profileUpdate.error.message }, { status: 400 });
  }

  if (templateUpdate.error) {
    return NextResponse.json({ error: templateUpdate.error.message }, { status: 400 });
  }

  await recordAccountAuditLog(serviceClient, {
    actorId: viewer.user.id,
    targetUserId: targetProfile.id,
    targetEmail: targetProfile.email,
    action: "password_reset_requested",
    summary: `${viewer.user.name} sent a password reset link to ${targetProfile.email}.`,
    details: {
      role: targetProfile.role,
    },
  });

  return NextResponse.json({
    ok: true,
    userId: targetProfile.id,
  });
}
