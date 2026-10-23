// Screenshot tour: every page from dist at 375×812 and 1440×900, full height.
// PNGs go to .artifacts/screens (git-ignored). Plus an objective check: no horizontal scroll.
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
      // Lazy images below the first screen don't load on their own, so a full-height shot would have holes.
      await page.evaluate(async () => {
        for (const img of document.images) img.loading = "eager";
        await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
        await document.fonts.ready;
      });
      const slug = route === "/" ? "index" : route.replace(/^\/|\/$/g, "").replaceAll("/", "__");
      const file = join(OUT, `${slug}@${vp.width}.png`);
      await page.screenshot({ path: file, fullPage: true });

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 0) problems.push(`${route} @${vp.width}: horizontal scroll by ${overflow}px`);
      console.log(`✓ ${route} @${vp.width} → ${file}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  stop();
}

if (problems.length) {
  console.log("\nLayout breaks:");
  for (const p of problems) console.log("  ✗ " + p);
  process.exit(1);
}
console.log(`\nDone: ${routes.length} pages × ${VIEWPORTS.length} widths, no horizontal scroll.`);
