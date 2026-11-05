// The stamp's own code, loaded by src/components/Stamp.astro only when a stamp on the page is on.
// The impression in units of its radius R, y up, as if the glass were still on the page: a slow dome of glass whose
// rim wanders a little and was pressed unevenly; light from the upper left.
const REACH = 1.7; // the caustic falls a little past the rim; the square holds it all
const TILT = [0.35, 0.3]; // the sheet at rest, a little toward the light
const SEEDS = [
  [0.4, 2.1, 4.0, 1.3, -0.035],
  [3.3, 0.7, 5.1, 2.6, 0.05],
  [1.9, 4.4, 0.2, 5.5, -0.02],
];
const Y = [0.2126, 0.7152, 0.0722];

// 400–700 nm to linear RGB: smooth lobes, a little red back at the violet end. Cauchy: blue bends further than red.
const TAPS = Array.from({ length: 10 }, (_, i) => {
  const lam = 400 + (300 * (i + 0.5)) / 10;
  const e = (c: number, w: number) => Math.exp(-(((lam - c) / w) ** 2));
  return { w: [e(600, 42) + 0.3 * e(440, 22), e(545, 44), e(452, 30)], s: 302500 / (lam * lam) - 1 };
});
const WSUM = [0, 1, 2].map((c) => TAPS.reduce((a, t) => a + t.w[c], 0));
// Where each channel looks on average along the spread.
const SBAR = [0, 1, 2].map((c) => TAPS.reduce((a, t) => a + t.w[c] * t.s, 0) / WSUM[c]);

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const lin = (c: number) => Math.pow(c, 2.2);
const srgb = (c: number) => Math.pow(Math.max(c, 0), 1 / 2.2);
// A fold caustic: a quick rise on the inside, a long soft tail outward. Peak ≈ 1.
const fold = (x: number) => (2 * Math.exp(-x / 0.75)) / (1 + Math.exp(-x / 0.35));
const cdf = (x: number) => 1 / (1 + Math.exp(-1.702 * x));
const ign = (x: number, y: number) => {
  const f = 52.9829189 * ((0.06711056 * x + 0.00583715 * y) % 1);
  return f - Math.floor(f);
};

// The mark, ☺: a ring, two eyes, a smile, each a stroke with a rounded relief (a crisp shoulder over a soft foot).
function mark(x: number, y: number) {
  const relief = (d: number, w: number) =>
    0.65 * (cdf((w - d) / 0.0117) - cdf((-w - d) / 0.0117)) + 0.35 * (cdf((w - d) / 0.035) - cdf((-w - d) / 0.035));
  const ring = Math.abs(Math.hypot(x, y) - 0.43);
  const eye = (ex: number) => Math.hypot(x - ex, y - clamp(y, 0.085, 0.155));
  const sx = x, sy = y - 0.035, a = Math.atan2(sy, sx);
  const smile =
    a > -2.55 && a < -0.59
      ? Math.abs(Math.hypot(sx, sy) - 0.235)
      : Math.min(
          Math.hypot(sx - 0.235 * Math.cos(-2.55), sy - 0.235 * Math.sin(-2.55)),
          Math.hypot(sx - 0.235 * Math.cos(-0.59), sy - 0.235 * Math.sin(-0.59)),
        );
  return Math.max(relief(ring, 0.033), relief(eye(-0.145), 0.04), relief(eye(0.145), 0.04), relief(smile, 0.033));
}

type Maps = { a: string; b: string; s: string; sa: number; sb: number; lo: number; hi: number };

