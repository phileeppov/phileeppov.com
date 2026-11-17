// Emerald cut — the behaviour the markup alone can't carry: where the stones and the picture sit; the watched
// stretches cut into the timeline; the play stone turning while the reel plays; the volume cut into its own small
// stone; the mark when the timeline is cut in full. Video.js does the rest.

import { Stone } from "./stone.js";

const WORDS = {
  en: { sound: "Sound", muted: "Muted", cc: "Captions", full: "Full screen", exit: "Exit", mark: "Cut in full", fail: "The video didn't load" },
  ru: { sound: "Звук", muted: "Без звука", cc: "Субтитры", full: "На весь экран", exit: "Выйти", mark: "Огранён целиком", fail: "Видео не загрузилось" },
  es: { sound: "Sonido", muted: "Silencio", cc: "Subtítulos", full: "Pantalla completa", exit: "Salir", mark: "Tallado entero", fail: "El vídeo no se cargó" },
  ar: { sound: "الصوت", muted: "صامت", cc: "الترجمة", full: "ملء الشاشة", exit: "خروج", mark: "قُطع بالكامل", fail: "تعذّر تحميل الفيديو" },
};

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let uid = 0;

// Where things sit: the picture as large as the box allows; under it the play stone at the left, then the timeline,
// as long as the rest of the picture's width; under them the engraved row, and under the play stone its speed. Every
// size the canvas and the CSS use comes from here.
export function geometry(W, H, aspect, narrow = false, gemScale = 1.15) {
  const compact = narrow || W < 640;
  const row = compact ? 100 : 56;
  const pad = compact ? 12 : clamp(Math.min(W, H) * 0.045, 18, 72);
  const bh = compact ? 34 : Math.round(clamp(Math.min(W, H) * 0.062, 42, 72));   // the stone's height
  const D = compact ? 50 : Math.round(clamp(bh * gemScale, 52, 100));            // the play stone
  const gap = compact ? 10 : Math.round(clamp(bh * 0.3, 10, 18));
  const below = compact ? 6 : 10;
  const tw = Math.max(160, Math.min(W - 2 * pad, (H - 2 * pad - gap - D - below - row) * aspect));
  const th = tw / aspect;
  const top = Math.max(pad, (H - (th + gap + D + below + row)) / 2);
  const vx = Math.round(W / 2 - tw / 2), vy = Math.round(top), vw = Math.round(tw), vh = Math.round(th);
  const by = Math.round(vy + vh + gap + D / 2);
  const wr = D / 2, wx = vx + wr;
  const x0 = Math.round(vx + D + Math.max(5, D * 0.08)), x1 = vx + vw;
  return {
    vx, vy, vw, vh, by, bh, wx, wr, x0, x1, cx: (x0 + x1) / 2, A: (x1 - x0) / 2,
    K: Math.round(bh * 0.34), S: Math.round(bh * 0.22), row, rowY: Math.round(by + D / 2 + below), compact,
  };
}

