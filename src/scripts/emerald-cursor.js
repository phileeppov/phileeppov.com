// The emerald cursor: the pointer itself is a cut stone, a kite whose tip is the hotspot. The material is the one the
// stones on the buttons have (src/scripts/emerald.js): beryl's three indices, its absorption, a dark room with two tall
// panels so the steps alternate light and dark, facet junctions hinted at 1x. Over text it turns into a baguette, the
// I-beam; over a link or a button it fills out into a rounder drop and bows (chosen over a kite that swings round to
// point like the site's arrows and one that shrinks to a seed). Moving, it is emerald; still, the colour drains to
// smoke. Over a link it stays green, unless the link grows its own stone: then the green is the stone's. Nothing is
// drawn frame by frame at rest: the last frame stays on the canvas. The system cursor goes only once this one has
// drawn, and comes back whenever it steps aside or WebGL fails. The caller runs this only on wide screens with a fine
// pointer, no reduced-motion, contrast or forced-colours preference.
export async function startCursor() {
const root = document.documentElement;
const cv = document.createElement('canvas');
cv.setAttribute('aria-hidden', 'true');
cv.dataset.layer = 'cursor';
cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000';
const gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
if (!gl) return;
// WebGL drawn on the CPU (no GPU, or it is blocklisted) can't keep a pointer under the hand: the system one stays.
const info = gl.getExtension('WEBGL_debug_renderer_info');
if (info && /swiftshader|llvmpipe|software|basic render/i.test(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))) return;

const UNIT = 22;   // css px per stone unit: the kite is one unit from tip to heel

// ---------- the cut ----------
const D = Math.PI / 180;
const angDist = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const angMid = (a, b) => a + angDist(a, b) / 2;
// An outline (CCW) as sides: each edge, plus a corner side at each vertex (a negative cut leaves the point sharp,
// the side is still there, so two shapes have the same count and can morph into each other).
function sides(verts, cuts) {
  const n = verts.length, out = [];
  const edge = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); const nx = dy / l, ny = -dx / l; return [Math.atan2(ny, nx), nx * a[0] + ny * a[1]]; };
  for (let i = 0; i < n; i++) {
    const v = verts[i], e0 = edge(verts[(i + n - 1) % n], v), e1 = edge(v, verts[(i + 1) % n]);
    const a = angMid(e0[0], e1[0]);
    out.push([a, Math.cos(a) * v[0] + Math.sin(a) * v[1] - cuts[i]]);
    out.push(e1);
  }
  return out.sort((p, q) => p[0] - q[0]);
}
// A step cut on any outline: girdle, two crown steps, table, three pavilion steps; s scales the steps.
function cut(sd, s) {
  const P = [];
  const step = (a, g, slope, inset, z, down) => {
    const sn = Math.sin(slope * D), c = Math.cos(slope * D) * (down ? -1 : 1);
    const N = [Math.cos(a) * sn, Math.sin(a) * sn, c], px = Math.cos(a) * (g - inset), py = Math.sin(a) * (g - inset);
    P.push([N[0], N[1], N[2], N[0] * px + N[1] * py + N[2] * z]);
  };
  for (const [a, g] of sd) P.push([Math.cos(a), Math.sin(a), 0, g]);
  const z0 = 0.03 * s, i1 = 0.12 * s, i2 = 0.14 * s;
  const z1 = z0 + i1 * Math.tan(48 * D), zt = z1 + i2 * Math.tan(25 * D);
  for (const [a, g] of sd) step(a, g, 48, 0, z0, false);
  for (const [a, g] of sd) step(a, g, 25, i1, z1, false);
  P.push([0, 0, 1, zt]);
  const q1 = 0.2 * s, q2 = 0.42 * s, y1 = -z0 - q1 * Math.tan(52 * D), y2 = y1 - (q2 - q1) * Math.tan(44 * D);
  for (const [a, g] of sd) step(a, g, 52, 0, -z0, true);
  for (const [a, g] of sd) step(a, g, 44, q1, y1, true);
  for (const [a, g] of sd) step(a, g, 36, q2, y2, true);
  return P;
}
// The lowest point of the stone (its culet or keel), found column by column.
function depth(P, verts) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [x, y] of verts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  let lo = 0;
  for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) {
    const x = x0 + ((x1 - x0) * i) / 20, y = y0 + ((y1 - y0) * j) / 20;
    let zl = -1e9, zh = 1e9, ok = true;
    for (const [a, b, c, d] of P) {
      const r = d - a * x - b * y;
      if (Math.abs(c) < 1e-6) { if (r < 0) { ok = false; break; } }
      else if (c > 0) zh = Math.min(zh, r / c); else zl = Math.max(zl, r / c);
    }
    if (ok && zl <= zh) lo = Math.min(lo, zl);
  }
  return -lo;
}
const SHAPES = {
  // A kite with a sharp tip: the pointer. The tip is the hotspot.
  kite: { verts: [[0, 0.62], [-0.3, -0.02], [0, -0.38], [0.3, -0.02]], cuts: [-0.03, 0.045, 0.05, 0.045], s: 0.42, pivot: [0, 0.62] },
  // A baguette: the same stone as an I-beam over text, centred on the hotspot.
  bag: { verts: [[-0.085, 0.5], [-0.085, -0.5], [0.085, -0.5], [0.085, 0.5]], cuts: [0.02, 0.02, 0.02, 0.02], s: 0.118, pivot: [0, 0] },
  // A drop: the kite filled out, shoulders and heel rounded off; the tip stays where it was.
  drop: { verts: [[0, 0.62], [-0.37, 0.05], [0, -0.3], [0.37, 0.05]], cuts: [-0.03, 0.12, 0.15, 0.12], s: 0.47, pivot: [0, 0.62] },
};
for (const k in SHAPES) { const S = SHAPES[k]; S.sides = sides(S.verts, S.cuts); S.planes = cut(S.sides, S.s); S.depth = depth(S.planes, S.verts); }
// Pair the kite's sides with another shape's, so one turns into the other side by side.
function pairing(B) {
  let best = 0, bs = 1e9;
  for (let k = 0; k < 8; k++) { let s = 0; for (let i = 0; i < 8; i++) s += Math.abs(angDist(SHAPES.kite.sides[i][0], B.sides[(i + k) % 8][0])); if (s < bs) { bs = s; best = k; } }
  return best;
}
const SHIFT = { bag: pairing(SHAPES.bag), drop: pairing(SHAPES.drop) };
let shapeKey = '', shapeMemo = null;
// The kite, part way to the baguette (mt) and part way to the drop (md).
function shapeAt(mt, md) {
  mt = Math.round(Math.min(1, Math.max(0, mt)) * 400) / 400; md = Math.round(Math.min(1, Math.max(0, md)) * 400) / 400;
  const sum = mt + md; if (sum > 1) { mt /= sum; md /= sum; }
  if (mt === 0 && md === 0) return SHAPES.kite;
  if (mt === 1) return SHAPES.bag;
  if (md === 1) return SHAPES.drop;
  const key = mt + ':' + md;
  if (key === shapeKey) return shapeMemo;
  const A = SHAPES.kite, B = SHAPES.bag, C = SHAPES.drop;
  const sd = A.sides.map((p, i) => {
    const qb = B.sides[(i + SHIFT.bag) % 8], qc = C.sides[(i + SHIFT.drop) % 8];
    return [p[0] + angDist(p[0], qb[0]) * mt + angDist(p[0], qc[0]) * md, p[1] + (qb[1] - p[1]) * mt + (qc[1] - p[1]) * md];
  });
  const s = A.s + (B.s - A.s) * mt + (C.s - A.s) * md;
  const verts = A.verts.map((v, i) => [0, 1].map((j) => v[j] + (B.verts[i][j] - v[j]) * mt + (C.verts[i][j] - v[j]) * md));
  const planes = cut(sd, s);
  shapeKey = key;
  shapeMemo = { sides: sd, s, planes, verts, depth: depth(planes, verts), pivot: [0, 0.62 * (1 - mt)] };
  return shapeMemo;
}

