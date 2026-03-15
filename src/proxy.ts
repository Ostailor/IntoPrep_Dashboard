import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";
import {
  getSupabasePublicConfig,
  hasSupabaseServiceRole,
  isSupabaseConfigured,
} from "@/lib/supabase/config";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const protectedPrefixes = [
  "/reset-password",
  "/dashboard",
  "/calendar",
  "/cohorts",
  "/attendance",
  "/students",
  "/families",
  "/programs",
  "/academics",
  "/messaging",
  "/billing",
  "/integrations",
  "/settings",
  "/api/engineer",
  "/api/attendance",
  "/api/settings/users",
];

function isProtectedPath(pathname: string) {
  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function clearSupabaseCookies(request: NextRequest, response: NextResponse) {
  request.cookies
    .getAll()
    .filter((cookie) => cookie.name.startsWith("sb-"))
    .forEach((cookie) => {
      response.cookies.set(cookie.name, "", {
        maxAge: 0,
        path: "/",
      });
    });

  return response;
}

function getAccessTokenIssuedAt(accessToken?: string | null) {
  if (!accessToken) {
    return null;
  }

  const [, payload] = accessToken.split(".");

  if (!payload) {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(padded)) as {
      iat?: number;
    };

    return typeof parsed.iat === "number" ? parsed.iat * 1000 : null;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.next();
  }

  const { url, anonKey } = getSupabasePublicConfig();
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const pathname = request.nextUrl.pathname;
  const isApiPath = pathname.startsWith("/api/");

  if (!user && isProtectedPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user) {
    const profileQuery = hasSupabaseServiceRole()
      ? createSupabaseServiceClient()
          .from("profiles")
          .select("account_status,must_change_password,session_revoked_at,deleted_at")
          .eq("id", user.id)
          .maybeSingle()
      : supabase
          .from("profiles")
          .select("account_status,must_change_password,session_revoked_at,deleted_at")
          .eq("id", user.id)
          .maybeSingle();
    const { data: profile } = await profileQuery;
    const accountStatus = profile?.account_status ?? "active";
    const mustChangePassword = profile?.must_change_password ?? false;
    const deletedAt = profile?.deleted_at ?? null;
    const sessionRevokedAt = profile?.session_revoked_at ?? null;
    const tokenIssuedAt = getAccessTokenIssuedAt(session?.access_token);

    if (
      sessionRevokedAt &&
      tokenIssuedAt !== null &&
      tokenIssuedAt <= new Date(sessionRevokedAt).getTime()
    ) {
      if (isApiPath) {
        return NextResponse.json(
          { error: "Your portal session was revoked. Sign in again." },
          { status: 401 },
        );
      }

      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("error", "Your session was revoked. Sign in again.");
      loginUrl.searchParams.delete("next");

      return clearSupabaseCookies(request, NextResponse.redirect(loginUrl));
    }

    if (accountStatus === "suspended" || deletedAt) {
      if (isApiPath) {
        return NextResponse.json(
          { error: deletedAt ? "This IntoPrep portal account is no longer active." : "Your IntoPrep portal account is suspended." },
          { status: 403 },
        );
      }

      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set(
        "error",
        deletedAt
          ? "This IntoPrep portal account is no longer active. Contact an engineer."
          : "Your IntoPrep portal account is suspended. Contact an engineer or admin.",
      );
      loginUrl.searchParams.delete("next");

      return clearSupabaseCookies(request, NextResponse.redirect(loginUrl));
    }

    if (
      mustChangePassword &&
      pathname !== "/reset-password" &&
      pathname !== "/auth/confirm"
    ) {
      if (isApiPath) {
        return NextResponse.json(
          { error: "Password change required before accessing the portal." },
          { status: 403 },
        );
      }

      const resetUrl = request.nextUrl.clone();
      resetUrl.pathname = "/reset-password";
      resetUrl.searchParams.set("mode", "required");

      if (isProtectedPath(pathname)) {
        resetUrl.searchParams.set("next", pathname);
      }

      return NextResponse.redirect(resetUrl);
    }
  }

  if (user && (pathname === "/login" || pathname === "/forgot-password")) {
    const profileQuery = hasSupabaseServiceRole()
      ? createSupabaseServiceClient()
          .from("profiles")
          .select("must_change_password")
          .eq("id", user.id)
          .maybeSingle()
      : supabase
          .from("profiles")
          .select("must_change_password")
          .eq("id", user.id)
          .maybeSingle();
    const { data: profile } = await profileQuery;

    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.searchParams.delete("next");

    if (profile?.must_change_password) {
      dashboardUrl.pathname = "/reset-password";
      dashboardUrl.searchParams.set("mode", "required");
      return NextResponse.redirect(dashboardUrl);
    }

    dashboardUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
