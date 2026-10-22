// Стекло на WebGL: суперэллипс с фаской, фаска преломляет логотип внутрь,
// спектральные выборки дают радужную кайму. Без библиотек, WebGL 1.
// Логотип приходит полем расстояний (SDF): край считается, а не берётся из пикселей,
// поэтому под линзой он остаётся гладким при любом увеличении.

export type Shape = "squircle" | "circle";
export type Background = "light" | "dark" | "none";
export type Sides = "all" | "two" | "one";

// Всё, что можно плавно вести между значениями, — числа: форма, стороны, заливка логотипа.
export interface GlassParams {
  n: number; // показатель суперэллипса: 2 — круг, 5 — скруглённый квадрат
  refraction: number; // 0..1.5 — насколько фаска тянет картинку изнутри
  dispersion: number; // 0..1 — разлёт цветов
  edge: number; // ширина фаски в долях полуразмера иконки
  motion: number; // 0..1 — покачивание формы
  size: number; // полуразмер логотипа в долях полуразмера иконки
  tint: [number, number, number]; // цвет заливки логотипа
  tintMix: number; // 0 — свой цвет логотипа, 1 — заливка tint
  sideMix: number; // 0 — кромка преломляет везде, 1 — только на выбранных сторонах
  sideTwo: number; // 0 — одна сторона, 1 — две противоположные
  angle: number; // направление в радианах, 0 — вправо, против часовой
  spread: number; // 0..1 — ширина зоны выбранных сторон
  liquid: number; // 0..1 — смаз натекает в край, по толще идут волны
  volume: number; // толщина плиты, 0..1
  depth: number; // 0 — плоское стекло, 1 — с объёмом
  background: Background;
  bg: [number, number, number]; // цвет фона для light/dark, 0..1
}