// ---------- GL ----------
const VS = `#version 300 es
uniform vec4 uBox;
void main() { vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)); gl_Position = vec4(mix(uBox.xy, uBox.zw, c), 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
#define MAXP 56
uniform vec4 uP[MAXP];
uniform int uNP, uNS, uSS;
uniform mat3 uR;                   // the stone's turn, local -> world
uniform vec3 uPivL, uSig, uFloor, uFloorP, uL;
uniform vec2 uOrigin, uCen, uSh;
uniform float uUnit, uZ, uH, uRad, uShR, uAS, uAC, uCaustic, uS, uDisp, uFlash;
out vec4 o;
const float BIG = 1e9;
// smoothstep written out: many calls here run from the high edge to the low one, which the spec leaves undefined.
float sstep(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 spectrum(float x) { float h = x * 0.8; return clamp(vec3(abs(h * 6.0 - 3.0) - 1.0, 2.0 - abs(h * 6.0 - 2.0), 2.0 - abs(h * 6.0 - 4.0)), 0.0, 1.0); }
vec3 toSrgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
float fres(float c, float eta) { float r0 = (1.0 - eta) / (1.0 + eta); r0 *= r0; return r0 + (1.0 - r0) * pow(1.0 - c, 5.0); }

// What the stone sees, the same room as the stones on the buttons: dark, darker where the viewer stands, one small
// hot light (crisp glints that travel as it turns), a broad wrap round it, two tall soft panels the steps carry as
// bands. Over a dark surface the room is a little lighter. Below the horizon: the surface it lies on.
const vec3 METAL = vec3(1.0, 0.965, 0.91);
float dark() { return sstep(0.3, 0.02, luma(uFloor)); }
vec3 env(vec3 d) {
  vec3 room = vec3(mix(0.16, 0.26, dark())) + vec3(0.14) * d.y;
  room *= mix(1.0, 0.25, sstep(0.78, 0.97, d.z)) * (1.0 + 2.8 * uFlash);
  float k = dot(d, uL);
  room += vec3(1.0, 0.99, 0.97) * (7.0 + 14.0 * uFlash) * sstep(0.962, 0.988, k);
  room += vec3(0.25 + 0.9 * uFlash) * sstep(0.55, 0.95, k);
  float front = sstep(0.0, 0.35, d.z);
  room += vec3(1.5) * sstep(0.12, 0.0, abs(d.x + 0.62)) * front * sstep(-0.4, 0.3, d.y);
  room += vec3(1.2) * sstep(0.1, 0.0, abs(d.x - 0.7)) * front * sstep(-0.4, 0.3, d.y);
  room += vec3(0.9) * sstep(0.7, 0.92, dot(d, normalize(vec3(-0.5, 0.7, 0.5))));
  if (d.z > 0.02) return room;
  // Below: the surface it lies on. Over a dark one, as the stones on the dark buttons are set: a polished cup of warm
  // white metal behind the pavilion, so the window shows light coming back off the metal, not the dark.
  vec3 cup = METAL * 0.45 * (0.55 + 0.6 * max(0.0, dot(normalize(vec3(-d.xy, 1.2)), uL)));
  return mix(room, mix(uFloor, cup, dark()), sstep(0.02, -0.18, d.z));
}
// The crown's own surface: a black card keeps the studio's sheen off it, only the hot light glints.
vec3 sheen(vec3 d) { return 0.3 * env(d) + vec3(1.0, 0.99, 0.97) * (5.0 + 18.0 * uFlash) * sstep(0.962, 0.988, dot(d, uL)); }
bool enter(vec3 o, vec3 d, out float t, out vec3 n) {
  float tn = -BIG, tf = BIG;
  n = vec3(0.0, 0.0, 1.0);
  for (int i = 0; i < uNP; i++) {
    vec3 N = uP[i].xyz; float dn = dot(N, d); float s = uP[i].w - dot(N, o);
    if (abs(dn) < 1e-7) { if (s < 0.0) return false; continue; }
    float ti = s / dn;
    if (dn < 0.0) { if (ti > tn) { tn = ti; n = N; } } else tf = min(tf, ti);
  }
  t = tn;
  return tn < tf && tf > 0.0;
}
float leave(vec3 o, vec3 d, out vec3 n) {
  float tf = BIG; n = vec3(0.0, 0.0, 1.0);
  for (int i = 0; i < uNP; i++) {
    vec3 N = uP[i].xyz; float dn = dot(N, d);
    if (dn > 1e-6) { float ti = (uP[i].w - dot(N, o)) / dn; if (ti < tf) { tf = ti; n = N; } }
  }
  return tf;
}
// One colour channel from the entry point on, as on the buttons: its own index, its own absorption, three bounces.
// pk: pleochroism, the absorption leans with the ray's direction.
float channel(vec3 p, vec3 d, vec3 n, float ior, float sig, float pk, int ch) {
  float R = fres(clamp(-dot(d, n), 0.0, 1.0), ior);
  float acc = R * sheen(uR * reflect(d, n))[ch];
  float T = 1.0 - R;
  d = refract(d, n, 1.0 / ior);
  for (int k = 0; k < 3; k++) {
    vec3 nx;
    float tl = leave(p + d * 1e-4, d, nx);
    p += d * tl;
    T *= exp(-sig * (1.0 + pk * (d.x * d.x - 0.3)) * tl);
    vec3 od = refract(d, -nx, ior);
    if (dot(od, od) < 1e-6) { d = reflect(d, -nx); continue; }
    float Rx = fres(clamp(dot(d, nx), 0.0, 1.0), 1.0 / ior);
    acc += T * (1.0 - Rx) * env(uR * od)[ch];
    T *= Rx;
    d = reflect(d, -nx);
  }
  return acc + T * 0.35 * exp(-sig * 0.8) * env(uR * d)[ch];
}
float lobe(vec3 d) { return sstep(0.42, 0.12, acos(clamp(dot(d, uL), -1.0, 1.0))); }
// From a point on the page back toward the light through the stone: how much of that light still gets here.
float through(vec3 o, vec3 d, float t, vec3 n, float ior, float sg) {
  vec3 p = o + d * t;
  float T = 1.0 - fres(clamp(-dot(d, n), 0.0, 1.0), ior);
  d = refract(d, n, 1.0 / ior);
  float acc = 0.0;
  for (int k = 0; k < 3; k++) {
    vec3 nx; float tl = leave(p + d * 1e-4, d, nx);
    p += d * tl; T *= exp(-sg * tl);
    vec3 od = refract(d, -nx, ior);
    if (dot(od, od) < 1e-6) { d = reflect(d, -nx); continue; }
    float Rx = fres(clamp(dot(d, nx), 0.0, 1.0), 1.0 / ior);
    acc += T * (1.0 - Rx) * (lobe(uR * od) + 0.1);
    T *= Rx; d = reflect(d, -nx);
  }
  return acc;
}
// The page near the stone, as a multiplier on its own colour: a soft green contact shade and the light the stone
// lets through, traced per wavelength, so the spectrum lands on the page and never on the stone.
vec3 pageLight(vec2 w) {
  mat3 Rt = transpose(uR);
  vec3 ol = uPivL + Rt * vec3(w, -uZ);
  vec2 fl = (uPivL + Rt * vec3(w, 0.0)).xy;
  float sd = -BIG;
  for (int i = 0; i < uNS; i++) { sd = max(sd, dot(uP[i].xy, fl) - uP[i].w); }
  float soft = 0.05 * uS + 0.45 * uH;
  float occ = (1.0 - sstep(-soft, soft, sd - 0.2 * uH)) / (1.0 + 2.5 * uH);
  vec3 ao = 1.0 - occ * (1.0 - 0.8 * exp(-uSig * 0.5 * uS));
  vec3 TU = normalize(cross(uL, vec3(0.0, 0.0, 1.0))), TV = cross(uL, TU);
  vec3 acc = vec3(0.0), ref = vec3(0.0);
  for (int k = 0; k < 12; k++) {
    float x = (float(k) + 0.5) / 12.0;
    vec3 wv = spectrum(x);
    float a = float(k) * 2.39996;
    float r = sqrt(fract(float(k) * 0.618034 + 0.31)) * 0.09;
    // Each colour leaves the stone a little off the others: its shadow and its light land apart, the rim splits.
    vec3 L = normalize(uL + (cos(a) * TU + sin(a) * TV) * r + (x - 0.5) * uDisp * TV);
    vec3 dl = Rt * L;
    float t; vec3 nn;
    float K = 1.0;
    if (enter(ol, dl, t, nn)) K = through(ol, dl, t, nn, mix(1.545, 1.625, x), dot(uSig, wv) / dot(wv, vec3(1.0)));
    acc += wv * K; ref += wv;
  }
  return 0.45 * ao + 0.55 * acc / ref;
}
// Source-over can only darken or tint toward a colour, so pick the least alpha that turns the page colour into
// the lit one; on text under it the same alpha reads as a light shade.
vec4 overPage(vec3 E) {
  vec3 R = toSrgb(pow(uFloorP, vec3(2.2)) * E);
  vec3 P0 = uFloorP;
  vec3 a1 = 1.0 - R / max(P0, vec3(1e-3));
  vec3 a2 = (R - P0) / max(1.0 - P0, vec3(1e-3));
  float a = clamp(max(max(max(a1.r, a1.g), a1.b), max(max(a2.r, a2.g), a2.b)), 0.0, 1.0);
  return vec4(clamp(R - (1.0 - a) * P0, 0.0, a), a);
}
vec3 tone(vec3 c) { vec3 hi = 0.82 + 0.18 * (1.0 - exp(-(c - 0.82) / 0.18)); return mix(c, hi, step(vec3(0.82), c)); }

void main() {
  vec2 fc = gl_FragCoord.xy;
  mat3 Rt = transpose(uR);
  vec2 w0 = (fc - uOrigin) / uUnit;
  vec3 sc = vec3(0.0); float cov = 0.0, edge = 0.0;
  // Over a dark surface the girdle is set in a thin band of the same metal, lit on the side of the light: the outline
  // a system arrow gets from its white edge. Over the light page it isn't there.
  float rimAmt = 0.9 * dark();
  float rimW = 1.3 / uUnit;
  if (length(w0 - uCen) < uRad) {
    float hits = 0.0, inv = 1.0 / float(uSS);
    for (int sy = 0; sy < 3; sy++) { if (sy >= uSS) break;
      for (int sx = 0; sx < 3; sx++) { if (sx >= uSS) break;
        vec2 off = mat2(0.9659, 0.2588, -0.2588, 0.9659) * ((vec2(float(sx), float(sy)) + 0.5) * inv - 0.5);
        vec2 w = w0 + off / uUnit;
        vec3 ro = uPivL + Rt * vec3(w, 10.0), rd = Rt * vec3(0.0, 0.0, -1.0);
        float t; vec3 nn;
        if (enter(ro, rd, t, nn)) {
          vec3 hp = ro + rd * t;
          // Bluish green, vivid, transparent; beryl's three indices sit close, so no fire inside the stone.
          vec3 c = vec3(channel(hp, rd, nn, 1.574, uSig.r, -0.3, 0), channel(hp, rd, nn, 1.580, uSig.g, 0.0, 1),
            channel(hp, rd, nn, 1.588, uSig.b, 0.4, 2));
          // Facet junctions, hinted: where the second-nearest plane is within a pixel, a hairline.
          float e1 = BIG, e2 = BIG;
          for (int g = 0; g < uNP; g++) { float e = uP[g].w - dot(uP[g].xyz, hp); if (e < e1) { e2 = e1; e1 = e; } else if (e < e2) e2 = e; }
          edge += sstep(1.0 / uUnit, 0.3 / uUnit, e2);
          if (rimAmt > 0.0) {
            float sd = -BIG; vec2 en = vec2(0.0);
            for (int i = 0; i < uNS; i++) { float e = dot(uP[i].xy, hp.xy) - uP[i].w; if (e > sd) { sd = e; en = uP[i].xy; } }
            float side = 0.55 + 0.55 * max(dot(normalize((uR * vec3(en, 0.0)).xy), normalize(uL.xy)), 0.0);
            c = mix(c, METAL * 0.5 * side, rimAmt * sstep(-rimW, -0.25 * rimW, sd));
          }
          sc += c; hits += 1.0;
        }
      }
    }
    if (hits > 0.0) { sc /= hits; edge /= hits; }
    // The junctions: a touch darker on a lit facet, a touch lighter on a dark one, so the steps read at 1x.
    sc = mix(sc, sc * 0.5 + 0.045, edge * 0.6);
    cov = hits * inv * inv;
  }
  vec3 E = vec3(1.0);
  if (cov * uAS < 0.999 && (length(w0 - uSh) < uShR || length(w0 - uCen) < uRad + uH)) E = pageLight(w0);
  E = min(mix(vec3(1.0), E, uCaustic * uAC), vec3(1.0));
  vec4 page = overPage(E);
  vec4 st = vec4(toSrgb(tone(sc)) * cov, cov) * uAS;
  o = st + page * (1.0 - st.a);
}`;
function compile(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
const prog = gl.createProgram();
gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
gl.linkProgram(prog);
// The driver builds the shader off the main thread where it can (KHR_parallel_shader_compile): wait for that without
// asking, since asking for the result blocks the page until the build is done (a second or more, cold).
const par = gl.getExtension('KHR_parallel_shader_compile');
if (par) await new Promise((done) => { const check = () => gl.isContextLost() || gl.getProgramParameter(prog, par.COMPLETION_STATUS_KHR) ? done() : setTimeout(check, 50); check(); });
// A shader this GPU won't build: no emerald, the system cursor stays.
if (gl.isContextLost() || !gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
gl.useProgram(prog);
const U = {};
for (const n of ['uBox', 'uP', 'uNP', 'uNS', 'uSS', 'uR', 'uPivL', 'uSig', 'uFloor', 'uFloorP', 'uL', 'uOrigin', 'uCen', 'uSh', 'uUnit', 'uZ', 'uH', 'uRad', 'uShR', 'uAS', 'uAC', 'uCaustic', 'uS', 'uDisp', 'uFlash'])
  U[n] = gl.getUniformLocation(prog, n);
gl.bindVertexArray(gl.createVertexArray());
document.body.append(cv);
// The system cursor goes only while this one is on: the class is set in the frame that first draws it, and taken
// off whenever it steps aside.
let shown = false;
const show = () => { if (!shown) { shown = true; root.classList.add('gem-cursor'); } };
const hide = () => { if (shown) { shown = false; root.classList.remove('gem-cursor'); } };
const style = document.createElement('style');
style.textContent = 'html.gem-cursor, html.gem-cursor * { cursor: none !important; }';
document.head.append(style);

let W = innerWidth, H = innerHeight, dpr = 1;
function resize() { dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); kick(); }

// ---------- pointer and what is under it ----------
const ptr = { x: -100, y: -100, inside: false, down: false };
let failed = false;
function fail() {
  failed = true; running = false;
  hide();
  cv.remove();
}
cv.addEventListener('webglcontextlost', fail);
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' || failed) return;
  // Over the page's own scrollbar the system cursor is back anyway: this one steps aside.
  const on = e.clientX < root.clientWidth && e.clientY < root.clientHeight;
  // A move that goes nowhere (a synthetic event after a scroll, a still hand) doesn't wake the loop.
  if (e.clientX === ptr.x && e.clientY === ptr.y && on === ptr.inside) return;
  ptr.x = e.clientX; ptr.y = e.clientY;
  // Back on the page: there at once, at full strength, no fade-in while the system cursor is already hidden.
  if (on && !ptr.inside) { st.reenter = true; st.alpha = 1; }
  ptr.inside = on;
  if (!on) hide();
  kick();
}, { passive: true });
addEventListener('pointerdown', (e) => { if (e.button === 0 && e.pointerType !== 'touch') { ptr.down = true; st.flash = 1; kick(); } });
addEventListener('pointerup', () => { ptr.down = false; kick(); });
addEventListener('pointercancel', () => { ptr.down = false; kick(); });
// The emerald steps aside, at once, and the system cursor is back: off the page, a native drag (it brings its own
// cursor), the context menu, a zoom (the coordinates are stale until the hand moves), the page being put away.
function away() { ptr.inside = false; ptr.down = false; st.alpha = 0; hide(); kick(); }
document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) away(); });
addEventListener('dragstart', away);
addEventListener('contextmenu', away);
addEventListener('pagehide', () => { away(); gl.clear(gl.COLOR_BUFFER_BIT); });
addEventListener('blur', () => { ptr.down = false; kick(); });
// The page scrolling under a still pointer changes what it is over.
addEventListener('scroll', () => kick(), { passive: true });
addEventListener('resize', () => { away(); resize(); });

