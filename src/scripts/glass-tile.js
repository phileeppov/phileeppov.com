// The Glass tile on the home page comes alive under the hand. Its still picture is the Night look with the demo logo;
// on hover the same shader as /glass takes over: the glass rings once, as a tap on its middle rings it on /glass, and
// its light leans toward the cursor. Leaving, it settles on the picture's own frame and the picture comes back.
// Nothing is drawn while nothing moves; any failure (no WebGL, a shader the GPU won't compile) leaves the picture.
import { GlassRenderer, LOGO_FILL, SDF_SPREAD } from "./glass/renderer.js";
import { buildSdf } from "./glass/sdf.js";

const LAYER = 1024; // logo textures, px, as on /glass
// The demo logo of /glass, drawn large so the distance field is sharp. Its ink spans 4.5..95.5 of the viewBox.
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" width="${LAYER}" height="${LAYER}" viewBox="0 0 100 100"><g fill="none" stroke="#0a0a0a" stroke-width="7" stroke-linecap="round"><circle cx="50" cy="50" r="42"/><path d="M31 46Q37 37 43 46M57 46Q63 37 69 46"/><path d="M34 59Q50 72 66 59"/></g></svg>`;
const INK = [4.5, 91]; // where the ink starts and how wide it is, in viewBox units

// The Night look (/glass presets) with a white logo: the look the picture was made in.
export const LOOK = {
  n: 5,
  refraction: 1.45,
  dispersion: 1,
  edge: 0.18,
  motion: 0.5,
  size: 0.64,
  tint: [1, 1, 1],
  tintMix: 1,
  sideMix: 1,
  sideTwo: 1,
  angle: Math.PI / 4,
  spread: 0.6,
  liquid: 0.75,
  volume: 0.45,
  depth: 1,
  facet: 0,
  reverse: 0,
  background: "dark",
  bg: [10 / 255, 10 / 255, 10 / 255],
  shadow: 1,
};
// The picture's frame: the loop phase it was taken at and the share of the square the glass takes (fitted to the
// picture pixel by pixel; it was drawn at twice its size, so the glass is too, for the same fine rim).
export const REST = { phase: 0.95, frame: 0.92 };
const SUPERSAMPLE = 2;

async function logo(renderer) {
  const img = new Image();
  img.src = "data:image/svg+xml," + encodeURIComponent(LOGO);
  await img.decode();
  const c = document.createElement("canvas");
  c.width = c.height = LAYER;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const k = LAYER / 100;
  const side = LAYER * LOGO_FILL;
  const at = (LAYER - side) / 2;
  ctx.drawImage(img, INK[0] * k, INK[0] * k, INK[1] * k, INK[1] * k, at, at, side, side);
  const sdf = buildSdf(ctx.getImageData(0, 0, LAYER, LAYER).data, LAYER, SDF_SPREAD);
  // The logo is filled white by the tint, so its own colour never shows: one texel is enough.
  const color = document.createElement("canvas");
  color.width = color.height = 1;
  renderer.setLogo(sdf, color, LAYER);
}

// A renderer with the logo loaded, or a throw if WebGL or the shader fails.
export async function makeGlass(canvas) {
  const renderer = new GlassRenderer(canvas);
  await logo(renderer);
  return renderer;
}

const DING = { x: 0, y: 0, r: 0.3 }; // the handpan's middle field on /glass
const RISE = 0.025; // s, how fast a strike rises (as on /glass)
const STRIKE = 0.85; // how hard the hand taps it: a touch softer than a tap on /glass, the tile is small
const RING = 0.5; // s, how long it rings here: shorter than on /glass, so the tile answers within a second
const LEAN = 320; // ms, how fast the light follows the hand (as on /glass)

export async function glassTile(tile) {
  const art = tile.querySelector(".art");
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  let renderer;
  try {
    renderer = await makeGlass(canvas);
  } catch {
    return; // the picture stays
  }
  art.append(canvas);
  canvas.addEventListener("webglcontextlost", () => {
    tile.classList.remove("is-live");
    canvas.remove();
    over = false;
  });

  const fields = new Float32Array(36);
  let ring = 0; // how hard the middle rings now
  let goal = 0; // where a strike is rising to
  const tilt = [0, 0];
  const tiltGoal = [0, 0];
  let over = false;
  let frame = 0;
  let last = 0;

  const size = () => {
    const px = Math.round(canvas.clientWidth * Math.min(devicePixelRatio, 2) * SUPERSAMPLE);
    renderer.setSize(Math.max(Math.min(px, 1040), 2));
  };

  const draw = () => {
    fields.set([DING.x, DING.y, DING.r, ring], 0);
    const p = { ...LOOK, frame: REST.frame, fields };
    if (tilt[0] || tilt[1]) p.tilt = tilt;
    renderer.render(p, REST.phase);
  };

  const step = (now) => {
    frame = 0;
    const dt = Math.min(now - last, 100) / 1000;
    last = now;
    if (goal > ring) {
      ring += (goal - ring) * (1 - Math.exp(-dt / RISE));
      if (goal - ring < 0.01) goal = 0;
    } else ring *= Math.exp(-dt / RING);
    if (ring < 0.004 && !goal) ring = 0;
    let leaning = false;
    const a = 1 - Math.exp((-dt * 1000) / LEAN);
    for (let i = 0; i < 2; i++) {
      const d = tiltGoal[i] - tilt[i];
      if (Math.abs(d) > 1e-3) {
        tilt[i] += d * a;
        leaning = true;
      } else tilt[i] = tiltGoal[i];
    }
    draw();
    if (ring || goal || leaning) frame = requestAnimationFrame(step);
    else if (!over) tile.classList.remove("is-live"); // settled on the picture's frame: the picture takes over
  };

  const run = () => {
    if (frame) return;
    last = performance.now();
    frame = requestAnimationFrame(step);
  };

  const aim = (e) => {
    const r = canvas.getBoundingClientRect();
    const half = (r.width / 2) * REST.frame;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    tiltGoal[0] = Math.max(-1, Math.min(1, (e.clientX - cx) / half));
    tiltGoal[1] = Math.max(-1, Math.min(1, -(e.clientY - cy) / half));
  };

  const enter = (e) => {
    if (!canvas.isConnected) return;
    over = true;
    if (!tile.classList.contains("is-live")) {
      // The first frame is the picture's own, drawn before the canvas shows: no jump when it takes over.
      size();
      draw();
      tile.classList.add("is-live");
    }
    goal = Math.min(1.2, ring + STRIKE);
    aim(e);
    run();
  };
  tile.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && enter(e));
  tile.addEventListener("pointermove", (e) => {
    if (!over || e.pointerType !== "mouse") return;
    aim(e);
    run();
  });
  tile.addEventListener("pointerleave", () => {
    if (!over) return;
    over = false;
    tiltGoal[0] = tiltGoal[1] = 0;
    run();
  });
  return { enter };
}
