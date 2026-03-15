"use server";

import { redirect } from "next/navigation";
import { hasSupabaseServiceRole } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

function getNextPath(formData: FormData) {
  const next = formData.get("next");
  return typeof next === "string" && next.startsWith("/") ? next : "/dashboard";
}

export async function signInAction(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");
  const next = getNextPath(formData);

  if (typeof email !== "string" || typeof password !== "string") {
    redirect(`/login?error=${encodeURIComponent("Email and password are required.")}&next=${encodeURIComponent(next)}`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);
  }

  const profileQuery = hasSupabaseServiceRole()
    ? createSupabaseServiceClient()
        .from("profiles")
        .select("account_status,must_change_password")
        .eq("id", data.user?.id ?? "")
        .maybeSingle()
    : supabase
        .from("profiles")
        .select("account_status,must_change_password")
        .eq("id", data.user?.id ?? "")
        .maybeSingle();
  const { data: profile } = await profileQuery;

  if (profile?.account_status === "suspended") {
    await supabase.auth.signOut();
    redirect(
      `/login?error=${encodeURIComponent(
        "Your IntoPrep portal account is suspended. Contact an engineer or admin.",
      )}`,
    );
  }

  if (profile?.must_change_password) {
    redirect(`/reset-password?mode=required&next=${encodeURIComponent(next)}`);
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
