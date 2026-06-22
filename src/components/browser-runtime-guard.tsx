"use client";

import { useEffect } from "react";
import { isDesktopShell } from "@/lib/desktop-shell";

const STALE_ACTION_RELOAD_KEY = "intoprep:stale-action-reloaded";
const SERVICE_WORKER_CLEANUP_KEY = "intoprep:legacy-sw-cleaned";

function isStaleServerActionError(value: unknown) {
  const message =
    value instanceof Error
      ? `${value.name} ${value.message}`
      : typeof value === "string"
        ? value
        : typeof value === "object" && value !== null && "message" in value
          ? String((value as { message?: unknown }).message)
          : "";

  return (
    message.includes("UnrecognizedActionError") ||
    message.includes("Server Action") && message.includes("was not found on the server")
  );
}

function reloadOnce(storageKey: string) {
  if (window.sessionStorage.getItem(storageKey) === "true") {
    return;
  }

  window.sessionStorage.setItem(storageKey, "true");
  window.location.reload();
}

async function clearLegacyServiceWorker() {
  if (isDesktopShell() || !("serviceWorker" in navigator)) {
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  const hadLegacyWorker = registrations.length > 0 || Boolean(navigator.serviceWorker.controller);

  await Promise.all(registrations.map((registration) => registration.unregister()));

  if ("caches" in window) {
    const cacheNames = await window.caches.keys();

    await Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith("intoprep-portal"))
        .map((cacheName) => window.caches.delete(cacheName)),
    );
  }

  if (hadLegacyWorker) {
    reloadOnce(SERVICE_WORKER_CLEANUP_KEY);
  }
}

export function BrowserRuntimeGuard() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (isStaleServerActionError(event.error) || isStaleServerActionError(event.message)) {
        event.preventDefault();
        reloadOnce(STALE_ACTION_RELOAD_KEY);
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isStaleServerActionError(event.reason)) {
        event.preventDefault();
        reloadOnce(STALE_ACTION_RELOAD_KEY);
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    void clearLegacyServiceWorker().catch(() => {
      // If browser cleanup fails, normal network loading still works.
    });

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}
