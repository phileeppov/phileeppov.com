// "An emerald instead of the arrow": while the pointer is over a link or a dark button, its arrow turns into a cut
// emerald; when the pointer leaves, the stone goes back into the arrow. Nothing is drawn frame by frame at rest: once
// the stone settles, the loop stops and the last frame stays on the canvas.
// One WebGL2 canvas over the page that only ever draws a few small quads. Every link and button in the page's header,
// main and footer gets a stone (data-gem-off on it or around it opts out); they are marked data-gem here, so the cursor
// and the passage see them as stones too. The glyph the stone grows from is .arw inside them, or the dot after a link
// in a row; a link without either keeps its stone where the layout leaves room (see anchor). Dark buttons (.btn) and
// links on the dark band get the stone in a closed collet, so it stays light on the dark. This runs only with no
// reduced-motion preference (see the
// caller): on wide screens with a fine pointer, for hover, focus and press; on touch screens ({ touch: true }) for
// the press alone. There the stone comes out under the finger as it lands, stays while it is down and while the
// page it opens loads, and goes at once if the touch turns into a scroll or a long press. On a phone the canvas is
// hidden whenever nothing is pressed, so scrolling composites no extra layer and runs no frames.
export async function startEmerald({ touch: TOUCH = false } = {}) {
const cv = document.createElement('canvas');
cv.setAttribute('aria-hidden', 'true');
cv.dataset.layer = 'gem';
cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:50' + (TOUCH ? ';visibility:hidden' : '');
// On a phone only a real GPU: WebGL drawn on the CPU would heat the phone and still miss the finger.
// It never tests depth: a phone skips that buffer, a screenful of GPU memory.
const gl = cv.getContext('webgl2', { premultipliedAlpha: true, antialias: false, alpha: true, ...(TOUCH && { depth: false, failIfMajorPerformanceCaveat: true }) });
if (!gl) return;
if (TOUCH) {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  // Without parallel builds the first query of a shader blocks the page until it is built: a phone keeps its arrows.
  if ((info && /swiftshader|llvmpipe|software|basic render/i.test(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))) || !gl.getExtension('KHR_parallel_shader_compile')) {
    const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    return;
  }
}
document.body.append(cv);
// ---------- the cut: 49 planes, same stone as free-02-emerald-cut ----------
const A = 1.0, B = 0.72, CUT = 0.24;
const deg = (d) => (d * Math.PI) / 180;
const sides = [[1, 0, A], [-1, 0, A], [0, 1, B], [0, -1, B]];
const s2 = Math.SQRT1_2;
[[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([x, y]) => sides.push([x * s2, y * s2, (A + B - CUT) * s2]));
const planes = [];
function step(n, g, slope, inset, z, down) {
  const s = Math.sin(deg(slope)), c = Math.cos(deg(slope)) * (down ? -1 : 1);
  const N = [n[0] * s, n[1] * s, c], P = [n[0] * (g - inset), n[1] * (g - inset), z];
  planes.push([...N, N[0] * P[0] + N[1] * P[1] + N[2] * P[2]]);
}
const z0 = 0.03;
sides.forEach(([x, y, g]) => planes.push([x, y, 0, g]));
sides.forEach(([x, y, g]) => step([x, y], g, 48, 0.0, z0, false));
const z1 = z0 + 0.12 * Math.tan(deg(48));
sides.forEach(([x, y, g]) => step([x, y], g, 25, 0.12, z1, false));
planes.push([0, 0, 1, z1 + 0.14 * Math.tan(deg(25))]);
const p2z = -z0 - 0.2 * Math.tan(deg(52));
[[52, 0.0, -z0], [44, 0.2, p2z], [36, 0.42, p2z - 0.22 * Math.tan(deg(44))]].forEach(([sl, ins, zz]) =>
  sides.forEach(([x, y, g]) => step([x, y], g, sl, ins, zz, true)));
const NP = planes.length;

// ---------- GL ----------
// The canvas resolution: at most 2x. A phone at 3x gets the stone at 2x: a 3x canvas would hold 2.25 times the pixels
// for a stone barely sharper at its size.
const DPR_MAX = 2;
const SS_TOUCH = 2;
let dpr = Math.min(devicePixelRatio || 1, DPR_MAX);
const VS = `#version 300 es
in vec2 aP; uniform vec4 uRect; uniform vec2 uRes;
void main(){ vec2 px = uRect.xy + aP * uRect.zw; gl_Position = vec4(px / uRes * 2.0 - 1.0, 0.0, 1.0); }`;

const STONE = `#version 300 es
precision highp float;
uniform vec4 uP[${NP}];
uniform int uNP;            // the plane count again, as a uniform: loops bounded by it aren't unrolled, so the shader
                            // builds in a fraction of the time on D3D
uniform mat3 uRot, uRotT;   // world->local, local->world
uniform vec2 uC;            // centre, device px
uniform float uS;           // device px per stone unit
uniform vec3 uL;            // key light, world: on the cursor's side
uniform vec3 uBack, uBack2; // the page behind the stone, linear; uBack2 inside uBox (a dark button)
uniform vec4 uBox;          // that button: centre and half size, device px
uniform float uBoxR;
uniform float uFlash, uA, uShadow, uRim, uJar, uEdge, uGlow;
uniform int uSS;
uniform float uCup;         // a closed back: the collet's polished cup under the pavilion (0: open, the page shows)
uniform float uBz;          // the setting: a collet round the girdle, its thickness in stone units (0: none)
out vec4 o;
const float BIG = 1e9;
// smoothstep written out: many calls here run from the high edge to the low one, which the spec leaves undefined.
float sstep(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
vec2 gPos;                  // this sample's place on the page, device px
float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
// Where a ray leaving the back meets the page: a little past the stone, along its way out. So the button's edge
// shows bent inside the stone, the thickness of the wall.
vec3 behind(vec3 d) {
  vec2 at = gPos + d.xy / max(0.35, -d.z) * uS * 0.5;
  // On a dark button the stone's own light shows: the green it lets through gathers on the button under it,
  // a little away from the light, and the window sees that patch instead of a black hole.
  vec2 g = (at - uC) / uS + uL.xy * 0.3;
  vec3 back2 = uBack2 * (1.0 + uGlow * vec3(0.25, 1.0, 0.7) * exp(-dot(g, g) * 2.5));
  vec3 b = mix(back2, uBack, sstep(-1.0, 1.0, sdBox(at - uBox.xy, uBox.zw, uBoxR)));
  // A closed collet: under the pavilion a polished cup of the same metal, as jewellers back a stone set on dark.
  // Every ray that leaves through the back meets it (no edge, so no coloured fringe): the window sees light coming
  // back off the metal, brighter where the cup faces the light, not a glow from inside.
  if (uCup > 0.0) b = vec3(1.0, 0.965, 0.91) * uCup * (0.55 + 0.6 * max(0.0, dot(normalize(vec3(-d.xy, 1.2)), uL)));
  return b;
}

// What the stone sees. Behind it: the page. In front: a soft bright room, darker where the viewer stands,
// one small hot light on the cursor's side (crisp glints that travel as it turns) and a broad wrap around it.
vec3 env(vec3 d) {
  // A darker room: the steps alternate dark and bright, the hall of mirrors. On a dark button a little lighter,
  // so the light the pavilion sends back has something to return.
  vec3 room = vec3(uRim > 0.0 ? 0.26 : 0.16) + vec3(0.14) * d.y;
  room *= mix(1.0, 0.25, sstep(0.78, 0.97, d.z)) * (1.0 + 2.8 * uFlash);
  float k = dot(d, uL);
  room += vec3(1.0, 0.99, 0.97) * (7.0 + 14.0 * uFlash) * sstep(0.962, 0.988, k);
  room += vec3(0.25 + 0.9 * uFlash) * sstep(0.55, 0.95, k);
  // Two tall soft panels left and right: the step facets carry them as bright bands, the hall of mirrors.
  float front = sstep(0.0, 0.35, d.z);
  room += vec3(1.5) * sstep(0.12, 0.0, abs(d.x + 0.62)) * front * sstep(-0.4, 0.3, d.y);
  room += vec3(1.2) * sstep(0.1, 0.0, abs(d.x - 0.7)) * front * sstep(-0.4, 0.3, d.y);
  room += vec3(0.9) * sstep(0.7, 0.92, dot(d, normalize(vec3(-0.5, 0.7, 0.5))));
  if (d.z > 0.02) return room;
  return mix(room, behind(d), sstep(0.02, -0.18, d.z));
}
// The crown's own surface: a photographer's black card keeps the studio's sheen off it, only the hot light glints.
vec3 sheen(vec3 d) {
  return 0.3 * env(d) +vec3(1.0, 0.99, 0.97) * (5.0 + 18.0 * uFlash) * sstep(0.962, 0.988, dot(d, uL));
}
bool enter(vec3 ro, vec3 rd, out float t, out vec3 n) {
  float tn = -BIG, tf = BIG;
  for (int i = 0; i < uNP; i++) {
    vec3 N = uP[i].xyz; float dn = dot(N, rd); float s = uP[i].w - dot(N, ro);
    if (abs(dn) < 1e-6) { if (s < 0.0) return false; continue; }
    float ti = s / dn;
    if (dn < 0.0) { if (ti > tn) { tn = ti; n = N; } } else tf = min(tf, ti);
  }
  t = tn;
  return tn < tf && tf > 0.0;
}
float leave(vec3 ro, vec3 rd, out vec3 n) {
  float tf = BIG;
  for (int i = 0; i < uNP; i++) {
    vec3 N = uP[i].xyz; float dn = dot(N, rd);
    if (dn > 1e-6) { float ti = (uP[i].w - dot(N, ro)) / dn; if (ti < tf) { tf = ti; n = N; } }
  }
  return tf;
}
float fres(float c, float eta) { float r0 = (1.0 - eta) / (1.0 + eta); r0 *= r0; return r0 + (1.0 - r0) * pow(1.0 - c, 5.0); }
// The jardin: one healed fracture (a "feather") crossing the stone. Close up it is a fingerprint: wavy rows that
// throw back a little light only when the plane faces it. Strung along it, two jagged fluid cavities stretched
// along the stone's length (the c-axis), each with a gas bubble: the three-phase inclusions of Colombian stones.
const vec3 VN = vec3(0.5313, 0.3065, 0.7898);   // the feather's plane, unit normal
const vec3 VU = vec3(0.8472, -0.1922, -0.4953); // the c-axis (local x) laid into that plane
const float VC = -0.12;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
vec3 jardin(vec3 p) {   // x: the fingerprint, y: the cavities, z: their bubbles
  vec2 q = vec2(dot(p, VU), dot(p, cross(VN, VU))) - vec2(0.1, -0.05);
  float reach = sstep(0.62, 0.15, length(q * vec2(0.8, 1.5)));
  // Rows ~0.14 of the half-length apart: 4 px at 2x, a faint veil at 1x. Broken into dashes, bent by a slow warp.
  float rows = sstep(0.3, 0.95, 0.5 + 0.5 * sin(dot(q, vec2(0.6, 0.8)) * 46.0 + 5.0 * vnoise(q * 2.5 + 1.7)));
  float lace = rows * sstep(0.32, 0.62, vnoise(q * 7.0 + 4.0)) * reach;
  float cav = 0.0, bub = 0.0;
  for (int i = 0; i < 2; i++) {
    vec2 c = i == 0 ? vec2(-0.27, 0.07) : vec2(0.2, -0.1);
    float len = i == 0 ? 0.21 : 0.14;
    vec2 e = q - c;
    float a = e.x / len;
    // A toothed outline: the width saws up and down along the length.
    float wid = 0.046 * (0.72 + 0.56 * abs(fract(a * 1.6 + 0.3 * float(i)) - 0.5) * 2.0) * sqrt(max(0.0, 1.0 - a * a * 0.6));
    cav = max(cav, sstep(1.0, 0.7, length(vec2(a, e.y / wid))));
    bub = max(bub, sstep(0.03, 0.018, length(e - vec2(len * 0.5, 0.004))));
  }
  float k = sstep(0.0, 0.3, reach);
  return vec3(lace, cav * k, bub * k);
}
// One colour channel from the entry point on: its own index, its own absorption, four bounces inside.
// pk: pleochroism, the absorption leans with the ray's direction: along the length (the c-axis here) a touch
// yellower, across it a touch bluer.
float channel(vec3 p, vec3 d, vec3 n, float ior, float sig, float pk, int ch) {
  float c = clamp(-dot(d, n), 0.0, 1.0);
  float R = fres(c, ior);
  float acc = R * sheen(uRotT * reflect(d, n))[ch];
  float T = 1.0 - R;
  d = refract(d, n, 1.0 / ior);
  for (int k = 0; k < 4; k++) {
    vec3 nx;
    float tl = leave(p + d * 1e-4, d, nx);
    float sg = sig * (1.0 + pk * (d.x * d.x - 0.3));
    // The first two legs: seen straight, and once more mirrored in a pavilion step, as step cuts repeat them.
    if (k < 2 && uJar > 0.0) {
      float tv = (VC - dot(VN, p)) / dot(VN, d);
      if (tv > 0.0 && tv < tl) {
        vec3 j = jardin(p + d * tv) * uJar;
        float Tv = T * exp(-sg * tv);
        vec3 rv = uRotT * reflect(d, VN);
        // The rows mirror the room when they face it and scatter a little white light either way; a cavity's
        // jagged wall turns light away (dark), its bubble lets it through and catches a glint.
        acc += Tv * ((j.x * 0.7 * exp(-sg * 0.4) + j.z * 0.6) * env(rv)[ch] + j.x * 0.05);
        T *= 1.0 - 0.18 * j.x - 0.8 * j.y * (1.0 - 0.9 * j.z);
      }
    }
    p += d * tl;
    T *= exp(-sg * tl);
    vec3 od = refract(d, -nx, ior);
    if (dot(od, od) < 1e-6) { d = reflect(d, -nx); continue; }
    float Rx = fres(clamp(dot(d, nx), 0.0, 1.0), 1.0 / ior);
    acc += T * (1.0 - Rx) * env(uRotT * od)[ch];
    T *= Rx;
    d = reflect(d, -nx);
  }
  return acc + T * 0.35 * exp(-sig * 0.8) * env(uRotT * d)[ch];
}
// The setting: a collet of warm white metal round the girdle, a short band from just under it to a lip just over
// the crown's edge. On a dark button it parts the stone from the dark and draws the outline of the cut; the stone
// itself stays as it is, deep and see-through, not lit from inside.
const float BZ_LO = -0.06, BZ_HI = 0.06, BZ_LIP = 0.02;
float octd(vec2 p, out vec2 ns) {   // how far outside the girdle's outline (negative inside), and that side's normal
  float d = -BIG; ns = vec2(0.0);
  for (int g = 0; g < 8; g++) { float e = dot(uP[g].xy, p) - uP[g].w; if (e > d) { d = e; ns = uP[g].xy; } }
  return d;
}
bool bezel(vec3 ro, vec3 rd, out float t, out vec3 n) {
  float tn = -BIG, tf = BIG; n = vec3(0.0, 0.0, 1.0);
  for (int i = 0; i < 10; i++) {
    vec3 N = i < 8 ? vec3(uP[i].xy, 0.0) : vec3(0.0, 0.0, i == 8 ? 1.0 : -1.0);
    float w = i < 8 ? uP[i].w + uBz : (i == 8 ? BZ_HI : -BZ_LO);
    float dn = dot(N, rd), s = w - dot(N, ro);
    if (abs(dn) < 1e-6) { if (s < 0.0) return false; continue; }
    float ti = s / dn;
    if (dn < 0.0) { if (ti > tn) { tn = ti; n = N; } } else tf = min(tf, ti);
  }
  t = tn;
  return tn < tf && tf > 0.0;
}
vec3 metal(vec3 bp, vec3 nb, bool cup) {
  vec2 ns; float od = octd(bp.xy, ns);
  // The top is a rounded bead: across its width the normal turns from the stone, through up, to the outside.
  float u = clamp((od + BZ_LIP) / (uBz + BZ_LIP), 0.0, 1.0);
  // At 1x the bead is under a pixel and its curve averages out: tilt less, so the band keeps one soft tone
  // instead of beading into dots. The outer wall is rounded into it.
  float fp = clamp((uBz + BZ_LIP) * uS / 2.0, 0.35, 1.0);
  vec3 nl = nb.z > 0.5 ? normalize(vec3(ns * (2.0 * u - 1.0) * 1.4 * fp, 1.0)) : normalize(vec3(nb.xy, 0.6));
  vec3 nw = uRotT * nl;
  float k = dot(reflect(vec3(0.0, 0.0, -1.0), nw), uL);
  // Satin white metal, lighter where it faces up and towards you; the glint only on the cursor's side.
  float base = 0.2 + 0.08 * nw.y + 0.1 * max(nw.z, 0.0);
  float side = clamp(dot(nw.xy, normalize(uL.xy + 1e-4)) * 2.0, 0.0, 1.0);
  float hi = (1.8 + 5.0 * uFlash) * sstep(0.8, 0.98, k) + 0.5 * side * sstep(0.3, 0.9, k);
  return vec3(1.0, 0.965, 0.91) * (base + hi) * (cup ? 0.35 : 1.0);
}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec3 col = vec3(0.0); float cov = 0.0, edge = 0.0;
  float inv = 1.0 / float(uSS);
  // Outside the stone's bounding circle the quad only carries the shadow: no rays there.
  bool near = length((gl_FragCoord.xy - uC) / uS) < 1.16 + uBz + 2.0 / uS;
  for (int i = 0; i < 4; i++) { if (i >= uSS || !near) break;
    for (int j = 0; j < 4; j++) { if (j >= uSS) break;
      vec2 off = (vec2(float(i), float(j)) + 0.5) * inv - 0.5;
      off = mat2(0.9659, 0.2588, -0.2588, 0.9659) * off;          // rotated grid
      gPos = gl_FragCoord.xy + off;
      vec2 p = (gPos - uC) / uS;
      vec3 ro = uRot * vec3(p, 4.0), rd = uRot * vec3(0.0, 0.0, -1.0);
      float t; vec3 n;
      bool hs = enter(ro, rd, t, n);
      if (uBz > 0.0) {
        float tb; vec3 nb;
        if (bezel(ro, rd, tb, nb) && (!hs || tb < t)) {
          vec3 bp = ro + rd * tb; vec2 ns;
          bool hole = nb.z > 0.5 && octd(bp.xy, ns) <= -BZ_LIP;
          // Through the opening over the crown the ray goes on to the stone; if it misses, it meets the cup inside.
          if (!hole || !hs) { col += metal(bp, nb, hole); cov += 1.0; continue; }
        }
      }
      if (hs) {
        vec3 hp = ro + rd * t;
        // Bluish green, vivid, not too dark, transparent (GIA): red goes fast, blue a little faster than green.
        // Beryl's dispersion is low (0.014): the three indices sit that close, so no fire inside; the spread
        // shows only outside, on the page.
        col += vec3(channel(hp, rd, n, 1.574, 3.4, -0.3, 0), channel(hp, rd, n, 1.580, 0.62, 0.0, 1),
          channel(hp, rd, n, 1.588, 1.15, 0.4, 2));
        // Facet junctions, hinted: where the second-nearest plane is within a pixel, a hairline.
        if (uEdge > 0.0) {
          float e1 = BIG, e2 = BIG;
          for (int g = 0; g < uNP; g++) { float e = uP[g].w - dot(uP[g].xyz, hp); if (e < e1) { e2 = e1; e1 = e; } else if (e < e2) e2 = e; }
          edge += sstep(1.0 / uS, 0.3 / uS, e2);
        }
        // The girdle's edge on the side of the light: a hairline bevel, the thickness of the wall catching light.
        if (uRim > 0.0) {
          float dg = BIG; vec2 ng = vec2(0.0);
          for (int g = 0; g < 8; g++) { float e = uP[g].w - dot(uP[g].xy, hp.xy); if (e < dg) { dg = e; ng = uP[g].xy; } }
          vec2 nw = (uRotT * vec3(ng, 0.0)).xy;
          float face = sstep(-0.1, 0.8, dot(normalize(nw), normalize(uL.xy + vec2(1e-4))));
          col += vec3(0.62, 0.72, 0.66) * uRim * face * sstep(1.3 / uS, 0.35 / uS, dg);
        }
        cov += 1.0;
      }
    }
  }
  edge /= max(cov, 1.0);
  col /= max(cov, 1.0);
  // The junctions: a touch darker on a lit facet, a touch lighter on a dark one, so the steps read at 1x.
  col = mix(col, col * 0.5 + 0.045, edge * uEdge * 0.6);
  cov *= inv * inv;
  col = mix(col, 0.82 + 0.18 * (1.0 - exp(-(col - 0.82) / 0.18)), step(0.82, col));   // highlights roll off
  vec3 s = toSRGB(clamp(col, 0.0, 1.0));
  // On the page under it: a soft shadow away from the light, and the green it lets through, inside the shadow.
  vec2 q = (gl_FragCoord.xy - uC) / uS;
  vec2 sc = -uL.xy * 0.35 + vec2(0.0, -0.22);
  vec2 dq = (q - sc) * vec2(0.85, 1.25);
  float sh = exp(-dot(dq, dq) * 1.5) * uShadow;
  vec2 cc = -uL.xy * 0.5 + vec2(0.0, -0.16);
  float ca = exp(-dot((q - cc) * 1.9, (q - cc) * 1.9)) * uShadow;
  vec3 pre = s * cov + (1.0 - cov) * vec3(0.0, 0.05, 0.03) * ca;
  float a = cov + (1.0 - cov) * 0.14 * sh;
  o = vec4(pre, a) * uA;
}`;

const SPEC = `#version 300 es
precision highp float;
uniform vec2 uC; uniform float uR, uW, uAng, uSpan, uI;
out vec4 o;
vec3 bump3(vec3 x) { return max(1.0 - x * x, 0.0); }
// The light the stone split, landing on the page: a short soft smear across the beam, violet near, red far.
void main() {
  vec2 d = gl_FragCoord.xy - uC;
  vec2 dir = vec2(cos(uAng), sin(uAng));
  float along = dot(d, dir), across = dot(d, vec2(-dir.y, dir.x));
  float u = across / (uSpan * uR), v = (along - uR) / uW;
  float k = exp(-u * u * 3.0) * exp(-v * v * 1.6) * uI;
  // Soft, not a rainbow: wide overlapping bands, a warm far edge and a cool near one.
  float w = clamp(v * 0.3 + 0.5, 0.0, 1.0);
  vec3 sp = bump3(vec3(2.4 * (w - 0.8), 2.4 * (w - 0.52), 2.4 * (w - 0.22)));
  o = vec4(sp * k * 0.48, k * 0.12);
}`;

function build(fs) {
  const p = gl.createProgram();
  for (const [t, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
    gl.attachShader(p, s);
  }
  gl.bindAttribLocation(p, 0, 'aP'); gl.linkProgram(p);
  return p;
}
// The driver builds the shaders off the main thread where it can (KHR_parallel_shader_compile): wait for that
// without asking, since asking for the result blocks the page until the build is done (a second or more, cold).
function built(progs) {
  const ext = gl.getExtension('KHR_parallel_shader_compile');
  return new Promise((done) => {
    const check = () => !ext || gl.isContextLost() || progs.every((p) => gl.getProgramParameter(p, ext.COMPLETION_STATUS_KHR)) ? done() : setTimeout(check, 50);
    check();
  });
}
function prog(p) {
  // A shader this GPU won't build: no stone at all, the arrows stay arrows.
  if (gl.isContextLost() || !gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name.replace('[0]', ''); u[nm] = gl.getUniformLocation(p, nm); }
  return { p, u };
}
const pS = build(STONE), pX = build(SPEC);
await built([pS, pX]);
const PS = prog(pS), PX = prog(pX);
if (!PS || !PX) { cv.remove(); return; }
gl.useProgram(PS.p); gl.uniform4fv(PS.u.uP, new Float32Array(planes.flat())); gl.uniform1i(PS.u.uNP, NP);
const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
let W = 0, H = 0;
// On a phone 100vh is the tall viewport, under the browser's bars too, and innerHeight is the visible part: the
// canvas takes its own size, so its pixels stay square and the stone lands on its arrow whatever the bars do.
function resize() {
  dpr = Math.min(devicePixelRatio || 1, DPR_MAX);
  if (!TOUCH) { W = innerWidth; H = innerHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); return; }
  W = cv.clientWidth || innerWidth; H = cv.clientHeight || innerHeight;
  const w = Math.round(W * dpr), h = Math.round(H * dpr);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
}
resize(); addEventListener('resize', () => { resize(); kick(); });
// A phone builds the stone's pipeline now, at idle, with one draw that leaves nothing on the canvas: a GPU that
// finishes its shaders only at the first draw would otherwise do it on the first press, as a hitch under the finger.
if (TOUCH) {
  gl.viewport(0, 0, cv.width, cv.height);
  for (const P of [PS, PX]) {
    gl.useProgram(P.p); gl.uniform2f(P.u.uRes, cv.width, cv.height);
    gl.uniform4f(P.u.uRect, 0, 0, 4, 4);
    if (P === PS) { gl.uniform1i(PS.u.uSS, 1); gl.uniform1f(PS.u.uS, 1); gl.uniform1f(PS.u.uA, 0); } else gl.uniform1f(PX.u.uI, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  // Sent now: the hidden canvas isn't shown, so nothing else would hand these draws to the GPU before the first press.
  gl.flush();
}

// ---------- small math ----------
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qax = (x, y, z, t) => { const s = Math.sin(t / 2); return [x * s, y * s, z * s, Math.cos(t / 2)]; };
const qn = (q) => { const l = Math.hypot(...q) || 1; return q.map((v) => v / l); };
const qconj = (q) => [-q[0], -q[1], -q[2], q[3]];
function qstep(q, w, dt) { const d = qmul([w[0], w[1], w[2], 0], q); return qn(q.map((v, i) => v + 0.5 * dt * d[i])); }
function qerr(qt, q) {
  let e = qmul(qt, qconj(q)); if (e[3] < 0) e = e.map((v) => -v);
  const s = Math.hypot(e[0], e[1], e[2]); if (s < 1e-9) return [0, 0, 0];
  const a = 2 * Math.atan2(s, e[3]); return [e[0] / s * a, e[1] / s * a, e[2] / s * a];
}
function mats(q) {
  const [x, y, z, w] = q;
  const R = [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];   // rows, local->world
  return [new Float32Array(R), new Float32Array([R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]])];
}
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const PAPER = [lin(242), lin(242), lin(240)], DARK = [lin(50), lin(50), lin(50)], BAND = [lin(10), lin(10), lin(10)];
// A spring toward a target: weight comes from omega, overshoot from zeta.
function spring(x, v, to, w, z, dt) { const a = w * w * (to - x) - 2 * z * w * v; v += a * dt; return [x + v * dt, v]; }

// ---------- state ----------
// The stone's length per font size: on dark buttons (inside the pill, a size under the label's cap height plus a
// little) and on links.
const GEM_BTN = 1.15, GEM_LINK = 1.2;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
// The setting: a closed collet on the dark only (dark buttons, the black band).
const BZ = 'dark';
// Table turned more to you than in v4, so the window and its steps show; still tilted enough for the crown's side.
const REST = qn(qmul(qax(0, 0, 1, 0.1), qmul(qax(0, 1, 0, 0.24), qax(1, 0, 0, -0.34))));
const ptr = { x: -999, y: -999, t: -1e9, el: null, lastEl: null, leftT: -1e9, enterT: -1e9, real: false, inside: false };
let pressEl = null, pressT = -1e9, focusEl = null, focusT = -1e9, lastInput = 'pointer';
// A phone: the element a tap has just followed. Its stone stays until the page goes.
let held = null;
const stones = [], specs = [];
let cur = null;

// Every link and button gets one, so a new link has its stone without being marked.
for (const el of document.querySelectorAll(['header', 'main', 'footer'].map((p) => `body > ${p} :is(a[href], button)`).join()))
  if (!el.closest('[data-gem-off]')) el.setAttribute('data-gem', '');
const ELS = [...document.querySelectorAll('[data-gem]')];
const isBtn = (el) => el.classList.contains('btn');
// The dark under a stone: a dark button, or the black band its link stands on.
const darkOf = (el) => (isBtn(el) ? el : el.closest('.tools'));
// The glyph the stone stands in for: the arrow, or in a row of links the dot after the link.
function glyphOf(el) {
  const n = el.nextElementSibling;
  return el.querySelector('.arw') || (n && n.classList.contains('sep') ? n : null);
}
// A link set in a row of small links (the footer, the header's nav) or inside running text: its stone rises above
// the line, so on its way along the row it never crosses the words.
const rows = new Map();
function inRow(el) {
  let k = rows.get(el);
  if (k === undefined) {
    const p = el.parentElement;
    k = !!el.closest('footer, header nav') ||
      (getComputedStyle(el).display === 'inline' && !!p && p.textContent.trim() !== el.textContent.trim());
    rows.set(el, k);
  }
  return k;
}
// The link's text, first and last line: the boxes of its first and last words' lines, and the size they are set in.
function lines(el) {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let a = null, b = null;
  for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue.trim() && n.parentElement.getClientRects().length) { a = a || n; b = n; }
  if (!b) return null;
  const rg = document.createRange();
  rg.selectNodeContents(a); const ra = rg.getClientRects();
  rg.selectNodeContents(b); const rb = rg.getClientRects();
  if (!ra.length || !rb.length) return null;
  return { first: ra[0], last: rb[rb.length - 1], fs: parseFloat(getComputedStyle(b.parentElement).fontSize) };
}
// The glyph's own box. Its rect would include the shrink we put on it while the stone is out (a scale about its
// centre), and the stone would then slide onto the label: so the size comes from layout, the centre from the rect.
function box(g) {
  const a = g.getBoundingClientRect(), cx = a.left + a.width / 2, cy = a.top + a.height / 2, w = g.offsetWidth, h = g.offsetHeight;
  return { left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, width: w, height: h };
}
// Where the stone sits on an element: in its glyph if there is one, else just after the label.
function anchor(el) {
  const r = el.getBoundingClientRect();
  const fs = parseFloat(getComputedStyle(el).fontSize);
  const arw = glyphOf(el), lbl = el.querySelector('.lbl');
  // L is the stone's length; its width is 0.72 L. About the size of the arrow it stands in for, a little longer on a
  // dark button; on a Lead-size line no longer than 28px. Over a row of small links 18px, risen above the line.
  let L = isBtn(el) ? fs * GEM_BTN : Math.min(28, fs * GEM_LINK);
  let x, y, gx, gy, raised = false;
  if (arw && arw.classList.contains('sep')) {
    L = Math.min(18, fs * 1.4); raised = true;
    const a = box(arw); x = gx = a.left + a.width / 2;
    gy = r.top + r.height * 0.56; y = r.top - L * 0.16;
  } else if (arw) {
    // Grown from the arrow and pushed away from the words: after a label it starts where the arrow starts,
    // before one it ends where the arrow ends.
    const a = box(arw), first = a.left - r.left < 2;
    gx = a.left + a.width / 2; gy = y = a.top + a.height * 0.54;
    // Before a label it may take the space before the first letter, and hangs into the margin like hanging
    // punctuation, but never closer than 8px to the screen edge (phones: the column starts 24px in).
    x = first ? Math.max(8 + L / 2, Math.min(gx, a.right + 2 - L / 2)) : Math.max(gx, a.left - 1 + L / 2);
  } else if (lbl) { const a = lbl.getBoundingClientRect(); x = gx = a.right + 10 + L / 2; y = gy = a.top + a.height * 0.52; }
  else {
    // No glyph: the stone's place comes from the text. Sized by the line it ends, not by the link's box.
    const t = lines(el) || { first: r, last: r, fs };
    const e = t.last;
    const cs = getComputedStyle(el);
    // A light pill (round ends and a surface of its own; a focus ring rounds plain links too, so the fill decides):
    // the stone is set into its round end, where a button's arrow would be.
    if (!isBtn(el) && parseFloat(cs.borderTopRightRadius) >= r.height / 2 - 1 && (cs.backgroundImage !== 'none' || !/^(transparent|rgba\(.*,\s*0\))$/.test(cs.backgroundColor))) {
      L = Math.min(18, t.fs * 1.3);
      x = gx = Math.min(r.right - L * 0.1, innerWidth - 8 - L / 2); y = gy = r.top + r.height / 2;
    } else if (!isBtn(el) && inRow(el)) {
      // In a row: over the gap to the next link when that is close, else just past the last letter, risen above the
      // line; never nearer than 8px to the screen's edge.
      L = Math.min(18, t.fs * 1.4); raised = true;
      const n = el.nextElementSibling, nr = n && n.getBoundingClientRect();
      const gap = nr && Math.abs(nr.top + nr.height / 2 - (r.top + r.height / 2)) < r.height ? nr.left - e.right : Infinity;
      x = gx = Math.min(gap < L + 8 ? e.right + gap / 2 : e.right + 4 + L / 2, innerWidth - 8 - L / 2);
      gy = e.top + e.height * 0.54; y = Math.max(8 + L * 0.36, e.top - L * 0.16);
    } else {
      // Alone on its line: after its last word, as a full stop.
      L = isBtn(el) ? L : Math.min(28, t.fs * GEM_LINK);
      x = gx = e.right + Math.max(4, t.fs * 0.3) + L / 2; y = gy = e.top + e.height * 0.54;
    }
  }
  const dark = darkOf(el);
  return { x, y, L, back: dark ? (isBtn(el) ? DARK : BAND) : PAPER, dark, raised, r, ox: gx - x, oy: gy - y };
}
function newStone(el, a) {
  const s = { el, x: a.x, y: a.y, tx: a.x, ty: a.y, ox: a.ox, oy: a.oy, vx: 0, vy: 0, L: a.L, p: 0, vp: 0, want: 1, q: REST, qt: REST, w: [0, 0, 0],
    flash: 0, glint: 0, back: a.back, dark: a.dark, raised: a.raised, arw: glyphOf(el) };
  // It comes out of the arrow edge-on and turns its table to you as it grows.
  if (!RM) s.q = qn(qmul(qax(0, 1, 0, -1.25), REST));
  stones.push(s); return s;
}
// The light: on the pointer's side. From the keyboard, and on a phone (a finger is no lamp, and it covers the stone),
// the studio's own key light, high on the left: the split light then falls down and right, on the screen.
function lightFor(s) {
  let lx = (ptr.x - s.x) / 70, ly = -(ptr.y - s.y) / 70;
  if (!(Math.abs(lx) < 50) || lastInput === 'key' || TOUCH) { lx = -0.55; ly = 0.75; }
  lx = Math.max(-1.4, Math.min(1.4, lx)); ly = Math.max(-1.4, Math.min(1.4, ly));
  const l = Math.hypot(lx, ly, 1);
  return [lx / l, ly / l, 1 / l];
}
// The split light lands just outside the element, on the line from the light through the stone, a little downhill.
function landing(s) {
  const r = s.el.getBoundingClientRect();
  const fixed = lastInput === 'key' || TOUCH;
  let lx = s.x - (fixed ? s.x - 40 : ptr.x), ly = s.y - (fixed ? s.y - 30 : ptr.y);
  const l0 = Math.hypot(lx, ly) || 1; lx = lx / l0; ly = ly / l0 + 1.2;
  const l = Math.hypot(lx, ly); lx /= l; ly /= l;
  const tx = lx > 0 ? (r.right - s.x) / lx : lx < 0 ? (r.left - s.x) / lx : 1e9;
  const ty = ly > 0 ? (r.bottom - s.y) / ly : ly < 0 ? (r.top - s.y) / ly : 1e9;
  const inside = s.x > r.left && s.x < r.right && s.y > r.top && s.y < r.bottom;
  const R = (inside ? Math.max(0, Math.min(tx, ty, 300)) : 0) + s.L * 0.4 + 6;
  return { ang: Math.atan2(-ly, lx), R };
}

// ---------- input ----------
// The stone an element answers with: its own, or, where it lends itself to another link to the same place
// (data-gem-to, the id of that link: a case's picture and its title), that link's.
function gemOf(e) {
  if (!e || !e.closest) return null;
  const to = e.closest('[data-gem-to]');
  return to ? document.getElementById(to.dataset.gemTo) : e.closest('[data-gem]');
}
function hit(x, y) { return gemOf(document.elementFromPoint(x, y)); }
function setHover(el) {
  if (ptr.el === el) return;
  if (ptr.el) { ptr.el.classList.remove('hov'); ptr.lastEl = ptr.el; ptr.leftT = performance.now(); }
  ptr.el = el; ptr.enterT = performance.now();
  if (el) el.classList.add('hov');
}
function move(x, y) {
  const now = performance.now();
  const dx = x - ptr.x, dy = y - ptr.y, d = Math.hypot(dx, dy);
  ptr.x = x; ptr.y = y;
  const was = ptr.el;
  setHover(hit(x, y));
  if (d > 0.5 && d < 400) {
    ptr.t = now;
    // A brush of the pointer nudges the stone, as a fingertip would.
    if (cur && cur.el === ptr.el && !RM) { cur.w[1] += dx * 0.03; cur.w[0] += dy * 0.03; }
  }
  // A pointermove that goes nowhere (a still hand, a synthetic event after scroll) doesn't wake the loop.
  if (d > 0.5 || ptr.el !== was) kick();
}
// Pressed with the button: it dips, rocks a little and its facets flash; the light it splits falls outside.
function burst() {
  if (!cur) return;
  cur.flash = 1;
  // On a phone the press is the stone's birth: it rocks and flashes but doesn't dip, or it would come out late.
  if (!RM) { cur.w[0] -= 5; if (!TOUCH) cur.vp -= 2.2; }
  const { ang, R } = landing(cur);
  specs.push({ x: cur.x, y: cur.y, ang, R, t0: performance.now(), amp: 1 });
}
// A phone: the stone comes out at once, the flash waits until the touch is a press (lifted, or still for 90ms), so a
// scroll that starts on a button only shows a small stone folding back, not a flash and a rainbow.
let pend = false;
const CONFIRM = 90;
function press(el, x, y) {
  pressEl = el; pressT = performance.now(); ptr.t = pressT;
  kick();
  if (TOUCH) { pend = true; return; }
  // The stone exists by the next frame: then it flashes, turns, and the light it splits falls outside.
  requestAnimationFrame(burst);
}
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') {
    // A phone: a finger that rolls on the button before it lifts rocks the stone and tilts it after the finger.
    if (TOUCH && pressEl && cur && cur.el === pressEl && !RM) {
      const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
      ptr.x = e.clientX; ptr.y = e.clientY;
      if (Math.hypot(dx, dy) > 0.5) { cur.w[1] += dx * 0.06; cur.w[0] += dy * 0.06; kick(); }
    }
    return;
  }
  ptr.real = true; ptr.inside = true;
  lastInput = 'pointer';
  move(e.clientX, e.clientY);
}, { passive: true });
addEventListener('pointerdown', (e) => {
  lastInput = 'pointer'; ptr.real = true;
  const el = gemOf(e.target);
  if (TOUCH) held = null;
  if (!el) return;
  ptr.x = e.clientX; ptr.y = e.clientY;
  if (e.pointerType === 'touch') setHover(el);
  press(el, e.clientX, e.clientY);
});
addEventListener('pointerup', (e) => { pressEl = null; if (e.pointerType === 'touch') setHover(null); kick(); });
// The pointer is gone from the page, or its coordinates no longer mean anything: no hover until it moves again.
// A press ends here too: a link dragged away, a zoom, a page put into the back-forward cache never see a pointerup.
function away() { pressEl = null; ptr.inside = false; setHover(null); kick(); }
document.addEventListener('pointerleave', away);
addEventListener('pointercancel', away);
addEventListener('dragstart', away);
// A zoom or a new window size makes the coordinates stale. On a phone the browser's bars sliding in and out resize the
// page under a still finger: that keeps the press (same width).
let lastW = innerWidth;
addEventListener('resize', () => { if (TOUCH && innerWidth === lastW) return; lastW = innerWidth; away(); });
if (TOUCH) {
  // The touch became a scroll, or a long press opened the link's menu: the stone goes at once, the arrow is back.
  const drop = () => {
    pressEl = null; pressT = -1e9; held = null; pend = false;
    setHover(null); ptr.lastEl = null;
    if (cur) { cur.want = 0; cur.snap = true; cur = null; }
    specs.length = 0;
    kick();
  };
  addEventListener('pointercancel', (e) => { if (e.pointerType === 'touch') drop(); });
  addEventListener('contextmenu', drop);
  // The page lost focus under the finger (a link preview, another app): no pointerup may follow.
  addEventListener('blur', drop);
  // The tap is followed: the stone stays while the next page loads, until pagehide. A link that leads nowhere new
  // (a hash on this page, a new tab, a script that took the click) lets it go as a press does.
  addEventListener('click', (e) => {
    const g = gemOf(e.target), el = g && g.matches('a[data-gem][href]') ? g : null;
    if (!el || e.defaultPrevented || el.target === '_blank' || el.hasAttribute('download')) return;
    const u = new URL(el.href, location.href);
    // mailto: and the like open another app: the page stays, so the stone goes as after any press.
    if (!/^https?:$/.test(u.protocol)) return;
    if (u.hash && u.origin === location.origin && u.pathname === location.pathname && u.search === location.search) return;
    held = el; kick();
    // A load that never comes (offline, stopped): let the stone go after a while, counted from the last tap.
    const tap = pressT;
    setTimeout(() => { if (held === el && pressT === tap) { held = null; kick(); } }, 5000);
  });
}
addEventListener('pagehide', () => {
  away(); focusEl = null; ptr.lastEl = null; held = null;
  for (const s of stones) if (s.arw) s.arw.style.cssText = '';
  stones.length = 0; specs.length = 0; cur = null;
  gl.clear(gl.COLOR_BUFFER_BIT);
  if (TOUCH) cv.style.visibility = 'hidden';
});
// The page scrolls under a still pointer: the stones ride with their elements; one whose element has left the
// pointer goes. A new one comes out only when the hand moves: links passing under a still pointer stay arrows.
addEventListener('scroll', () => { if (ptr.el && hit(ptr.x, ptr.y) !== ptr.el) setHover(null); kick(); }, { passive: true });
let sx0 = scrollX, sy0 = scrollY;
addEventListener('keydown', (e) => {
  lastInput = 'key';
  // A key press has no key-up for the stone to wait for: it flashes and stays on for focus, not for the press.
  if ((e.key === 'Enter' || e.key === ' ') && document.activeElement && document.activeElement.matches('[data-gem]')) { press(document.activeElement); pressEl = null; }
});
document.addEventListener('focusin', (e) => {
  const el = e.target.closest && e.target.closest('[data-gem]');
  if (el && lastInput === 'key') { focusEl = el; focusT = performance.now(); kick(); }
});
document.addEventListener('focusout', () => { focusEl = null; kick(); });

