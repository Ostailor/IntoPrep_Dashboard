import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const mode = args.has("--mode=dev") ? "dev" : "prod";
const fallbackProductionUrl = "https://dashboard-alpha-nine-82.vercel.app";
const fallbackUpdaterEndpoint =
  "https://github.com/Ostailor/IntoPrep_Dashboard/releases/latest/download/latest.json";
const localDesktopUrl = "http://127.0.0.1:3000";

function normalizeBaseUrl(rawUrl) {
  const parsedUrl = new URL(rawUrl);
  parsedUrl.pathname = "";
  parsedUrl.search = "";
  parsedUrl.hash = "";
  return parsedUrl.toString().replace(/\/$/, "");
}

function resolveDesktopVersion() {
  if (process.env.DESKTOP_APP_VERSION) {
    return process.env.DESKTOP_APP_VERSION;
  }

  const refName = process.env.GITHUB_REF_NAME;
  const tagMatch = refName?.match(/^desktop-v(.+)$/);
  return tagMatch?.[1];
}

const requestedUrl =
  mode === "dev"
    ? localDesktopUrl
    : process.env.DESKTOP_APP_URL || process.env.PRODUCTION_URL || fallbackProductionUrl;

const frontendDist = normalizeBaseUrl(requestedUrl);
const updaterEndpoint = process.env.DESKTOP_UPDATER_ENDPOINT || fallbackUpdaterEndpoint;
const updaterPublicKey = process.env.TAURI_UPDATER_PUBLIC_KEY;
const desktopVersion = resolveDesktopVersion();
const outputPath = path.join(process.cwd(), "src-tauri", "tauri.desktop.conf.json");
const overrideConfig = {
  build: {
    frontendDist,
  },
};

if (desktopVersion) {
  overrideConfig.version = desktopVersion;
}

if (mode === "prod" && updaterPublicKey) {
  overrideConfig.bundle = {
    createUpdaterArtifacts: true,
  };
  overrideConfig.plugins = {
    updater: {
      endpoints: [updaterEndpoint],
      pubkey: updaterPublicKey,
    },
  };
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(overrideConfig, null, 2)}\n`, "utf8");

console.log(`Prepared desktop config (${mode}) -> ${frontendDist}`);
if (desktopVersion) {
  console.log(`Desktop version override -> ${desktopVersion}`);
}
