// "An emerald instead of the arrow": while the pointer moves over a link or a dark button, its arrow turns into a cut
// emerald; when the hand stops, the stone goes back into the arrow. At rest the page draws nothing (no frames).
// One WebGL2 canvas over the page that only ever draws a few small quads. Elements opt in with data-gem; the glyph the
// stone grows from is .arw inside them (without one, the stone sits after the label). Dark buttons (.btn) get the stone
// in a closed collet, so it stays light on the dark. Emerald exists only in motion: this runs on wide screens with a
// fine pointer and no reduced-motion preference (see the caller); elsewhere the arrows stay arrows.
export function startEmerald() {
const cv = document.createElement('canvas');
cv.setAttribute('aria-hidden', 'true');
cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:50';
const gl = cv.getContext('webgl2', { premultipliedAlpha: true, antialias: false, alpha: true });
if (!gl) return;
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
const dpr = Math.min(devicePixelRatio || 1, 2);
const VS = `#version 300 es
in vec2 aP; uniform vec4 uRect; uniform vec2 uRes;
void main(){ vec2 px = uRect.xy + aP * uRect.zw; gl_Position = vec4(px / uRes * 2.0 - 1.0, 0.0, 1.0); }`;

const STONE = `#version 300 es
precision highp float;
uniform vec4 uP[${NP}];
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
  vec3 b = mix(back2, uBack, smoothstep(-1.0, 1.0, sdBox(at - uBox.xy, uBox.zw, uBoxR)));
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
  room *= mix(1.0, 0.25, smoothstep(0.78, 0.97, d.z)) * (1.0 + 2.8 * uFlash);
  float k = dot(d, uL);
  room += vec3(1.0, 0.99, 0.97) * (7.0 + 14.0 * uFlash) * smoothstep(0.962, 0.988, k);
  room += vec3(0.25 + 0.9 * uFlash) * smoothstep(0.55, 0.95, k);
  // Two tall soft panels left and right: the step facets carry them as bright bands, the hall of mirrors.
  float front = smoothstep(0.0, 0.35, d.z);
  room += vec3(1.5) * smoothstep(0.12, 0.0, abs(d.x + 0.62)) * front * smoothstep(-0.4, 0.3, d.y);
  room += vec3(1.2) * smoothstep(0.1, 0.0, abs(d.x - 0.7)) * front * smoothstep(-0.4, 0.3, d.y);
  room += vec3(0.9) * smoothstep(0.7, 0.92, dot(d, normalize(vec3(-0.5, 0.7, 0.5))));
  if (d.z > 0.02) return room;
  return mix(room, behind(d), smoothstep(0.02, -0.18, d.z));
}
// The crown's own surface: a photographer's black card keeps the studio's sheen off it, only the hot light glints.
vec3 sheen(vec3 d) {
  return 0.3 * env(d) +vec3(1.0, 0.99, 0.97) * (5.0 + 18.0 * uFlash) * smoothstep(0.962, 0.988, dot(d, uL));
}
bool enter(vec3 ro, vec3 rd, out float t, out vec3 n) {
  float tn = -BIG, tf = BIG;
  for (int i = 0; i < ${NP}; i++) {
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
  for (int i = 0; i < ${NP}; i++) {
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
  float reach = smoothstep(0.62, 0.15, length(q * vec2(0.8, 1.5)));
  // Rows ~0.14 of the half-length apart: 4 px at 2x, a faint veil at 1x. Broken into dashes, bent by a slow warp.
  float rows = smoothstep(0.3, 0.95, 0.5 + 0.5 * sin(dot(q, vec2(0.6, 0.8)) * 46.0 + 5.0 * vnoise(q * 2.5 + 1.7)));
  float lace = rows * smoothstep(0.32, 0.62, vnoise(q * 7.0 + 4.0)) * reach;
  float cav = 0.0, bub = 0.0;
  for (int i = 0; i < 2; i++) {
    vec2 c = i == 0 ? vec2(-0.27, 0.07) : vec2(0.2, -0.1);
    float len = i == 0 ? 0.21 : 0.14;
    vec2 e = q - c;
    float a = e.x / len;
    // A toothed outline: the width saws up and down along the length.
    float wid = 0.046 * (0.72 + 0.56 * abs(fract(a * 1.6 + 0.3 * float(i)) - 0.5) * 2.0) * sqrt(max(0.0, 1.0 - a * a * 0.6));
    cav = max(cav, smoothstep(1.0, 0.7, length(vec2(a, e.y / wid))));
    bub = max(bub, smoothstep(0.03, 0.018, length(e - vec2(len * 0.5, 0.004))));
  }
  float k = smoothstep(0.0, 0.3, reach);
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
  float hi = (1.8 + 5.0 * uFlash) * smoothstep(0.8, 0.98, k) + 0.5 * side * smoothstep(0.3, 0.9, k);
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
          for (int g = 0; g < ${NP}; g++) { float e = uP[g].w - dot(uP[g].xyz, hp); if (e < e1) { e2 = e1; e1 = e; } else if (e < e2) e2 = e; }
          edge += smoothstep(1.0 / uS, 0.3 / uS, e2);
        }
        // The girdle's edge on the side of the light: a hairline bevel, the thickness of the wall catching light.
        if (uRim > 0.0) {
          float dg = BIG; vec2 ng = vec2(0.0);
          for (int g = 0; g < 8; g++) { float e = uP[g].w - dot(uP[g].xy, hp.xy); if (e < dg) { dg = e; ng = uP[g].xy; } }
          vec2 nw = (uRotT * vec3(ng, 0.0)).xy;
          float face = smoothstep(-0.1, 0.8, dot(normalize(nw), normalize(uL.xy + vec2(1e-4))));
          col += vec3(0.62, 0.72, 0.66) * uRim * face * smoothstep(1.3 / uS, 0.35 / uS, dg);
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

function prog(fs) {
  const p = gl.createProgram();
  for (const [t, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
    gl.attachShader(p, s);
  }
  gl.bindAttribLocation(p, 0, 'aP'); gl.linkProgram(p);
  // A shader this GPU won't build: no stone at all, the arrows stay arrows.
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name.replace('[0]', ''); u[nm] = gl.getUniformLocation(p, nm); }
  return { p, u };
}
const PS = prog(STONE), PX = prog(SPEC);
if (!PS || !PX) { cv.remove(); return; }
gl.useProgram(PS.p); gl.uniform4fv(PS.u.uP, new Float32Array(planes.flat()));
const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
let W = 0, H = 0;
function resize() { W = innerWidth; H = innerHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
resize(); addEventListener('resize', () => { resize(); kick(); });

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
const PAPER = [lin(242), lin(242), lin(240)], DARK = [lin(50), lin(50), lin(50)];
// A spring toward a target: weight comes from omega, overshoot from zeta.
function spring(x, v, to, w, z, dt) { const a = w * w * (to - x) - 2 * z * w * v; v += a * dt; return [x + v * dt, v]; }

// ---------- state ----------
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
// The setting: a closed collet on dark buttons only.
const BZ = 'dark';
// Table turned more to you than in v4, so the window and its steps show; still tilted enough for the crown's side.
const REST = qn(qmul(qax(0, 0, 1, 0.1), qmul(qax(0, 1, 0, 0.24), qax(1, 0, 0, -0.34))));
const ptr = { x: -999, y: -999, t: -1e9, el: null, lastEl: null, leftT: -1e9, enterT: -1e9, dist: 0, real: false };
let pressEl = null, pressT = -1e9, focusEl = null, focusT = -1e9, lastInput = 'pointer';
const stones = [], specs = [];
let cur = null;

const ELS = [...document.querySelectorAll('[data-gem]')];
const isBtn = (el) => el.classList.contains('btn');
// The glyph the stone stands in for: the arrow, or in the footer row the dot after the link.
function glyphOf(el) {
  const n = el.nextElementSibling;
  return el.querySelector('.arw') || (n && n.classList.contains('sep') ? n : null);
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
  const foot = !!el.closest('footer');
  // Large enough for a step to get ~3px at 1x. L is the stone's length; its width is 0.72 L.
  // In the footer the line is too small for that: there the stone rises out of the dot and stands above the line.
  let L = fs * (isBtn(el) ? 1.9 : 1.7);
  if (foot) L = 20;
  let x, y, gx, gy;
  if (arw && arw.classList.contains('sep')) {
    const a = box(arw); x = gx = a.left + a.width / 2;
    gy = r.top + r.height * 0.56; y = r.top - L * 0.16;
  } else if (arw) {
    // Grown from the arrow and pushed away from the words: after a label it starts where the arrow starts,
    // before one it ends where the arrow ends.
    const a = box(arw), first = a.left - r.left < 2;
    gx = a.left + a.width / 2; gy = y = a.top + a.height * 0.54;
    // Before a label it may take the space before the first letter, and hangs into the margin like hanging
    // punctuation, but never closer than 8px to the screen edge (phones: the column starts 24px in).
    x = first ? Math.max(8 + L / 2, Math.min(gx, a.right + 2 - L / 2)) : Math.max(gx, a.left - 5 + L / 2);
  } else if (lbl) { const a = lbl.getBoundingClientRect(); x = gx = a.right + 10 + L / 2; y = gy = a.top + a.height * 0.52; }
  else { x = gx = r.right + 4 + L / 2; gy = r.top + r.height * 0.54; y = foot ? r.top - L * 0.16 : gy; }
  return { x, y, L, back: isBtn(el) ? DARK : PAPER, r, ox: gx - x, oy: gy - y };
}
function newStone(el, a) {
  const s = { el, x: a.x, y: a.y, tx: a.x, ty: a.y, ox: a.ox, oy: a.oy, vx: 0, vy: 0, L: a.L, p: 0, vp: 0, want: 1, q: REST, qt: REST, w: [0, 0, 0],
    flash: 0, glint: 0, back: a.back, arw: glyphOf(el) };
  // It comes out of the arrow edge-on and turns its table to you as it grows.
  if (!RM) s.q = qn(qmul(qax(0, 1, 0, -1.25), REST));
  stones.push(s); return s;
}
function lightFor(s) {
  let lx = (ptr.x - s.x) / 70, ly = -(ptr.y - s.y) / 70;
  if (!(Math.abs(lx) < 50) || lastInput === 'key') { lx = -0.55; ly = 0.75; }
  lx = Math.max(-1.4, Math.min(1.4, lx)); ly = Math.max(-1.4, Math.min(1.4, ly));
  const l = Math.hypot(lx, ly, 1);
  return [lx / l, ly / l, 1 / l];
}
// The split light lands just outside the element, on the line from the light through the stone, a little downhill.
function landing(s) {
  const r = s.el.getBoundingClientRect();
  let lx = s.x - (lastInput === 'key' ? s.x - 40 : ptr.x), ly = s.y - (lastInput === 'key' ? s.y - 30 : ptr.y);
  const l0 = Math.hypot(lx, ly) || 1; lx = lx / l0; ly = ly / l0 + 1.2;
  const l = Math.hypot(lx, ly); lx /= l; ly /= l;
  const tx = lx > 0 ? (r.right - s.x) / lx : lx < 0 ? (r.left - s.x) / lx : 1e9;
  const ty = ly > 0 ? (r.bottom - s.y) / ly : ly < 0 ? (r.top - s.y) / ly : 1e9;
  const inside = s.x > r.left && s.x < r.right && s.y > r.top && s.y < r.bottom;
  const R = (inside ? Math.max(0, Math.min(tx, ty, 300)) : 0) + s.L * 0.4 + 6;
  return { ang: Math.atan2(-ly, lx), R };
}

// ---------- input ----------
function hit(x, y) { const e = document.elementFromPoint(x, y); return e && e.closest('[data-gem]'); }
function setHover(el) {
  if (ptr.el === el) return;
  if (ptr.el) { ptr.el.classList.remove('hov'); ptr.lastEl = ptr.el; ptr.leftT = performance.now(); }
  ptr.el = el; ptr.dist = 0; ptr.enterT = performance.now();
  if (el) el.classList.add('hov');
}
function move(x, y) {
  const now = performance.now();
  const dx = x - ptr.x, dy = y - ptr.y, d = Math.hypot(dx, dy);
  ptr.x = x; ptr.y = y;
  const was = ptr.el;
  setHover(hit(x, y));
  if (d > 0.5 && d < 400) {
    ptr.t = now; ptr.dist += d;
    // A brush of the pointer nudges the stone, as a fingertip would.
    if (cur && cur.el === ptr.el && !RM) { cur.w[1] += dx * 0.03; cur.w[0] += dy * 0.03; }
  }
  // A pointermove that goes nowhere (a still hand, a synthetic event after scroll) doesn't wake the loop.
  if (d > 0.5 || ptr.el !== was) kick();
}
function press(el, x, y) {
  pressEl = el; pressT = performance.now(); ptr.t = pressT;
  kick();
  // The stone exists by the next frame: then it flashes, turns, and the light it splits falls outside.
  requestAnimationFrame(() => {
    if (!cur) return;
    // Pressed with the button: it dips, rocks a little and its facets flash.
    cur.flash = 1;
    if (!RM) { cur.w[0] -= 5; cur.vp -= 2.2; }
    const { ang, R } = landing(cur);
    specs.push({ x: cur.x, y: cur.y, ang, R, t0: performance.now(), amp: 1 });
  });
}
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  ptr.real = true;
  lastInput = 'pointer';
  move(e.clientX, e.clientY);
}, { passive: true });
addEventListener('pointerdown', (e) => {
  lastInput = 'pointer'; ptr.real = true;
  const el = e.target.closest('[data-gem]');
  if (!el) return;
  ptr.x = e.clientX; ptr.y = e.clientY;
  if (e.pointerType === 'touch') setHover(el);
  press(el, e.clientX, e.clientY);
});
addEventListener('pointerup', (e) => { pressEl = null; if (e.pointerType === 'touch') setHover(null); kick(); });
document.addEventListener('pointerleave', () => setHover(null));
addEventListener('keydown', (e) => {
  lastInput = 'key';
  if ((e.key === 'Enter' || e.key === ' ') && document.activeElement && document.activeElement.matches('[data-gem]')) press(document.activeElement);
});
document.addEventListener('focusin', (e) => {
  const el = e.target.closest && e.target.closest('[data-gem]');
  if (el && lastInput === 'key') { focusEl = el; focusT = performance.now(); kick(); }
});

// ---------- the loop: it runs only while a stone is out or something moves ----------
let running = false, last = 0, dead = false;
function kick() { if (!running && !dead) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
// The GPU dropped the context (a driver reset, too many tabs): the stones go, every arrow comes back, nothing draws again.
cv.addEventListener('webglcontextlost', () => {
  dead = true;
  for (const el of ELS) { const g = glyphOf(el); if (g) g.style.cssText = ''; }
  stones.length = 0; specs.length = 0; cur = null;
  cv.remove();
});
// HOLD: how long it stays after the pointer stops. DWELL: a pointer only passing over doesn't bring one out.
const HOLD = 380, GRACE = 140, FAR = 140, FAR_KEY = 320, DWELL = 70;
function frame(now) {
  if (dead) { running = false; return; }
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  {
    // Who gets the stone: a press, then a keyboard focus, then a moving pointer.
    let el = null, travel = false;
    const hovEl = ptr.el || (now - ptr.leftT < GRACE ? ptr.lastEl : null);
    if (pressEl || now - pressT < 650) el = pressEl || (cur && cur.el) || hovEl;
    else if (focusEl && now - focusT < 1100 && lastInput === 'key') { el = focusEl; travel = true; }
    else if (hovEl && now - ptr.t < HOLD && ptr.dist > 3 && ((cur && cur.want === 1) || (ptr.el && now - ptr.enterT > DWELL))) el = hovEl;
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
          if (!RM && !el.closest('footer') &&Math.abs(a.y - cur.y) < 6 && Math.abs(a.x - cur.x) > 4) cur.hop = { x0: cur.x, dx: a.x - cur.x, D: a.r.bottom - a.y + a.L * 0.5 + 1 };
        }
      }
      if (cur.want === 0 && !RM) cur.w[1] -= 3;
      Object.assign(cur, { tx: a.x, ty: a.y, ox: a.ox, oy: a.oy, L: a.L, back: a.back, want: 1 });
      // It leans with the pointer's place on the element.
      cur.qt = REST;
      if (ptr.el === el && lastInput !== 'key') {
        const nx = Math.max(-1, Math.min(1, (ptr.x - (a.r.left + a.r.width / 2)) / (a.r.width / 2)));
        const ny = Math.max(-1, Math.min(1, (ptr.y - (a.r.top + a.r.height / 2)) / (a.r.height / 2)));
        cur.qt = qn(qmul(qmul(qax(0, 1, 0, 0.45 * nx), qax(1, 0, 0, 0.3 * ny)), REST));
      }
    } else if (cur && cur.want === 1) { cur.want = 0; if (!RM) cur.w[1] += 5; }

    const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
    for (const s of stones) {
      for (let k = 0; k < n; k++) {
        [s.p, s.vp] = spring(s.p, s.vp, s.want, RM ? (s.quick ? 45 : 12) : s.want ? 22 : 18, RM ? 1 : s.want ? 0.55 : 1, h);
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
  const busy = stones.length || specs.length || (ptr.el && now - ptr.t < HOLD + 50) || now - pressT < 700 || (focusEl && now - focusT < 1200);
  if (busy) requestAnimationFrame(frame);
  else { running = false; gl.clear(gl.COLOR_BUFFER_BIT); }
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
  gl.uniform1i(PS.u.uSS, dpr >= 2 ? 3 : 4);
  for (const s of stones) {
    // On the way between neighbours it tucks in a little, so it slides past the next label instead of over it.
    // Raised above the footer row it clears the words, so there it keeps its size along the way.
    const tuck = RM || s.el.closest("footer") ? 0 : Math.min(1, Math.hypot(s.vx, s.vy) / 500);
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
    if (s.back === DARK) {
      const r = s.el.getBoundingClientRect();
      gl.uniform4f(PS.u.uBox, (r.left + r.width / 2) * dpr, (H - r.top - r.height / 2) * dpr, r.width / 2 * dpr, r.height / 2 * dpr);
      gl.uniform1f(PS.u.uBoxR, Math.min(r.width, r.height) / 2 * dpr);
    } else { gl.uniform4f(PS.u.uBox, -1e4, -1e4, 0, 0); gl.uniform1f(PS.u.uBoxR, 0); }
    gl.uniform1f(PS.u.uJar, 1);
    gl.uniform1f(PS.u.uEdge, 1);
    gl.uniform1f(PS.u.uFlash, s.flash);
    // On a dark button: how much the stone's own green lights the button under it (seen through the window).
    gl.uniform1f(PS.u.uGlow, s.back === DARK ? 3 : 0);
    // On a dark button the window shows the dark behind it: the lit girdle edge gives the stone its outline there.
    // The collet: ~0.65px of metal plus its lip, ~1px in all; it grows with the stone. Under it the lit edge is quieter.
    const bz = BZ === 'off' ? 0 : s.back === DARK ? 0.65 : BZ === 'all' ? 0.45 : 0;
    gl.uniform1f(PS.u.uBz, bz / (s.L / 2));
    gl.uniform1f(PS.u.uCup, bz > 0 && s.back === DARK ? 0.45 : 0);
    gl.uniform1f(PS.u.uRim, s.back === DARK ? (bz > 0 ? 0.3 : 0.7) : 0);
    gl.uniform1f(PS.u.uA, RM ? Math.min(1, Math.max(0, s.p)) : Math.min(1, Math.max(0, s.p) / 0.3));
    gl.uniform1f(PS.u.uShadow, s.back === DARK ? 0.3 : 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

}
