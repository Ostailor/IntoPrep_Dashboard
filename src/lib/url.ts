import "server-only";

import { headers } from "next/headers";

export async function getAbsoluteUrl(path: string) {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const protocol =
    headerStore.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "development" ? "http" : "https");

  if (!host) {
    throw new Error("Request host header is missing.");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${protocol}://${host}${normalizedPath}`;
}
