import { GENERATOR_MAP } from "./generators";
import {
  BLEND_MODES,
  INTERACTION_MODES,
  type ShaderProject,
} from "./types";

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
uniform float uStir;
uniform float uPress;
uniform vec4  uRip[4];
uniform vec4  uK;
uniform vec4  uK2;
uniform float uScale;
uniform float uWarp;
uniform float uWarpScale;
uniform float uSwirl;
uniform float uSym;
uniform float uPix;
uniform float uSeed;
uniform vec3  uPal[6];
uniform float uPalN;
uniform vec3  uAccent;
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
uniform float uIStr;
uniform float uIRad;
uniform float uOp2;
uniform float uScale2;
uniform float uSpd2;
uniform float uShift2;
`;

const COMMON = /* glsl */`
#define PI 3.14159265359
#define TAU 6.28318530718
#define SEED vec2(uSeed * 3.17, uSeed * 5.31)

vec3  gCol = vec3(0.);
float gHas = 0.;
float gRip = 0.;

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

vec3 palAt(int i){ return uPal[clamp(i, 0, int(uPalN) - 1)]; }
vec3 palCycle(int i){ return palAt(int(mod(float(i), uPalN))); }
vec3 ramp(float v){
  float x = v * uPalRep + uPalShift;
  x = 1. - abs(1. - mod(x, 2.));
  float s = x * (uPalN - 1.);
  int i = int(floor(s));
  return mix(palAt(i), palAt(i + 1), s - float(i));
}
vec3 hueShift(vec3 c, float a){
  const vec3 k = vec3(.57735026);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1. - ca);
}
`;

const PIPELINE = /* glsl */`
/* pointer, ripples, kaleidoscope, rotation, swirl, zoom and domain warp */
vec2 xform(vec2 p, float t){
  gRip = 0.;
#if IMODE != 0 && IMODE != 4
  vec2 dm = p - uMouse;
  float R = max(uIRad, .02);
  float pw = exp(-dot(dm, dm) / (R * R));
  #if IMODE == 1
    p += vec2(-dm.y, dm.x) * pw * (.12 + .6 * uStir) * uIStr;
  #elif IMODE == 2
    p -= dm * pw * .55 * uIStr * (1. + uPress);
  #else
    p += dm * pw * .55 * uIStr * (1. + uPress);
  #endif
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

const LAYER_BLEND = /* glsl */`
vec3 blendLayer(vec3 a, vec3 b, float m){
#if BLEND == 0
  return mix(a, b, clamp(uOp2 * m * 1.6, 0., 1.));
#elif BLEND == 1
  return a + b * uOp2;
#elif BLEND == 2
  return 1. - (1. - a) * (1. - b * uOp2);
#elif BLEND == 3
  return a * mix(vec3(1.), b, uOp2);
#elif BLEND == 4
  vec3 o = mix(2. * a * b, 1. - 2. * (1. - a) * (1. - b), step(.5, a));
  return mix(a, o, uOp2);
#else
  return mix(a, abs(a - b), uOp2);
#endif
}
`;

const SCENE = /* glsl */`
vec3 scene(vec2 uv0){
  float t = uTime;
  vec2 uv = uv0;
#ifdef PIX
  uv = (floor(uv * uPix) + .5) / uPix;
#endif
  vec2 p = xform(uv, t);

  gHas = 0.;
  vec4 f = fieldA(p, t, uK);
  vec3 col = mix(ramp(clamp(f.x, 0., 1.)), gCol, gHas);
  col = mix(col, uAccent, clamp(f.y, 0., 1.));
  float h = f.z;
  float hole = f.w;

#ifdef LAYER2
  gHas = 0.;
  vec4 g = fieldB(p * uScale2, t * uSpd2, uK2);
  vec3 c2 = mix(ramp(clamp(g.x, 0., 1.) + uShift2), gCol, gHas);
  c2 = mix(c2, uAccent, clamp(g.y, 0., 1.));
  col = blendLayer(col, c2, g.x);
  h += g.z * uOp2 * .5;
  hole = max(hole, g.w * uOp2);
#endif

#ifdef RELIEF
  vec2 gr = vec2(dFdx(h), dFdy(h)) * uRes.y * .004 * uRelief;
  vec3 n = normalize(vec3(-gr, 1.));
  #if IMODE == 4
    vec3 L = normalize(vec3(uMouse - uv, .35));
  #else
    vec3 L = normalize(vec3(cos(uLightAng), sin(uLightAng), .75));
  #endif
  float diff = dot(n, L);
  float spec = pow(max(dot(n, normalize(L + vec3(0., 0., 1.))), 0.), 36.);
  col *= .62 + .55 * diff;
  col += spec * uShine * (.35 + .65 * dot(col, vec3(.3333)));
#endif
#if IMODE == 4
  vec2 dl = uv - uMouse;
  float pool = exp(-dot(dl, dl) / (uIRad * uIRad * 1.5));
  col *= mix(1., .5 + 1.2 * pool, clamp(uIStr, 0., 1.));
#endif

  col *= 1. - clamp(hole, 0., 1.);
  col += uAccent * gRip * .16;
  return col;
}
`;

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
#ifdef ABERR
  vec2 o = uv * uAber * .035;
  vec3 col = vec3(scene(uv + o).r, scene(uv).g, scene(uv - o).b);
#else
  vec3 col = scene(uv);
#endif
  fragColor = vec4(finish(col, uv), 1.);
}
`;

/* ─────────────────────────── feature flags ─────────────────────────── */

export interface ShaderFlags {
  imode: number;
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
  overlay: boolean;
  blend: number;
}

const IMODE_INDEX: Record<(typeof INTERACTION_MODES)[number], number> = {
  Off: 0, Stir: 1, Attract: 2, Repel: 3, Light: 4,
};

export function flagsOf(p: ShaderProject): ShaderFlags {
  const imode = IMODE_INDEX[p.interaction];
  return {
    imode,
    ripples: p.ripples,
    sym: p.symmetry >= 2,
    pix: p.pixelate >= 8,
    warp: p.warp > 0,
    swirl: p.swirl !== 0,
    relief: p.relief > 0 || imode === 4,
    aber: p.aberration > 0,
    scan: p.scanlines > 0,
    poster: p.posterize >= 2,
    glow: p.glow > 0,
    tone: p.tone > 0,
    hue: p.hue !== 0,
    overlay: p.overlay.enabled,
    blend: Math.max(0, BLEND_MODES.indexOf(p.overlay.blend)),
  };
}

/** Changes whenever the GLSL itself has to be rebuilt (not for plain slider moves). */
export function programKey(p: ShaderProject): string {
  const f = flagsOf(p);
  const bits = [f.ripples, f.sym, f.pix, f.warp, f.swirl, f.relief, f.aber, f.scan, f.poster, f.glow, f.tone, f.hue, f.overlay]
    .map((b) => (b ? "1" : "0")).join("");
  return `${p.generator}|${f.overlay ? p.overlay.generator : "-"}|${f.imode}|${f.blend}|${bits}`;
}

function fieldSource(name: string, id: ShaderProject["generator"]): string {
  return GENERATOR_MAP[id].glsl.split("FIELD").join(name);
}

export function buildFragmentSource(p: ShaderProject): string {
  const f = flagsOf(p);
  const defs: string[] = [`#define IMODE ${f.imode}`, `#define BLEND ${f.blend}`];
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
  if (f.overlay) defs.push("#define LAYER2");

  const parts = [
    "#version 300 es\nprecision highp float;\nprecision highp int;\nout vec4 fragColor;",
    defs.join("\n"),
    UNIFORMS,
    COMMON,
    PIPELINE,
    fieldSource("fieldA", p.generator),
  ];
  if (f.overlay) {
    parts.push(fieldSource("fieldB", p.overlay.generator));
    parts.push(LAYER_BLEND);
  }
  parts.push(SCENE, FINISH);
  return parts.join("\n");
}

