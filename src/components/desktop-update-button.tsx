"use client";

import { Download, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { isDesktopShell } from "@/lib/desktop-shell";

interface UpdaterApi {
  check: typeof import("@tauri-apps/plugin-updater").check;
  relaunch: typeof import("@tauri-apps/plugin-process").relaunch;
  getVersion: typeof import("@tauri-apps/api/app").getVersion;
}

function formatProgress(downloadedBytes: number, totalBytes?: number) {
  if (!totalBytes || totalBytes <= 0) {
    return `${Math.round(downloadedBytes / 1024)} KB`;
  }

  return `${Math.round((downloadedBytes / totalBytes) * 100)}%`;
}

export function DesktopUpdateButton() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [updaterApi, setUpdaterApi] = useState<UpdaterApi | null>(null);

  useEffect(() => {
    if (!isDesktopShell()) {
      return;
    }

    let isMounted = true;

    const loadDesktopApis = async () => {
      setIsDesktop(true);

      try {
        const [{ getVersion }, updaterModule, { relaunch }] = await Promise.all([
          import("@tauri-apps/api/app"),
          import("@tauri-apps/plugin-updater"),
          import("@tauri-apps/plugin-process"),
        ]);

        if (!isMounted) {
          return;
        }

        setCurrentVersion(await getVersion());
        setUpdaterApi({
          check: updaterModule.check,
          relaunch,
          getVersion,
        });
      } catch {
        if (isMounted) {
          setStatus("Desktop shell detected, but updater APIs are unavailable in this build.");
        }
      }
    };

    void loadDesktopApis();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!updaterApi) {
      return;
    }

    let cancelled = false;

    const runCheck = async () => {
      setIsChecking(true);
      setStatus("Checking for desktop shell updates...");
      setProgress(null);

      try {
        const update = await updaterApi.check({
          timeout: 12000,
        });

        if (cancelled) {
          return;
        }

        setAvailableUpdate(update);

        if (update) {
          setStatus(`Desktop shell ${update.version} is ready to install.`);
        } else {
          setStatus("Desktop shell is up to date.");
        }
      } catch {
        if (!cancelled) {
          setStatus("No updater feed is configured for this desktop build yet.");
        }
      } finally {
        if (!cancelled) {
          setIsChecking(false);
        }
      }
    };

    void runCheck();

    return () => {
      cancelled = true;
    };
  }, [updaterApi]);

  if (!isDesktop) {
    return null;
  }

  const handleInstall = async () => {
    if (!availableUpdate || !updaterApi) {
      return;
    }

    setIsInstalling(true);
    setStatus(`Downloading desktop shell ${availableUpdate.version}...`);
    setProgress(null);

    try {
      let downloadedBytes = 0;
      let totalBytes: number | undefined;

      await availableUpdate.downloadAndInstall((event) => {
        if (event.event === "Started") {
          totalBytes = event.data.contentLength;
          setProgress(formatProgress(0, totalBytes));
          return;
        }

        if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          setProgress(formatProgress(downloadedBytes, totalBytes));
          return;
        }

        if (event.event === "Finished") {
          setProgress("Downloaded");
        }
      });

      setStatus(`Desktop shell ${availableUpdate.version} installed. Restarting...`);
      await updaterApi.relaunch();
    } catch {
      setStatus("Desktop shell update failed. Download the latest release manually if needed.");
      setIsInstalling(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="rounded-full border border-[rgba(34,93,120,0.24)] bg-[rgba(34,93,120,0.12)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--navy-strong)]">
        Desktop shell{currentVersion ? ` v${currentVersion}` : ""}
      </div>
      {availableUpdate ? (
        <button
          type="button"
          onClick={handleInstall}
          disabled={isInstalling}
          className="inline-flex items-center gap-2 rounded-full border border-[rgba(187,110,69,0.24)] bg-[rgba(187,110,69,0.12)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--copper)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isInstalling ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {isInstalling ? "Installing update" : `Update to v${availableUpdate.version}`}
        </button>
      ) : (
        <button
          type="button"
          onClick={async () => {
            if (!updaterApi || isChecking) {
              return;
            }

            setIsChecking(true);
            setStatus("Checking for desktop shell updates...");
            setProgress(null);

            try {
              const update = await updaterApi.check({
                timeout: 12000,
              });
              setAvailableUpdate(update);
              setStatus(
                update
                  ? `Desktop shell ${update.version} is ready to install.`
                  : "Desktop shell is up to date.",
              );
            } catch {
              setStatus("No updater feed is configured for this desktop build yet.");
            } finally {
              setIsChecking(false);
            }
          }}
          disabled={isChecking}
          className="inline-flex items-center gap-2 rounded-full border border-[color:var(--line)] bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--navy-strong)] hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? "animate-spin" : ""}`} />
          Check updates
        </button>
      )}
      {status ? (
        <div className="text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
          {status}
          {progress ? ` • ${progress}` : ""}
        </div>
      ) : null}
    </div>
  );
}
