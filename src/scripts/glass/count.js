// Anonymous counter for /glass: only an event's name goes to the server (/api/event, worker/index.js). No logo, no file
// name, no value, nothing about the visitor. Fire and forget: the page doesn't wait for an answer.
// The tool (app.js and the rest of this folder) is the same code as the open repository phileeppov/glass: it only tells
// what happened (glass:tell). Counting is this site's business, so it lives here, and the tool's files stay identical.

const root = document.querySelector("[data-glass]");
const touched = new Set(); // what was already counted this visit

function send(name) {
  try {
    navigator.sendBeacon?.("/api/event", name);
  } catch {
    // Not sent; that's fine.
  }
}

// Once a visit: whether people try a thing, not how often.
function once(name) {
  if (touched.has(name)) return;
  touched.add(name);
  send(name);
}

// What the tool tells. Uploads, presets and downloads count every time; trying a feature counts once a visit.
const EVERY = /^(upload$|from:|logo:|preset:|png$|image:|video|share$)/;
root.addEventListener("glass:tell", (e) => (EVERY.test(e.detail) ? send(e.detail) : once(e.detail)));

// Errors the page didn't catch, from this site's own scripts, once a visit: the name only, no message, file or line.
// Only thrown errors (the browser's own notices, like a ResizeObserver loop, carry none) and rejections whose stack runs
// through this site (not an extension's). Without WebGL the tool stops on purpose and says so (error:webgl), so that one
// isn't counted twice.
const crashed = () => root.classList.contains("is-unsupported") || once("error:js");
addEventListener("error", (e) => {
  try {
    if (e.error && e.filename && new URL(e.filename).origin === location.origin) crashed();
  } catch {
    // Not a URL: not ours.
  }
});
addEventListener("unhandledrejection", (e) => {
  if (String(e.reason?.stack ?? "").includes(location.origin)) crashed();
});

// Author links (data-link in the markup): which one was followed. This runs apart from the tool, so links count even where
// WebGL fails and the tool doesn't start. Middle click opens a tab without firing click, so auxclick catches it.
const trackLink = (e) => {
  if (!(e.target instanceof Element)) return;
  const link = e.target.closest("a[data-link]");
  if (!link || (e.type === "auxclick" && e.button !== 1)) return;
  once(`link:${link.dataset.link}`);
};
document.addEventListener("click", trackLink);
document.addEventListener("auxclick", trackLink);

// Which knobs get touched, once each: no values, no number of moves. Names match the screen (liquid is Blend on screen).
// Presets, links, Randomize and the double-click reset change inputs from code; those events (isTrusted = false) don't count.
const KNOB_NAMES = {
  liquid: "blend",
  size: "logo-size",
  edge: "edge-width",
  spread: "length",
  volume: "depth",
  sides: "edges",
  color: "logo-color",
  format: "video-format",
};
const KNOBS = new Set(["refraction", "blend", "logo-size", "dispersion", "edge-width", "angle", "length", "spin", "motion", "depth", "thickness", "background", "logo-color", "shape", "edges", "video-format", "facets"]);
const trackKnob = (e) => {
  const name = KNOB_NAMES[e.target.name] ?? e.target.name;
  if (e.isTrusted && KNOBS.has(name)) once(`knob:${name}`);
};
root.addEventListener("input", trackKnob);
root.addEventListener("change", trackKnob);

// The user opened Advanced, rather than it opening because they left it open last time.
const advanced = root.querySelector("[data-advanced]");
advanced.querySelector("summary").addEventListener("click", () => {
  if (!advanced.open) once("advanced");
});
