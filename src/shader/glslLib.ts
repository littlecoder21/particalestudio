/**
 * Shared GLSL library.
 *
 * Generators never carry their own copy of a noise function or a distance
 * function. They declare which modules they need (`GeneratorDef.uses`) and the
 * builder pastes each required module exactly once, dependencies first, right
 * after the common helpers and before the generator functions. A shader that
 * does not use a module does not pay for it.
 *
 * Everything here relies on the helpers from builder.ts' COMMON block
 * (`SEED`, `TAU`, `PI`, `rot`, `hash21`, `hash22`) and uses no uniforms except
 * through those macros, so the code also works in the exported shaders.
 *
 * NOTE: generator code is passed through a token rename (the word FIELD becomes a
 * per-layer function name). Library code is not, but keep the word out of it anyway.
 */

export type GlslModuleId = "noise" | "sdf" | "vfield";

interface GlslModule {
  requires: readonly GlslModuleId[];
  code: string;
}

/* ───────────────────────── noise ───────────────────────── */

const NOISE = /* glsl */`
/* ── noise library ──
   vnoise    value noise                      0..1
   simplex2  2D simplex noise                 about -1..1
   fbmV      value-noise fbm                  0..1
   fbmS      simplex fbm                      about -1..1
   ridged    ridged multifractal              0..1
   worley    cellular noise                   x = F1, y = F2, z = cell id (0..1) */
float vnoise(vec2 p){
  p += SEED;
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash21(i), hash21(i + vec2(1., 0.)), u.x),
             mix(hash21(i + vec2(0., 1.)), hash21(i + vec2(1., 1.)), u.x), u.y);
}

float simplex2(vec2 p){
  p += SEED;
  const float F2 = .366025404;
  const float G2 = .211324865;
  vec2 i = floor(p + (p.x + p.y) * F2);
  vec2 a = p - i + (i.x + i.y) * G2;
  float m = step(a.y, a.x);
  vec2 o = vec2(m, 1. - m);
  vec2 b = a - o + G2;
  vec2 c = a - 1. + 2. * G2;
  vec3 h = max(.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.);
  vec3 g = vec3(dot(a, hash22(i) * 2. - 1.),
                dot(b, hash22(i + o) * 2. - 1.),
                dot(c, hash22(i + 1.) * 2. - 1.));
  vec3 h2 = h * h;
  return 52. * dot(h2 * h2, g);
}

const mat2 NROT = mat2(.8, .6, -.6, .8);

float fbmV(vec2 p, int oct, float gain){
  float v = 0., a = .5, s = 0.;
  for (int i = 0; i < 6; i++){
    if (i >= oct) break;
    v += a * vnoise(p);
    s += a;
    p = NROT * p * 2.02 + 7.1;
    a *= gain;
  }
  return v / max(s, 1e-4);
}

float fbmS(vec2 p, int oct, float gain){
  float v = 0., a = .5, s = 0.;
  for (int i = 0; i < 6; i++){
    if (i >= oct) break;
    v += a * simplex2(p);
    s += a;
    p = NROT * p * 2.02 + 7.1;
    a *= gain;
  }
  return v / max(s, 1e-4);
}

float ridged(vec2 p, int oct, float gain){
  float v = 0., a = .5, s = 0., w = 1.;
  for (int i = 0; i < 6; i++){
    if (i >= oct) break;
    float n = 1. - abs(simplex2(p));
    n *= n;
    v += a * n * w;
    w = clamp(n * 2., 0., 1.);
    s += a;
    p = NROT * p * 2.02 + 7.1;
    a *= gain;
  }
  return v / max(s, 1e-4);
}

/* jit 0 = regular grid, 1 = fully animated random points */
vec3 worley(vec2 p, float jit, float t){
  vec2 ip = floor(p), fp = fract(p);
  float d1 = 8., d2 = 8., id = 0.;
  for (int j = -1; j <= 1; j++){
    for (int i = -1; i <= 1; i++){
      vec2 g = vec2(float(i), float(j));
      vec2 h = hash22(ip + g + SEED);
      vec2 o = mix(vec2(.5), .5 + .5 * sin(t + TAU * h), jit);
      vec2 r = g + o - fp;
      float d = dot(r, r);
      if (d < d1){ d2 = d1; d1 = d; id = hash21(ip + g + SEED + 7.3); }
      else if (d < d2){ d2 = d; }
    }
  }
  return vec3(sqrt(d1), sqrt(d2), id);
}
`;

/* ───────────────────────── signed distance fields ───────────────────────── */