function overText(x, y) {
  let node = null, i = 0;
  if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); if (p) { node = p.offsetNode; i = p.offset; } }
  else if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); if (r) { node = r.startContainer; i = r.startOffset; } }
  if (!node || node.nodeType !== 3) return false;
  const rg = document.createRange();
  rg.setStart(node, Math.max(0, i - 1)); rg.setEnd(node, Math.min(node.length, i + 1));
  for (const b of rg.getClientRects()) if (x >= b.left - 2 && x <= b.right + 2 && y >= b.top - 4 && y <= b.bottom + 4) return true;
  return false;
}
const NONE = { kind: 'none', el: null };
function sense(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return NONE;
  const a = el.closest('a[href], button, [role="button"], summary, label, select');
  if (a) return { kind: 'link', el: a };
  if (el.closest('input, textarea, [contenteditable]')) return { kind: 'text', el };
  return { kind: overText(x, y) ? 'text' : 'none', el };
}
// What the stone lies on: the first background up the tree (a gradient counts as the mean of its stops).
const PAGE = [242 / 255, 242 / 255, 240 / 255];
const floors = new WeakMap();
function bgOf(e) {
  if (floors.has(e)) return floors.get(e);
  const cs = getComputedStyle(e);
  let c = null;
  const m = cs.backgroundColor.match(/[\d.]+/g);
  if (m && (m[3] === undefined || +m[3] > 0.5)) c = m.slice(0, 3).map((v) => v / 255);
  else if (cs.backgroundImage.includes('gradient')) {
    const stops = [...cs.backgroundImage.matchAll(/rgba?\(([^)]+)\)/g)].map((s) => s[1].split(',').map(Number));
    if (stops.length) c = [0, 1, 2].map((k) => stops.reduce((t, s) => t + s[k], 0) / stops.length / 255);
  }
  floors.set(e, c);
  return c;
}
function floorAt(x, y) {
  for (let e = document.elementFromPoint(x, y); e && e !== root; e = e.parentElement) { const c = bgOf(e); if (c) return c; }
  return bgOf(root) || PAGE;
}