// Иконка занимает 80% кадра: по 10% на тень и воздух.
export const ICON_SCALE = 0.8;
// Логотип занимает такую долю текстуры по длинной стороне; поля — под спад SDF.
export const LOGO_FILL = 0.86;
// Насколько далеко от края SDF ещё различает расстояние, в текселях.
export const SDF_SPREAD = 32;

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const frag = (derivatives: boolean) => `
${derivatives ? "#extension GL_OES_standard_derivatives : enable" : ""}
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 v_uv;
uniform sampler2D u_sdf;    // R: 0.5 — край логотипа, больше — внутри
uniform sampler2D u_color;  // цвет логотипа, раздвинутый за край
uniform float u_texSize;
uniform float u_halfPx;     // полуразмер иконки в пикселях
uniform float u_n;          // показатель суперэллипса: 2 — круг, 5 — скруглённый квадрат
uniform float u_edge;
uniform float u_refract;
uniform float u_disp;
uniform float u_phase;      // 0..1, одна петля анимации
uniform float u_motion;
uniform float u_size;
uniform vec4 u_tint;        // rgb — заливка, a — насколько залить: 0 свой цвет, 1 заливка
uniform float u_sideMix;    // 0 — везде, 1 — только выбранные стороны
uniform float u_sideTwo;    // 0 — одна сторона, 1 — две
uniform float u_angle;
uniform float u_spread;     // ширина зоны сторон: 0 — узкое пятно, 1 — почти вся сторона
uniform float u_liquid;     // 0 — смаз полосой у кромки, 1 — глиф натекает в край, по толще идут волны
uniform float u_volume;     // толщина плиты, 0..1
uniform float u_depth;      // 0 — плоское стекло, 1 — с объёмом; плавно, чтобы объём растворялся, а не пропадал
uniform vec3 u_bg;
uniform float u_mode;       // 0 светлый, 1 тёмный, 2 прозрачный

const int TAPS = 32;
const float TAU = 6.2831853;

// Спектр от красного (0) к фиолетовому (1).
vec3 spectrum(float x) {
  float h = x * 0.8;
  return clamp(vec3(abs(h * 6.0 - 3.0) - 1.0, 2.0 - abs(h * 6.0 - 2.0), 2.0 - abs(h * 6.0 - 4.0)), 0.0, 1.0);
}

// Квадрат через умножение: pow(x, 2.0) при x < 0 в GLSL не определён, на части видеокарт — чёрные пиксели.
float sq(float x) {
  return x * x;
}

// Расстояние до края суперэллипса (приближённое, точное у самого края) и нормаль наружу.
float shape(vec2 p, out vec2 nrm) {
  vec2 a = max(abs(p), vec2(1e-4));
  vec2 an = pow(a, vec2(u_n));
  float s = an.x + an.y;
  float f = pow(s, 1.0 / u_n);
  vec2 g = sign(p) * pow(a, vec2(u_n - 1.0)) * pow(s, 1.0 / u_n - 1.0);
  float gl = max(length(g), 1e-4);
  nrm = g / gl;
  return (f - 1.0) / gl;
}

// Без фона стекло то же, что на светлом: прозрачным остаётся только то, что снаружи.
// Почти пустое стекло нечему преломлять — радуга превращалась в серые мазки.
// Норма суперэллипса: 1 на краю, меньше внутри. Её уровни — уменьшенные копии формы, углы у них
// всегда скруглены. Отступ на постоянное расстояние в углу ломается, когда он больше радиуса скругления,
// а линза кромки этот излом увеличивает — отсюда были складки в углах.
float snorm(vec2 p) {
  vec2 a = max(abs(p), vec2(1e-4));
  return pow(pow(a.x, u_n) + pow(a.y, u_n), 1.0 / u_n);
}

vec4 glassBase() {
  // Тело почти как фон: у Apple стекло прозрачное, сквозь него видна подложка, а не белая плитка.
  if (u_mode > 0.5 && u_mode < 1.5) return vec4(mix(u_bg, vec3(1.0), 0.04), 1.0);
  return vec4(mix(u_bg, vec3(1.0), 0.05), 1.0);
}

// Логотип в точке q пространства иконки. blur — полуширина перехода края в текселях.
vec4 content(vec2 q, float blur) {
  vec2 uv = 0.5 + q * (0.5 * ${LOGO_FILL.toFixed(2)}) / u_size;
  uv.y = 1.0 - uv.y;
  float dist = (texture2D(u_sdf, uv).r * 255.0 - 128.0) / 127.0 * ${SDF_SPREAD.toFixed(1)};
  float cov = smoothstep(-blur, blur, dist);
  vec3 col = mix(texture2D(u_color, uv).rgb, u_tint.rgb, u_tint.a);
  vec4 logo = vec4(col * cov, cov);
  return logo + glassBase() * (1.0 - logo.a);
}

// --- Объём: плита толщиной h со скруглённой верхней кромкой. Луч от глаза входит в кромку,
// преломляется и падает на дно — что там лежит, то и видно. Отсюда переливы внутри ребра. ---

// Куда на дне попадёт луч, вошедший в стекло с нормалью n3.
vec2 throughSlab(vec3 n3, float ior, float h) {
  // Показатель меньше 1 даёт полное отражение, refract() возвращает ноль — разрыв на картинке.
  vec3 t = refract(vec3(0.0, 0.0, -1.0), n3, 1.0 / max(ior, 1.02));
  return t.xy / max(-t.z, 0.25) * h;
}

// Дно плиты: логотип и подложка, у края — контактная тень. Светлое кольцо каустики тут было,
// но в углах кромка собирает лучи и растягивала его в прямые светлые полосы — убрано.
vec4 floorAt(vec2 q, float blur) {
  vec4 c = content(q, blur);
  float contact = exp(min(snorm(q) - 1.0, 0.0) / 0.04) * 0.12 * u_depth;
  c.rgb *= 1.0 - contact;
  return c;
}

// Комната, которая отражается в кромке: пол под плитой, стены, окно сверху слева и полоса света снизу справа.
vec3 studio(vec3 r) {
  float len = length(r.xy);
  vec2 dir = r.xy / max(len, 1e-4);
  float key = dot(dir, normalize(vec2(-0.55, 0.85)));
  float ang = len > 1e-4 ? atan(dir.y, dir.x) : 0.0; // atan(0, 0) в GLSL не определён
  float up = smoothstep(-0.25, 0.35, r.z);
  float window = exp(-sq((ang - 2.15) / 0.22)) * up;
  float strip = exp(-sq((ang + 0.9) / 0.14)) * up;
  bool dark = u_mode > 0.5 && u_mode < 1.5;
  vec3 floorC = u_bg * (dark ? 0.6 : 0.78);
  vec3 wall = dark ? vec3(0.08 + 0.2 * max(key, 0.0)) : u_bg + 0.04 * key;
  return mix(floorC, wall, up) + vec3(window * (dark ? 0.9 : 0.35) + strip * (dark ? 0.4 : 0.18));
}

// Медленные волны в толще стекла: сумма синусов под разными углами. Фаза T — петля анимации,
// поэтому видео зацикливается без шва.
vec2 waves(vec2 p, float T) {
  float a = sin(dot(p, vec2(3.1, 1.7)) + T) + sin(dot(p, vec2(-2.3, 2.9)) - T + 1.7);
  float b = sin(dot(p, vec2(1.3, -3.4)) + T + 0.6) + sin(dot(p, vec2(-3.7, -1.1)) - T + 2.4);
  return vec2(a, b) * 0.5;
}

// Шум с равномерным спектром: дрожание выборок вместо полос.
float ign(vec2 c) {
  return fract(52.9829189 * fract(dot(c, vec2(0.06711056, 0.00583715))));
}

void main() {
  float T = u_phase * TAU;
  vec2 p = (v_uv - 0.5) * 2.0 / ${ICON_SCALE.toFixed(2)};
  p *= 1.0 - 0.012 * u_motion * sin(T);

  vec2 nrm;
  float d = shape(p, nrm);
  float th = atan(p.y, p.x + 1e-7); // сдвиг — чтобы в самом центре не было atan(0, 0)
  float wob = u_motion * (0.016 * sin(3.0 * th + T) + 0.01 * sin(2.0 * th - 2.0 * T));
  d -= wob;
  // Глубина внутрь по уменьшенным копиям формы: 0 на краю, растёт к центру.
  float depth = 1.0 - snorm(p) + wob;

  float px = 1.0 / u_halfPx;
  float texelsPerUnit = u_texSize * 0.5 * ${LOGO_FILL.toFixed(2)} / u_size;

  // Снаружи: фон и мягкая тень чуть ниже иконки.
  vec2 sn;
  float sd = max(shape(p + vec2(0.0, 0.05), sn), 0.0);
  float shadow = exp(-sd / 0.12) * (u_mode > 0.5 && u_mode < 1.5 ? 0.45 : 0.035) * (1.0 + 0.4 * u_volume * u_depth);
  vec4 outside;
  if (u_mode > 1.5) {
    outside = vec4(0.0, 0.0, 0.0, shadow);
  } else {
    // Фон ровный: сливается со страницей, а в видео 16:9 — с полями по бокам без шва.
    vec3 bg = u_bg;
    outside = vec4(bg * (1.0 - shadow), 1.0);
  }

  // Внутри: фаска преломляет — выборки смещаются по нормали внутрь, каждая со своим цветом.
  // Глубина, с которой фаска собирает картинку, не зависит от её ширины: узкая кромка
  // сжимает широкую полосу изнутри — так глиф у края растягивается вдоль него, как у толстого стекла.
  float t = clamp(depth / u_edge, 0.0, 1.0);
  float e = 1.0 - t;

  // Стороны: где кромка преломляет. Маска по углу положения, а не нормали: у нормали на прямых
  // сторонах угол один и тот же, и сторона включалась целиком. Spread — полуширина зоны.
  float side = 1.0;
  if (u_sideMix > 0.001) {
    float c = cos(th - u_angle);
    float hw = mix(0.25, 1.6, u_spread);
    side = mix(1.0, smoothstep(cos(hw), cos(hw * 0.35), mix(c, abs(c), u_sideTwo)), u_sideMix);
  }
  float wave = 1.0 + 0.25 * u_motion * sin(T + 1.3);
  // Профиль: смещение быстро набирает полную силу и держит её через всю полосу — как у Apple,
  // где кромка показывает сплошную полосу глифа, подтянутого издалека, а кайма — на её внутренней границе.
  float rimPull = smoothstep(0.0, 0.65, e);
  // Liquid: затухание уходит глубоко внутрь и становится пологим — изображение не складывается
  // в отдельную дугу, а непрерывно тянется к краю: глиф натекает в кромку перемычкой, как у Apple.
  float flowW = mix(u_edge, 0.62, u_liquid);
  float flow = pow(1.0 - smoothstep(0.0, flowW, depth), 1.4);
  // Волны в толще: толщина смаза гуляет вдоль кромки. В центре их нет — глиф там остаётся ровным.
  vec2 wv = waves(p, T);
  float nearEdge = 1.0 - smoothstep(0.0, 0.6, depth);
  float swell = 1.0 + 0.45 * u_liquid * wv.x * nearEdge;
  // В углу до центра дальше, чем от середины стороны, — и луч тянется дальше, иначе углу не хватает глифа.
  float cornerReach = length(p) / max(snorm(p), 1e-3);
  // Полоса у ребра остаётся (длинные хвосты вдоль сторон), перемычка к глифу добавляется поверх.
  float k = u_refract * 0.42 * wave * swell * cornerReach * max(rimPull, flow * u_liquid) * side;
  // Разлёт цветов ограничен сверху: иначе при большом смещении кайма расплывается широкими пятнами.
  float kDisp = min(k, 0.16);
  // Направление выборки: по нормали, а с Liquid — сходится к центру, и хвосты стекаются в угол.
  vec2 dir = normalize(mix(nrm, p / max(length(p), 1e-3), 0.45 * u_liquid));
  vec2 ripple = wv * 0.05 * u_liquid * nearEdge * side;

  // Объём: плита со скруглённой кромкой. Её видимую ширину и глубину задаёт Thickness,
  // смаз фаски — по-прежнему Edge width. Луч считает смещение, показатель — от Refraction.
  bool vol = u_depth > 0.001;
  float rimW = 0.05 + 0.2 * u_volume;
  float tr = clamp(depth / rimW, 0.0, 1.0);
  float r = 1.0 - tr;
  float slope = r / max(sqrt(1.0 - r * r), 0.08);
  vec3 n3 = normalize(vec3(nrm * slope, 1.0));
  float h = 0.1 + 0.4 * u_volume;
  float ior = 1.0 + 0.5 * u_refract;
  // Честная плита отклоняет луч слабо — смаз у Apple сильнее физики. Поэтому с объёмом луч
  // сквозь кромку складывается с прежним смазом фаски: линза плюс радуга.
  vec2 offC = (vol ? throughSlab(n3, ior, h) * side * wave * u_depth : vec2(0.0)) - dir * k + ripple;

  // Ширина перехода края: размер пикселя в текселях там, куда смотрит выборка,
  // плюс размытие, которое растёт с силой преломления — у стекла кромка мягкая.
  vec2 q0 = p + offC;
#ifdef GL_OES_standard_derivatives
  float foot = length(fwidth(q0)) * texelsPerUnit * 0.4;
#else
  float foot = px * texelsPerUnit * 1.5;
#endif
  float reach = length(offC);
  float blur = max(foot, 0.35) + reach * 0.035 * texelsPerUnit;

  // Порядок цветов в кайме. Чёрный глиф на светлом и светлый на тёмном дают дополнительные
  // цвета друг к другу — на тёмном кайма выходила жёлто-оранжевой. Разворачиваем, чтобы везде как у Apple.
  // В полосе у ребра изображение сложено, на перемычке Liquid — нет, и порядок цветов в них противоположный.
  // Разворачиваем по зоне с плавным переходом: у ребра голубое внутри и красное снаружи, вокруг перемычки голубой ореол.
  float zone = mix(-1.0, 1.0, smoothstep(u_edge * 0.6, u_edge * 1.3, depth) * step(0.001, u_liquid));
  float order = (u_mode > 0.5 && u_mode < 1.5 ? -1.0 : 1.0) * zone;

  vec4 inside;
  if (reach < 1e-4) {
    // С объёмом дно рисуем так же, как в цикле, — иначе там, где маска сторон гасит смаз,
    // пропадала контактная тень и на стекле появлялась прямая ступенька тона.
    inside = vol ? floorAt(p, blur) : content(p, blur);
  } else {
    vec3 acc = vec3(0.0);
    vec3 wsum = vec3(0.0);
    float aacc = 0.0;
    vec2 tng = vec2(-nrm.y, nrm.x);
    float jitter = ign(gl_FragCoord.xy);
    for (int i = 0; i < TAPS; i++) {
      float x = (float(i) + jitter) / float(TAPS);
      vec3 w = spectrum(x);
      // Красный уходит глубже, синий — ближе к краю: снаружи красная кайма, внутри голубая, как на референсе.
      // Небольшой разброс вдоль кромки смягчает резкие срезы глифа.
      float along = (fract(x * 7.31 + jitter) - 0.5) * 0.25;
      float spread = (0.5 - x) * order;
      vec2 off = -dir * (k + kDisp * u_disp * spread * 0.9) + ripple;
      vec4 c;
      if (vol) {
        off += throughSlab(n3, ior + u_disp * 0.3 * spread, h) * side * wave * u_depth;
        // Разброс вдоль кромки переходит к плоскому варианту вместе с u_depth — иначе в момент выключения он прыгал.
        c = floorAt(p + off + tng * mix(k, length(off), u_depth) * along, blur);
      } else {
        c = content(p + off + tng * k * along, blur);
      }
      acc += c.rgb * w;
      wsum += w;
      aacc += c.a;
    }
    float a = aacc / float(TAPS);
    inside = vec4(min(acc / wsum, vec3(a)), a);
    // Сочнее: усредняя выборки, кайма теряет насыщенность — возвращаем её, только там, где есть смаз.
    float luma = dot(inside.rgb, vec3(0.299, 0.587, 0.114));
    inside.rgb = clamp(luma + (inside.rgb - luma) * 1.7, 0.0, a);
  }

  vec2 L = normalize(vec2(-0.55, 0.85));
  float lit = 0.55 + 0.45 * dot(nrm, L);
  // Тонкий блик у самого края — у снятого стекла он есть всегда.
  float glint = exp(-sq((-d - 0.012) / (2.0 * px)));
  // Плоская кромка: светлая полоса с тонким бликом внутри и серым контуром снаружи.
  float band = smoothstep(0.035, 0.0, -d);
  vec4 flatRim = mix(inside, vec4(1.0), clamp(glint * (0.35 + 0.55 * lit) + band * 0.12, 0.0, 1.0));
  if (vol) {
    vec4 v = inside;
    // Отражение комнаты по Френелю — слабое: стекло у Apple прозрачное, а не глянцевый пластик.
    vec3 refl = reflect(vec3(0.0, 0.0, -1.0), n3);
    float fres = (0.04 + 0.96 * pow(max(1.0 - n3.z, 0.0), 3.0)) * step(tr, 0.999);
    v = mix(v, vec4(studio(refl), 1.0), clamp(fres, 0.0, 1.0) * 0.55);
    // Шов, где кромка переходит в плоскость: со стороны света блик, с обратной — тень.
    float seam = exp(-sq((depth - rimW) / (1.4 * px)));
    float toLight = dot(nrm, L);
    v = mix(v, vec4(1.0), seam * max(toLight, 0.0) * 0.6);
    v.rgb *= 1.0 - seam * max(-toLight, 0.0) * 0.2;
    v = mix(v, vec4(1.0), glint * (0.25 + 0.5 * lit));
    // Объём растворяется в плоское стекло вместе с u_depth — без скачка в конце.
    inside = mix(flatRim, v, u_depth);
  } else {
    inside = flatRim;
  }

  float line = smoothstep(2.0 * px, 0.0, -d);
  if (u_mode > 0.5 && u_mode < 1.5) inside = mix(inside, vec4(1.0), 0.3 * line);
  else inside.rgb *= 1.0 - 0.12 * line;

  float cov = clamp(0.5 - d / px, 0.0, 1.0);
  gl_FragColor = inside * cov + outside * (1.0 - cov);
}`;

