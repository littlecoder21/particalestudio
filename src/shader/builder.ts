import { GENERATOR_MAP } from "./generators";
import { glslModules, type GlslModuleId } from "./glslLib";
import { SDF_SPAN } from "./mask";
import {
  STACK_GLSL_HELPERS,
  blendLibrary,
  buildStackGlsl,
  fieldFnName,
  stackOrder,
  stackSignature,
  stackUniforms,
} from "./stack";
import { activeRules, buildTouchGlsl, ruleUniform, touchFlags, touchSignature } from "./touch";
import { MASK_PATTERNS, MAX_LAYERS, MAX_LAYER_COLORS, MAX_RULES, type GeneratorId, type ShaderProject } from "./types";

/* ─────────────────────────── helpers ─────────────────────────── */

export function hexToRgb(hex: string): [number, number, number] {
  const value = /^#[\da-f]{6}$/i.test(hex) ? hex : "#000000";
  return [
    parseInt(value.slice(1, 3), 16) / 255,
    parseInt(value.slice(3, 5), 16) / 255,
    parseInt(value.slice(5, 7), 16) / 255,
  ];
}

const RAD = Math.PI / 180;

/** Uniform arrays and how many floats each element has (uniform1fv / 3fv / 4fv). */
export const ARRAY_UNIFORMS: Record<string, 1 | 3 | 4> = {
  "uPal[0]": 3,
  "uPalPos[0]": 1,
  "uCA[0]": 4,
  "uLA[0]": 4,
  "uLB[0]": 4,
  "uLK[0]": 4,
  "uLF[0]": 4,
  "uLP[0]": 3,
  "uLQ[0]": 4,
};

/* ─────────────────────────── GLSL source ─────────────────────────── */

export const VERTEX_SOURCE = `#version 300 es
void main(){
  vec2 v = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(v * 2. - 1., 0., 1.);
}`;

const UNIFORMS = /* glsl */`
uniform vec2  uRes;
uniform float uTime;
uniform float uRot;
uniform float uPalShift;
uniform vec2  uMouse;
uniform vec2  uVel;
uniform float uStir;
uniform float uPress;
uniform vec4  uRip[4];
uniform vec4  uTrail[12];
uniform vec4  uCA[${MAX_RULES}];
uniform vec4  uK;
uniform float uScale;
uniform float uWarp;
uniform float uWarpScale;
uniform float uSwirl;
uniform float uSym;
uniform float uPix;
uniform float uSeed;
uniform vec3  uPal[6];
uniform float uPalPos[6];
uniform float uPalN;
uniform float uPalSoft;
uniform vec3  uAccent;
uniform vec3  uCanvas;
uniform float uPalRep;
uniform float uContrast;
uniform float uExposure;
uniform float uSat;
uniform float uHue;
uniform float uGlow;
uniform float uTone;
uniform float uRelief;
uniform float uLightAng;
uniform float uShine;
uniform float uAber;
uniform float uVig;
uniform float uGrain;
uniform float uScan;
uniform float uPost;
uniform vec4  uLA[${MAX_LAYERS}];
uniform vec4  uLB[${MAX_LAYERS}];
uniform vec4  uLK[${MAX_LAYERS}];
uniform vec4  uLF[${MAX_LAYERS}];
uniform vec3  uLP[${MAX_LAYERS * MAX_LAYER_COLORS}];
uniform vec4  uLQ[${MAX_LAYERS * 2}];
`;

