// Общее для screens и copy-check: список страниц из dist, превью-сервер, браузер.
import { spawn } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DIST = join(ROOT, "dist");
const PORT = 4329;
export const BASE_URL = `http://127.0.0.1:${PORT}`;

// Каждая собранная страница = .html в dist. Маршрут: about/index.html → /about/.
export function listRoutes() {
  if (!existsSync(DIST)) throw new Error("Нет dist/ — сначала astro build");
  const routes = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".html")) {
        const rel = relative(DIST, full).split(sep).join("/");
        routes.push("/" + rel.replace(/(^|\/)index\.html$/, "$1").replace(/\.html$/, ""));
      }
    }
  };
  walk(DIST);
  return routes.sort();
}

// astro preview отдаёт dist как есть; _redirects он не применяет, поэтому / открывается страницей.
export async function startPreview() {
  const astroBin = join(ROOT, "node_modules", "astro", "bin", "astro.mjs");
  const child = spawn(process.execPath, [astroBin, "preview", "--host", "127.0.0.1", "--port", String(PORT)], {
    cwd: ROOT,
    stdio: "ignore",
  });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE_URL + "/");
      if (res.status < 500) return () => child.kill();
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error(`Превью не поднялось на ${BASE_URL}`);
}

// Браузер берём системный (Edge есть в любой Windows 11), чтобы не качать Chromium.
// Другой — через переменную BROWSER_CHANNEL (chrome, msedge) или BROWSER_PATH.
export function launchBrowser() {
  if (process.env.BROWSER_PATH) return chromium.launch({ executablePath: process.env.BROWSER_PATH });
  return chromium.launch({ channel: process.env.BROWSER_CHANNEL || "msedge" });
}