// ---------- motion ----------
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
// A spring toward a target: f in Hz, z the damping ratio (below 1 it overshoots).
function sp(o, k, target, f, z, dt) { const w = 2 * Math.PI * f; let v = o[k + 'V'] || 0; v += (w * w * (target - o[k]) - 2 * z * w * v) * dt; o[k] += v * dt; o[k + 'V'] = v; }
const ease = (o, k, target, up, down, dt) => { o[k] += (target - o[k]) * (1 - Math.exp(-dt / (target > o[k] ? up : down))); };
const nrm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
// Absorption per stone unit, as on the buttons (GIA: bluish green, vivid, not too dark), a third deeper: the cursor is
// small and has to read on the page. Smoke: the same stone with most of the colour drained, for rest; a grey that
// still leans green, so it reads as the emerald gone quiet rather than another stone.
const EMERALD = [3.4, 0.62, 1.15].map((v) => v * 1.35), SMOKE = [2.3, 1.55, 1.85];
// The light: nearly overhead, so the shadow hugs the stone instead of reading as a second cursor.
const LIGHT = nrm([-0.28, 0.38, 1]);
const st = { x: -100, y: -100, yaw: 0.36, pitch: 0, roll: 0, lift: 0.2, scale: 1, mt: 0, ml: 0, wake: 0, alpha: 0, vx: 0, vy: 0, px: -100, py: -100, flash: 0, floor: PAGE.slice(), floorP: PAGE.slice(), reenter: true };

