"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getLocalQaRole,
  isLocalQaMode,
  LOCAL_QA_COOKIE,
  LOCAL_QA_PASSWORD,
} from "@/lib/local-qa";
import { hasSupabaseServiceRole } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

function getNextPath(formData: FormData) {
  const next = formData.get("next");
  return typeof next === "string" && next.startsWith("/") ? next : "/dashboard";
}

function normalizeSignInErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid email or password") ||
    normalized.includes("email not confirmed")
  ) {
    return "Incorrect email or password.";
  }

  return message;
}

export async function signInAction(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");
  const next = getNextPath(formData);

  if (typeof email !== "string" || typeof password !== "string") {
    redirect(`/login?error=${encodeURIComponent("Email and password are required.")}&next=${encodeURIComponent(next)}`);
  }

  if (isLocalQaMode()) {
    const role = getLocalQaRole(email);

    if (!role || password !== LOCAL_QA_PASSWORD) {
      redirect(
        `/login?error=${encodeURIComponent("Incorrect email or password.")}&next=${encodeURIComponent(next)}`,
      );
    }

    const cookieStore = await cookies();
    cookieStore.set(LOCAL_QA_COOKIE, role, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });

    if (email.toLowerCase().includes("firsttime")) {
      redirect(`/reset-password?mode=required&next=${encodeURIComponent(next)}`);
    }

    redirect(next);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(
      `/login?error=${encodeURIComponent(normalizeSignInErrorMessage(error.message))}&next=${encodeURIComponent(next)}`,
    );
  }

  if (data.user && hasSupabaseServiceRole()) {
    const serviceClient = createSupabaseServiceClient();
    const normalizedEmail = data.user.email?.toLowerCase();
    const [{ data: profile }, { data: template }] = await Promise.all([
      serviceClient
        .from("profiles")
        .select("must_change_password,last_signed_in_at")
        .eq("id", data.user.id)
        .maybeSingle(),
      normalizedEmail
        ? serviceClient
            .from("user_templates")
            .select("must_change_password")
            .eq("email", normalizedEmail)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const mustChangePassword =
      template?.must_change_password ??
      (profile?.must_change_password === true || !profile?.last_signed_in_at);

    if (mustChangePassword) {
      redirect(`/reset-password?mode=required&next=${encodeURIComponent(next)}`);
    }
  }

  redirect(next);
}

export async function signUpAction(formData: FormData) {
  const next = getNextPath(formData);
  redirect(
    `/login?error=${encodeURIComponent(
      "Self-service account creation is disabled. Ask an engineer or admin to provision your account in Settings.",
    )}&next=${encodeURIComponent(next)}`,
  );
}

export async function signOutAction() {
  if (isLocalQaMode()) {
    const cookieStore = await cookies();
    cookieStore.delete(LOCAL_QA_COOKIE);
    redirect("/login?message=Signed%20out");
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login?message=Signed%20out");
}
