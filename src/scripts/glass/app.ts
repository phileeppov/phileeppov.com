// Страница /glass: загрузка логотипа, ползунки, экспорт PNG и видео. Всё в браузере, ничего не уходит на сервер.
import { GlassRenderer, LOGO_FILL, SDF_SPREAD, type GlassParams, type Shape, type Background, type Sides } from "./renderer";
import { buildSdf } from "./sdf";

const LAYER = 1024; // текстуры логотипа, px
const EXPORT_PX = 1024;
const VIDEO_PX = 1080;
const SUPERSAMPLE = 2; // PNG считается вдвое крупнее и сжимается — края без лесенок. Видео так не тянет 60 кадров.
const PERIOD = 4000; // одна петля анимации, мс
const TAU = Math.PI * 2;

// Логотип по умолчанию — ☺ из бренда (brand.md §06), пока человек не загрузил свой.
// Добрый: глаза-дуги, как будто жмурится, мягкая неглубокая улыбка (выбор из десяти вариантов, 22.10.2026).
const DEMO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="none" stroke="#0a0a0a" stroke-width="7" stroke-linecap="round"><circle cx="50" cy="50" r="42"/><path d="M31 46Q37 37 43 46M57 46Q63 37 69 46"/><path d="M34 59Q50 72 66 59"/></g></svg>`;

type LogoColor = "original" | "black" | "white";

const root = document.querySelector<HTMLElement>("[data-glass]")!;
const canvas = root.querySelector<HTMLCanvasElement>("canvas")!;
const stage = root.querySelector<HTMLElement>("[data-stage]")!;
const fileInput = root.querySelector<HTMLInputElement>("input[type=file]")!;
const pngButton = root.querySelector<HTMLButtonElement>("[data-png]")!;
const videoButton = root.querySelector<HTMLButtonElement>("[data-video]")!;
const status = root.querySelector<HTMLElement>("[data-status]")!;
const shareButton = root.querySelector<HTMLButtonElement>("[data-share]")!;

const tokens = getComputedStyle(document.documentElement);
const BG: Record<"light" | "dark", [number, number, number]> = {
  light: hexToRgb(tokens.getPropertyValue("--color-off-white")),
  dark: hexToRgb(tokens.getPropertyValue("--color-black")),
};
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Что выбрано в полях. Для шейдера переводится в числа (target), на экране догоняется плавно (ease).
interface State {
  shape: Shape;
  refraction: number;
  dispersion: number;
  edge: number;
  motion: number;
  size: number;
  tint: [number, number, number] | null;
  sides: Sides;
  spread: number;
  liquid: number;
  volume: number;
  depth: number;
  background: Background;
  bg: [number, number, number];
}

const params: State = {
  shape: "squircle",
  refraction: 1,
  dispersion: 0.8,
  edge: 0.16,
  motion: 0.5,
  size: 0.8,
  tint: null,
  sides: "all",
  spread: 0.35,
  liquid: 0,
  volume: 0.5,
  depth: 0,
  background: "light",
  bg: BG.light,
};
let angleDeg = 45;
let spin = false;
let volumeOn = false;
let thickness = 0.5;
// Толщина остаётся, когда объём выключают: плавно уходит только depth, и объём растворяется, а не схлопывается.
const applyVolume = () => {
  params.volume = thickness;
  params.depth = volumeOn ? 1 : 0;
};
let logoColor: LogoColor = "original";
let demo = true; // пока человек не загрузил свой логотип
let logoLuma = 0; // средняя яркость логотипа 0..1 — тёмный логотип на тёмном фоне красим в белый
let autoColor = false; // цвет переключили мы, а не человек
let recording = false;

let renderer: GlassRenderer;
try {
  renderer = new GlassRenderer(canvas);
} catch {
  root.classList.add("is-unsupported");
  throw new Error("WebGL недоступен");
}

// --- Логотип ---

async function loadFile(file: File) {
  if (recording) return; // логотип не меняется посреди записи видео
  demo = false;
  if (autoColor) setColor("original");
  if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
    await loadSvg(await file.text());
  } else if (file.type.startsWith("image/")) {
    await loadUrl(URL.createObjectURL(file));
  } else {
    say("That file isn't an image. Try an SVG or PNG.");
  }
}

// SVG без width/height браузер рисует крошечным — проставляем размер из viewBox.
async function loadSvg(text: string) {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.nodeName.toLowerCase() !== "svg") return say("Couldn't read that SVG.");
  solidify(svg);
  const vb = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  const w = parseFloat(svg.getAttribute("width") ?? "") || vb[2] || 100;
  const h = parseFloat(svg.getAttribute("height") ?? "") || vb[3] || 100;
  if (!svg.getAttribute("viewBox")) svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const k = (LAYER * 2) / Math.max(w, h);
  svg.setAttribute("width", String(w * k));
  svg.setAttribute("height", String(h * k));
  const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
  await loadUrl(URL.createObjectURL(blob));
}

// Слои с прозрачностью из Фигмы (opacity, fill-opacity, stroke-opacity) ставим в 100%:
// полупрозрачный логотип стекло почти не видит — и сам он, и преломление выходят бледными.
const OPACITY = ["opacity", "fill-opacity", "stroke-opacity"];
function solidify(svg: Element) {
  for (const el of [svg, ...svg.querySelectorAll("*")]) {
    for (const attr of OPACITY) el.removeAttribute(attr);
    const style = el.getAttribute("style");
    if (style) el.setAttribute("style", style.replace(/(?:^|;)\s*(?:fill-|stroke-)?opacity\s*:[^;]*/gi, ""));
  }
  for (const css of svg.querySelectorAll("style")) {
    css.textContent = (css.textContent ?? "").replace(/(?:fill-|stroke-)?opacity\s*:[^;}]*;?/gi, "");
  }
}

async function loadUrl(url: string) {
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    return say("Couldn't open that image.");
  }
  try {
    buildLogo(img, trim(img));
  } catch {
    // Например, SVG с <foreignObject> (размытие фона из Фигмы) — браузер не даёт прочитать пиксели.
    return say("Couldn't open that image.");
  } finally {
    URL.revokeObjectURL(url);
  }
  say("");
  if (!demo) track("upload");
  fitColorToBackground();
  applyColor();
  draw();
  kick();
}

// Пустые поля вокруг логотипа срезаем: эффект виден, только когда рисунок доходит до кромки.
function trim(img: HTMLImageElement) {
  const k = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const h = Math.max(1, Math.round(img.naturalHeight * k));
  const data = pixels(w, h, (ctx) => ctx.drawImage(img, 0, 0, w, h));
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
  return { x: x0 / k, y: y0 / k, w: (x1 - x0 + 1) / k, h: (y1 - y0 + 1) / k };
}

// Две текстуры: поле расстояний для формы и цвет, раздвинутый за край — чтобы размытая кромка не темнела.
function buildLogo(img: HTMLImageElement, crop: { x: number; y: number; w: number; h: number }) {
  const k = (LAYER * LOGO_FILL) / Math.max(crop.w, crop.h);
  const w = crop.w * k;
  const h = crop.h * k;
  const place = (ctx: CanvasRenderingContext2D) =>
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, (LAYER - w) / 2, (LAYER - h) / 2, w, h);

  const shape = pixels(LAYER, LAYER, place);
  // PNG целиком полупрозрачный — дотягиваем альфу до полной по самому плотному пикселю.
  let maxAlpha = 0;
  for (let i = 3; i < shape.length; i += 4) if (shape[i] > maxAlpha) maxAlpha = shape[i];
  if (maxAlpha > 0 && maxAlpha < 250) for (let i = 3; i < shape.length; i += 4) shape[i] = (shape[i] * 255) / maxAlpha;
  const sdf = buildSdf(shape, LAYER, SDF_SPREAD);

  const color = document.createElement("canvas");
  color.width = color.height = LAYER;
  const ctx = color.getContext("2d", { willReadFrequently: true })!;
  for (const blur of [24, 6, 0]) {
    ctx.filter = blur ? `blur(${blur}px)` : "none";
    place(ctx);
  }
  ctx.filter = "none";
  const data = ctx.getImageData(0, 0, LAYER, LAYER);
  const px = data.data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (shape[i + 3] > 128) {
      r += shape[i];
      g += shape[i + 1];
      b += shape[i + 2];
      n++;
    }
  }
  const avg = n ? [r / n, g / n, b / n] : [0, 0, 0];
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) [px[i], px[i + 1], px[i + 2]] = avg;
    px[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  logoLuma = (0.299 * avg[0] + 0.587 * avg[1] + 0.114 * avg[2]) / 255;
  renderer.setLogo(sdf, color, LAYER);
}

function pixels(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  paint(ctx);
  return ctx.getImageData(0, 0, w, h).data;
}

function applyColor() {
  params.tint = logoColor === "black" ? hexToRgb(tokens.getPropertyValue("--color-black")) : logoColor === "white" ? [1, 1, 1] : null;
}

// --- Отрисовка ---

let t0 = performance.now();
let frame = 0;
let last = 0;
let lastTint: [number, number, number] = [0, 0, 0];

const spinning = () => spin && params.sides !== "all";
const animated = () => params.motion > 0 || spinning();

function phaseAt(now: number) {
  return animated() ? ((now - t0) % PERIOD) / PERIOD : 0;
}

// Состояние полей → числа для шейдера. Угол — без прокрутки, её добавляет withTurn.
function target(st: State): GlassParams {
  if (st.tint) lastTint = st.tint;
  return {
    n: st.shape === "circle" ? 2 : 5,
    refraction: st.refraction,
    dispersion: st.dispersion,
    edge: st.edge,
    motion: st.motion,
    size: st.size,
    tint: lastTint,
    tintMix: st.tint ? 1 : 0,
    sideMix: st.sides === "all" ? 0 : 1,
    sideTwo: st.sides === "two" ? 1 : 0,
    angle: (angleDeg / 180) * Math.PI,
    spread: st.spread,
    liquid: st.liquid,
    volume: st.volume,
    depth: st.depth,
    background: st.background,
    bg: st.bg,
  };
}

// Прокрутка: один оборот за петлю, у двух сторон — пол-оборота, рисунок повторяется.
function withTurn(p: GlassParams, phase: number): GlassParams {
  const turn = spinning() ? phase * TAU * (params.sides === "two" ? 0.5 : 1) : 0;
  return { ...p, angle: p.angle + turn };
}

// Плавность: каждое число на экране догоняет выбранное с постоянной времени EASE —
// стекло перетекает из квадрата в круг, из одних сторон в другие, а не прыгает.
const EASE = 90; // мс
const EASED = ["n", "refraction", "dispersion", "edge", "motion", "size", "tintMix", "sideMix", "sideTwo", "angle", "spread", "liquid", "volume", "depth"] as const;
let shown: GlassParams | null = null;

function ease(goal: GlassParams, dt: number): boolean {
  if (!shown || reducedMotion) {
    shown = { ...goal };
    return false;
  }
  const a = 1 - Math.exp(-dt / EASE);
  let moving = false;
  for (const key of EASED) {
    const d = goal[key] - shown[key];
    if (Math.abs(d) > 1e-4) {
      shown[key] += d * a;
      moving = true;
    } else shown[key] = goal[key];
  }
  shown.tint = shown.tint.map((c, i) => c + (goal.tint[i] - c) * a) as [number, number, number];
  shown.background = goal.background;
  shown.bg = goal.bg;
  return moving;
}

function previewSize() {
  const css = stage.clientWidth;
  return Math.min(Math.round(css * Math.min(devicePixelRatio, 2)), 1400);
}

// Кадр без догоняния — для ресайза и после экспорта.
function draw() {
  if (recording) return;
  if (!shown) shown = target(params);
  renderer.setSize(previewSize());
  const phase = phaseAt(performance.now());
  renderer.render(withTurn(shown, phase), phase);
}

function loop(now: number) {
  frame = 0;
  if (recording) return;
  const moving = ease(target(params), Math.min(now - last, 100));
  last = now;
  draw();
  if (moving || animated()) frame = requestAnimationFrame(loop);
}

// Запустить перерисовку, если цикл стоит.
function kick() {
  if (frame || recording) return;
  last = performance.now();
  frame = requestAnimationFrame(loop);
}

new ResizeObserver(() => draw()).observe(stage);

// --- Управление ---

// Значения берём из полей: браузер может вернуть их после перезагрузки.
for (const input of root.querySelectorAll<HTMLInputElement>("input[type=range]")) {
  const box = input.parentElement!;
  const val = box.querySelector<HTMLElement>(".val");
  const set = () => {
    const v = Number(input.value);
    const min = Number(input.min);
    // --p — положение ручки 0..1 для вёрстки, .val — число, которое видно, пока тянешь.
    box.style.setProperty("--p", String((v - min) / (Number(input.max) - min)));
    // Число — атрибутом, а не текстом: это показание, а не копирайт страницы (copy-check сверяет текст).
    if (val) val.dataset.v = input.name === "angle" ? `${Math.round(v)}°` : v.toFixed(2);
    if (input.name === "angle") angleDeg = v;
    else if (input.name === "thickness") {
      thickness = v;
      applyVolume();
    } else (params as unknown as Record<string, number>)[input.name] = v;
  };
  if (input.name === "motion" && reducedMotion) input.value = "0";
  set();
  input.addEventListener("input", () => {
    set();
    kick();
  });
  // Двойной клик по ползунку — вернуть значение по умолчанию.
  input.addEventListener("dblclick", () => {
    input.value = input.defaultValue;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const spinInput = root.querySelector<HTMLInputElement>("input[name=spin]")!;
spin = spinInput.checked && !reducedMotion;
spinInput.checked = spin;
spinInput.addEventListener("change", () => {
  spin = spinInput.checked;
  kick();
});

const volumeInput = root.querySelector<HTMLInputElement>("input[name=volume]")!;
const syncVolume = () => {
  volumeOn = volumeInput.checked;
  root.dataset.volume = volumeOn ? "on" : "off";
  root.querySelector<HTMLInputElement>("input[name=thickness]")!.disabled = !volumeOn;
  applyVolume();
};
syncVolume();
volumeInput.addEventListener("change", () => {
  syncVolume();
  kick();
});

for (const input of root.querySelectorAll<HTMLInputElement>("input[type=radio]")) {
  const apply = () => {
    if (input.name === "shape") params.shape = input.value as Shape;
    if (input.name === "sides") {
      params.sides = input.value as Sides;
      root.dataset.sides = input.value;
      // Угол и прокрутка без выбранных сторон ничего не меняют — выключаем по-настоящему, не только видом.
      for (const el of root.querySelectorAll<HTMLInputElement>(".directional input")) el.disabled = input.value === "all";
    }
    if (input.name === "background") {
      params.background = input.value as Background;
      params.bg = input.value === "dark" ? BG.dark : BG.light;
    }
    if (input.name === "color") logoColor = input.value as LogoColor;
  };
  if (input.checked) apply();
  input.addEventListener("change", () => {
    if (!input.checked) return;
    apply();
    if (input.name === "background") {
      fitColorToBackground();
    }
    if (input.name === "color") autoColor = false;
    applyColor();
    kick();
  });
}
applyColor();

// Тёмный логотип на тёмном фоне пропадает — красим в белый, и обратно, когда фон снова светлый.
// Решаем по яркости самого логотипа, а не только для демо-смайлика.
function fitColorToBackground() {
  const dark = params.background === "dark";
  if (dark && (logoColor === "black" || (logoColor === "original" && logoLuma < 0.3))) setColor("white", true);
  else if (!dark && logoColor === "white") setColor(autoColor ? "original" : "black", true);
}

function setColor(c: LogoColor, auto = false) {
  logoColor = c;
  autoColor = auto;
  root.querySelector<HTMLInputElement>(`input[name=color][value=${c}]`)!.checked = true;
  applyColor();
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) loadFile(file);
  fileInput.value = "";
});

// Файл можно бросить куда угодно на страницу; пока несёшь — сцена подсвечена.
let dragDepth = 0;
document.addEventListener("dragenter", (e) => {
  if (!e.dataTransfer?.types.includes("Files")) return;
  dragDepth++;
  root.classList.add("is-over");
});
document.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) root.classList.remove("is-over");
});
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  e.preventDefault();
  dragDepth = 0;
  root.classList.remove("is-over");
  const file = e.dataTransfer?.files[0];
  if (file) loadFile(file);
});

// --- Пресеты ---

// Готовые виды одним кликом. Studio стоит по умолчанию и в разметке — первый экран сразу «вау».
type Preset = { ranges: Record<string, number>; radios: Record<string, string>; checks: Record<string, boolean> };
// Каждый пресет задаёт форму, стороны, фон, объём и прокрутку целиком — иначе вид зависел бы от предыдущего.
const PRESETS: Record<string, Preset> = {
  // Логотип натекает в два противоположных угла — как нота у Apple.
  studio: {
    ranges: { size: 0.66, refraction: 1.5, dispersion: 0.95, edge: 0.18, liquid: 0.75, angle: 45, spread: 0.6, thickness: 0.35, motion: 0.5 },
    radios: { sides: "two", background: "light", shape: "squircle" },
    checks: { volume: true, spin: false },
  },
  // Натекает во все углы, радужные пятна.
  melt: {
    ranges: { size: 0.6, refraction: 1.2, dispersion: 0.9, edge: 0.22, liquid: 0.85, thickness: 0.45, motion: 0.7 },
    radios: { sides: "all", background: "light", shape: "squircle" },
    checks: { volume: true, spin: false },
  },
  // Тонкая радуга по всей кромке, логотип почти не тронут — без тяжёлой рамки его цвета.
  prism: {
    ranges: { size: 0.62, refraction: 1.05, dispersion: 1, edge: 0.14, liquid: 0, thickness: 0.6, motion: 0.5 },
    radios: { sides: "all", background: "light", shape: "squircle" },
    checks: { volume: true, spin: false },
  },
  // Круглая линза — как штамп бренда (brand.md §06).
  lens: {
    ranges: { size: 0.6, refraction: 0.85, dispersion: 1, edge: 0.28, liquid: 0.15, thickness: 0.5, motion: 0.4 },
    radios: { sides: "all", background: "light", shape: "circle" },
    checks: { volume: true, spin: false },
  },
  // Тёмный фон; тёмный логотип сам станет белым.
  night: {
    ranges: { size: 0.62, refraction: 1.3, dispersion: 1, edge: 0.2, liquid: 0.75, thickness: 0.6, motion: 0.5 },
    radios: { sides: "all", background: "dark", shape: "squircle" },
    checks: { volume: true, spin: false },
  },
};
const PRESET_KEYS = new Set(Object.values(PRESETS).flatMap((p) => [...Object.keys(p.ranges), ...Object.keys(p.radios), ...Object.keys(p.checks)]));
let applyingPreset = false;

// Пресет ставит значения в сами поля — стекло перетекает к нему тем же догонянием, что и от ползунков.
function applyPreset(name: string) {
  const preset = PRESETS[name];
  if (!preset) return;
  applyingPreset = true;
  for (const [key, on] of Object.entries(preset.checks)) {
    const el = root.querySelector<HTMLInputElement>(`input[name=${key}]`)!;
    if (el.checked !== on) {
      el.checked = on;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
  for (const [key, value] of Object.entries(preset.radios)) {
    const el = root.querySelector<HTMLInputElement>(`input[name=${key}][value=${value}]`)!;
    if (!el.checked) {
      el.checked = true;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
  for (const [key, value] of Object.entries(preset.ranges)) {
    if (key === "motion" && reducedMotion) continue;
    const el = root.querySelector<HTMLInputElement>(`input[name=${key}]`)!;
    el.value = String(value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  applyingPreset = false;
}

for (const input of root.querySelectorAll<HTMLInputElement>("input[name=preset]")) {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    applyPreset(input.value);
    track(`preset:${input.value}`);
  });
}

// Advanced помнит, раскрыт ли он, — у каждого посетителя в его браузере.
const advanced = root.querySelector<HTMLDetailsElement>("[data-advanced]")!;
try {
  if (localStorage.getItem("glass-advanced") === "open") {
    advanced.classList.add("instant");
    advanced.open = true;
    requestAnimationFrame(() => requestAnimationFrame(() => advanced.classList.remove("instant")));
  }
} catch {
  // Хранилище недоступно — просто свёрнут.
}
advanced.addEventListener("toggle", () => {
  try {
    localStorage.setItem("glass-advanced", advanced.open ? "open" : "closed");
  } catch {
    // Не запомнили — не страшно.
  }
});

// Тронул настройку, которую задаёт пресет, — выбор пресета снимается: вид уже свой.
const clearPreset = (e: Event) => {
  const name = (e.target as HTMLInputElement).name;
  if (applyingPreset || !PRESET_KEYS.has(name)) return;
  for (const input of root.querySelectorAll<HTMLInputElement>("input[name=preset]")) input.checked = false;
};
root.addEventListener("input", clearPreset);
root.addEventListener("change", clearPreset);

// Фигма копирует «Copy as SVG» текстом — принимаем и текст, и картинку из буфера.
document.addEventListener("paste", (e) => {
  const data = e.clipboardData;
  if (!data) return;
  const file = [...data.files].find((f) => f.type.startsWith("image/"));
  if (file) return void loadFile(file);
  const text = data.getData("text/plain").trim();
  if (recording) return;
  if (text.startsWith("<svg") || text.startsWith("<?xml")) {
    demo = false;
    if (autoColor) setColor("original");
    loadSvg(text);
  }
});

// --- Экспорт ---

// Кадр считается в SUPERSAMPLE раз крупнее и сжимается в итоговый размер.
function frameInto(out: HTMLCanvasElement, p: GlassParams, phase: number) {
  renderer.setSize(out.width * SUPERSAMPLE);
  renderer.render(p, phase);
  const ctx = out.getContext("2d")!;
  ctx.clearRect(0, 0, out.width, out.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
}

pngButton.addEventListener("click", () => {
  const out = document.createElement("canvas");
  out.width = out.height = EXPORT_PX;
  const phase = phaseAt(performance.now());
  frameInto(out, withTurn(target(params), phase), phase);
  const done = (blob: Blob | null) => {
    if (blob) {
      save(blob, "glass-icon.png");
      track("png");
    }
    draw();
  };
  // iOS пускает в «Поделиться» надёжно только в том же такте, что и нажатие, а toBlob отвечает позже —
  // там PNG собираем синхронно.
  if (ios) done(dataUrlToBlob(out.toDataURL("image/png")));
  else out.toBlob(done, "image/png");
});

videoButton.addEventListener("click", async () => {
  const type =
    typeof MediaRecorder === "undefined"
      ? undefined
      : ["video/mp4;codecs=avc1.640028", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((t) =>
          MediaRecorder.isTypeSupported(t),
        );
  if (!type) return say("This browser can't record video. Try Chrome or Safari.");

  recording = true;
  // Обнулить обязательно: иначе kick() после записи считает цикл живым, и превью замирает.
  cancelAnimationFrame(frame);
  frame = 0;
  root.classList.add("is-recording");
  videoButton.disabled = pngButton.disabled = true;
  say(params.background === "none" ? "Recording on light: video can't be transparent." : "Recording…");

  // Если браузер не потянет запись (кодек, 1080p, битрейт), страница не должна остаться с выключенными кнопками.
  let message = "";
  try {
    // Без фона видео не бывает: прозрачный режим пишем на светлом. Неподвижное видео смысла не имеет — качаем форму.
    const base = target({
      ...params,
      ...(params.background === "none" ? { background: "light" as const, bg: BG.light } : {}),
      motion: animated() ? params.motion : 0.5,
    });

    // Wide — кадр 1920×1080 для ленты X: квадрат с иконкой по центру, поля того же цвета, что фон.
    const wide = root.querySelector<HTMLInputElement>("input[name=format]:checked")?.value === "wide";
    const frameCanvas = wide ? document.createElement("canvas") : null;
    const frameCtx = frameCanvas?.getContext("2d");
    if (frameCanvas) {
      frameCanvas.width = 1920;
      frameCanvas.height = VIDEO_PX;
    }
    const fill = `rgb(${base.bg.map((c) => Math.round(c * 255)).join(",")})`;
    const paint = (phase: number) => {
      renderer.render(withTurn(base, phase), phase);
      if (frameCtx) {
        frameCtx.fillStyle = fill;
        frameCtx.fillRect(0, 0, 1920, VIDEO_PX);
        frameCtx.drawImage(canvas, (1920 - VIDEO_PX) / 2, 0, VIDEO_PX, VIDEO_PX);
      }
    };

    renderer.setSize(VIDEO_PX);
    paint(0);
    const stream = (frameCanvas ?? canvas).captureStream(60);
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 16_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));

    recorder.start();
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        const elapsed = now - start;
        const phase = Math.min(elapsed / PERIOD, 1) % 1;
        paint(phase);
        if (elapsed < PERIOD) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    recorder.stop();
    await done;
    stream.getTracks().forEach((t) => t.stop());

    const mp4 = type.startsWith("video/mp4");
    if (chunks.length) {
      save(new Blob(chunks, { type }), `glass-icon${wide ? "-wide" : ""}.${mp4 ? "mp4" : "webm"}`);
      track(wide ? "video-wide" : "video");
      // X берёт видео в MP4 и MOV; WebM пишут браузеры без записи в MP4 (Firefox).
      if (!mp4) message = "Saved as WebM. For X, record in Chrome or Safari.";
    } else {
      message = "This browser can't record video. Try Chrome or Safari.";
    }
  } catch {
    message = "This browser can't record video. Try Chrome or Safari.";
  } finally {
    recording = false;
    root.classList.remove("is-recording");
    videoButton.disabled = pngButton.disabled = false;
    say(message);
    t0 = performance.now();
    frame = 0;
    kick();
  }
});

// --- Поделиться в X ---

// Тексты — из плана запуска («Glass — запуск» §11, после фокус-группы): в заготовке только адрес, без @ —
// подпись автора дизайнеры стирают как водяной знак.
const SHARE_URL = "https://phileeppov.com/glass";
const SHARE_TEXT = "made with";
const SHARE_POST = `${SHARE_TEXT} ${SHARE_URL.replace("https://", "")}`;
const SHARE_LABEL = shareButton.textContent;
// Телефон — системное «Поделиться» с файлом. На компьютере в этом меню X обычно нет, поэтому там — буфер и редактор X.
const touch = matchMedia("(pointer: coarse)").matches;
// iPhone и iPad (iPad представляется Маком, выдаёт его сенсор). Обычное скачивание там уводит файл в «Файлы»,
// а браузер X открывает картинку на весь экран. Поэтому сохраняем через «Поделиться»: в меню «Save Image» в «Фото»
// и сразу X (само меню проверено Ником на iPhone в Safari и в браузере X, 23.10.2026; «Download PNG» сразу в меню — нет).
const ios =
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
let lastExport: { blob: Blob; name: string; video: boolean } | null = null;

async function save(blob: Blob, name: string) {
  const file = new File([blob], name, { type: blob.type });
  if (!ios || !navigator.canShare?.({ files: [file] })) return download(blob, name);
  lastExport = { blob, name, video: blob.type.startsWith("video/") };
  shareButton.hidden = true;
  // Меню «Поделиться» открывается только сразу после нажатия, а видео пишется 4 с — для него сразу кнопка.
  if (lastExport.video) return offerSave();
  try {
    await navigator.share({ files: [file], text: SHARE_POST });
  } catch (e) {
    // Закрыл меню или тапнул дважды (меню уже открыто) — ничего. Не пустило по другой причине — та же кнопка.
    const reason = (e as DOMException).name;
    if (reason !== "AbortError" && reason !== "InvalidStateError") offerSave();
  }
}

// На iPhone кнопка под экспортом — не тихая ссылка, а полноценная: без неё файл не сохранить.
function offerSave() {
  shareButton.textContent = lastExport?.video ? "Save video" : "Save image";
  shareButton.classList.add("is-save");
  shareButton.hidden = false;
}

shareButton.addEventListener("click", async () => {
  if (!lastExport) return;
  // На iPhone эта кнопка — «сохранить», а не «поделиться»: в счётчик share не идёт.
  if (!ios) track("share");
  const file = new File([lastExport.blob], lastExport.name, { type: lastExport.blob.type });
  if ((touch || ios) && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: SHARE_POST });
    } catch (e) {
      // Закрыл меню — ничего. На iPhone без меню файл не сохранить, поэтому при сбое — обычное скачивание.
      if (ios && (e as DOMException).name !== "AbortError") download(file, file.name);
    }
    return;
  }
  // Ссылка на редактор X умеет только текст и адрес; картинку кладём в буфер, видео — перетащить из загрузок.
  let hint = "Attach the video you just downloaded.";
  if (!lastExport.video) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": lastExport.blob })]);
      hint = "Image copied. Paste it into your post.";
    } catch {
      hint = "Attach the image you just downloaded.";
    }
  }
  // Отдельным окном поверх страницы — подсказка на странице остаётся видна.
  const tab = window.open(
    `https://x.com/intent/post?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(SHARE_URL)}`,
    "_blank",
    "popup,width=620,height=720",
  );
  if (tab) tab.opener = null;
  say(tab ? hint : "Pop-up blocked. Allow pop-ups to open X.");
});

