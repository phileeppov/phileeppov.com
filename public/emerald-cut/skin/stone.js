// The stone. One WebGL2 pass draws the page around the picture and, under it, the player's stones: a small emerald
// cut that is the play key, the timeline (a long baguette of the same cut) and a small baguette for the volume. What has been watched is cut: step facets and a flat table that catch the light and carry the picture's
// colour. What hasn't is still raw: a frosted, rounded crystal a little fuller than the cut stone, lit softly by
// the picture above it. The cutter works at the current time while the reel plays over raw stone. The picture itself
// stays a plain <video> above the canvas, so nothing here can stop playback.

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;      // canvas, device px
uniform float uDpr;
uniform vec2 uC;        // centre of the picture, css px
uniform vec2 uH;        // half size of the picture
uniform vec4 uBar;      // the stone: centre x, y, half length, half height (css px)
uniform float uK;       // corner cut of the stone
uniform float uS;       // width of the crown steps, from the girdle in to the table
uniform vec4 uWheel;    // the play stone: centre x, y, radius (css px), how far it has turned (rad)
uniform float uSmear;   // how far it turns while the eye takes one look (rad): its facets smear that much
uniform vec4 uVol;      // the volume stone: centre x, y, half length, half height (css px); z = 0 when there is none
uniform float uVolLevel; // how far it is cut: the volume (0..1)
uniform vec4 uSpan;     // time runs from x = uSpan.x to uSpan.y; uSpan.z = now (0..1); uSpan.w = aim (0..1, < 0 none)
uniform vec3 uLight;    // pointer x, y (css px) and how present it is
uniform float uTime;
uniform vec2 uPress;     // the play key: pressed (0..1), the hand over it (0..1)
uniform float uIdle;     // over the picture, the controls stepping aside (0..1)
uniform vec2 uOverlay;   // over the picture (1/0), and where the dark band at its foot begins (css px)
uniform float uGemMode;  // the play key: 0 a square step cut, 1 an emerald cabochon, 2 a seal in the setting's metal
uniform float uRawMode;  // what the unwatched stone is: 0 natural beryl, 1 crystal still in its rock
uniform float uCalm;    // reduced motion: nothing flies, nothing twinkles
uniform float uHas;     // the video texture holds a frame
uniform float uCut;     // the cutter is at work: the reel plays over stone not cut yet (0..1)
uniform vec3 uFlash;    // a stretch just cut whole (from, to; 0..1) and how far its flash has run (0..1); z < 0 none
uniform float uCh[8];   // chapter starts (0..1)
uniform int uChN;
uniform sampler2D uVid;
uniform sampler2D uSeen; // what has been watched, along the time span: 1 where the stone is cut
uniform sampler2D uAtlas; // what was seen: a small frame per stretch of the reel, transparent where none was kept
uniform vec4 uAtlasInfo;  // its grid: columns, rows, stretches, the frames' aspect
uniform float uAtlasOn;
out vec4 o;

