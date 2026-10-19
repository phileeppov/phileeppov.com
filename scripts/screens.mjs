// Скриншот-тур: каждая страница из dist в 375×812 и 1440×900, полная высота.
// PNG — в .artifacts/screens (вне git). Плюс объективная проверка: нет горизонтального скролла.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT, BASE_URL, listRoutes, startPreview, launchBrowser } from "./lib/site.mjs";

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
];
const OUT = join(ROOT, ".artifacts", "screens");
mkdirSync(OUT, { recursive: true });

const routes = listRoutes();
const stop = await startPreview();
const browser = await launchBrowser();
const problems = [];

try {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: vp });
    for (const route of routes) {
      await page.goto(BASE_URL + route, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const slug = route === "/" ? "index" : route.replace(/^\/|\/$/g, "").replaceAll("/", "__");
      const file = join(OUT, `${slug}@${vp.width}.png`);
      await page.screenshot({ path: file, fullPage: true });

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 0) problems.push(`${route} @${vp.width}: горизонтальный скролл на ${overflow}px`);
      console.log(`✓ ${route} @${vp.width} → ${file}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  stop();
}

if (problems.length) {
  console.log("\nРазваливается:");
  for (const p of problems) console.log("  ✗ " + p);
  process.exit(1);
}
console.log(`\nГотово: ${routes.length} стр. × ${VIEWPORTS.length} ширины, горизонтального скролла нет.`);