/* ─────────────────────────── uniforms ─────────────────────────── */

export type UniformValue = number | number[];
export type UniformEntry = [name: string, value: UniformValue];

/** Uniforms that only change when the project changes. */
export function staticUniforms(p: ShaderProject): UniformEntry[] {
  const pal: number[] = [];
  for (let i = 0; i < 6; i++) pal.push(...hexToRgb(p.palette[Math.min(i, p.palette.length - 1)] ?? "#000000"));
  return [
    ["uK", [...p.knobs]],
    ["uK2", [...p.overlay.knobs]],
    ["uScale", p.scale],
    ["uWarp", p.warp],
    ["uWarpScale", p.warpScale],
    ["uSwirl", p.swirl],
    ["uSym", p.symmetry],
    ["uPix", p.pixelate],
    ["uSeed", p.seed],
    ["uPal[0]", pal],
    ["uPalN", Math.max(2, Math.min(6, p.palette.length))],
    ["uAccent", hexToRgb(p.accent)],
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
    ["uIStr", p.interactionStrength],
    ["uIRad", p.interactionRadius],
    ["uOp2", p.overlay.opacity],
    ["uScale2", p.overlay.scale],
    ["uSpd2", p.overlay.speed],
    ["uShift2", p.overlay.shift],
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
  };
}