const COMMON = /* glsl */`
#define PI 3.14159265359
#define TAU 6.28318530718
#define SEED vec2(uSeed * 3.17, uSeed * 5.31)

vec3  gCol = vec3(0.);
float gHas = 0.;
float gRip = 0.;
float gPalOff = 0.;
vec3  gPal[6];
float gPos[6];
float gPalN = 2.;
float gRep = 1.;
float gSh = 0.;
float gSoft = 1.;

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

float hash11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2  hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }

float gnoise(vec2 p){
  p += SEED;
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6. - 15.) + 10.);
  vec2 a = hash22(i) * 2. - 1.;
  vec2 b = hash22(i + vec2(1., 0.)) * 2. - 1.;
  vec2 c = hash22(i + vec2(0., 1.)) * 2. - 1.;
  vec2 d = hash22(i + vec2(1., 1.)) * 2. - 1.;
  return mix(mix(dot(a, f), dot(b, f - vec2(1., 0.)), u.x),
             mix(dot(c, f - vec2(0., 1.)), dot(d, f - vec2(1., 1.)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0., a = .5;
  mat2 m = mat2(.8, .6, -.6, .8) * 2.03;
  for (int i = 0; i < 5; i++){ v += a * gnoise(p); p = m * p + 7.1; a *= .5; }
  return v;
}
float hexDist(vec2 p){
  p = abs(p);
  return max(dot(p, normalize(vec2(1., 1.7320508))), p.x);
}

/* colour roles and the colour ramp. Stops can sit anywhere on the bar. */
vec3 palAt(int i){ return gPal[clamp(i, 0, int(gPalN) - 1)]; }
vec3 palCycle(int i){ return palAt(int(mod(float(i), gPalN))); }
vec3 ramp(float v){
  float x = v * gRep + gSh;
  x = 1. - abs(1. - mod(x, 2.));
  int n = int(gPalN);
  if (x <= gPos[0]) return gPal[0];
  for (int i = 1; i < 6; i++){
    if (i >= n) break;
    if (x <= gPos[i]){
      float t = clamp((x - gPos[i - 1]) / max(gPos[i] - gPos[i - 1], 1e-4), 0., 1.);
      t = mix(step(.5, t), t, gSoft);
      return mix(gPal[i - 1], gPal[i], t);
    }
  }
  return gPal[n - 1];
}
vec3 hueShift(vec3 c, float a){
  const vec3 k = vec3(.57735026);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1. - ca);
}
`;

/* ───────────────────────── image mask ───────────────────────── */

const MASK_GLSL = /* glsl */`
uniform sampler2D uMaskTex;
uniform vec4 uM0;   /* scale, x, y, rotation */
uniform vec4 uM1;   /* follow, breathe, grow, edge */
uniform vec4 uM2;   /* sdf span, smoke, smoke scale, bevel */
uniform vec4 uM3;   /* glow, halo, outline, distort */
uniform vec4 uM4;   /* particles, size, speed, flow */
uniform vec4 uM5;   /* pattern amount, scale, angle, speed */
uniform vec4 uM6;   /* ghost, inner boost, inner hue */
uniform vec3 uMBg;

/* x = blurred coverage, y = signed distance in screen units (+ inside), z = interior depth */
vec3 maskAt(vec2 uv){
  float sc = max(uM0.x * (1. + uM1.y * .05 * sin(uTime * 1.4)), .02);
  vec2 q = uv - uM0.yz - uMouse * uM1.x;
  q = rot(-uM0.w) * q / sc + .5;
  vec2 cq = clamp(q, 0., 1.);
  vec4 s = texture(uMaskTex, cq);
  float outD = length(q - cq) * sc;
  float sd = (s.g - .5) * uM2.x * sc - outD;
  return vec3(s.r * (1. - smoothstep(0., .05, outD)), sd, s.b * (1. - step(1e-4, outD)));
}

float shapeSd(vec2 uv, float sd){
  sd += uM1.z * .08;
#ifdef MSMOKE
  sd += fbm(uv * uM2.z * 3. + vec2(uTime * .08, -uTime * .06)) * uM2.y * .24;
#endif
  return sd;
}

#ifdef MPART
float particleCov(vec2 uv){
  float cs = .045 * uM4.y;
  float spd = uM4.z * .32;
  vec2 g = uv / cs;
  g.y -= uTime * spd;
  vec2 id = floor(g);
  vec2 f = fract(g) - .5;
  float h = hash21(id + SEED);
  vec2 off = (hash22(id + 3.1 + SEED) - .5) * .5;
  vec2 cuv = (id + .5) * cs;
  cuv.y += uTime * spd * cs;
  vec3 mc = maskAt(cuv);
  float sd = shapeSd(cuv, mc.y);
  float vis = smoothstep(-.03 - .12 * uM2.y, .02, sd);
  float keep = step(h, clamp(.3 + sd * 9., 0., 1.));
  float tw = .55 + .45 * sin(uTime * (1.2 + h * 2.) + h * 40.);
  float rad = (.1 + .13 * h) * tw;
  float d = length(f - off);
  return (1. - smoothstep(rad * .55, rad, d)) * vis * keep;
}
#endif

#if MPAT != 0
float maskPattern(vec2 uv, float sd, float depth){
  float t = uTime * uM5.w;
  vec2 q = rot(uM5.z) * uv * uM5.y * 14.;
#if MPAT == 1
  return smoothstep(.3, .7, .5 + .5 * sin(q.x * 3. + t * 3.));
#elif MPAT == 2
  return 1. - smoothstep(.22, .34, length(fract(q + vec2(0., t)) - .5));
#elif MPAT == 3
  vec2 g = abs(fract(q + .5) - .5);
  return 1. - smoothstep(.02, .07, min(g.x, g.y));
#elif MPAT == 4
  float e = sd > 0. ? depth * 34. : sd * 150.;
  return smoothstep(.35, .65, .5 + .5 * sin(e * uM5.y * 1.6 - t * 4.));
#elif MPAT == 5
  return mod(floor(q.x) + floor(q.y), 2.);
#elif MPAT == 6
  return smoothstep(.35, .65, .5 + .5 * sin((q.x + q.y) * 3.2 + t * 3.));
#else
  return smoothstep(.2, .8, .5 + .5 * sin(q.y * 7. - t * 5.));
#endif
}
#endif
`;

