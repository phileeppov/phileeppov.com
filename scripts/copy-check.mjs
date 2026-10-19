// Сверка текста страниц с site.md. Тексты не переписываем — расхождение = ошибка.
// Какая страница какому разделу соответствует — copy-map.json. Страницы без записи пропускаются.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, BASE_URL, listRoutes, startPreview, launchBrowser } from "./lib/site.mjs";

const BRAND_DIR = process.env.BRAND_DIR;
const map = JSON.parse(readFileSync(join(ROOT, "copy-map.json"), "utf8")).pages;

const CYRILLIC = /[а-яё]/i;
const norm = (s) =>
  s
    .normalize("NFC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[→←]/g, "") // стрелки — оформление, могут быть иконкой
    .replace(/\s+/g, " ")
    .trim();

// Раздел по номеру: "1.1" → от «### 1.1 — …» до следующего заголовка того же или старшего уровня.
function section(md, id) {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^#{2,4} ${id.replace(".", "\\.")} — `).test(l));
  if (start < 0) throw new Error(`В site.md нет раздела ${id}`);
  const level = lines[start].match(/^#+/)[0].length;
  const end = lines.findIndex((l, i) => i > start && /^#+ /.test(l) && l.match(/^#+/)[0].length <= level);
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

// Из блоков кода раздела: абзацы (hard) и подписи элементов (soft).
// [ Кнопка ] с заглавной — текст кнопки, hard. [ подсказка ] со строчной — плейсхолдер, soft.
// [Заглушка] без пробелов, строки по-русски и линии ─── — служебное, пропускаем.
function expected(lines) {
  const hard = [];
  const soft = [];
  let inCode = false;
  let para = [];
  const flush = () => {
    if (para.length) hard.push(norm(para.join(" ")));
    para = [];
  };
  for (const raw of lines) {
    if (raw.trim().startsWith("```")) {
      flush();
      inCode = !inCode;
      continue;
    }
    if (!inCode) continue;
    const line = raw.trim();
    if (!line || /^─+$/.test(line)) { flush(); continue; }
    if (CYRILLIC.test(line)) { flush(); continue; }
    const ui = line.match(/^\[ (.+) \]$/);
    if (ui) {
      flush();
      (/^[A-Z]/.test(ui[1]) ? hard : soft).push(norm(ui[1]));
      continue;
    }
    if (/^\[[^ ].*\]$/.test(line)) { flush(); continue; }
    para.push(line);
  }
  flush();
  return { hard: hard.filter(Boolean), soft: soft.filter(Boolean) };
}

const routes = listRoutes();
const mapped = routes.filter((r) => map[r]);
for (const r of routes.filter((r) => !map[r])) console.log(`– ${r}: нет в copy-map.json, пропускаю`);
for (const r of Object.keys(map).filter((r) => !routes.includes(r))) console.log(`! ${r}: есть в copy-map.json, но страницы нет`);
if (!mapped.length) {
  console.log("\nСопоставленных страниц нет — сверять нечего.");
  process.exit(0);
}

const stop = await startPreview();
const browser = await launchBrowser();
let failed = false;

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const route of mapped) {
    const entry = map[route];
    const md = readFileSync(join(BRAND_DIR, entry.file || "site.md"), "utf8");
    const exp = { hard: [], soft: [] };
    for (const id of entry.sections) {
      const e = expected(section(md, id));
      exp.hard.push(...e.hard);
      exp.soft.push(...e.soft);
    }

    await page.goto(BASE_URL + route, { waitUntil: "networkidle" });
    const visible = await page.evaluate(() => document.body.innerText);
    const attrs = await page.evaluate(() =>
      [...document.querySelectorAll("[placeholder], [aria-label], img[alt]")]
        .map((el) => el.getAttribute("placeholder") || el.getAttribute("aria-label") || el.getAttribute("alt"))
        .join("\n"),
    );
    const pageText = norm(visible);
    const pageAll = norm(visible + "\n" + attrs);
    const ignore = (entry.ignore || []).map(norm);

    const missing = [];
    const caseOnly = [];
    for (const p of exp.hard) {
      if (pageText.includes(p)) continue;
      if (pageText.toLowerCase().includes(p.toLowerCase())) caseOnly.push(p);
      else missing.push(p);
    }
    const softMissing = exp.soft.filter((p) => !pageAll.toLowerCase().includes(p.toLowerCase()));

    const source = norm(exp.hard.concat(exp.soft).join(" ")).toLowerCase();
    const extra = visible
      .split("\n")
      .map(norm)
      .filter((l) => l && !source.includes(l.toLowerCase()) && !ignore.some((i) => l.includes(i)));

    const ok = !missing.length && !extra.length;
    if (!ok) failed = true;
    console.log(`\n${ok ? "✓" : "✗"} ${route} ← ${entry.file || "site.md"} ${entry.sections.join(", ")}`);
    for (const p of missing) console.log(`  нет на странице или текст отличается:\n    «${p}»`);
    for (const l of extra) console.log(`  на странице, но нет в разделе:\n    «${l}»`);
    for (const p of caseOnly) console.log(`  ~ совпадает без учёта регистра:\n    «${p}»`);
    for (const p of softMissing) console.log(`  ~ подсказка не найдена (плейсхолдер или подпись, проверь):\n    «${p}»`);
  }
} finally {
  await browser.close();
  stop();
}

process.exit(failed ? 1 : 0);