const UNIFORMS = [
  "u_sdf", "u_color", "u_texSize", "u_halfPx", "u_n", "u_edge", "u_refract", "u_disp", "u_phase",
  "u_motion", "u_size", "u_tint", "u_sideMix", "u_sideTwo", "u_angle", "u_spread", "u_liquid", "u_volume", "u_depth", "u_bg", "u_mode",
];

export class GlassRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private sdf: WebGLTexture;
  private color: WebGLTexture;
  private texSize = 1;
  private loc: Record<string, WebGLUniformLocation | null> = {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error("webgl");
    this.gl = gl;
    const derivatives = !!gl.getExtension("OES_standard_derivatives");
    this.program = this.link(frag(derivatives));
    gl.useProgram(this.program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(this.program, "a_pos");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    for (const name of UNIFORMS) this.loc[name] = gl.getUniformLocation(this.program, name);
    this.sdf = this.texture(0);
    this.color = this.texture(1);
    gl.uniform1i(this.loc.u_sdf, 0);
    gl.uniform1i(this.loc.u_color, 1);
  }

  private texture(unit: number): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private link(fragSrc: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "shader");
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
    return prog;
  }

  // sdf — size×size байт (128 — край), color — холст того же размера с цветом, раздвинутым за край.
  setLogo(sdf: Uint8Array, color: HTMLCanvasElement, size: number) {
    const gl = this.gl;
    this.texSize = size;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sdf);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, size, size, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, sdf);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.color);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, color);
  }

  setSize(px: number) {
    if (this.canvas.width !== px) {
      this.canvas.width = px;
      this.canvas.height = px;
    }
  }

  render(params: GlassParams, phase: number) {
    const gl = this.gl;
    const size = this.canvas.width;
    gl.viewport(0, 0, size, size);
    gl.uniform1f(this.loc.u_texSize, this.texSize);
    gl.uniform1f(this.loc.u_halfPx, (size / 2) * ICON_SCALE);
    gl.uniform1f(this.loc.u_n, params.n);
    gl.uniform1f(this.loc.u_edge, params.edge);
    gl.uniform1f(this.loc.u_refract, params.refraction);
    gl.uniform1f(this.loc.u_disp, params.dispersion);
    gl.uniform1f(this.loc.u_phase, phase);
    gl.uniform1f(this.loc.u_motion, params.motion);
    gl.uniform1f(this.loc.u_size, params.size);
    gl.uniform4f(this.loc.u_tint, ...params.tint, params.tintMix);
    gl.uniform1f(this.loc.u_sideMix, params.sideMix);
    gl.uniform1f(this.loc.u_sideTwo, params.sideTwo);
    gl.uniform1f(this.loc.u_angle, params.angle);
    gl.uniform1f(this.loc.u_spread, params.spread);
    gl.uniform1f(this.loc.u_liquid, params.liquid);
    gl.uniform1f(this.loc.u_volume, params.volume);
    gl.uniform1f(this.loc.u_depth, params.depth);
    gl.uniform3fv(this.loc.u_bg, params.bg);
    gl.uniform1f(this.loc.u_mode, params.background === "light" ? 0 : params.background === "dark" ? 1 : 2);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