const SDF = /* glsl */`
/* ── 2D signed distance functions (negative inside) and operators ── */
float sdCircle(vec2 p, float r){ return length(p) - r; }

float sdBox(vec2 p, vec2 b){
  vec2 d = abs(p) - b;
  return length(max(d, 0.)) + min(max(d.x, d.y), 0.);
}

float sdRoundBox(vec2 p, vec2 b, float r){ return sdBox(p, max(b - r, 0.)) - r; }

/* regular n-gon with circumradius r, one vertex pointing along +x */
float sdPolygon(vec2 p, float r, float n){
  float an = PI / n;
  float a = mod(atan(p.y, p.x), 2. * an) - an;
  return length(p) * cos(a) - r * cos(an);
}

/* n-pointed star, outer radius r, inner = inner radius as a fraction of r */
float sdStar(vec2 p, float r, float n, float inner){
  float an = PI / n;
  float a = abs(mod(atan(p.y, p.x) + an, 2. * an) - an);
  vec2 q = length(p) * vec2(cos(a), sin(a));
  vec2 tip = vec2(r, 0.);
  vec2 dip = r * inner * vec2(cos(an), sin(an));
  vec2 e = dip - tip;
  vec2 w = q - tip;
  vec2 d = w - e * clamp(dot(w, e) / dot(e, e), 0., 1.);
  float side = e.x * w.y - e.y * w.x;
  return length(d) * (side > 0. ? -1. : 1.);
}

float sdRing(vec2 p, float r, float w){ return abs(length(p) - r) - w; }

float sdSegment(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0., 1.);
  return length(pa - ba * h);
}

float sdCapsule(vec2 p, vec2 a, vec2 b, float r){ return sdSegment(p, a, b) - r; }

/* polynomial smooth minimum / maximum: k is the blend width */
float smin(float a, float b, float k){
  float h = max(k - abs(a - b), 0.) / max(k, 1e-4);
  return min(a, b) - h * h * k * .25;
}
float smax(float a, float b, float k){ return -smin(-a, -b, k); }

/* infinite repetition with cell size c; the cell centre sits on the origin */
vec2 opRep(vec2 p, vec2 c){ return mod(p + .5 * c, c) - .5 * c; }
vec2 opRepId(vec2 p, vec2 c){ return floor((p + .5 * c) / c); }

/* the standard look of a distance: filled inside, rippling contour bands outside.
   unit is the size of the shape. Returns (value, outline accent, height) in the generator contract. */
vec3 sdShade(float d, float unit, float t){
  float nd = d / max(unit, 1e-3);
  float aa = fwidth(nd) + 1e-4;
  float inside = 1. - smoothstep(-aa, aa, nd);
  float bands = .5 + .5 * cos(nd * 9. - t * .9);
  float outer = bands * exp(-max(nd, 0.) * 1.1) * .8;
  float inner = .55 + .45 * clamp(-nd, 0., 1.);
  float line = 1. - smoothstep(0., .06 + aa, abs(nd));
  return vec3(mix(outer, inner, inside), line, inside * (.4 + .6 * clamp(-nd, 0., 1.)));
}
`;

/* ───────────────────────── vector fields ───────────────────────── */

const VFIELD = /* glsl */`
/* ── vector-field library ──
   A field is any function  vec2 f(vec2 p, float t).  These helpers build the common
   ones and move coordinates along them, so any generator can bend any other. */

/* stream function of a slowly evolving two-octave simplex field */
float vfPotential(vec2 p, float t){
  return simplex2(p + vec2(t * .07, -t * .05)) + .5 * simplex2(p * 2.1 + vec2(-t * .06, t * .08) + 3.7);
}

/* divergence-free "curl noise" velocity (central differences) */
vec2 vfCurl(vec2 p, float t){
  const float e = .03;
  float dx = vfPotential(p + vec2(e, 0.), t) - vfPotential(p - vec2(e, 0.), t);
  float dy = vfPotential(p + vec2(0., e), t) - vfPotential(p - vec2(0., e), t);
  return vec2(dy, -dx) / (2. * e);
}

/* cheaper single-octave curl for tight loops (forward differences) */
vec2 vfCurlFast(vec2 p, float t){
  const float e = .04;
  vec2 q = p + vec2(t * .07, -t * .05);
  float c = simplex2(q);
  return vec2(simplex2(q + vec2(0., e)) - c, -(simplex2(q + vec2(e, 0.)) - c)) / e;
}

/* rotational field around c — strength < 0 spins the other way, radius is the core size */
vec2 vfVortex(vec2 p, vec2 c, float strength, float radius){
  vec2 d = p - c;
  return vec2(-d.y, d.x) * strength / (dot(d, d) + radius * radius);
}

/* radial field towards c — strength < 0 pushes away */
vec2 vfSink(vec2 p, vec2 c, float strength, float radius){
  vec2 d = p - c;
  return -d * strength / (dot(d, d) + radius * radius);
}

/* walk p backwards along the curl field: the result is where the fluid at p came from */
vec2 vfAdvect(vec2 p, float t, float strength, int steps){
  float h = strength / max(float(steps), 1.);
  for (int i = 0; i < 6; i++){
    if (i >= steps) break;
    p -= vfCurl(p, t) * h;
  }
  return p;
}
`;

export const GLSL_MODULES: Record<GlslModuleId, GlslModule> = {
  noise: { requires: [], code: NOISE },
  sdf: { requires: [], code: SDF },
  vfield: { requires: ["noise"], code: VFIELD },
};

/** The GLSL for the requested modules and everything they depend on, each once, dependencies first. */
export function glslModules(ids: Iterable<GlslModuleId>): string {
  const seen = new Set<GlslModuleId>();
  const out: string[] = [];
  const visit = (id: GlslModuleId): void => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const dep of GLSL_MODULES[id].requires) visit(dep);
    out.push(GLSL_MODULES[id].code);
  };
  for (const id of ids) visit(id);
  return out.join("\n");
}
