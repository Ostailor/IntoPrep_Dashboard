"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAbsoluteUrl } from "@/lib/url";

export async function requestPasswordResetAction(formData: FormData) {
  const email = formData.get("email");

  if (typeof email !== "string" || email.trim().length === 0) {
    redirect(
      `/forgot-password?error=${encodeURIComponent("Enter the email tied to your IntoPrep portal account.")}`,
    );
  }

  const supabase = await createSupabaseServerClient();
  const redirectTo = await getAbsoluteUrl("/auth/confirm?next=/reset-password");
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo,
  });

  if (error) {
    redirect(`/forgot-password?error=${encodeURIComponent(error.message)}`);
  }

  redirect(
    `/forgot-password?message=${encodeURIComponent(
      "If that account exists, a password reset email has been sent.",
    )}`,
  );
}