function step(dt, c, dvx, dvy) {
  // The tip is the pointer, always: weight lives in how the body swings from it, not in lagging behind.
  st.x = ptr.x; st.y = ptr.y;
  const text = c.kind === 'text', link = c.kind === 'link', gem = link && c.el.matches('[data-gem]');
  // The cut changes only once the pointer has stayed over text (or off it) for a beat: crossing a word gap or a line
  // gap doesn't flip it back and forth.
  if (text !== st.wantText) { st.wantText = text; st.since = 0; }
  st.since = (st.since || 0) + dt;
  if (st.since > 0.06) st.textOn = text;
  sp(st, 'mt', st.textOn ? 1 : 0, 6.5, 1, dt);
  sp(st, 'ml', link ? 1 : 0, 6, 0.75, dt);
  const m = clamp(st.mt, 0, 1), l = clamp(st.ml, 0, 1.15);
  let rest = 0.36 * (1 - m);
  rest -= 0.08 * l;
  const a = [-Math.sin(st.yaw), Math.cos(st.yaw)], g = 1 - 0.85 * m;
  // Dragged by its tip: speed lays the tail behind, a change of speed swings it.
  st.yawV = (st.yawV || 0) + 0.065 * g * (a[0] * -st.vy - a[1] * st.vx) * dt;
  st.yawV += 0.0028 * g * (a[0] * -dvy - a[1] * dvx);
  sp(st, 'yaw', rest, 3.0 + 4 * m, 0.45, dt);
  st.yaw = clamp(st.yaw, rest - 0.5, rest + 0.5);
  sp(st, 'roll', clamp(-0.06 * st.yawV, -0.4, 0.4), 5, 0.7, dt);
  // The drop bows to what it is over: its body tips back and it reads shorter and rounder.
  sp(st, 'pitch', 0.28 * l, 4, 0.35, dt);
  const speed = Math.hypot(st.vx, st.vy);
  // Colour: from speed, and kept over something you can press. Over a link that grows its own stone the green goes
  // there: the cursor turns to smoke, so the page has one emerald at a time.
  const wake = gem ? 0 : Math.max(smooth(20, 700, speed), Math.min(1, Math.abs(st.yawV) / 5), 0.9 * clamp(l, 0, 1));
  ease(st, 'wake', wake, 0.05, gem ? 0.12 : 0.45, dt);
  if (st.wake < 0.02 && (gem || (speed < 1 && !link))) st.wake = 0;
  // At rest it lies on the page; moving, it lifts a little and its shadow comes apart from it.
  sp(st, 'lift', ptr.down ? 0.0 : 0.25 * st.wake, 6, 0.6, dt);
  sp(st, 'scale', (ptr.down ? 0.9 : 1 + 0.05 * st.wake) * (1 + 0.06 * l), 8, 0.5, dt);
  ease(st, 'alpha', ptr.inside ? 1 : 0, 0.05, 0.08, dt);
}