const float R2 = 0.70710678;
// Emerald absorbs red hard, blue some, green least (Beer-Lambert, per unit of path through the stone).
const vec3 EMERALD = vec3(3.6, 0.7, 1.9);

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
// The picture at a point given relative to its centre (css px), linear light. Blurred by lod.
vec3 pic(vec2 p, float lod) {
  vec2 uv = clamp((p + uH) / (2.0 * uH), vec2(0.002), vec2(0.998));
  return lin(mix(vec3(0.22, 0.23, 0.24), textureLod(uVid, uv, lod).rgb, uHas));
}
// The room the facets reflect: a large softbox above left, a narrow strip low on the right, the dark studio
// around them, and the hand (or the light circling the stone) as a small bright lamp.
float box(vec2 q, vec2 c, vec2 h, float soft) {
  vec2 d = abs(q - c) - h;
  return 1.0 - smoothstep(-soft, soft, max(d.x, d.y));
}
vec3 room(vec3 r) {
  vec2 q = r.xy / max(r.z, 0.06);
  float key = box(q, vec2(-0.75, -1.2), vec2(0.5, 0.42), 0.02) * (0.7 + 0.3 * smoothstep(-1.6, -0.8, q.y));
  float strip = box(q, vec2(1.15, 1.1), vec2(0.55, 0.16), 0.03);
  vec3 toHand = normalize(vec3((uLight.xy - uC) / max(uH.x, uH.y) * 1.25, 0.75));
  float hand = pow(max(dot(r, toHand), 0.0), 70.0) * uLight.z;
  return vec3(0.01) + vec3(1.0, 0.98, 0.95) * key * 11.0 + vec3(0.85, 0.92, 1.0) * strip * 3.0 + vec3(1.0) * hand * 1.6;
}
// The same room off a frosted surface: no edges, only where the light is.
vec3 roomSoft(vec3 r) {
  vec2 q = r.xy / max(r.z, 0.06);
  float key = box(q, vec2(-0.75, -1.2), vec2(0.7, 0.6), 0.7);
  float strip = box(q, vec2(1.15, 1.1), vec2(0.7, 0.3), 0.6);
  vec3 toHand = normalize(vec3((uLight.xy - uC) / max(uH.x, uH.y) * 1.25, 0.75));
  float hand = pow(max(dot(r, toHand), 0.0), 6.0) * uLight.z;
  return vec3(0.008) + vec3(1.0, 0.98, 0.95) * key * 0.9 + vec3(0.85, 0.92, 1.0) * strip * 0.3 + vec3(0.9, 1.0, 0.95) * hand * 0.35;
}
vec3 mirror(vec3 N) { return vec3(2.0 * N.z * N.x, 2.0 * N.z * N.y, 2.0 * N.z * N.z - 1.0); }
// A point of light on a corner, as a good lens sees a gem: a sharp core in a soft halo, no painted rays.
float glint(vec2 r) {
  float d2 = dot(r, r);
  return exp(-d2 / 1.1) + 0.16 * exp(-d2 / 16.0);
}
// A kept frame: the cell of one stretch in the atlas, at a point inside it (0..1); alpha 0 where none was kept.
vec4 keptAt(float slot, vec2 luv) {
  vec2 cell = vec2(mod(slot, max(uAtlasInfo.x, 1.0)), floor(slot / max(uAtlasInfo.x, 1.0)));
  return texture(uAtlas, (cell + clamp(luv, vec2(0.03), vec2(0.97))) / max(uAtlasInfo.xy, vec2(1.0)));
}
float seenAt(float x) { return texture(uSeen, vec2(clamp((x - uSpan.x) / max(uSpan.y - uSpan.x, 1.0), 0.0, 1.0), 0.5)).r; }
// The raw stone. Natural beryl (uRawMode 0): a six-sided prism, milky and frosted, lighter and darker in zones along
// its length, chipped along its edges, fine striations, a few inclusions. Or the crystal still in its rock (1): grey
// schist with mica glinting, the green showing through where the rock has cracked. Next to what is cut it is chipped
// down by the cutter: small fresh facets that catch the light (chisel, 1 at the break).
vec3 rawBar(vec2 px, vec2 p, float rawF, float hh, float span, float la, float facing, float chisel) {
  float v = p.y / hh;
  float face = v < -0.4 ? 0.0 : (v > 0.4 ? 2.0 : 1.0);
  float wav = noise(vec2(px.x * 0.022, face * 7.0 + 1.0)) - 0.5;
  vec3 N = face == 0.0 ? vec3(0.0, -0.8, 0.6) : (face == 2.0 ? vec3(0.0, 0.8, 0.6) : vec3(0.0, 0.0, 1.0));
  N = normalize(N + vec3(wav * 0.25, wav * 0.08, 0.0));
  vec2 e = vec2(px.x - uC.x, uH.y - 6.0);
  vec3 Lin = pic(e, 5.5);
  float lum = dot(pic(e, 4.0), vec3(0.2126, 0.7152, 0.0722));
  float cloud = 0.8 * noise(vec2(px.x * 0.02, p.y * 0.07) + 5.0) + 0.2 * noise(px * 0.05 + 2.0);
  float zone = noise(vec2(px.x * 0.011, 1.3));                      // colour zoning along the crystal
  vec3 deep = vec3(0.006, 0.045, 0.03), milk = vec3(0.045, 0.14, 0.1);
  vec3 body = mix(deep, milk, smoothstep(0.25, 0.85, cloud)) * (0.62 + 0.5 * lum) * (0.75 + 0.55 * zone);
  body *= face == 0.0 ? 1.4 : (face == 2.0 ? 0.6 : 1.0);
  body += Lin * vec3(0.1, 0.42, 0.3) * 0.12 * (face == 0.0 ? 1.0 : 0.25);
  float stri = noise(vec2(px.x * 0.005, p.y * 0.8 + face * 3.0));
  body *= 0.94 + 0.12 * smoothstep(0.4, 0.6, stri);
  if (uRawMode > 0.5) {                                              // still in its rock
    float band = noise(vec2(px.x * 0.009, p.y * 0.22) + 9.0) * 0.7 + noise(vec2(px.x * 0.04, p.y * 0.6)) * 0.3;
    vec3 rock = mix(vec3(0.022, 0.021, 0.02), vec3(0.075, 0.07, 0.064), band);
    float crack = smoothstep(0.62, 0.72, noise(px * vec2(0.025, 0.06) + 4.0));
    body = mix(rock * (face == 0.0 ? 1.3 : (face == 2.0 ? 0.7 : 1.0)), body * 1.2, crack);
    float mica = step(0.985, hash(floor(px * 0.7) + 1.0)) * pow(max(0.0, cos(la * 3.0 + hash(floor(px * 0.7)) * 40.0)), 8.0);
    body += vec3(0.6, 0.6, 0.55) * mica * 0.5 * (1.0 - crack);
  }
  for (int k = 0; k < 8; k++) {
    if (k >= uChN) break;
    float dx = abs(px.x - (uSpan.x + uCh[k] * span));
    body *= 1.0 - 0.45 * (1.0 - smoothstep(0.4, 1.4, dx));
  }
  // The cutter's chips: small fresh facets, each its own plane, lighter where the crystal has just broken.
  if (chisel > 0.01) {
    vec2 cid = vec2(floor((px.x + p.y * 0.7) / 5.5), sign(p.y));
    vec3 Nc = normalize(vec3((hash(cid) - 0.5) * 1.2, (hash(cid + 3.1) - 0.5) * 0.6, 0.8));
    float fl = pow(0.5 + 0.5 * cos(la - hash(cid + 7.7) * 6.2832), 10.0);
    vec3 chip = vec3(0.03, 0.17, 0.12) * (0.7 + 0.6 * hash(cid + 5.0)) + vec3(0.3, 0.9, 0.7) * fl * 0.5;
    N = normalize(mix(N, Nc, chisel));
    body = mix(body, chip, chisel * 0.85);
  }
  float F = 0.04 + 0.5 * pow(1.0 - N.z, 2.0);
  vec3 R = roomSoft(mirror(N)) * 0.8 + room(mirror(N)) * mix(0.015, 0.06, chisel);
  vec3 l = normalize(vec3(uLight.xy - px, 380.0));
  float sheen = pow(max(dot(N, normalize(l + vec3(0, 0, 1))), 0.0), 14.0) * uLight.z;
  vec3 col = body * (1.0 - F) + R * F + vec3(0.45, 0.9, 0.7) * sheen * 0.05;
  float edge = 1.0 - smoothstep(0.0, 1.1, abs(abs(p.y) - 0.4 * hh));
  col += vec3(0.05, 0.13, 0.1) * edge * (0.45 + facing) * (1.0 - chisel) * (uRawMode > 0.5 ? 0.3 : 1.0);
  col += vec3(0.04, 0.1, 0.075) * (1.0 - smoothstep(0.0, 1.4, -rawF)) * (0.4 + facing);
  return col;
}