const MASK_PRELUDE = /* glsl */`
  vec3 mk = maskAt(uv);
  float sd = shapeSd(uv, mk.y);
  float es = max(uM1.w * .06, fwidth(sd) * .9 + 2e-4);
  float shape = smoothstep(-es, es, sd);
  float cov = shape;
#ifdef MPART
  float pc = particleCov(uv);
  cov = mix(shape, pc, uM4.x);
#endif`;

const MASK_COMPOSITE = /* glsl */`
#ifdef MASK
  vec3 inner = col * exp2(uM6.y);
  #ifdef MHUE
    inner = hueShift(inner, uM6.z);
  #endif
  #if MPAT != 0
    float pt = maskPattern(uv, sd, mk.z);
    inner = mix(inner, mix(inner * .28, inner * 1.35 + uAccent * .1, pt), uM5.x * cov);
  #endif
  float span = .5 * uM2.x * max(uM0.x, .02);
  float rim = pow(clamp(1. - max(sd, 0.) / span, 0., 1.), 3.) * shape;
  inner += uAccent * rim * uM3.x * (.55 + .45 * dot(inner, vec3(.3333)));
  vec3 hc = mix(uAccent, ramp(.72), .45);
  float ho = clamp(max(-sd, 0.) / span, 0., 1.);
  float halo = (1. - shape) * (.7 * pow(1. - ho, 1.6) + .9 * mk.x);
  vec3 outer = mix(uMBg, col * .55, uM6.x);
  outer += hc * halo * uM3.y * .55;
  col = mix(outer, inner, cov);
  float ol = exp(-(sd * sd) / 4e-5);
  col += uAccent * ol * uM3.z * 1.4;
  #ifdef MPART
    col += uAccent * pc * uM4.x * .45;
  #endif
#endif`;

/* ───────────────────────── pipeline ───────────────────────── */

const PIPELINE = /* glsl */`
/* pointer rules, mask flow, ripples, kaleidoscope, rotation, swirl, zoom and domain warp */
vec2 xform(vec2 p, float t){
  gRip = 0.;
  p = touchWarp(p);
#ifdef MWARP
  {
    vec3 m0 = maskAt(p);
    float e = .01;
    vec2 gd = vec2(maskAt(p + vec2(e, 0.)).y - maskAt(p - vec2(e, 0.)).y,
                   maskAt(p + vec2(0., e)).y - maskAt(p - vec2(0., e)).y) / (2. * e);
    vec2 nn = gd / (length(gd) + 1e-3);
    float ew = exp(-m0.y * m0.y / .0049);
    p -= nn * uM3.w * .05 * ew;
    p += vec2(-nn.y, nn.x) * uM4.w * .06 * ew * sin(uTime * .9 - m0.y * 38.);
  }
#endif
#ifdef RIPPLES
  for (int i = 0; i < 4; i++){
    float age = uRip[i].z;
    if (age >= 0.){
      vec2 d = p - uRip[i].xy;
      float r = length(d) + 1e-4;
      float fr = age * .6;
      float x = (r - fr) * 8.;
      float w = exp(-x * x) * exp(-age * .9) * uRip[i].w;
      p += d / r * w * sin((r - fr) * 26.) * .05;
      gRip += w;
    }
  }
#endif
#ifdef SYM
  float segs = floor(uSym + .5);
  float ang = atan(p.y, p.x);
  float rad = length(p);
  float seg = TAU / segs;
  ang = abs(mod(ang, seg) - seg * .5);
  p = rad * vec2(cos(ang), sin(ang));
#endif
  p = rot(uRot) * p;
#ifdef SWIRL
  p = rot(uSwirl * smoothstep(1.2, 0., length(p))) * p;
#endif
  p /= uScale;
#ifdef WARP
  p += uWarp * .5 * vec2(fbm(p * uWarpScale * 1.5 + vec2(0., t * .07)),
                         fbm(p * uWarpScale * 1.5 + vec2(5.2, 1.3) - t * .06));
#endif
  return p;
}
`;

