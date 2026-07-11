import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isLocalQaMode } from "@/lib/local-qa";

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
];

function isProtectedPath(pathname: string) {
  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function hasSupabaseSessionCookie(request: NextRequest) {
  return request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-"));
}

export async function proxy(request: NextRequest) {
  if (isLocalQaMode()) {
    return NextResponse.next();
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;
  if (!hasSupabaseSessionCookie(request) && isProtectedPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