// ---------- frame ----------
let running = false, last = 0, lastSense = NONE, cleared = true, slow = 0;
function kick() { if (!running && !failed) { running = true; last = 0; requestAnimationFrame(frame); } }
function frame(now) {
  try { tick(now); } catch (err) { fail(); throw err; }
}
function tick(now) {
  const gap = last ? (now - last) / 1000 : 1 / 60;
  const dtF = Math.min(0.05, gap);
  last = now;
  // A pointer that can't keep up is worse than none: a run of slow frames while it moves brings the system one back.
  slow = gap > 0.045 ? slow + 1 : gap < 0.025 ? 0 : slow;
  if (slow >= 12) { fail(); return; }
  const c = ptr.inside ? sense(ptr.x, ptr.y) : NONE;
  // Coming onto something you can press: a nod and a glint.
  if (c.kind === 'link' && lastSense.el !== c.el) { st.pitchV = (st.pitchV || 0) + 2.2; st.flash = Math.max(st.flash, 0.35); }
  lastSense = c;
  // Pointer speed, measured per frame so it follows the page clock. A jump back into the window is not a throw.
  const ovx = st.vx, ovy = st.vy;
  if (st.reenter) { st.vx = st.vy = 0; st.reenter = false; }
  else { const k = 1 - Math.exp(-dtF / 0.025); st.vx += ((ptr.x - st.px) / dtF - st.vx) * k; st.vy += ((ptr.y - st.py) / dtF - st.vy) * k; }
  st.px = ptr.x; st.py = ptr.y;
  const n = Math.max(1, Math.ceil(dtF / 0.004)), dt = dtF / n;
  for (let i = 0; i < n; i++) step(dt, c, i === 0 ? st.vx - ovx : 0, i === 0 ? st.vy - ovy : 0);
  st.flash *= Math.exp(-dtF * 7);
  if (st.flash < 0.004) st.flash = 0;
  render(dtF);
  // Stop when nothing moves: the last frame stays on the canvas. Thresholds are what the eye can still see.
  const moving = ['yaw', 'roll', 'pitch', 'lift', 'scale', 'mt', 'ml'].some((q) => Math.abs(st[q + 'V'] || 0) > 0.004);
  if (st.wake <= 0.02 && Math.hypot(st.vx, st.vy) < 1) st.wake = 0;
  const settling = Math.abs(st.alpha - (ptr.inside ? 1 : 0)) > 0.004 || (st.wake > 0 && st.wake < 0.89) || st.flash > 0;
  if (moving || settling || Math.hypot(st.vx, st.vy) > 1) requestAnimationFrame(frame);
  else running = false;
}