function buildScene(stackCode: string, hasMask: boolean): string {
  return /* glsl */`
vec3 scene(vec2 uv0){
  float t = uTime;
  vec2 uv = uv0;
#ifdef PIX
  uv = (floor(uv * uPix) + .5) / uPix;
#endif
  vec2 p = xform(uv, t);
${hasMask ? MASK_PRELUDE : "  float cov = 1.;"}

  gPalOff = 0.;
  gSoft = uPalSoft;
  touchPre(uv);

${stackCode}
  gSoft = uPalSoft;
  vec3 col = mix(uCanvas, cb, ab);

#ifdef MBEVEL
  h += mk.z * 4. * uM2.w;
#endif
#ifdef RELIEF
  float rs = uRelief;
  #ifdef MBEVEL
    rs += uM2.w * 1.4;
  #endif
  vec2 gr = vec2(dFdx(h), dFdy(h)) * uRes.y * .004 * rs;
  vec3 n = normalize(vec3(-gr, 1.));
  #ifdef TOUCH_LIGHT
    vec3 L = normalize(vec3(uMouse - uv, .35));
  #else
    vec3 L = normalize(vec3(cos(uLightAng), sin(uLightAng), .75));
  #endif
  float diff = dot(n, L);
  float spec = pow(max(dot(n, normalize(L + vec3(0., 0., 1.))), 0.), 36.);
  col *= .62 + .55 * diff;
  col += spec * uShine * (.35 + .65 * dot(col, vec3(.3333)));
#endif
  col = touchPost(col, uv);

  col *= 1. - clamp(hole, 0., 1.);
  col += uAccent * gRip * .16;
${MASK_COMPOSITE}
  return col;
}
`;
}

const FINISH = /* glsl */`
vec3 finish(vec3 col, vec2 uv){
  col *= exp2(uExposure);
#ifdef GLOW
  float l = dot(col, vec3(.299, .587, .114));
  col += col * uGlow * smoothstep(.35, 1., l);
#endif
#ifdef TONE
  col = mix(col, 1. - exp(-col * 1.35), uTone);
#endif
  float lum = dot(col, vec3(.299, .587, .114));
  col = mix(vec3(lum), col, uSat);
#ifdef HUE
  col = hueShift(col, uHue);
#endif
  col = (col - .5) * uContrast + .5;
#ifdef POSTER
  col = floor(col * uPost + .5) / uPost;
#endif
  col *= 1. - uVig * dot(uv, uv) * 1.4;
#ifdef SCAN
  col *= 1. - uScan * .35 * (.5 + .5 * sin(uv.y * 270. * PI));
#endif
  col += (hash21(gl_FragCoord.xy + fract(uTime) * 91.7) - .5) * (uGrain * .14 + .004);
  return max(col, 0.);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
#if defined(ABERR) || defined(TOUCH_PRISM)
  vec2 o = vec2(0.);
  #ifdef ABERR
    o += uv * uAber * .035;
  #endif
  #ifdef TOUCH_PRISM
    o += touchPrism(uv);
  #endif
  vec3 col = vec3(scene(uv + o).r, scene(uv).g, scene(uv - o).b);
#else
  vec3 col = scene(uv);
#endif
  fragColor = vec4(finish(col, uv), 1.);
}
`;

/* ─────────────────────────── feature flags ─────────────────────────── */