export function cut(root) {
  const host = root.querySelector("video, mux-video, hls-video, hlsjs-video");
  const media = () => (host?.tagName === "VIDEO" ? host : host?.nativeEl ?? host?.shadowRoot?.querySelector("video") ?? host);
  const canvas = root.querySelector(".cut-light");
  const rule = root.querySelector(".cut-rule");
  const volEl = root.querySelector(".cut-vol");
  const stone = new Stone(canvas);
  root.toggleAttribute("data-flat", !stone.ok);
  // The GPU can drop the canvas (a phone tab in the background, a driver reset): the CSS stones stand in until it
  // comes back, then the canvas is rebuilt with what has been watched.
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); stone.ok = false; root.toggleAttribute("data-flat", true); });
  canvas.addEventListener("webglcontextrestored", () => {
    stone.restore();
    root.toggleAttribute("data-flat", !stone.ok);
    atlasDirty = true;
    pushAtlas();
    rebuild(false);
    dirty = true;
    wake();
  });

  // ---- Place the stone, the picture over its table, the time along its lower crown, the row under it.
  let geo = null;
  const place = () => {
    const W = root.clientWidth, H = root.clientHeight;
    if (!W || !H) return;
    const v = media();
    const aspect = v?.videoWidth ? v.videoWidth / v.videoHeight : 16 / 9;
    const full = document.fullscreenElement === root;
    const reserve = full ? 0 : Number(root.dataset.reserve) || 0;     // room a page keeps above the player (a title)
    const reserveB = full ? 0 : Number(root.dataset.reserveBottom) || 0;   // and under it (a line of credits)
    const lay = (narrow) => {
      geo = geometry(W, H - reserve - reserveB, aspect, narrow, Number(root.dataset.gem) || 1.15);
      if (reserve) { geo.vy += reserve; geo.by += reserve; geo.rowY += reserve; }
      const { vx, vy, vw, vh, by, bh, wx, wr, x0, x1, row, rowY } = geo;
      const set = (n, x) => root.style.setProperty(n, `${x}px`);
      set("--cut-x", vx); set("--cut-y", vy); set("--cut-w", vw); set("--cut-h", vh); set("--cut-k", Math.round(Math.min(10, vh * 0.014)));
      set("--cut-s", bh); set("--cut-girdle-x", x0); set("--cut-girdle-w", x1 - x0); set("--cut-end-x", x1);
      set("--cut-band-y", by); set("--cut-row-y", rowY); set("--cut-row-h", row);
      set("--cut-wheel-x", wx); set("--cut-wheel-d", 2 * wr);
      root.toggleAttribute("data-compact", geo.compact);
    };
    lay(false);
    // The words of the row take the room they need (longer in Russian or Spanish, one more with captions): when the
    // time, a short chapter line and the keys don't fit the stone's length, the row goes to two lines.
    const clock = root.querySelector(".cut-clock"), keys = root.querySelector(".cut-keys");
    if (!geo.compact && clock && keys && clock.offsetWidth + keys.scrollWidth + 24 + 120 > geo.x1 - geo.x0) lay(true);
    const vr = volEl?.getBoundingClientRect(), rr = root.getBoundingClientRect();
    stone.vol = vr && vr.width > 0 ? [vr.x - rr.x + vr.width / 2, vr.y - rr.y + vr.height / 2, vr.width / 2 - 3, geo.compact ? 6 : 8.5] : [0, 0, 0, 0];
    stone.geo = geo;
    stone.size(W, H, Math.min(devicePixelRatio || 1, 2));
    wake();
  };
  new ResizeObserver(place).observe(root);
  root.cutRelayout = place;                                           // for a page whose title or credits change size
  host?.addEventListener("loadedmetadata", place);

  // ---- The picture is a key: a press plays or pauses.
  root.querySelector(".cut-table")?.addEventListener("click", (e) => {
    if (e.target.closest(".cut-err-card")) return;
    const v = media();
    if (v) v.paused ? v.play().catch(() => {}) : v.pause();
  });

  // ---- Frames for the crown: each new video frame, else the poster.
  let dirty = true, posterImg = null;
  const poster = () => {
    const src = host?.getAttribute("poster") || media()?.poster;
    if (!src || posterImg?.dataset.src === src) return;
    posterImg = new Image();
    posterImg.crossOrigin = "anonymous";
    posterImg.dataset.src = src;
    posterImg.onload = () => { if ((media()?.readyState ?? 0) < 2) { stone.upload(posterImg); wake(); } };
    posterImg.src = src;
  };
  const hooked = new WeakSet();
  const frames = () => {
    const v = media();
    if (!v?.requestVideoFrameCallback || hooked.has(v)) return;
    hooked.add(v);
    const on = () => { dirty = true; wake(); v.requestVideoFrameCallback(on); };
    v.requestVideoFrameCallback(on);
  };
  frames();
  host?.addEventListener("loadstart", frames);
  for (const ev of ["loadeddata", "seeked", "emptied"]) host?.addEventListener(ev, () => { dirty = true; poster(); wake(); });
  poster();

  // ---- Chapters: cues from the chapters track, as cuts across the crown and a line in the row.
  let cues = [];
  const readCues = () => {
    const v = media();
    if (!v?.textTracks) return;
    for (const t of v.textTracks) {
      if (t.kind !== "chapters") continue;
      if (t.mode === "disabled") t.mode = "hidden";
      if (t.cues?.length) cues = [...t.cues].map((c) => ({ start: c.startTime, end: c.endTime, text: c.text }));
    }
    const d = v.duration;
    stone.chapters = isFinite(d) && d > 0 ? cues.map((c) => c.start / d).filter((x) => x > 0.001 && x < 0.999) : [];
  };
  host?.addEventListener("loadedmetadata", readCues);
  host?.addEventListener("durationchange", readCues);
  const nowN = root.querySelector(".cut-now-n"), nowT = root.querySelector(".cut-now-t");
  let shownChapter = -2;
  const chapter = (time) => {
    if (!cues.length) readCues();
    let i = -1;
    for (let j = 0; j < cues.length; j++) if (time >= cues[j].start && time < cues[j].end) i = j;
    if (i < 0 && cues.length && time >= cues[cues.length - 1].end) i = cues.length - 1;
    if (i === shownChapter || !nowT) return;
    shownChapter = i;
    nowN.textContent = i >= 0 ? String(i + 1).padStart(2, "0") : "";
    nowT.textContent = i >= 0 ? cues[i].text : "";
  };

  // ---- What has been watched cuts the stone. The media keeps its own record of played time; this browser keeps it
  // across visits (localStorage, per video). Nothing leaves the page.
  const N = Stone.N, map = new Uint8Array(N);
  let kept = [], seen = [], cover = 0, done = [], whole = false, flash = null, savedAt = 0, markAt = 0;
  const mark = root.querySelector(".cut-mark"), markIn = root.querySelector(".cut-mark-in");
  const keyOf = () => {
    const id = host?.getAttribute("playback-id") || host?.getAttribute("src") || media()?.currentSrc || "";
    if (!id || id.startsWith("blob:")) return "";
    try { return "cut-seen:" + (host?.hasAttribute("playback-id") ? id : new URL(id, location.href).href.split("?")[0]); } catch { return ""; }
  };
  const merge = (rs, d) => {
    const out = [];
    for (const [a, b] of rs.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])) {
      const last = out[out.length - 1];
      if (last && a <= last[1] + 0.6) last[1] = Math.max(last[1], b);
      else out.push([a, b]);
    }
    if (out.length && out[0][0] < 0.6) out[0][0] = 0;                 // seconds lost to a seek at the very ends
    if (out.length && d - out[out.length - 1][1] < 0.6) out[out.length - 1][1] = d;
    return out;
  };
  const load = () => {
    try {
      const j = JSON.parse(localStorage.getItem(keyOf()) || "null");
      kept = Array.isArray(j?.r) ? j.r.filter((r) => Array.isArray(r) && r.length === 2 && r.every(Number.isFinite) && r[1] > r[0]) : [];
      markAt = Number(j?.at) || 0;
    } catch { kept = []; markAt = 0; }
    done = []; whole = false;
  };
  const save = () => {
    const k = keyOf();
    if (!k || !seen.length) return;
    try { localStorage.setItem(k, JSON.stringify({ r: seen.map(([a, b]) => [+a.toFixed(2), +b.toFixed(2)]), at: markAt || undefined })); } catch {}
    savedAt = performance.now();
  };
  const covered = (s, e) => {
    let c = 0;
    for (const [a, b] of seen) c += Math.max(0, Math.min(b, e) - Math.max(a, s));
    return e > s ? c / (e - s) : 0;
  };
  const rebuild = (live) => {
    const v = media(), d = v?.duration;
    if (!isFinite(d) || d <= 0) return;
    seen = merge([...kept, ...session], d);
    map.fill(0);
    let total = 0;
    for (const [s, e] of seen) {
      total += e - s;
      const a = clamp(s / d, 0, 1) * N, b = clamp(e / d, 0, 1) * N;
      for (let i = Math.floor(a); i < Math.min(N, Math.ceil(b)); i++) map[i] = Math.min(255, map[i] + Math.round((Math.min(b, i + 1) - Math.max(a, i)) * 255));
    }
    cover = total / d;
    stone.seen(map);
    // Without WebGL the same record paints the flat timeline: watched stretches emerald, the rest the groove's dark.
    const stops = seen.map(([a, b]) => `transparent ${(a / d * 100).toFixed(2)}%, var(--_cut-lit) ${(a / d * 100).toFixed(2)}% ${(b / d * 100).toFixed(2)}%, transparent ${(b / d * 100).toFixed(2)}%`);
    root.style.setProperty("--cut-seen", stops.length ? `linear-gradient(90deg, ${stops.join(", ")})` : "none");
    // A chapter seen through, or the whole reel, flashes once: the moment it's done, not on the next visit.
    const nowDone = cues.map((c) => covered(c.start, Math.min(c.end, d)) > 0.985);
    const nowWhole = cover > 0.995;
    if (live && !reduced.matches) {
      if (nowWhole && !whole) flash = { a: 0, b: 1, t: performance.now(), ms: 1600 };
      else nowDone.forEach((x, i) => { if (x && done.length && !done[i]) flash = { a: cues[i].start / d, b: Math.min(cues[i].end, d) / d, t: performance.now(), ms: 1100 }; });
    }
    // Cut in full: the stone gets its mark, engraved under its end with the day it was finished. The first time, live,
    // a point of light writes it.
    if (nowWhole && !markAt) markAt = Date.now();
    if (nowWhole !== whole || (nowWhole && !mark?.hasAttribute("data-on"))) {
      const lang = (root.closest("[lang]")?.lang || "en").slice(0, 2);
      const day = markAt ? new Date(markAt).toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" }) : "";
      if (markIn) markIn.textContent = `${(WORDS[lang] ?? WORDS.en).mark} · ${day}`;
      mark?.toggleAttribute("data-on", nowWhole);
      mark?.toggleAttribute("data-fresh", nowWhole && live && !whole && !reduced.matches);
    }
    done = nowDone;
    whole = nowWhole;
    const said = whole ? "Cut in full: all watched" : `${Math.round(cover * 100)}% watched`;
    const knob = rule?.querySelector(".cut-thumb");
    if (knob && knob.getAttribute("aria-description") !== said) knob.setAttribute("aria-description", said);
  };
  host?.addEventListener("loadedmetadata", () => { load(); rebuild(false); });
  for (const ev of ["seeked", "durationchange", "emptied"]) host?.addEventListener(ev, () => rebuild(false));
  // What this page has played, stretch by stretch: kept by the skin itself, so a fresh start can clear it (the
  // media's own played ranges stay until the source changes). Time that runs on without a jump counts.
  let session = [], lastT = null;
  const note = () => {
    const v = media();
    if (!v) return;
    const t = v.currentTime;
    if (!v.paused && !v.seeking && lastT !== null && t > lastT && t - lastT < 2.5) session = merge([...session, [lastT, t]], v.duration || Infinity);
    lastT = v.paused || v.seeking ? null : t;
  };
  host?.addEventListener("timeupdate", note);
  host?.addEventListener("playing", () => { lastT = media()?.currentTime ?? null; });
  host?.addEventListener("seeking", () => { lastT = null; });
  host?.addEventListener("emptied", () => { session = []; lastT = null; });
  for (const ev of ["pause", "ended"]) host?.addEventListener(ev, () => { note(); rebuild(true); save(); });
  addEventListener("pagehide", save);
  // For a page that shows the stone at a given state, and for a viewer who wants the raw stone back.
  // ---- What you saw, kept: a small frame for each of SLOTS stretches of the reel, taken the first time the cutter
  // passes it, kept in this browser beside the record. The stone shows them inside the cut.
  const SLOTS = 48, CW = 160, COLS = 8, ROWS = 6;
  const atlas = document.createElement("canvas");
  const actx = atlas.getContext("2d");
  let fh = 90, faspect = 16 / 9, filled = new Uint8Array(SLOTS), atlasDirty = false, framesDirty = false, keptOk = true, framesSeq = 0;
  const sizeAtlas = () => {
    const v = media();
    const a = v?.videoWidth ? v.videoWidth / v.videoHeight : 16 / 9;
    const h = Math.max(24, Math.round(CW / a));
    if (atlas.width !== COLS * CW || atlas.height !== ROWS * h) {
      atlas.width = COLS * CW; atlas.height = ROWS * h;
      filled = new Uint8Array(SLOTS); atlasDirty = true;
    }
    fh = h; faspect = a;
  };
  const capture = (slot) => {
    const v = media();
    if (!v || v.readyState < 2 || !keptOk) return;
    try {
      actx.drawImage(v, (slot % COLS) * CW, Math.floor(slot / COLS) * fh, CW, fh);
      filled[slot] = 1; atlasDirty = true; framesDirty = true;
    } catch { keptOk = false; }
  };
  const pushAtlas = () => {
    if (!atlasDirty || !stone.ok) return;
    atlasDirty = false;
    stone.atlas(atlas, [COLS, ROWS, SLOTS, faspect]);
  };
  const framesKey = () => { const k = keyOf(); return k ? k + ":frames" : ""; };
  const saveFrames = () => {
    const k = framesKey();
    if (!k || !framesDirty || !filled.some(Boolean)) return;
    try { localStorage.setItem(k, JSON.stringify({ f: [...filled].join(""), img: atlas.toDataURL("image/jpeg", 0.72) })); framesDirty = false; } catch {}
  };
  const loadFrames = () => {
    const tok = ++framesSeq;
    sizeAtlas();
    filled = new Uint8Array(SLOTS);
    actx.clearRect(0, 0, atlas.width, atlas.height);
    atlasDirty = true;
    let jf = null;
    try { jf = JSON.parse(localStorage.getItem(framesKey()) || "null"); } catch {}
    if (!jf?.img || typeof jf.f !== "string") { pushAtlas(); return; }
    const img = new Image();
    img.onload = () => {
      if (tok !== framesSeq) return;                                 // forgotten, or another source since
      const sw = img.width / COLS, sh = img.height / ROWS;
      for (let k = 0; k < SLOTS; k++) {
        if (jf.f[k] !== "1" || filled[k]) continue;                  // a frame taken meanwhile stays
        actx.drawImage(img, (k % COLS) * sw, Math.floor(k / COLS) * sh, sw, sh, (k % COLS) * CW, Math.floor(k / COLS) * fh, CW, fh);
        filled[k] = 1;
      }
      atlasDirty = true; pushAtlas(); wake();
    };
    img.src = jf.img;
  };
  host?.addEventListener("loadedmetadata", loadFrames);
  host?.addEventListener("resize", sizeAtlas);
  for (const ev of ["pause", "ended"]) host?.addEventListener(ev, saveFrames);
  addEventListener("pagehide", saveFrames);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") { save(); saveFrames(); } });

  root.cutMemory = {
    get: () => seen.map((r) => [...r]),
    set: (ranges, at) => { kept = ranges.map((r) => [...r]); session = []; lastT = null; markAt = at || 0; done = []; whole = false; rebuild(false); save(); wake(); },
    forget: () => {
      kept = []; session = []; lastT = null; markAt = 0; framesSeq++;
      try { localStorage.removeItem(keyOf()); localStorage.removeItem(framesKey()); } catch {}
      filled = new Uint8Array(SLOTS); actx.clearRect(0, 0, atlas.width, atlas.height); atlasDirty = true; pushAtlas();
      rebuild(false); wake();
    },
    // Take the frames for given stretches by seeking through them (a page that shows a viewing already made).
    fill: async (ranges) => {
      const v = media(), d = v?.duration, tok = ++framesSeq;
      if (!isFinite(d)) return;
      for (let k = 0; k < SLOTS; k++) {
        const t = (k + 0.5) / SLOTS * d;
        if (!ranges.some(([a, b]) => t >= a && t <= b)) continue;
        v.currentTime = t;
        await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
        if (tok !== framesSeq) return;                               // forgotten meanwhile: keep nothing
        capture(k);
      }
      pushAtlas(); saveFrames(); wake();
    },
  };

  // ---- An error: the card says it; closed, the stone goes dim and the keyboard lands back on the play stone.
  host?.addEventListener("error", () => root.toggleAttribute("data-error", true));
  for (const ev of ["loadstart", "emptied"]) host?.addEventListener(ev, () => root.toggleAttribute("data-error", false));
  const card = root.querySelector(".cut-err-card");
  card && new MutationObserver(() => {
    if (!card.hasAttribute("data-open") && (document.activeElement === document.body || card.contains(document.activeElement))) root.querySelector(".cut-wheel")?.focus();
  }).observe(card, { attributes: true, attributeFilter: ["data-open"] });

  // ---- Captions: whatever track is showing, its words go to the line at the foot of the picture.
  const subs = root.querySelector(".cut-subs");
  const watched = new WeakSet();
  const watchTracks = () => {
    const v = media();
    if (!v?.textTracks || !subs) return;
    const show = () => {
      const t = [...v.textTracks].find((x) => (x.kind === "captions" || x.kind === "subtitles") && x.mode === "showing");
      subs.textContent = t?.activeCues ? [...t.activeCues].map((c) => c.text.replace(/<[^>]+>/g, "")).join(" ") : "";
    };
    for (const t of v.textTracks) {
      if (watched.has(t)) continue;
      watched.add(t);
      t.addEventListener("cuechange", show);
    }
    if (!watched.has(v.textTracks)) {
      watched.add(v.textTracks);
      v.textTracks.addEventListener("change", show);
      v.textTracks.addEventListener("addtrack", watchTracks);
    }
    show();
  };
  host?.addEventListener("loadedmetadata", watchTracks);
  watchTracks();
  if (host && host.tagName !== "VIDEO" && host.shadowRoot) {
    const st = document.createElement("style");
    st.textContent = "video::cue { color: transparent; background: transparent; }";
    host.shadowRoot.append(st);
  }

  // ---- The light: it circles the stone as the reel plays (and stops with it); a pointer over the player takes it.
  const hand = { x: 0, y: 0, on: false, p: 0 };
  root.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    const r = root.getBoundingClientRect();
    hand.x = e.clientX - r.left;
    hand.y = e.clientY - r.top;
    hand.on = true;
    wake();
  });
  root.addEventListener("pointerleave", () => { hand.on = false; wake(); });

  // ---- The frame loop runs only while something moves: the reel, the hand, a drag. Off screen, nothing runs.
  let raf = 0, visible = true, lx = 0, ly = 0, settle = 0;
  const wheel = { a: 0.6, w: 0, t: 0 };
  const press = { x: 0, y: 0, tx: 0, ty: 0 };
  const key = root.querySelector(".cut-wheel");
  key?.addEventListener("pointerdown", () => { press.tx = 1; wake(); });
  for (const ev of ["pointerup", "pointercancel"]) key?.addEventListener(ev, () => { press.tx = 0; wake(); });
  key?.addEventListener("pointerenter", () => { press.ty = 1; wake(); });
  key?.addEventListener("pointerleave", () => { press.ty = 0; press.tx = 0; wake(); });
  for (const ev of ["play", "pause"]) host?.addEventListener(ev, () => { if (!reduced.matches) { press.x = Math.max(press.x, 0.8); wake(); } });
  // When the page opens, light runs once through what has been watched.
  let intro = !reduced.matches;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; wake(); }).observe(root);
  function wake() {
    if (!raf && visible) raf = requestAnimationFrame(tick);
  }
  function tick() {
    raf = 0;
    if (!geo) return;
    const v = media();
    const playing = v && !v.paused && !v.ended && v.readyState > 2;
    if (v && v.readyState >= 2 && (dirty || (playing && !v.requestVideoFrameCallback))) {
      stone.upload(v);
      dirty = false;
    }
    const d = v?.duration;
    let now = isFinite(d) && d > 0 ? v.currentTime / d : 0;
    const dragging = rule?.hasAttribute("data-dragging");
    if (dragging) now = (parseFloat(rule.style.getPropertyValue("--media-slider-fill")) || 0) / 100;
    if (v?.ended) now = 1;
    const aim = rule?.matches("[data-pointing]") && !dragging ? (parseFloat(rule.style.getPropertyValue("--media-slider-pointer")) || 0) / 100 : -1;
    stone.span = [geo.x0, geo.x1, clamp(now, 0, 1), aim];

    // The wheel turns while the reel plays, as fast as the knob says; it takes a moment to spin up and runs down
    // slower, as a heavy wheel does. A stall (the reel waiting for data) runs it down too.
    const tnow = performance.now(), dt = Math.min(0.05, (tnow - (wheel.t || tnow)) / 1000);
    wheel.t = tnow;
    const want = playing && !reduced.matches ? 6.2832 * 0.3 * (v.playbackRate || 1) : 0;
    wheel.w += (want - wheel.w) * (1 - Math.exp(-dt / (want > wheel.w ? 0.28 : 0.6)));
    if (wheel.w < 0.02 && !want) wheel.w = 0;
    wheel.a += wheel.w * dt;
    stone.wheel = [geo.wx, geo.by, geo.wr, wheel.a];
    stone.smear = Math.min(wheel.w / 11, 2);
    const vm = media();
    stone.volLevel = vm?.muted ? 0 : clamp((parseFloat(volEl?.style.getPropertyValue("--media-slider-fill")) || (vm?.volume ?? 1) * 100) / 100, 0, 1);

    // The record grows while the reel plays; the cutter works only where nothing has been seen ahead of it.
    if (playing) {
      note();
      rebuild(true);
      if (performance.now() - savedAt > 3000) save();
      if (!dragging && isFinite(d) && d > 0) {
        const pos = v.currentTime / d * SLOTS, sl = Math.min(SLOTS - 1, Math.floor(pos));
        if (!filled[sl] && pos - sl >= 0.12) capture(sl);
      }
    }
    pushAtlas();
    const t = v?.currentTime || 0;
    const ahead = seen.some(([a, b]) => a <= t + 0.3 && b > t + 0.3);
    const cutting = playing && !dragging && !ahead ? 1 : 0;
    stone.cut += (cutting - stone.cut) * (reduced.matches ? 1 : 0.12);
    let flashing = false;
    if (flash) {
      const k = (performance.now() - flash.t) / flash.ms;
      if (k >= 1) flash = null;
      else { stone.flash = [flash.a, flash.b, k]; flashing = true; }
    }
    if (!flashing) stone.flash = [0, 0, -1];

    const target = hand.on ? 1 : 0;
    hand.p += (target - hand.p) * (reduced.matches ? 1 : 0.09);
    stone.calm = reduced.matches;
    press.x += (press.tx - press.x) * (press.tx > press.x ? 0.5 : 0.14);
    press.y += (press.ty - press.y) * 0.18;
    if (press.x < 0.002) press.x = 0;
    stone.press = [press.x, press.y];
    if (intro && seen.length && isFinite(d)) { intro = false; flash = { a: 0, b: 1, t: performance.now(), ms: 1700 }; }
    stone.rawMode = root.dataset.raw === "rock" ? 1 : 0;
    stone.gemMode = { asscher: 0, cabochon: 1, seal: 2 }[root.dataset.play] ?? 0;
    const ang = reduced.matches ? 3.6 : (v?.currentTime || 0) * 0.38 + 3.6;   // the light circles while it plays, or stands still on request
    const ox = geo.cx + Math.cos(ang) * geo.vw * 0.7, oy = geo.by + Math.sin(ang) * geo.vh * 0.9;
    const tx = ox + (hand.x - ox) * hand.p, ty = oy + (hand.y - oy) * hand.p;
    const f = reduced.matches || !settle ? 1 : 0.22;
    lx += (tx - lx) * f;
    ly += (ty - ly) * f;
    settle = 1;
    stone.light = [lx, ly, 0.55 + 0.45 * hand.p];
    stone.draw();
    chapter(v?.currentTime || 0);

    const moving = Math.abs(hand.p - target) > 0.003 || Math.abs(tx - lx) + Math.abs(ty - ly) > 0.3 || stone.cut > 0.002 || wheel.w > 0 || press.x > 0.002 || Math.abs(press.y - press.ty) > 0.003;
    if (playing || dragging || moving || dirty || flashing) wake();
  }
  for (const ev of ["play", "pause", "seeking", "seeked", "timeupdate", "ended", "loadedmetadata", "durationchange", "volumechange", "ratechange", "waiting", "playing"]) host?.addEventListener(ev, wake);
  volEl && new MutationObserver(wake).observe(volEl, { attributes: true, attributeFilter: ["style"] });
  rule && new MutationObserver(wake).observe(rule, { attributes: true, attributeFilter: ["data-pointing", "data-dragging", "style"] });
  place();
  document.fonts?.ready.then(place);
  if ((media()?.readyState ?? 0) >= 1) { load(); rebuild(false); loadFrames(); readCues(); }
}

// Before the elements upgrade: each word → popup pair gets ids of its own (several players can share a page), and
// the words take the player's language.
export function cutPrepare(scope = document) {
  for (const root of scope.querySelectorAll(".cut-skin")) {
    const n = ++uid;
    for (const t of root.querySelectorAll("[data-for]")) {
      const pop = root.querySelector(`[data-pop="${t.dataset.for}"]`);
      if (!pop) continue;
      pop.id = `cut-${t.dataset.for}-${n}`;
      t.setAttribute("commandfor", pop.id);
    }
    const lang = (root.closest("[lang]")?.lang || "en").slice(0, 2).toLowerCase();
    const W = WORDS[lang] ?? WORDS.en;
    for (const el of root.querySelectorAll("[data-word]")) el.textContent = W[el.dataset.word] ?? el.textContent;
  }
}

export function cutAll(scope = document) {
  for (const root of scope.querySelectorAll(".cut-skin")) cut(root);
}