// The play key, three ways. uGemMode 0: a small square step cut, quiet: three narrow steps, a dark table with one
// mirrored ring. 1: an emerald cabochon, a smooth dome; while the reel plays a band of light turns across it, as on a
// cat's-eye stone. 2: a seal in the setting's metal, polished, its rim bevelled; the glyph is engraved in it (the
// page draws it) and lights up while the reel plays. In every case the glyph is the key's own, in the page.
vec3 gem(vec2 px, vec3 col) {
  vec2 d = px - uWheel.xy;
  float R = uWheel.z * (1.0 - 0.045 * uPress.x);
  if (R < 1.0) return col;
  float laR = atan(uLight.y - uWheel.y, uLight.x - uWheel.x);
  vec2 e = vec2(px.x - uC.x, uH.y - 6.0);
  float lum = dot(pic(e, 3.5), vec3(0.2126, 0.7152, 0.0722));
  vec3 deepG = vec3(0.004, 0.05, 0.026) * (0.6 + 0.9 * lum) * (1.0 + 0.35 * uPress.y + 1.2 * uPress.x);
  // the outline: an octagon for the step cut and the seal, a circle for the cabochon
  float h = R * 0.9, k = h * 0.34;
  vec2 q = abs(d);
  float c = 2.0 * h - k;
  float fx = q.x - h, fy = q.y - h, fc = (q.x + q.y - c) * R2;
  float fo = max(fx, max(fy, fc));
  float fr = length(d) - R * 0.88;
  float f = uGemMode > 0.5 && uGemMode < 1.5 ? fr : fo;
  vec2 n; float second;
  if (fx >= fy && fx >= fc) { n = vec2(sign(d.x), 0.0); second = max(fy, fc); }
  else if (fy >= fc) { n = vec2(0.0, sign(d.y)); second = max(fx, fc); }
  else { n = vec2(sign(d.x), sign(d.y)) * R2; second = max(fx, fy); }
  vec2 ds = d - vec2(R * 0.03, R * 0.16);
  float fs = uGemMode > 0.5 && uGemMode < 1.5 ? length(ds) - R * 0.88
           : max(max(abs(ds.x) - h, abs(ds.y) - h), (abs(ds.x) + abs(ds.y) - c) * R2);
  float shadow = 1.0 - 0.7 * exp(-max(fs, 0.0) / (R * 0.14));
  vec3 spill = uGemMode > 1.5 ? vec3(0.0) : vec3(0.01, 0.14, 0.06) * exp(-max(f, 0.0) / (R * 0.3)) * 0.25 * step(0.0, f);
  if (f > 1.0) return col * shadow + spill;
  float depth = -f;
  vec3 cc;
  if (uGemMode > 1.5) {
    // The seal: polished white metal, turned rings, the lamp's streak through it, a bevelled rim catching the room.
    float r = length(d) / R;
    float th = atan(d.y, d.x);
    float bev = 1.0 - smoothstep(0.0, R * 0.16, depth);              // 1 at the rim, fading inward
    vec3 N = normalize(vec3(n * bev * 0.7, 1.0));
    float ring = 0.6 * noise(vec2(length(d) * 1.2, 0.5)) + 0.4 * noise(vec2(length(d) * 3.4, 7.0));
    float streak = pow(abs(cos(th - laR)), 10.0);
    vec3 metal = vec3(0.16, 0.165, 0.172) * (0.8 + 0.35 * ring) + vec3(0.36, 0.37, 0.38) * streak * (0.4 + 0.6 * uLight.z);
    float F = 0.08 + 0.5 * pow(1.0 - N.z, 1.5);
    cc = metal * (1.0 - F) + room(mirror(N)) * F * 0.5;
    cc *= 0.82 + 0.25 * max(dot(n, normalize(vec2(-0.6, -0.8))), -0.4) * bev;
    float inner = 1.0 - smoothstep(0.0, 1.0, abs(depth - R * 0.16));  // the line where the bevel meets the face
    cc += vec3(0.1) * inner * (0.4 + 0.6 * (0.5 + 0.5 * cos(laR - atan(n.y, n.x))));
    cc *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 1.4, depth));           // a dark line at the very edge
  } else if (uGemMode > 0.5) {
    // The cabochon: a dome of emerald. The room in its skin, the stone's depth below, light gathered at its foot, and
    // while it plays a cat's-eye band that turns.
    vec2 u = d / (R * 0.88);
    float r2 = dot(u, u);
    vec3 N = normalize(vec3(u * 0.85, sqrt(max(0.0, 1.0 - r2 * 0.72))));
    float foot = smoothstep(0.1, 0.9, dot(u, vec2(0.25, 0.97))) * (1.0 - smoothstep(0.75, 1.0, r2));
    vec3 T = deepG * (1.0 + 0.9 * (1.0 - r2)) + vec3(0.04, 0.42, 0.22) * foot * (0.5 + 0.8 * lum);
    float a = uWheel.w * 0.5 + 0.6;
    vec2 ax = vec2(cos(a), sin(a));
    float eq = dot(u, ax) / 0.12;
    float eye = exp(-eq * eq) * (1.0 - r2 * 0.6);
    T += vec3(0.25, 0.9, 0.6) * eye * 0.28;
    T = 1.0 - exp(-T * 1.6);
    float F = 0.04 + 0.6 * pow(1.0 - N.z, 2.0);
    cc = T * (1.0 - F) + room(mirror(N)) * F;
    cc *= 1.0 - 0.45 * smoothstep(0.82, 1.0, r2);                     // the rim goes dark
  } else {
    // The square step cut, quiet: three narrow steps, then a dark table with one mirrored ring.
    float S = h * 0.3;
    float sideA = atan(n.y, n.x);
    float side = floor(sideA / 0.7854 + 8.5);
    float la = laR + uWheel.w;
    float facing = 0.5 + 0.5 * cos(laR - sideA);
    float lines = 0.0;
    if (depth < S) {
      float t = (S - depth) / S;
      int i = t < 0.34 ? 0 : (t < 0.68 ? 1 : 2);
      float th = i == 0 ? 0.32 : (i == 1 ? 0.55 : 0.8);
      float fid = 400.0 + side * 3.0 + float(i);
      vec3 N = normalize(vec3(n * sin(th), cos(th)));
      float phi = sideA + (i == 1 ? 3.14159 : 0.0) + (hash(vec2(fid, 2.7)) - 0.5) * 1.2;
      float flash = pow(0.5 + 0.5 * cos(la - phi), 30.0);
      vec3 T = deepG * mix(0.6, 1.05, hash(vec2(fid, 5.3))) * 1.6 + vec3(0.25, 1.0, 0.62) * flash * (0.8 + 0.5 * lum);
      T = 1.0 - exp(-T * 1.5);
      T *= 0.75 + 0.35 * max(dot(n, normalize(vec2(-0.6, -0.8))), -0.5);
      float F = 0.04 + 0.6 * pow(1.0 - N.z, 2.0);
      cc = T * (1.0 - F) + room(mirror(N)) * F;
      float stepE = min(min(abs(depth - 0.33 * S), abs(depth - 0.66 * S)), abs(depth - S));
      lines = max(1.0 - smoothstep(0.0, 0.9, stepE), 1.0 - smoothstep(0.0, 0.9, abs(fo - second) / 0.765));
    } else {
      float r = clamp((depth - S) / (h - S), 0.0, 1.0);
      float heart = 1.0 - smoothstep(0.35, 0.9, r);
      float flash = pow(0.5 + 0.5 * cos(la - atan(n.y, n.x) - 1.3), 16.0) * (1.0 - smoothstep(0.3, 0.5, abs(r - 0.4)));
      vec3 T = deepG * (0.4 + 0.7 * heart) + vec3(0.2, 0.95, 0.6) * flash * 0.18;
      cc = 1.0 - exp(-T * 1.5);
      lines = (1.0 - smoothstep(0.0, 0.9, abs(r - 0.4) * (h - S))) * 0.5;
    }
    float edgeLight = 0.04 + 0.13 * pow(facing, 3.0);
    cc += vec3(edgeLight) * lines;
    cc += vec3(0.14 + edgeLight) * (1.0 - smoothstep(0.0, 1.2, depth));
  }
  return mix(col * shadow + spill, cc, smoothstep(0.6, -0.6, f));
}