export interface ShaderFlags {
  ripples: boolean;
  sym: boolean;
  pix: boolean;
  warp: boolean;
  swirl: boolean;
  relief: boolean;
  aber: boolean;
  scan: boolean;
  poster: boolean;
  glow: boolean;
  tone: boolean;
  hue: boolean;
  touchLight: boolean;
  touchPrism: boolean;
  mask: boolean;
  maskSmoke: boolean;
  maskParticles: boolean;
  maskPattern: number;
  maskWarp: boolean;
  maskBevel: boolean;
  maskHue: boolean;
}

export function flagsOf(p: ShaderProject): ShaderFlags {
  const touch = touchFlags(activeRules(p));
  const m = p.mask;
  const mask = m.enabled;
  return {
    ripples: p.ripples,
    sym: p.symmetry >= 2,
    pix: p.pixelate >= 8,
    warp: p.warp > 0,
    swirl: p.swirl !== 0,
    relief: p.relief > 0 || touch.light || (mask && m.bevel > 0),
    aber: p.aberration > 0,
    scan: p.scanlines > 0,
    poster: p.posterize >= 2,
    glow: p.glow > 0,
    tone: p.tone > 0,
    hue: p.hue !== 0,
    touchLight: touch.light,
    touchPrism: touch.prism,
    mask,
    maskSmoke: mask && m.smoke > 0,
    maskParticles: mask && m.particles > 0,
    maskPattern: mask ? Math.max(0, MASK_PATTERNS.indexOf(m.pattern)) : 0,
    maskWarp: mask && (m.distort > 0 || m.flow > 0),
    maskBevel: mask && m.bevel > 0,
    maskHue: mask && m.innerHue !== 0,
  };
}

/** Changes whenever the GLSL itself has to be rebuilt (not for plain slider moves). */
export function programKey(p: ShaderProject): string {
  const f = flagsOf(p);
  const bits = [
    f.ripples, f.sym, f.pix, f.warp, f.swirl, f.relief, f.aber, f.scan, f.poster, f.glow, f.tone, f.hue,
    f.mask, f.maskSmoke, f.maskParticles, f.maskWarp, f.maskBevel, f.maskHue,
  ].map((b) => (b ? "1" : "0")).join("");
  const stack = stackSignature(stackOrder(p.layers), f.mask);
  return `${p.generator}|${touchSignature(activeRules(p))}|${stack}|${f.maskPattern}|${bits}`;
}

function fieldSource(id: GeneratorId): string {
  return GENERATOR_MAP[id].glsl.split("FIELD").join(fieldFnName(id));
}

/** Library modules (noise, distance fields, vector fields) the stack's generators call. */
function libraryFor(generators: readonly GeneratorId[]): string {
  const ids = new Set<GlslModuleId>();
  for (const id of generators) for (const module of GENERATOR_MAP[id].uses ?? []) ids.add(module);
  return glslModules(ids);
}

export function buildFragmentSource(p: ShaderProject): string {
  const f = flagsOf(p);
  const rules = activeRules(p);
  const layers = stackOrder(p.layers);
  const stack = buildStackGlsl(layers, p.generator, f.mask);

  const defs: string[] = [`#define MPAT ${f.maskPattern}`];
  if (f.ripples) defs.push("#define RIPPLES");
  if (f.sym) defs.push("#define SYM");
  if (f.pix) defs.push("#define PIX");
  if (f.warp) defs.push("#define WARP");
  if (f.swirl) defs.push("#define SWIRL");
  if (f.relief) defs.push("#define RELIEF");
  if (f.aber) defs.push("#define ABERR");
  if (f.scan) defs.push("#define SCAN");
  if (f.poster) defs.push("#define POSTER");
  if (f.glow) defs.push("#define GLOW");
  if (f.tone) defs.push("#define TONE");
  if (f.hue) defs.push("#define HUE");
  if (f.touchLight) defs.push("#define TOUCH_LIGHT");
  if (f.touchPrism) defs.push("#define TOUCH_PRISM");
  if (f.mask) defs.push("#define MASK");
  if (f.maskSmoke) defs.push("#define MSMOKE");
  if (f.maskParticles) defs.push("#define MPART");
  if (f.maskWarp) defs.push("#define MWARP");
  if (f.maskBevel) defs.push("#define MBEVEL");
  if (f.maskHue) defs.push("#define MHUE");

  const parts = [
    "#version 300 es\nprecision highp float;\nprecision highp int;\nout vec4 fragColor;",
    defs.join("\n"),
    UNIFORMS,
    COMMON,
    STACK_GLSL_HELPERS,
    blendLibrary(stack.modes),
    f.mask ? MASK_GLSL : "",
    buildTouchGlsl(rules),
    PIPELINE,
    libraryFor(stack.generators),
    ...stack.generators.map(fieldSource),
    buildScene(stack.code, f.mask),
    FINISH,
  ];
  return parts.join("\n");
}

