"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(
      `/login?error=${encodeURIComponent(normalizeSignInErrorMessage(error.message))}&next=${encodeURIComponent(next)}`,
    );
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
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login?message=Signed%20out");
}