const lin = (c) => c.map((x) => Math.pow(x, 2.2));
function render(dtF) {
  gl.viewport(0, 0, cv.width, cv.height);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  const aS = st.alpha;
  if (aS < 0.002) { cleared = true; return; }
  cleared = false;
  const shape = shapeAt(st.mt, st.ml);
  const sig = SMOKE.map((s, i) => s + (EMERALD[i] - s) * st.wake);
  const L = LIGHT;
  const unit = UNIT * st.scale;
  // The pivot (the tip) on the device-pixel grid, so the hotspot is exact.
  const ox = Math.round(st.x * dpr), oy = Math.round((H - st.y) * dpr);
  const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw), cp = Math.cos(st.pitch), spp = Math.sin(st.pitch), cr = Math.cos(st.roll), sr = Math.sin(st.roll);
  // R = Rz(yaw) * Rx(pitch) * Ry(roll), column-major
  const Rx = [1, 0, 0, 0, cp, spp, 0, -spp, cp], Ry = [cr, 0, -sr, 0, 1, 0, sr, 0, cr], Rz = [cy, sy, 0, -sy, cy, 0, 0, 0, 1];
  const mul = (A, B) => { const C = new Array(9); for (let j = 0; j < 3; j++) for (let r = 0; r < 3; r++) C[j * 3 + r] = A[r] * B[j * 3] + A[3 + r] * B[j * 3 + 1] + A[6 + r] * B[j * 3 + 2]; return C; };
  const R = mul(Rz, mul(Rx, Ry));
  const piv = shape.pivot;
  const z = shape.depth + Math.max(0, st.lift);
  // Bounds: the stone round its centre, its shadow pushed away from the light by its height.
  let cx = 0, cyy = 0; for (const v of shape.verts) { cx += v[0] / shape.verts.length; cyy += v[1] / shape.verts.length; }
  let rad = 0; for (const v of [...shape.verts, ...SHAPES.kite.verts, ...SHAPES.bag.verts, ...SHAPES.drop.verts]) rad = Math.max(rad, Math.hypot(v[0] - cx, v[1] - cyy));
  rad = rad * 1.04 + shape.s * 0.5 * Math.min(1, Math.abs(st.pitch) + Math.abs(st.roll)) + 1.5 / unit;
  const ccx = R[0] * (cx - piv[0]) + R[3] * (cyy - piv[1]), ccy = R[1] * (cx - piv[0]) + R[4] * (cyy - piv[1]);
  const zc = z - shape.depth * 0.5;
  const shx = ccx - zc * L[0] / L[2], shy = ccy - zc * L[1] / L[2], shr = rad + 0.35 * zc + 0.1;
  // What the stone lies over and what its shadow falls on, eased: it darkens over a dark button, and the shadow is
  // worked out against the surface it actually lands on.
  const fe = 1 - Math.exp(-dtF / 0.06);
  const fs = floorAt(clamp(st.x + ccx * unit, 0, W - 1), clamp(st.y - ccy * unit, 0, H - 1));
  const fp = floorAt(clamp(st.x + shx * unit, 0, W - 1), clamp(st.y - shy * unit, 0, H - 1));
  for (let i = 0; i < 3; i++) { st.floor[i] += (fs[i] - st.floor[i]) * fe; st.floorP[i] += (fp[i] - st.floorP[i]) * fe; }
  const x0 = Math.min(ccx - rad, shx - shr), x1 = Math.max(ccx + rad, shx + shr), y0 = Math.min(ccy - rad, shy - shr), y1 = Math.max(ccy + rad, shy + shr);
  const u = unit * dpr;
  const toX = (wx) => ((ox + wx * u) / cv.width) * 2 - 1, toY = (wy) => ((oy + wy * u) / cv.height) * 2 - 1;
  gl.uniform4f(U.uBox, toX(x0) - 0.002, toY(y0) - 0.002, toX(x1) + 0.002, toY(y1) + 0.002);
  const flat = new Float32Array(56 * 4); shape.planes.forEach((p, i) => flat.set(p, i * 4));
  gl.uniform4fv(U.uP, flat);
  gl.uniform1i(U.uNP, shape.planes.length); gl.uniform1i(U.uNS, 8);
  gl.uniform1i(U.uSS, dpr >= 1.75 ? 2 : 3);
  gl.uniformMatrix3fv(U.uR, false, R);
  gl.uniform3f(U.uPivL, piv[0], piv[1], 0);
  gl.uniform3fv(U.uSig, sig.map((s) => s / shape.s));
  gl.uniform3fv(U.uFloor, lin(st.floor)); gl.uniform3fv(U.uFloorP, st.floorP); gl.uniform3fv(U.uL, L); gl.uniform1f(U.uDisp, 0.24);
  gl.uniform2f(U.uOrigin, ox, oy); gl.uniform2f(U.uCen, ccx, ccy); gl.uniform2f(U.uSh, shx, shy);
  gl.uniform1f(U.uUnit, u); gl.uniform1f(U.uZ, z); gl.uniform1f(U.uH, Math.max(0, st.lift));
  gl.uniform1f(U.uRad, rad); gl.uniform1f(U.uShR, shr); gl.uniform1f(U.uAS, aS); gl.uniform1f(U.uAC, aS);
  gl.uniform1f(U.uCaustic, 0.45); gl.uniform1f(U.uS, shape.s); gl.uniform1f(U.uFlash, st.flash);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  if (ptr.inside) show();
}
resize();
// After a passage from another page of the site the hand is usually still where it pressed (src/components/Passage.astro
// keeps that point for a few seconds). If the page agrees the pointer is over what lies at that point, the emerald
// starts there instead of waiting for the hand to move; the next real move takes over either way.
try {
  const s = JSON.parse(sessionStorage.getItem('passage:ptr') || 'null');
  sessionStorage.removeItem('passage:ptr');
  const over = [...document.querySelectorAll(':hover')].pop();
  const at = s && document.elementFromPoint(s.x, s.y);
  if (s && Date.now() - s.t < 4000 && ptr.x === -100 && over && at && over !== document.body && over !== root && (over === at || over.contains(at))) {
    ptr.x = s.x; ptr.y = s.y; ptr.inside = true; st.reenter = true; st.alpha = 1; kick();
  }
} catch {}
}