/* ─────────────────────────── uniforms ─────────────────────────── */

export type UniformValue = number | number[];
export type UniformEntry = [name: string, value: UniformValue];

function paletteArrays(p: ShaderProject): { colors: number[]; positions: number[] } {
  const n = Math.max(2, Math.min(6, p.palette.length));
  const colors: number[] = [];
  const positions: number[] = [];
  for (let i = 0; i < 6; i++) {
    colors.push(...hexToRgb(p.palette[Math.min(i, p.palette.length - 1)] ?? "#000000"));
    positions.push(i < n ? (p.palettePositions[i] ?? i / (n - 1)) : 1);
  }
  return { colors, positions };
}

/** Uniforms that only change when the project changes. */
export function staticUniforms(p: ShaderProject): UniformEntry[] {
  const pal = paletteArrays(p);
  const rules = activeRules(p);
  const ca: number[] = [];
  for (let i = 0; i < MAX_RULES; i++) {
    const rule = rules[i];
    ca.push(...(rule ? ruleUniform(rule, p.interactionStrength, p.interactionRadius) : [0, 0.2, 0, 0]));
  }
  const m = p.mask;
  return [
    ["uK", [...p.knobs]],
    ["uScale", p.scale],
    ["uWarp", p.warp],
    ["uWarpScale", p.warpScale],
    ["uSwirl", p.swirl],
    ["uSym", p.symmetry],
    ["uPix", p.pixelate],
    ["uSeed", p.seed],
    ["uPal[0]", pal.colors],
    ["uPalPos[0]", pal.positions],
    ["uPalN", Math.max(2, Math.min(6, p.palette.length))],
    ["uPalSoft", p.paletteSoft],
    ["uAccent", hexToRgb(p.accent)],
    ["uCanvas", hexToRgb(p.canvas)],
    ["uPalRep", p.paletteRepeat],
    ["uContrast", p.contrast],
    ["uExposure", p.exposure],
    ["uSat", p.saturation],
    ["uHue", p.hue * RAD],
    ["uGlow", p.glow],
    ["uTone", p.tone],
    ["uRelief", p.relief],
    ["uLightAng", p.lightAngle * RAD],
    ["uShine", p.shine],
    ["uAber", p.aberration],
    ["uVig", p.vignette],
    ["uGrain", p.grain],
    ["uScan", p.scanlines],
    ["uPost", p.posterize],
    ["uCA[0]", ca],
    ...stackUniforms(stackOrder(p.layers)),
    ["uM0", [m.scale, m.x, m.y, m.rotation * RAD]],
    ["uM1", [m.follow, m.breathe, m.grow, m.edge]],
    ["uM2", [SDF_SPAN, m.smoke, m.smokeScale, m.bevel]],
    ["uM3", [m.glow, m.halo, m.outline, m.distort]],
    ["uM4", [m.particles, m.particleSize, m.particleSpeed, m.flow]],
    ["uM5", [m.patternAmount, m.patternScale, m.patternAngle * RAD, m.patternSpeed]],
    ["uM6", [m.ghost, m.innerBoost, m.innerHue * RAD, 0]],
    ["uMBg", hexToRgb(m.background)],
  ];
}

export interface MotionConfig {
  speed: number;
  /** rad / s */
  spin: number;
  /** rad */
  rotation: number;
  paletteSpeed: number;
  paletteShift: number;
  idleDrift: boolean;
  ripples: boolean;
  playing: boolean;
  /** pointer smoothing rate */
  follow: number;
  /** seconds a trail point lives */
  trail: number;
}

export function motionOf(p: ShaderProject): MotionConfig {
  return {
    speed: p.speed,
    spin: p.spin * RAD,
    rotation: p.rotation * RAD,
    paletteSpeed: p.paletteSpeed,
    paletteShift: p.paletteShift,
    idleDrift: p.idleDrift,
    ripples: p.ripples,
    playing: p.playing,
    follow: p.touch.response,
    trail: p.touch.trail,
  };
}