// ---------- the loop: it runs only while a stone is out or something moves ----------
let running = false, last = 0, dead = false;
function kick() {
  // A phone wakes the loop only for a press or a stone still out: a scroll or a resize at rest costs no frame.
  if (TOUCH && !pressEl && !held && !stones.length && !specs.length) return;
  if (!running && !dead) { running = true; last = performance.now(); requestAnimationFrame(frame); }
}
// The GPU dropped the context (a driver reset, too many tabs): the stones go, every arrow comes back, nothing draws again.
cv.addEventListener('webglcontextlost', () => {
  dead = true;
  for (const el of ELS) { const g = glyphOf(el); if (g) g.style.cssText = ''; }
  stones.length = 0; specs.length = 0; cur = null;
  cv.remove();
});
// DWELL: a pointer only passing over doesn't bring one out. GRACE: leaving for a moment doesn't put it away.
const GRACE = 140, FAR = 140, FAR_KEY = 320, DWELL = 70;
// A stone that has stopped: grown, in place, turned to where it leans, no flash or glint left. Then no more frames.
function settled(s) {
  if (s.want !== 1 || s.hop) return false;
  return Math.abs(s.p - 1) < 0.002 && Math.abs(s.vp) < 0.01 && Math.abs(s.tx - s.x) + Math.abs(s.ty - s.y) < 0.05 &&
    Math.abs(s.vx) + Math.abs(s.vy) < 0.3 && Math.hypot(...s.w) < 0.01 && Math.hypot(...qerr(s.qt, s.q)) < 0.002 &&
    s.flash < 0.003 && s.glint < 0.01;
}
function frame(now) {
  if (dead) { running = false; return; }
  // A phone shows its canvas from the frame, not from the touch handler, which only records the press.
  if (TOUCH && cv.style.visibility) cv.style.visibility = '';
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  // Scrolled since the last frame: everything drawn moves with the page, so a stone stays on its arrow.
  const dsx = scrollX - sx0, dsy = scrollY - sy0; sx0 = scrollX; sy0 = scrollY;
  if (dsx || dsy) {
    for (const s of stones) { s.x -= dsx; s.tx -= dsx; s.y -= dsy; s.ty -= dsy; if (s.hop) s.hop.x0 -= dsx; }
    for (const sp of specs) { sp.x -= dsx; sp.y -= dsy; }
  }
  {
    // Who gets the stone: a press, then a keyboard focus, then the pointer. It stays for as long as the element is
    // hovered or focused, still hand or not.
    let el = null, travel = false;
    const hovEl = ptr.el || (now - ptr.leftT < GRACE ? ptr.lastEl : null);
    if (held) el = held;
    else if (pressEl || now - pressT < 650) el = pressEl || (cur && cur.el) || hovEl;
    else if (focusEl && lastInput === 'key') { el = focusEl; travel = true; }
    else if (hovEl && ((cur && cur.want === 1) || (ptr.el && now - ptr.enterT > DWELL))) el = hovEl;
    if (el) {
      const a = anchor(el);
      if (!cur) cur = newStone(el, a);
      else if (cur.el !== el) {
        // Near neighbours (a row of links, the Tab order): the same stone travels. Far: a new one, the old one goes.
        // With reduced motion it never travels: one fades out, the other fades in.
        if (RM || Math.hypot(a.x - cur.x, a.y - cur.y) > (travel ? FAR_KEY : FAR)) { cur.want = 0; cur.quick = true; cur = newStone(el, a); }
        else {
          if (cur.arw) cur.arw.style.cssText = ''; cur.el = el; cur.arw = glyphOf(el);
          // A hop along a row goes under the labels, not across them: down, along, up into the next glyph.
          // Raised above the line (footer) it already clears the words: no dip.
          if (!RM && !a.raised && Math.abs(a.y - cur.y) < 6 && Math.abs(a.x - cur.x) > 4) cur.hop = { x0: cur.x, dx: a.x - cur.x, D: a.r.bottom - a.y + a.L * 0.5 + 1 };
        }
      }
      if (cur.want === 0 && !RM) cur.w[1] -= 3;
      Object.assign(cur, { tx: a.x, ty: a.y, ox: a.ox, oy: a.oy, L: a.L, back: a.back, dark: a.dark, raised: a.raised, want: 1 });
      // It leans with the pointer's place on the element.
      cur.qt = REST;
      if (ptr.el === el && lastInput !== 'key') {
        const nx = Math.max(-1, Math.min(1, (ptr.x - (a.r.left + a.r.width / 2)) / (a.r.width / 2)));
        const ny = Math.max(-1, Math.min(1, (ptr.y - (a.r.top + a.r.height / 2)) / (a.r.height / 2)));
        cur.qt = qn(qmul(qmul(qax(0, 1, 0, 0.45 * nx), qax(1, 0, 0, 0.3 * ny)), REST));
      }
    } else if (cur && cur.want === 1) { cur.want = 0; if (!RM) cur.w[1] += 5; }

    if (pend && cur && (!pressEl || now - pressT > CONFIRM)) { pend = false; burst(); }
    const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
    for (const s of stones) {
      for (let k = 0; k < n; k++) {
        // On a phone it comes out faster, grown in about four frames; dropped by a scroll under the finger, it goes
        // back into its arrow in about 100ms.
        [s.p, s.vp] = spring(s.p, s.vp, s.want, RM ? (s.quick ? 45 : 12) : s.want ? (TOUCH ? 34 : 22) : s.snap ? 50 : 18, RM ? 1 : s.want ? 0.55 : 1, h);
        if (s.p < 0) { s.p = 0; s.vp = 0; }
        if (RM) { s.x = s.tx; s.y = s.ty; s.vx = s.vy = 0; s.q = REST; }
        else {
          [s.x, s.vx] = spring(s.x, s.vx, s.tx, 20, 0.78, h); [s.y, s.vy] = spring(s.y, s.vy, s.ty, 20, 0.78, h);
          const e = qerr(s.qt, s.q);
          for (let c = 0; c < 3; c++) s.w[c] += (225 * e[c] - 2 * 0.42 * 15 * s.w[c]) * h;
          // While it travels it rolls over the page like a ball on a table (screen y is down, world y is up).
          const roll = 0.35 / (s.L / 2);
          s.q = qstep(s.q, [s.w[0] + s.vy * roll, s.w[1] + s.vx * roll, s.w[2]], h);
        }
        s.flash *= Math.exp(-h * 7);
      }
      // A quick turn throws a faint spectrum too.
      const spin = Math.hypot(...s.w);
      s.glint += ((RM ? 0 : Math.min(1, Math.max(0, (spin - 4) / 14))) - s.glint) * Math.min(1, dt * 10);
      if (s.arw) { const v = Math.min(1, Math.max(0, s.p)); s.arw.style.opacity = (1 - Math.min(1, v * 1.6)).toFixed(3); s.arw.style.transform = `scale(${(1 - 0.5 * v).toFixed(3)})`; }
    }
    for (let i = stones.length - 1; i >= 0; i--) {
      const s = stones[i];
      if (s.want === 0 && s.p < 0.004 && Math.abs(s.vp) < 0.02) { if (s.arw) s.arw.style.cssText = ''; stones.splice(i, 1); if (cur === s) cur = null; }
    }
  }
  for (let i = specs.length - 1; i >= 0; i--) if (now - specs[i].t0 > 1500) specs.splice(i, 1);
  draw(now);
  // Keep going while anything still moves or a hovered element is still waiting out the dwell. A stone that has
  // settled stays on the canvas as the last frame drew it.
  const waiting = (ptr.el && !(cur && cur.el === ptr.el) && now - ptr.enterT < DWELL + 50) || (!ptr.el && ptr.lastEl && now - ptr.leftT < GRACE + 30);
  const busy = stones.some((s) => !settled(s)) || specs.length || waiting || now - pressT < 700 || (focusEl && now - focusT < 1200);
  if (busy) requestAnimationFrame(frame);
  else { running = false; if (!stones.length) { gl.clear(gl.COLOR_BUFFER_BIT); if (TOUCH) cv.style.visibility = 'hidden'; } }
}
function drawSpec(x, y, ang, R, I) {
  const Rd = R * dpr, Wd = 6 * dpr, len = 16 * dpr, half = Rd + Math.max(Wd * 3, len * 1.5);
  const cx = x * dpr, cy = (H - y) * dpr;
  gl.uniform4f(PX.u.uRect, cx - half, cy - half, half * 2, half * 2);
  gl.uniform2f(PX.u.uC, cx, cy); gl.uniform1f(PX.u.uR, Rd); gl.uniform1f(PX.u.uW, Wd);
  gl.uniform1f(PX.u.uAng, ang); gl.uniform1f(PX.u.uSpan, len / Rd); gl.uniform1f(PX.u.uI, I);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
function draw(now) {
  gl.viewport(0, 0, cv.width, cv.height);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(PX.p); gl.uniform2f(PX.u.uRes, cv.width, cv.height);
  for (const sp of specs) {
    const t = (now - sp.t0) / 1000;
    const I = sp.amp * (RM ? Math.min(1, t / 0.15) : 1 - Math.exp(-t / 0.05)) * Math.exp(-t / 0.42);
    // The stone's turn sweeps the beam a little across the page.
    const sw = RM ? 0 : 1 - Math.exp(-t / 0.3);
    drawSpec(sp.x, sp.y, sp.ang - 0.3 * sw, sp.R + 5 * sw, I);
  }
  for (const s of stones) if (s.glint > 0.02 && s.p > 0.3) { const { ang, R } = landing(s); drawSpec(s.x, s.y, ang, R, s.glint * 0.45 * Math.min(1, s.p)); }
  gl.useProgram(PS.p); gl.uniform2f(PS.u.uRes, cv.width, cv.height);
  // Samples per pixel side. A phone takes 2: four rays a pixel instead of nine, under half the GPU time, and on a
  // dense screen the difference doesn't show.
  gl.uniform1i(PS.u.uSS, TOUCH ? SS_TOUCH : dpr >= 2 ? 3 : 4);
  for (const s of stones) {
    // On the way between neighbours it tucks in a little, so it slides past the next label instead of over it.
    // Raised above a row of links it clears the words, so there it keeps its size along the way.
    const tuck = RM || s.raised ? 0 : Math.min(1, Math.hypot(s.vx, s.vy) / 500);
    const S = (s.L / 2) * dpr * (RM ? 1 : Math.max(0, s.p)) * (1 - 0.4 * tuck * tuck * (3 - 2 * tuck));
    if (S < 0.3) continue;
    let dip = 0;
    if (s.hop) {
      const k = Math.min(1, Math.max(0, (s.x - s.hop.x0) / s.hop.dx));
      dip = s.hop.D * Math.pow(Math.sin(Math.PI * k), 0.35);
      if (k >= 1 || Math.abs(s.tx - s.x) < 0.3) s.hop = null;
    }
    // It grows out of the glyph: born at the arrow (or the dot), it settles a little aside as it grows.
    const g = RM ? 0 : 1 - Math.min(1, Math.max(0, s.p));
    const cx = (s.x + s.ox * g) * dpr, cy = (H - s.y - s.oy * g - dip) * dpr, half = S * 1.9 + 2;
    gl.uniform4f(PS.u.uRect, cx - half, cy - half, half * 2, half * 2);
    gl.uniform2f(PS.u.uC, cx, cy); gl.uniform1f(PS.u.uS, S);
    const [rot, rotT] = mats(s.q);
    gl.uniformMatrix3fv(PS.u.uRot, false, rot); gl.uniformMatrix3fv(PS.u.uRotT, false, rotT);
    gl.uniform3fv(PS.u.uL, lightFor(s));
    gl.uniform3fv(PS.u.uBack, PAPER);
    gl.uniform3fv(PS.u.uBack2, s.back);
    const dk = !!s.dark;
    if (dk) {
      const r = s.dark.getBoundingClientRect();
      gl.uniform4f(PS.u.uBox, (r.left + r.width / 2) * dpr, (H - r.top - r.height / 2) * dpr, r.width / 2 * dpr, r.height / 2 * dpr);
      // A pill's ends are round; the band is square.
      gl.uniform1f(PS.u.uBoxR, isBtn(s.dark) ? Math.min(r.width, r.height) / 2 * dpr : 0);
    } else { gl.uniform4f(PS.u.uBox, -1e4, -1e4, 0, 0); gl.uniform1f(PS.u.uBoxR, 0); }
    gl.uniform1f(PS.u.uJar, 1);
    gl.uniform1f(PS.u.uEdge, 1);
    gl.uniform1f(PS.u.uFlash, s.flash);
    // On a dark button: how much the stone's own green lights the button under it (seen through the window).
    gl.uniform1f(PS.u.uGlow, dk ? 3 : 0);
    // On a dark button the window shows the dark behind it: the lit girdle edge gives the stone its outline there.
    // The collet: ~0.65px of metal plus its lip, ~1px in all; it grows with the stone. Under it the lit edge is quieter.
    const bz = BZ === 'off' ? 0 : dk ? 0.65 : BZ === 'all' ? 0.45 : 0;
    gl.uniform1f(PS.u.uBz, bz / (s.L / 2));
    gl.uniform1f(PS.u.uCup, bz > 0 && dk ? 0.45 : 0);
    gl.uniform1f(PS.u.uRim, dk ? (bz > 0 ? 0.3 : 0.7) : 0);
    gl.uniform1f(PS.u.uA, RM ? Math.min(1, Math.max(0, s.p)) : Math.min(1, Math.max(0, s.p) / 0.3));
    gl.uniform1f(PS.u.uShadow, dk ? 0.3 : 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

}
