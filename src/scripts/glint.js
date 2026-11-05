// The glint: the emerald cursor throws a faint spectrum on the 0.5px edge of the nearest raised thing (the pill, the
// dark buttons, the tool tiles), on the side that faces it. Within 160px; strongest a little way off and gone at
// contact, where the stone on the arrow takes over. One element at a time. Runs only with the emerald cursor
// (Site.astro: wide screen, fine pointer, no reduced motion); nothing runs while the hand is still.
export function startGlint() {
  const REACH = 160;
  const els = [...document.querySelectorAll(".top .work, .btn, .tile .art")].filter((el) => !el.closest(".pz"));
  if (!els.length) return;
  for (const el of els) el.classList.add("glint");
  let x = -1e4, y = -1e4, queued = false, lit = null;
  const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  function frame() {
    queued = false;
    let best = null, bd = REACH;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom);
      const d = Math.hypot(dx, dy);
      if (d < bd) { bd = d; best = [el, r]; }
    }
    if (lit && (!best || best[0] !== lit)) { lit.style.removeProperty("--glint"); lit = null; }
    if (!best) return;
    const [el, r] = best;
    const a = (Math.atan2(x - (r.left + r.width / 2), -(y - (r.top + r.height / 2))) * 180) / Math.PI;
    el.style.setProperty("--glint-a", a.toFixed(1) + "deg");
    el.style.setProperty("--glint", ((1 - bd / REACH) ** 1.4 * smooth(0, 20, bd)).toFixed(3));
    lit = el;
  }
  addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    x = e.clientX; y = e.clientY;
    if (!queued) { queued = true; requestAnimationFrame(frame); }
  }, { passive: true });
  addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(frame); } }, { passive: true });
  const off = () => { x = y = -1e4; if (lit) { lit.style.removeProperty("--glint"); lit = null; } };
  document.addEventListener("mouseout", (e) => { if (!e.relatedTarget) off(); });
  addEventListener("pagehide", off);
}