// The volume: a small baguette of the same stone, cut as far as the sound goes and raw beyond it.
vec3 volBar(vec2 px, vec3 col) {
  vec4 b = uVol;
  if (b.z < 1.0) return col;
  vec2 p = px - b.xy;
  vec2 q = abs(p);
  float k = b.w * 0.7;
  float fx = q.x - b.z, fy = q.y - b.w, fc = (q.x + q.y - (b.z + b.w - k)) * R2;
  float f = max(fx, max(fy, fc));
  vec2 n;
  if (fx >= fy && fx >= fc) n = vec2(sign(p.x), 0.0);
  else if (fy >= fc) n = vec2(0.0, sign(p.y));
  else n = vec2(sign(p.x), sign(p.y)) * R2;
  float shadow = 1.0 - 0.55 * exp(-max(f - 1.5, 0.0) / 3.0) * step(0.0, f);
  if (f > 0.6) return col * shadow;
  float u = (px.x - (b.x - b.z)) / (2.0 * b.z);
  float lit = 1.0 - smoothstep(uVolLevel - 0.004, uVolLevel + 0.004, u);
  float la = atan(uLight.y - b.y, uLight.x - b.x);
  float depth = -f, st = b.w * 0.5;
  float sideA = atan(n.y, n.x);
  float fid = depth < st ? floor(sideA / 0.7854 + 8.5) : 9.0;
  float th = depth < st ? 0.55 : 0.0;
  vec3 N = normalize(vec3(n * sin(th), cos(th)));
  float phi = depth < st ? sideA + (hash(vec2(fid, 2.7)) - 0.5) * 3.0 : hash(vec2(fid, 2.7)) * 6.2832;
  float flash = pow(0.5 + 0.5 * cos(la - phi), 22.0);
  vec3 cut = vec3(0.008, 0.2, 0.09) * (0.6 + 0.6 * hash(vec2(fid, 5.3))) + vec3(0.12, 1.0, 0.5) * flash * 0.8;
  cut = 1.0 - exp(-cut * 1.6);
  cut = cut * (1.0 - 0.04) + room(mirror(N)) * (0.04 + 0.3 * (1.0 - N.z));
  cut += vec3(0.1) * (1.0 - smoothstep(0.0, 0.9, abs(depth - st)));
  vec3 raw = vec3(0.03, 0.1, 0.075) * (0.8 + 0.3 * noise(px * 0.5)) + roomSoft(N) * 0.05;
  vec3 c = mix(raw, cut, lit);
  c = mix(c, vec3(0.86, 1.0, 0.93), (1.0 - smoothstep(0.3, 1.0, abs(u - uVolLevel) * 2.0 * b.z)) * 0.8);
  c += vec3(0.12) * (1.0 - smoothstep(0.0, 1.0, depth));
  return mix(col * shadow, c, smoothstep(0.6, -0.6, f));
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 bc = uBar.xy, bh = uBar.zw;
  vec2 p = px - bc;
  vec2 q = abs(p);
  float c = bh.x + bh.y - uK;
  float fx = q.x - bh.x, fy = q.y - bh.y, fc = (q.x + q.y - c) * R2;
  float f = max(fx, max(fy, fc));                                  // to the cut outline; < 0 inside the stone
  vec2 n; float second;
  if (fx >= fy && fx >= fc) { n = vec2(sign(p.x), 0.0); second = max(fy, fc); }
  else if (fy >= fc) { n = vec2(0.0, sign(p.y)); second = max(fx, fc); }
  else { n = vec2(sign(p.x), sign(p.y)) * R2; second = max(fx, fy); }

  float span = max(uSpan.y - uSpan.x, 1.0);
  float nowX = uSpan.x + uSpan.z * span;
  float aimX = uSpan.x + uSpan.w * span;
  float u = (px.x - uSpan.x) / span;
  float sideA = atan(n.y, n.x);
  float side = floor(sideA / 0.7854 + 8.5);
  float la = atan(uLight.y - bc.y, uLight.x - bc.x);
  float facing = 0.5 + 0.5 * cos(la - sideA);
  // Watched here? Cut where the reel has been seen, raw where it hasn't been yet.
  float cutv = smoothstep(0.2, 0.8, seenAt(px.x));
  float behind = max(nowX - px.x, 0.0);
  float fresh = cutv * exp(-behind / (0.03 * span)) * uCut;       // just off the wheel, still bright
  float gx = px.x - uSpan.x;                                       // the raw crystal grew in steps along its length
  float grow = (hash(vec2(floor(gx / 92.0), 3.7)) - 0.5) * 0.06 + (hash(vec2(floor(gx / 31.0), 8.1)) - 0.5) * 0.02;
  float hh = bh.y * (1.04 + grow) + (noise(vec2(px.x * 0.07, sign(p.y) * 2.0)) - 0.5) * bh.y * (uRawMode > 0.5 ? 0.16 : 0.06);
  // Next to what is cut, the crystal has been knocked down toward the cut stone's line: chipped, not grown.
  float dz = 99.0;
  if (cutv < 0.5 && abs(p.y) < bh.y * 2.0) {
    for (int k = 1; k <= 9; k++) {
      float o = float(k) * 3.0;
      if (seenAt(px.x - o) > 0.5 || seenAt(px.x + o) > 0.5) { dz = o; break; }
    }
  }
  float chisel = (1.0 - smoothstep(2.0, 18.0, dz)) * 0.8;
  float jag = (noise(vec2(px.x * 0.22, sign(p.y) * 4.0)) - 0.5) * bh.y * 0.12;
  hh = mix(hh, bh.y * 1.02 + jag, chisel);
  float rawF = max(max(q.x - bh.x, q.y - hh), (q.x - bh.x + q.y - hh + bh.y * 0.5) * R2);
  float wave = 0.0;                                                // a stretch just cut whole: light runs through it once
  if (uFlash.z >= 0.0) {
    float head = mix(uFlash.x - 0.04, uFlash.y + 0.04, uFlash.z);
    float inside = smoothstep(uFlash.x - 0.004, uFlash.x + 0.004, u) * (1.0 - smoothstep(uFlash.y - 0.004, uFlash.y + 0.004, u));
    float wq = (u - head) / (0.02 + 0.08 * (uFlash.y - uFlash.x));
    wave = inside * exp(-wq * wq) * (1.0 - 0.4 * uFlash.z);
  }

  // The page: dark metal; the picture's glow around its edge; under the stone its shadow and the light that came
  // through it, green where it is cut, little and milky through raw crystal.
  vec2 v = px / (uRes / uDpr) - 0.5;
  vec2 lampP = (px - vec2(uC.x, uC.y - uH.y * 0.55)) / max(uH.x, 1.0);   // a display lamp over the picture
  float lamp = exp(-dot(lampP * vec2(1.0, 1.6), lampP * vec2(1.0, 1.6)) * 0.6);
  float vig = 1.0 - 0.6 * smoothstep(0.32, 0.9, length(v * vec2(1.0, 1.3)));
  vec3 col = vec3(0.0058, 0.0072, 0.0068) * (0.7 + 1.25 * lamp) * vig * (0.93 + 0.14 * hash(floor(px * uDpr)));
  vec2 pv = px - uC;
  vec2 qv = abs(pv) - uH;
  float dv = length(max(qv, 0.0)) + min(max(qv.x, qv.y), 0.0);
  if (uOverlay.x < 0.5 && dv < -14.0) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }   // the <video> covers this; only its cut corners show
  col += pic(clamp(pv, -uH, uH), 6.5) * exp(-max(dv, 0.0) / (0.1 * uH.y)) * 0.042 * step(0.0, dv) * (1.0 - uOverlay.x);
  col += vec3(0.5, 0.55, 0.53) * (1.0 - smoothstep(0.0, 1.3, abs(dv - 0.6))) * smoothstep(0.2, -0.6, pv.y / uH.y) * 0.05;
  float fo = mix(rawF, f, cutv);
  if (fo > 0.0) {
    float below = step(0.0, p.y);
    float green = 0.0;
    for (int k = -2; k <= 2; k++) green += seenAt(px.x + float(k) * (6.0 + fo * 0.6));
    green = smoothstep(0.1, 0.9, green / 5.0);
    col += vec3(0.01, 0.16, 0.07) * (0.2 + 0.8 * green) * exp(-fo / (0.4 * bh.y + 6.0)) * (0.35 + 0.65 * below) * 0.5;
    if (below > 0.5 && green > 0.01) {                              // the film's light, gathered by the cut stone
      vec2 cq = vec2(px.x * 0.026, fo * 0.05 - uWheel.w * 0.05);
      float r1 = 1.0 - abs(2.0 * noise(cq) - 1.0);
      float r2 = 1.0 - abs(2.0 * noise(cq * vec2(1.7, 2.3) + 7.0) - 1.0);
      float caus = pow(r1 * r2, 9.0) * 1.7;
      float above = dot(pic(vec2(px.x - uC.x, uH.y - 6.0), 4.0), vec3(0.2126, 0.7152, 0.0722));
      col += vec3(0.06, 0.62, 0.36) * caus * green * exp(-fo / (bh.y * 1.4)) * smoothstep(0.0, 6.0, fo) * (1.0 - smoothstep(bh.y * 1.6, bh.y * 2.6, fo)) * (0.3 + 1.1 * above);
    }
    col *= 1.0 - (0.5 + 0.3 * below) * exp(-fo / (3.0 + 5.0 * below));
  }
  if (dv < 0.0) col = pic(pv, 0.0);                                // under the <video>; covers any seam
  vec3 bare = col;
  if (uOverlay.x > 0.5) {                                          // over the picture: black round it, a dark band at its foot
    if (dv >= 0.0) col = vec3(0.0015);
    bare = col;
    float band = smoothstep(uOverlay.y - 40.0, uOverlay.y + 36.0, px.y);
    col *= 1.0 - 0.84 * band;
  }

  if (f < 0.0) {
    // The cut stone: three steps of the crown from the girdle in, then the table, one flat facet per chapter. Each
    // facet is one plane: it flashes when the lamp stands where the pavilion behind it points, and neighbours rarely
    // agree. That blocky play of light, not a smooth bevel, reads as a step cut.
    float depth = -f;
    float chap = 0.0;
    for (int k = 0; k < 8; k++) { if (k >= uChN) break; chap += step(uCh[k], u); }
    int i = 3;
    float s = 0.5, sw = 1.0, split = 2.0, L = 1.3, th = 0.0, fid;
    vec3 N;
    if (depth < uS) {
      float d = uS - depth;                                        // 0 at the table's edge, uS at the girdle
      float t = d / uS;
      i = t < 0.5 ? 0 : 1;
      float fi = float(i);
      float s0 = i == 0 ? 0.0 : 0.5;
      float s1 = i == 0 ? 0.5 : 1.0;
      sw = (s1 - s0) * uS;
      s = (d - s0 * uS) / sw;
      th = i == 0 ? 0.36 : 0.72;
      L = i == 0 ? 0.7 : 1.05;
      fid = side * 3.0 + fi + (abs(n.y) > 0.9 ? chap * 31.0 : 0.0);
      split = 0.3 + 0.4 * hash(vec2(fid, 7.7));
      vec2 jit = (vec2(hash(vec2(fid, 1.3)), hash(vec2(fid, 6.1))) - 0.5) * 0.3;
      N = normalize(vec3(n * sin(th) + jit, cos(th)));
    } else {
      fid = 90.0 + chap * 7.0;
      vec2 jit = (vec2(hash(vec2(fid, 1.3)), hash(vec2(fid, 6.1))) - 0.5) * 0.18;
      N = normalize(vec3(jit, 1.0));
    }
    float phi = i == 3 ? hash(vec2(fid, 2.7)) * 6.2832 : sideA + (i == 1 ? 3.14159 : 0.0) + (hash(vec2(fid, 2.7)) - 0.5) * 3.0;
    float flash = pow(0.5 + 0.5 * cos(la - phi), 40.0);
    float body = i == 3 ? 0.88 + 0.2 * hash(vec2(fid, 5.3)) : mix(0.55, 1.05, hash(vec2(fid, 5.3)));
    float tilt = 1.0 + 0.2 * (s - 0.5) * (2.0 * facing - 1.0);
    // What you saw, kept in the stone: the frame taken when the cutter passed this stretch, seen through the table as
    // a strip of film and, in the steps, mirrored, as a step cut mirrors its table. Where no frame was kept (an earlier
    // visit, a picture the page may not read), the stone holds the picture above, softly.
    float tH = max(bh.y - uS, 1.0);                                  // half height of the table
    float tw = 2.0 * tH * max(uAtlasInfo.w, 0.5);                    // one frame along the stone, at its own aspect
    float tk = floor((px.x - uSpan.x) / tw);
    float tc = uSpan.x + (tk + 0.5) * tw;                            // this frame's middle, and so its time
    float slot = clamp(floor(clamp((tc - uSpan.x) / span, 0.0, 0.999) * uAtlasInfo.z), 0.0, max(uAtlasInfo.z - 1.0, 0.0));
    float ly = p.y;
    if (i < 3) { float ed = tH * sign(p.y); ly = ed - (p.y - ed) * (1.6 + 0.5 * float(i)); }
    vec2 luv = vec2((px.x - (tc - 0.5 * tw)) / tw, (ly + tH) / (2.0 * tH));
    if (i < 3) luv.x = fract(luv.x + (hash(vec2(fid, 4.4)) - 0.5) * 0.35);
    vec4 kept = vec4(0.0);
    if (uAtlasOn > 0.5) {                                          // the stretch at the frame's middle, else any kept in it
      kept = keptAt(slot, luv);
      float sa = floor(clamp((tc - 0.5 * tw - uSpan.x) / span, 0.0, 0.999) * uAtlasInfo.z);
      float sb = floor(clamp((tc + 0.5 * tw - uSpan.x) / span, 0.0, 0.999) * uAtlasInfo.z);
      for (int k = 0; k < 6; k++) {
        if (kept.a > 0.5 || sa + float(k) > sb) break;
        kept = keptAt(sa + float(k), luv);
      }
    }
    kept.a *= step(abs(ly), tH * 1.02);
    vec2 shard = vec2(px.x - uC.x + (hash(vec2(fid, 4.4)) - 0.5) * uH.x * 0.3,
                      uH.y * (0.92 - 0.5 * hash(vec2(fid, 8.1))) - (px.y - (bc.y - bh.y)) * 2.0);
    vec3 above = pic(shard, 3.8 + 0.6 * float(min(i, 2)));
    vec3 P = mix(above, lin(kept.rgb), kept.a);
    float lum = dot(P, vec3(0.2126, 0.7152, 0.0722));
    // Through emerald: green passes, red is drunk, blue some; the longer the path, the darker and greener.
    vec3 filt = exp(-EMERALD * (i == 3 ? 0.32 : 0.55 + 0.22 * float(i)));
    vec3 deepG = vec3(0.004, 0.055, 0.028) * (0.55 + 0.9 * lum);   // the stone's own depth
    vec3 T = (deepG + P * filt * mix(0.22, i == 3 ? 1.7 : 0.85, kept.a)) * body * tilt
           + vec3(0.25, 1.0, 0.65) * flash * (0.75 + 0.5 * lum);
    T *= 1.0 + 0.4 * fresh + 2.2 * wave;
    T = 1.0 - exp(-T * 1.5);                                       // deep; flashes run to white
    if (i < 3) T *= 0.7 + 0.4 * max(dot(n, normalize(vec2(-0.6, -0.8))), -0.5);
    vec3 I = normalize(vec3(px - bc, -5000.0));
    float F = 0.04 + 0.6 * pow(1.0 - N.z, 2.0);
    vec3 R = room(reflect(I, N));
    vec3 l = normalize(vec3(uLight.xy - px, 380.0));
    float glint = pow(max(dot(N, normalize(l + vec3(0, 0, 1))), 0.0), 120.0) * uLight.z;
    col = T * (1.0 - F) + R * F + vec3(glint) * 0.4;
    // Lines: the split inside a facet, the step edges and the table's edge, corner joints, chapter cuts, the girdle.
    float edgeLight = 0.03 + 0.12 * pow(facing, 3.0);
    float stepE = 1.0 - smoothstep(0.0, 1.0, min(abs(depth - 0.5 * uS), abs(depth - uS)));
    float jointL = (1.0 - smoothstep(0.0, 1.0, abs(f - second) / 0.765)) * step(depth, uS);
    col += vec3(edgeLight) * max(stepE, jointL);
    for (int k = 0; k < 8; k++) {
      if (k >= uChN) break;
      float dx = px.x - (uSpan.x + uCh[k] * span);
      col += vec3(edgeLight * 1.4) * (1.0 - smoothstep(0.0, 1.0, abs(dx)));
      col *= 1.0 - 0.3 * smoothstep(0.6, 1.6, dx) * (1.0 - smoothstep(1.6, 4.0, dx));
    }
    col += vec3(0.12 + edgeLight) * (1.0 - smoothstep(0.0, 1.2, depth));   // the girdle
    col *= 1.0 - 0.45 * kept.a * step(uS, depth) * (1.0 - smoothstep(0.0, 1.2, abs(px.x - (uSpan.x + tk * tw))));
  }

  // The raw crystal, over whatever the cut stone would show there.
  float rawM = (1.0 - cutv) * smoothstep(0.6, -0.6, rawF);
  if (rawM > 0.001) col = mix(col, rawBar(px, p, rawF, hh, span, la, facing, chisel), rawM);

  float inStone = smoothstep(0.6, -0.6, mix(rawF, f, cutv));
  // Where cut meets raw, the fresh break of the crystal catches the light.
  float gs = abs(seenAt(px.x + 1.2) - seenAt(px.x - 1.2));
  col += vec3(0.32, 0.7, 0.52) * smoothstep(0.15, 0.7, gs) * step(rawF, 0.0) * 0.45;
  // Sparkle: the corners of the girdle and the table catch the light in turn. Only a cut stone has corners.
  vec3 sp = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    float o = k == 0 ? 0.0 : uS;
    vec2 v1 = vec2(bh.x - o, bh.y - uK - o * 0.41421), v2 = vec2(bh.x - uK - o * 0.41421, bh.y - o);
    float a1 = atan(sign(p.y) * v1.y, sign(p.x) * v1.x), a2 = atan(sign(p.y) * v2.y, sign(p.x) * v2.x);
    float f1 = pow(0.5 + 0.5 * cos(la * 2.0 - a1 * 2.0 + float(k)), 30.0);
    float f2 = pow(0.5 + 0.5 * cos(la * 2.0 - a2 * 2.0 - float(k)), 30.0);
    sp += vec3(1.0, 0.97, 0.9) * (glint(q - v1) * f1 + glint(q - v2) * f2) * 0.9;
  }
  col += sp * cutv;
  // Now: a thin line of light across the stone where the cutter stands. At work over raw stone it glows and throws a
  // little glittering dust; over stone already cut it only passes, as light.
  // Now: a needle of light across the stone and a little past both its edges, so the position reads at a glance,
  // paused or playing, among facets and frames; a small notch above and below marks it from afar.
  float nx = abs(px.x - nowX);
  float over = bh.y * 1.28;                                          // how far past the stone's edges it reaches
  float inNeedle = 1.0 - smoothstep(over - 0.8, over + 0.8, abs(p.y));
  float nl = (1.0 - smoothstep(0.6, 1.4, nx)) * inNeedle;
  float halo = exp(-nx * nx / 9.0) * inNeedle * 0.35;
  float notch = (1.0 - smoothstep(0.0, 1.0, nx - max(0.0, (abs(p.y) - bh.y * 1.08) * 0.9))) * step(bh.y * 1.08, abs(p.y)) * inNeedle;
  col = mix(col, vec3(0.9, 1.0, 0.95), clamp(nl * (0.75 + 0.25 * uCut) + notch * 0.85, 0.0, 1.0));
  col += vec3(0.25, 0.75, 0.55) * halo;
  if (uSpan.w >= 0.0) col += vec3(0.3, 0.55, 0.42) * (1.0 - smoothstep(0.3, 1.0, abs(px.x - aimX))) * inStone * 0.7;
  if (uCut > 0.001) {
    vec2 hot = vec2(nowX, bc.y);
    // the cut itself: a narrow band of light across the stone at the cutter, brightest at its middle
    float bx = (px.x - hot.x) / 2.2, by4 = abs(px.y - hot.y) / (bh.y * 1.05);
    float band = exp(-bx * bx) * exp(-by4 * by4 * by4 * by4);
    col += vec3(0.55, 1.0, 0.78) * (band * 0.5 + exp(-dot(px - hot, px - hot) / 7.0) * 0.55) * uCut;
    if (uCalm < 0.5 && abs(px.x - hot.x) < 70.0 && abs(px.y - hot.y) < 70.0) {
      for (int k = 0; k < 12; k++) {
        float fk = float(k);
        float life = 0.45 + 0.4 * hash(vec2(fk, 9.1));
        float ph = uTime / life + hash(vec2(fk, 3.3));
        float age = fract(ph), gen = floor(ph);
        float h1 = hash(vec2(fk + gen * 13.0, 1.7)), h2 = hash(vec2(fk + gen * 13.0, 4.9));
        vec2 o0 = hot + vec2(1.5, (h1 - 0.5) * bh.y * 1.4);
        vec2 vel = vec2(14.0 + 34.0 * h2, (h1 - 0.5) * 40.0 + 10.0);
        vec2 pos = o0 + vel * age * life + vec2(0.0, 30.0) * age * age * life * life;
        float b = (1.0 - age) * (1.0 - age) * (0.5 + 0.5 * hash(vec2(fk + gen, 7.7)));
        vec2 dp = px - pos;
        col += vec3(0.78, 1.0, 0.88) * exp(-dot(dp, dp) / 0.8) * b * uCut;
      }
    }
  }
  col = volBar(px, gem(px, col));
  if (uOverlay.x > 0.5) col = mix(col, bare, uIdle);                 // stepped aside: only the picture
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}`;

export class Stone {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: "high-performance" });
    this.gl = gl;
    this.ok = !!gl && this.#build();
    this.geo = null;
    this.span = [0, 1, 0, -1];
    this.light = [0, 0, 0];
    this.cut = 0;
    this.flash = [0, 0, -1];
    this.wheel = [0, 0, 0, 0];
    this.smear = 0;
    this.calm = false;
    this.vol = [0, 0, 0, 0];
    this.atlasInfo = [1, 1, 1, 1.78];
    this.atlasOn = 0;
    this.volLevel = 1;
    this.has = 0;
    this.chapters = [];
    this.t0 = performance.now();
  }

  #build() {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const pr = gl.createProgram();
    gl.attachShader(pr, vs);
    gl.attachShader(pr, fs);
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(pr)); return false; }
    this.pr = pr;
    gl.useProgram(pr);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const k of ["uRes", "uDpr", "uC", "uH", "uBar", "uK", "uS", "uWheel", "uSmear", "uVol", "uVolLevel", "uSpan", "uLight", "uTime", "uCalm", "uRawMode", "uGemMode", "uPress", "uOverlay", "uIdle", "uHas", "uCut", "uFlash", "uCh", "uChN", "uVid", "uSeen", "uAtlas", "uAtlasInfo", "uAtlasOn"]) this.u[k] = gl.getUniformLocation(pr, k);
    const tex = (unit) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.seenTex = tex(1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, Stone.N, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(Stone.N));
    gl.uniform1i(this.u.uSeen, 1);
    this.atlasTex = tex(2);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.uniform1i(this.u.uAtlas, 2);
    this.tex = tex(0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([56, 58, 60, 255]));
    gl.uniform1i(this.u.uVid, 0);
    return true;
  }

  // The context came back after a loss: build it all again (the caller re-sends the watched map and a frame).
  restore() {
    this.ok = !!this.gl && !this.gl.isContextLost() && this.#build();
  }

  // A frame of the picture (a <video> with a frame, or the poster <img>). False if the browser won't let the canvas
  // read it (another origin without CORS): the crown then stays smoke.
  upload(src) {
    if (!this.ok) return false;
    const gl = this.gl;
    try {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.generateMipmap(gl.TEXTURE_2D);
      this.has = 1;
      return true;
    } catch {
      this.has = 0;
      return false;
    }
  }

  // What was seen: the atlas canvas of kept frames, and its grid [columns, rows, stretches, aspect].
  atlas(canvas, info) {
    if (!this.ok) return;
    const gl = this.gl;
    try {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      this.atlasInfo = info;
      this.atlasOn = 1;
    } catch {
      this.atlasOn = 0;                                            // a picture from another origin: nothing kept
    }
    gl.activeTexture(gl.TEXTURE0);
  }

  // The watched map: Stone.N bytes along the time span, 255 where the reel has been seen.
  seen(map) {
    if (!this.ok) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.seenTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, Stone.N, 1, gl.RED, gl.UNSIGNED_BYTE, map);
    gl.activeTexture(gl.TEXTURE0);
  }

  size(w, h, dpr) {
    const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    this.dpr = dpr;
  }

  draw() {
    if (!this.ok || !this.geo) return;
    const gl = this.gl, u = this.u, g = this.geo;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uDpr, this.dpr);
    gl.uniform2f(u.uC, g.vx + g.vw / 2, g.vy + g.vh / 2);
    gl.uniform2f(u.uH, g.vw / 2, g.vh / 2);
    gl.uniform4f(u.uBar, g.cx, g.by, g.A, g.bh / 2);
    gl.uniform1f(u.uK, g.K);
    gl.uniform1f(u.uS, g.S);
    gl.uniform4f(u.uWheel, ...this.wheel);
    gl.uniform1f(u.uSmear, this.smear);
    gl.uniform4f(u.uVol, ...this.vol);
    gl.uniform1f(u.uVolLevel, this.volLevel);
    gl.uniform4f(u.uAtlasInfo, ...this.atlasInfo);
    gl.uniform1f(u.uAtlasOn, this.atlasOn);
    gl.uniform4f(u.uSpan, ...this.span);
    gl.uniform3f(u.uLight, ...this.light);
    gl.uniform1f(u.uTime, (performance.now() - this.t0) / 1000);
    gl.uniform1f(u.uCalm, this.calm ? 1 : 0);
    gl.uniform1f(u.uRawMode, this.rawMode || 0);
    gl.uniform1f(u.uGemMode, this.gemMode || 0);
    gl.uniform2f(u.uPress, ...(this.press || [0, 0]));
    gl.uniform2f(u.uOverlay, g.overlay ? 1 : 0, g.bandTop || 0);
    gl.uniform1f(u.uIdle, g.overlay ? this.idle || 0 : 0);
    gl.uniform1f(u.uHas, this.has);
    gl.uniform1f(u.uCut, this.cut);
    gl.uniform3f(u.uFlash, ...this.flash);
    const ch = new Float32Array(8);
    this.chapters.slice(0, 8).forEach((x, i) => { ch[i] = x; });
    gl.uniform1fv(u.uCh, ch);
    gl.uniform1i(u.uChN, Math.min(8, this.chapters.length));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
Stone.N = 1024;