// --- Мелочи ---

// Анонимный счётчик: на сервер уходит только название события — без логотипа и данных о человеке
// (/api/event, worker/index.js). Выстрелил и забыл: страница ответа не ждёт.
function track(name: string) {
  try {
    navigator.sendBeacon?.("/api/event", name);
  } catch {
    // Не отправилось — не страшно.
  }
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  // На iOS скачивание подтверждают вручную — ссылку держим минуту, а не секунду.
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  // После сохранения появляется «поделиться»: делиться можно только по нажатию, файл к этому моменту готов.
  // WebM X, скорее всего, не примет — кнопку не показываем, подсказка про Chrome и Safari остаётся.
  if (blob.type.includes("webm")) {
    lastExport = null;
    shareButton.hidden = true;
    return;
  }
  lastExport = { blob, name, video: blob.type.startsWith("video/") };
  // Кнопка могла остаться iPhone-кнопкой «Save …» от прошлого экспорта — возвращаем ссылку.
  shareButton.classList.remove("is-save");
  shareButton.textContent = touch ? "Share" : SHARE_LABEL;
  shareButton.hidden = false;
}

// Синхронная замена toBlob для iOS (см. «Download PNG»).
function dataUrlToBlob(url: string) {
  const bytes = atob(url.slice(url.indexOf(",") + 1));
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes.charCodeAt(i);
  return new Blob([out], { type: "image/png" });
}

function say(text: string) {
  status.textContent = text;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.trim().replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

loadSvg(DEMO_SVG).then(kick);
