declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isDesktopShell() {
  return typeof window !== "undefined" && typeof window.__TAURI_INTERNALS__ !== "undefined";
}
