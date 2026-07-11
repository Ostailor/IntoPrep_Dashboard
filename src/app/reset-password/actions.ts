"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedViewerForRequest } from "@/lib/auth";
import { recordAccountAuditLog } from "@/lib/account-governance";
import { expirePortalLiveCache } from "@/lib/cache-invalidation";
import { isLocalQaMode, LOCAL_QA_COOKIE } from "@/lib/local-qa";
import { hasSupabaseServiceRole } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

function getNextPath(formData: FormData) {
  const next = formData.get("next");
  return typeof next === "string" && next.startsWith("/") ? next : "/dashboard";
}

function getMode(formData: FormData) {
  const mode = formData.get("mode");
  return typeof mode === "string" && mode.length > 0 ? mode : "reset";
}

export async function updatePasswordAction(formData: FormData) {
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");
  const next = getNextPath(formData);
  const mode = getMode(formData);

  if (typeof password !== "string" || typeof confirmPassword !== "string") {
    redirect(
      `/reset-password?error=${encodeURIComponent("Enter and confirm a new password.")}&next=${encodeURIComponent(next)}&mode=${encodeURIComponent(mode)}`,
    );
  }

  if (password.length < 8) {
    redirect(
      `/reset-password?error=${encodeURIComponent("Use a password with at least 8 characters.")}&next=${encodeURIComponent(next)}&mode=${encodeURIComponent(mode)}`,
    );
  }

  if (password !== confirmPassword) {
    redirect(
      `/reset-password?error=${encodeURIComponent("The password confirmation does not match.")}&next=${encodeURIComponent(next)}&mode=${encodeURIComponent(mode)}`,
    );
  }

  const viewer = await getAuthenticatedViewerForRequest({ allowPasswordChangeRequired: true });

  if (!viewer) {
    redirect(
      `/login?error=${encodeURIComponent("Sign in through a valid recovery link before updating your password.")}`,
    );
  }

  if (viewer.accountStatus === "suspended") {
    redirect(
      `/login?error=${encodeURIComponent(
        "Your IntoPrep portal account is suspended. Contact an engineer or admin.",
      )}`,
    );
  }

  if (isLocalQaMode()) {
    if (mode === "required") {
      const cookieStore = await cookies();
      cookieStore.delete(LOCAL_QA_COOKIE);
      redirect(
        `/login?message=${encodeURIComponent("Password updated. Sign in with your new password.")}&next=${encodeURIComponent(next)}`,
      );
    }

    redirect(next);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    redirect(
      `/reset-password?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}&mode=${encodeURIComponent(mode)}`,
    );
  }

  if (hasSupabaseServiceRole()) {
    const serviceClient = createSupabaseServiceClient();

    await serviceClient
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", viewer.user.id);

    if (viewer.email) {
      await serviceClient
        .from("user_templates")
        .update({ must_change_password: false })
        .eq("email", viewer.email.toLowerCase());
    }

    await recordAccountAuditLog(serviceClient, {
      actorId: viewer.user.id,
      targetUserId: viewer.user.id,
      targetEmail: viewer.email ?? null,
      action: "password_changed",
      summary: `${viewer.user.name} changed their password.`,
      details: {
        mode,
      },
    });
  }

  expirePortalLiveCache();

  if (mode === "required") {
    await supabase.auth.signOut();
    redirect(
      `/login?message=${encodeURIComponent("Password updated. Sign in with your new password.")}&next=${encodeURIComponent(next)}`,
    );
  }

  redirect(next);
}
