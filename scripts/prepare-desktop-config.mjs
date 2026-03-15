import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const mode = args.has("--mode=dev") ? "dev" : "prod";
const fallbackProductionUrl = "https://dashboard-alpha-nine-82.vercel.app";
const localDesktopUrl = "http://127.0.0.1:3000";

function normalizeBaseUrl(rawUrl) {
  const parsedUrl = new URL(rawUrl);
  parsedUrl.pathname = "";
  parsedUrl.search = "";
  parsedUrl.hash = "";
  return parsedUrl.toString().replace(/\/$/, "");
}

const requestedUrl =
  mode === "dev"
    ? localDesktopUrl
    : process.env.DESKTOP_APP_URL || process.env.PRODUCTION_URL || fallbackProductionUrl;

const frontendDist = normalizeBaseUrl(requestedUrl);
const outputPath = path.join(process.cwd(), "src-tauri", "tauri.desktop.conf.json");
const overrideConfig = {
  build: {
    frontendDist,
  },
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(overrideConfig, null, 2)}\n`, "utf8");

console.log(`Prepared desktop config (${mode}) -> ${frontendDist}`);