async function build(R: number, dpr: number, seed: number[], paper: number[]): Promise<Maps> {
  // The work is split into short slices, so scrolling never waits on it.
  let t0 = performance.now();
  const breathe = async () => {
    if (performance.now() - t0 < 8) return;
    await new Promise((go) => setTimeout(go, 0));
    t0 = performance.now();
  };
  const N = Math.ceil(2 * REACH * R * dpr);
  const k = (2 * REACH) / N; // q units per map pixel
  const turn = seed[4];
  const cs = Math.cos(turn), sn = Math.sin(turn);
  // The mark's height, then its slope and curvature (slope bends what's seen, curvature gathers light into lines).
  const h = new Float32Array(N * N);
  for (let j = 0; j < N; j++, await breathe())
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5) * k - REACH, y = REACH - (j + 0.5) * k;
      // The mark lies well inside the rim; past 0.62 R there is nothing of it.
      h[j * N + i] = x * x + y * y < 0.39 ? mark(cs * x + sn * y, -sn * x + cs * y) : 0;
    }
  const at = (i: number, j: number) => h[clamp(j, 0, N - 1) * N + clamp(i, 0, N - 1)];
  const gx = new Float32Array(N * N), gy = new Float32Array(N * N), lp = new Float32Array(N * N);
  let gm = 1e-6, lm = 1e-6;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const p = j * N + i;
      gx[p] = (at(i + 1, j) - at(i - 1, j)) * 0.5;
      gy[p] = (at(i, j - 1) - at(i, j + 1)) * 0.5; // y up
      lp[p] = -(at(i + 1, j) + at(i - 1, j) + at(i, j + 1) + at(i, j - 1) - 4 * h[p]);
      gm = Math.max(gm, Math.hypot(gx[p], gy[p]));
      lm = Math.max(lm, Math.abs(lp[p]));
    }
  const lpAt = (x: number, y: number) => {
    const fi = (x + REACH) / k - 0.5, fj = (REACH - y) / k - 0.5;
    const i0 = Math.floor(fi), j0 = Math.floor(fj), u = fi - i0, v = fj - j0;
    const g = (i: number, j: number) => lp[clamp(j, 0, N - 1) * N + clamp(i, 0, N - 1)];
    return ((1 - v) * ((1 - u) * g(i0, j0) + u * g(i0 + 1, j0)) + v * ((1 - u) * g(i0, j0 + 1) + u * g(i0 + 1, j0 + 1))) / lm;
  };

  let L = [-0.55 + TILT[0] * 0.9, 0.65 + TILT[1] * 0.9];
  const ll = Math.hypot(L[0], L[1]);
  L = [L[0] / ll, L[1] / ll];
  const pl = paper.map(lin);
  const A = new Float32Array(N * N * 3), B = new Float32Array(N * N * 2), F = new Float32Array(N * N * 3);
  let amax = 1e-6, bmax = 1e-6, lo = 1, hi = 1;
  for (let j = 0; j < N; j++, await breathe())
    for (let i = 0; i < N; i++) {
      const p = j * N + i;
      const x = (i + 0.5) * k - REACH, y = REACH - (j + 0.5) * k;
      const r = Math.hypot(x, y);
      const nx = r > 1e-4 ? x / r : 0, ny = r > 1e-4 ? y / r : 0;
      const th = Math.atan2(y, x) - turn;
      // The rim of a pressed mark, not a compass circle; the pressure is uneven around it.
      const edge = 1 + 0.02 * Math.sin(2 * th + seed[0]) + 0.011 * Math.sin(3 * th + seed[1]) + 0.006 * Math.sin(5 * th + seed[2]) + 0.003 * Math.sin(8 * th + seed[3]);
      const press = 0.78 + 0.22 * (0.62 * Math.sin(th + seed[1] * 1.7) + 0.38 * Math.sin(2 * th + seed[2] * 1.3));
      const u = r / edge;
      const xs = clamp((u - 0.72) / 0.28, 0, 1);
      const S = 1 - xs * xs * (3 - 2 * xs);
      const dS = (-6 * xs * (1 - xs)) / 0.28;
      const tx = x / edge + TILT[0] * 0.08, ty = y / edge + TILT[1] * 0.08;
      const T = (1 - 0.5 * (tx * tx + ty * ty)) * S * (0.86 + 0.14 * press);
      const mIn = 1 - smooth(0.68, 0.86, u);
      const mh = h[p], mgx = gx[p] / gm, mgy = gy[p] / gm;
      // What is seen through the glass moves: a touch of magnification, the rim's bend, the slab's parallax, the
      // relief of the mark. A is where the colours look on average, B how far they part.
      // A little gentler than the glass would be at the rim and in the spread: a browser displaces by whole
      // pixels, so a steep bend tears the letters it crosses.
      const dome = -0.025 * S, rim = 0.0042 * dS, slab = 0.045 * T, mk = -0.016 * mIn;
      const ax = x * dome + nx * rim + TILT[0] * slab + mgx * mk;
      const ay = y * dome + ny * rim + TILT[1] * slab + mgy * mk;
      const bx = 0.7 * (x * dome * 0.3 + nx * rim * 0.6 + TILT[0] * slab * 0.14 + mgx * mk * 0.5);
      const by = 0.7 * (y * dome * 0.3 + ny * rim * 0.6 + TILT[1] * slab * 0.14 + mgy * mk * 0.5);
      const fade = 1 - smooth(1.5, 1.68, r);
      if (fade === 0) {
        F[p * 3] = F[p * 3 + 1] = F[p * 3 + 2] = 1;
        continue;
      }
      // Green looks where the average green wavelength does; red and blue part from it along B.
      A[p * 3] = (ax + SBAR[1] * bx) * fade;
      A[p * 3 + 1] = (ay + SBAR[1] * by) * fade;
      A[p * 3 + 2] = fade;
      B[p * 2] = bx * fade;
      B[p * 2 + 1] = by * fade;
      amax = Math.max(amax, Math.abs(A[p * 3]), Math.abs(A[p * 3 + 1]));
      bmax = Math.max(bmax, Math.abs(B[p * 2]), Math.abs(B[p * 2 + 1]));

      // The light. Thicker glass lets a little less through; light bent at the rim lands just past it, each
      // wavelength at its own radius; light through the relief gathers into lines along the strokes.
      const trans = Math.exp(-0.15 * T - 0.2 * mh * mIn);
      const side = 0.6 - 0.4 * (nx * L[0] + ny * L[1]);
      const rimA = 0.34 * press * Math.sqrt(press) * side;
      const rimW = 0.042 / Math.sqrt(press);
      const rimC = edge * 1.02 - (nx * L[0] + ny * L[1]) * 0.012;
      let kK0 = 0, kK1 = 0, kK2 = 0, kR0 = 0, kR1 = 0, kR2 = 0, kM0 = 0, kM1 = 0, kM2 = 0;
      // Only near the rim and the strokes is there light to gather; elsewhere every wavelength agrees.
      const nearRim = (r - rimC) / rimW > -6 && (r - rimC) / rimW < 9;
      const nearMark = mIn > 0 && mh > 1e-3;
      for (const t of nearRim || nearMark ? TAPS : []) {
        const o = 0.024 + 0.018 * t.s;
        const cm = nearMark ? 0.22 * lpAt(x + L[0] * o, y + L[1] * o) * mIn : 0;
        const rr = rimA * fold((r - rimC - 0.05 * t.s) / rimW);
        const K = 1 + 2 * cm + 3.5 * rr;
        kK0 += t.w[0] * K; kK1 += t.w[1] * K; kK2 += t.w[2] * K;
        kR0 += t.w[0] * rr; kR1 += t.w[1] * rr; kR2 += t.w[2] * rr;
        kM0 += t.w[0] * cm; kM1 += t.w[1] * cm; kM2 += t.w[2] * cm;
      }
      const kK = nearRim || nearMark ? [kK0 / WSUM[0], kK1 / WSUM[1], kK2 / WSUM[2]] : [1, 1, 1];
      const lumK = Y[0] * kK[0] + Y[1] * kK[1] + Y[2] * kK[2];
      const lit = Y[0] * (kR0 + kM0) / WSUM[0] + Y[1] * (kR1 + kM1) / WSUM[1] + Y[2] * (kR2 + kM2) / WSUM[2];
      // On paper the ring is a shift of colour, not a glow: brightness shows only where light is taken away.
      let g = trans * (1 + (lit < 0 ? lit : 0.05 * lit));
      // The light gathered into the ring is missing just inside it: a soft darker band, the edge of the impression.
      g *= 1 - 0.5 * rimA * Math.exp(-((((r - rimC) / rimW + 1.8) / 1.3) ** 2));
      // The host multiplies onto the page, which can only take light away: where a channel would rise above the
      // paper (the cool side of the ring, a ridge of the mark), the other two fall by half as much instead, so the
      // hue still turns but the ring doesn't go grey-violet.
      const f = [0, 1, 2].map((c) => srgb(pl[c] * (kK[c] / lumK) * g) / paper[c]);
      const top = Math.sqrt(Math.max(1, f[0], f[1], f[2]));
      for (let c = 0; c < 3; c++) {
        const v = 1 + (Math.min(1, f[c] / top) - 1) * fade;
        F[p * 3 + c] = v;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }

  const sa = 2.2 * amax * R, sb = 2.2 * bmax * R; // displacement scales, CSS px
  lo -= 0.01;
  // Encoded off the main thread where the browser can, and handed to the filter as blob URLs.
  const png = (fill: (p: number, d: Uint8ClampedArray, o: number) => void) => {
    const c = document.createElement("canvas");
    c.width = c.height = N;
    const g = c.getContext("2d")!;
    const img = g.createImageData(N, N);
    for (let p = 0; p < N * N; p++) {
      fill(p, img.data, p * 4);
      img.data[p * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return new Promise<string>((done) => c.toBlob((blob) => done(blob ? URL.createObjectURL(blob) : c.toDataURL()), "image/png"));
  };
  const enc = (v: number, s: number) => 127.5 + (255 * v * R) / s;
  const a = png((p, d, o) => {
    d[o] = enc(A[p * 3], sa);
    d[o + 1] = enc(-A[p * 3 + 1], sa); // screen y runs down
    d[o + 2] = 255 * A[p * 3 + 2];
  });
  const b = png((p, d, o) => {
    d[o] = enc(B[p * 2], sb);
    d[o + 1] = enc(-B[p * 2 + 1], sb);
    d[o + 2] = 128;
  });
  const s = png((p, d, o) => {
    const i = p % N, j = (p / N) | 0, n = ign(i, j) - 0.5;
    for (let c = 0; c < 3; c++) d[o + c] = (255 * (F[p * 3 + c] - lo)) / (hi - lo) + n;
  });
  const [ua, ub, us] = await Promise.all([a, b, s]);
  return { a: ua, b: ub, s: us, sa, sb, lo, hi };
}

// Every rectangle of text and every object in a part of the page.
function obstacles(root: Element, skip?: Element) {
  const text: DOMRect[] = [], things: DOMRect[] = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (!n.nodeValue?.trim() || (skip && skip.contains(n))) continue;
    range.selectNodeContents(n);
    text.push(...range.getClientRects());
  }
  for (const el of root.querySelectorAll(".btn, hr, img, canvas, video, figure, [data-tool]")) {
    if (!(skip && skip.contains(el))) things.push(el.getBoundingClientRect());
  }
  return { text, things };
}

// Points spread evenly over a unit disc, to measure how much of a disc a set of rectangles covers.
const DISC = Array.from({ length: 140 }, (_, i) => {
  const r = Math.sqrt((i + 0.5) / 140), a = i * 2.39996;
  return [r * Math.cos(a), r * Math.sin(a)];
});
const cover = (cx: number, cy: number, rad: number, rects: DOMRect[]) => {
  let hit = 0;
  for (const [x, y] of DISC) {
    const px = cx + x * rad, py = cy + y * rad;
    if (rects.some((b) => px >= b.left && px <= b.right && py >= b.top && py <= b.bottom)) hit++;
  }
  return hit / DISC.length;
};

function setup(svg: SVGSVGElement, host: HTMLElement, word: HTMLElement) {
  const filter = svg.querySelector("filter")!;
  const seed = SEEDS[Number(svg.dataset.seed) % SEEDS.length];
  const prefer = (Number(svg.dataset.prefer) * Math.PI) / 180;
  const page = host.closest("main") ?? document.body;
  // Maps by size and density, each worked out once; a resize mid-way waits for the same one.
  const made = new Map<string, Promise<Maps>>();

  // Each call to place has a number; one that finds a newer call has started while it waited for its maps gives way.
  let gen = 0;
  const place = async () => {
    const my = ++gen;
    const W = document.documentElement.clientWidth;
    const R = W >= 1024 ? 70 : W >= 560 ? 60 : 46;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // The paper the stamp lies on, from the token (the svg's own colour is set to it).
    const css = getComputedStyle(svg).color.match(/[\d.]+/g)?.map(Number) ?? [242, 242, 240];
    const paper = css.slice(0, 3).map((c) => Math.max(c, 1) / 255);
    const key = `${R}/${dpr}`;
    if (!made.has(key)) made.set(key, build(R, dpr, seed, paper));
    const maps = await made.get(key)!;
    if (my !== gen) return;
    const hb = host.getBoundingClientRect();
    const wb = word.getBoundingClientRect();
    const wx = wb.left + wb.width / 2, wy = wb.top + wb.height * 0.56;
    // The page's own edges: the rim stays inside them, as the text does.
    const pb = page.getBoundingClientRect(), ps = getComputedStyle(page);
    const left = pb.left + parseFloat(ps.paddingLeft), right = pb.right - parseFloat(ps.paddingRight);
    // Only what lies within reach of the word can be under the stamp.
    const reach = (b: DOMRect) => b.right > wx - 3 * R && b.left < wx + 3 * R && b.bottom > wy - 3 * R && b.top < wy + 3 * R;
    const all = obstacles(host), out = obstacles(page, host);
    const text = [...all.text, ...out.text].filter(reach);
    const things = [...all.things, ...out.things].filter((b) => reach(b) && b.height > 2 && b.height < 120);
    const otherText = out.text.filter(reach);
    // Beside the word rather than on it: the rim crosses the word, the mark lands on clear paper, the whole
    // impression stays inside the page's edges and off anything outside the host (the stamp paints paper there).
    // Where the mark can't find clear paper (a narrow screen where the word sits mid-paragraph), no stamp.
    let best: [number, number] | null = null, bestScore = Infinity;
    for (let step = 0; step < 24; step++) {
      const ang = prefer + ((step % 2 ? -1 : 1) * Math.ceil(step / 2) * Math.PI) / 12;
      for (const d of [0.62, 0.72, 0.82, 0.92, 1.02]) {
        const cx = wx + Math.cos(ang) * d * R, cy = wy + Math.sin(ang) * d * R;
        if (cx - R < Math.max(6, left) || cx + R > Math.min(W - 6, right)) continue;
        const far = Math.max(...[wb.left, wb.right].flatMap((x) => [wb.top, wb.bottom].map((y) => Math.hypot(x - cx, y - cy))));
        const near = Math.hypot(clamp(cx, wb.left, wb.right) - cx, clamp(cy, wb.top, wb.bottom) - cy);
        if (far < 1.02 * R || near > 0.92 * R) continue;
        // Text outside the host would only darken under the glass, not bend: keep it out of the impression.
        if (cover(cx, cy, 1.1 * R, otherText) > 0) continue;
        const onText = cover(cx, cy, 0.5 * R, text);
        if (onText > 0.12) continue;
        const score =
          4 * onText +
          0.5 * cover(cx, cy, R, text) +
          6 * cover(cx, cy, 1.1 * R, things) +
          0.12 * (1 - Math.cos(ang - prefer)) +
          0.05 * Math.abs(d - 0.72);
        if (score < bestScore) {
          bestScore = score;
          best = [cx, cy];
        }
      }
    }
    if (!best) {
      host.style.removeProperty("filter");
      host.style.removeProperty("mix-blend-mode");
      delete host.dataset.stampCenter;
      return;
    }
    // Into the host's own space: the filter covers the host and the stamp's square together.
    const sx = best[0] - REACH * R - hb.left, sy = best[1] - REACH * R - hb.top, side = 2 * REACH * R;
    const x0 = Math.min(0, sx), y0 = Math.min(0, sy);
    const x1 = Math.max(hb.width, sx + side), y1 = Math.max(hb.height, sy + side);
    const set = (el: Element, attrs: Record<string, string | number>) => {
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    };
    set(filter, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
    for (const el of filter.querySelectorAll(".sq")) set(el, { x: sx, y: sy, width: side, height: side });
    const img = (sel: string, href: string) => {
      const el = filter.querySelector(sel)!;
      el.setAttribute("href", href);
      el.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", href);
    };
    img(".map-a", maps.a);
    img(".map-b", maps.b);
    img(".map-s", maps.s);
    // A browser displaces by whole device pixels: below two device pixels to the CSS pixel the bend at the rim tears
    // the word it crosses. There the glass only takes the light (the shade, the ring, the mark); the words stay put.
    const bend = window.devicePixelRatio >= 2 ? 1 : 0;
    set(filter.querySelector(".disp-a")!, { scale: maps.sa * bend });
    set(filter.querySelector(".disp-r")!, { scale: maps.sb * (SBAR[0] - SBAR[1]) * bend });
    set(filter.querySelector(".disp-b")!, { scale: maps.sb * (SBAR[2] - SBAR[1]) * 0.5 * bend });
    set(filter.querySelector(".disp-b2")!, { scale: maps.sb * (SBAR[2] - SBAR[1]) * 1.5 * bend });
    set(filter.querySelector(".shade")!, { k1: maps.hi - maps.lo, k2: maps.lo, k3: 0, k4: 0 });
    host.style.filter = `url(#${filter.id})`;
    host.style.mixBlendMode = "multiply";
    host.dataset.stampCenter = `${Math.round(best[0] - hb.left)},${Math.round(best[1] - hb.top)},${R}`;
  };

  let queued = 0;
  const later = () => {
    cancelAnimationFrame(queued);
    queued = requestAnimationFrame(place);
  };
  // Worked out only when the reader comes near it.
  const near = new IntersectionObserver(
    (seen) => {
      if (!seen.some((e) => e.isIntersecting)) return;
      near.disconnect();
      document.fonts.ready.then(() => {
        place();
        new ResizeObserver(later).observe(host);
        addEventListener("resize", later);
      });
    },
    { rootMargin: "900px 0px" },
  );
  near.observe(host);
}

export function stamp(svg: SVGSVGElement) {
  // The host is the one paragraph that holds the word, never a block with links or buttons: anything repainted
  // inside the host runs the filter again.
  const host = svg.parentElement?.querySelector<HTMLElement>("[data-stamp-host]");
  const word = host?.querySelector<HTMLElement>("[data-stamp-at]");
  if (host && word) setup(svg, host, word);
}
