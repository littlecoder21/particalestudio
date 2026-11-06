import type { GeneratorDef, KnobDef } from "./generators";

/**
 * Second generator family: noise, vector fields, signed-distance shapes, mathematical
 * patterns and organic structures.
 *
 * They follow exactly the same contract as the original generators —
 * `vec4 FIELD(vec2 p, float t, vec4 K)` with the four knobs in K — and share code
 * through the GLSL library (see glslLib.ts): a generator lists the modules it needs in
 * `uses`, and the builder pastes each module once. Nothing here is a hard-coded
 * animation; every number that changes the look is a knob or a project colour.
 */

const k = (label: string, min: number, max: number, step: number, value: number): KnobDef =>
  ({ label, min, max, step, value });

export const EXTRA_GENERATORS: GeneratorDef[] = [
  /* ───────────────────────────── Noise ───────────────────────────── */
  {
    id: "valueNoise",
    name: "Value Noise",
    category: "Noise",
    description: "Soft, blocky-smooth clouds built from interpolated random values. Octaves add detail.",
    uses: ["noise"],
    knobs: [k("Scale", 0.5, 8, 0.05, 3), k("Octaves", 1, 6, 1, 4), k("Contrast", 0.4, 3, 0.05, 1.2), k("Flow", 0, 3, 0.05, 0.6)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 q = p * K.x * 1.6 + vec2(t * .06 * K.w, -t * .045 * K.w);
  float n = fbmV(q, int(K.y + .5), .5);
  float v = clamp((n - .5) * K.z * 2.4 + .5, 0., 1.);
  return vec4(v, smoothstep(.8, 1., v) * .3, v, 0.);
}`,
  },
  {
    id: "simplexNoise",
    name: "Simplex Noise",
    category: "Noise",
    description: "Smooth isotropic noise without the grid artefacts of value noise. Roughness sets how much fine detail survives.",
    uses: ["noise"],
    knobs: [k("Scale", 0.5, 8, 0.05, 2.5), k("Octaves", 1, 6, 1, 5), k("Roughness", 0.25, 0.8, 0.01, 0.5), k("Flow", 0, 3, 0.05, 0.7)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 q = p * K.x * 1.4 + vec2(t * .05 * K.w, t * .035 * K.w);
  float n = fbmS(q, int(K.y + .5), K.z);
  float v = clamp(.5 + n * 1.1, 0., 1.);
  return vec4(v, smoothstep(.8, 1., v) * .3, v, 0.);
}`,
  },
  {
    id: "ridgedNoise",
    name: "Ridged Noise",
    category: "Noise",
    description: "Sharp mountain-like crests from folded noise. Sharpness pushes the ridges up against the valleys.",
    uses: ["noise"],
    knobs: [k("Scale", 0.5, 6, 0.05, 2), k("Sharpness", 0.5, 4, 0.05, 1.5), k("Octaves", 1, 6, 1, 5), k("Flow", 0, 3, 0.05, 0.6)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 q = p * K.x * 1.5 + vec2(t * .04 * K.w, -t * .03 * K.w);
  float r = ridged(q, int(K.z + .5), .5);
  float v = clamp(pow(clamp(r * 1.45, 0., 1.), K.y), 0., 1.);
  return vec4(v, smoothstep(.65, 1., v) * .5, v, 0.);
}`,
  },
  {
    id: "cellular",
    name: "Cellular Noise",
    category: "Noise",
    description: "Worley noise. Style slides from cell distance through F2 and cell walls to flat cell colours.",
    uses: ["noise"],
    knobs: [k("Cells", 2, 24, 0.5, 8), k("Style", 0, 3, 0.05, 0), k("Jitter", 0, 1, 0.02, 1), k("Edge glow", 0, 1, 0.02, 0.5)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec3 w = worley(p * K.x, K.z, t * .45);
  float v0 = 1. - clamp(w.x * 1.1, 0., 1.);
  float v1 = clamp(w.y * .8, 0., 1.);
  float v2 = clamp((w.y - w.x) * 2.2, 0., 1.);
  float v3 = w.z;
  float s = K.y;
  float v = mix(mix(v0, v1, clamp(s, 0., 1.)), mix(v2, v3, clamp(s - 2., 0., 1.)), clamp(s - 1., 0., 1.));
  float edge = 1. - smoothstep(0., .08, w.y - w.x);
  return vec4(v, edge * K.w, v, 0.);
}`,
  },

  /* ───────────────────────────── Vector fields ───────────────────────────── */
  {
    id: "curlFlow",
    name: "Curl Flow",
    category: "Vector",
    description: "Smoke carried along a divergence-free curl-noise flow. Strength is how far the flow drags the pattern.",
    uses: ["vfield"],
    knobs: [k("Scale", 0.4, 4, 0.05, 1.6), k("Strength", 0, 3, 0.05, 1.2), k("Steps", 1, 6, 1, 3), k("Flow speed", 0, 3, 0.05, 1)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 q = p * K.x * 1.4;
  vec2 a = vfAdvect(q, t * K.w, K.y * .4, int(K.z + .5));
  float n = fbmS(a * 1.3 + 3.1, 4, .5);
  float v = clamp(.5 + n * 1.05, 0., 1.);
  return vec4(v, smoothstep(.8, 1., v) * .35, v, 0.);
}`,
  },
  {
    id: "flowLines",
    name: "Flow Lines",
    category: "Vector",
    description: "Line-integral convolution: white noise smeared along a curl-noise vector field, so the field direction becomes visible as hair-fine streamlines.",
    uses: ["vfield"],
    knobs: [k("Scale", 0.4, 3, 0.05, 1.2), k("Line length", 2, 10, 1, 6), k("Density", 30, 160, 1, 80), k("Flow speed", 0, 3, 0.05, 1)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  float h = 1.1 / K.z;
  int n = int(K.y + .5);
  float tt = t * K.w * .6;
  float acc = hash21(floor(p * K.z) + SEED);
  float wsum = 1., w2 = 1.;
  for (int dir = 0; dir < 2; dir++){
    float sg = dir == 0 ? 1. : -1.;
    vec2 x = p;
    for (int i = 0; i < 10; i++){
      if (i >= n) break;
      vec2 v = vfCurlFast(x * K.x * 1.3, tt);
      x += sg * v / (length(v) + 1e-3) * h;
      float w = 1. - float(i + 1) / float(n + 1);
      acc += w * hash21(floor(x * K.z) + SEED);
      wsum += w;
      w2 += w * w;
    }
  }
  float v = (acc / wsum - .5) * (wsum / sqrt(w2)) * 1.1 + .5;
  v = clamp(v, 0., 1.);
  return vec4(v, smoothstep(.85, 1., v) * .35, v, 0.);
}`,
  },
  {
    id: "vortexField",
    name: "Vortex Field",
    category: "Vector",
    description: "Several orbiting vortices twist a pattern around themselves. Neighbouring vortices spin in opposite directions; Twist below zero flips them all.",
    uses: [],
    knobs: [k("Vortices", 1, 6, 1, 3), k("Twist", -6, 6, 0.05, 3.2), k("Radius", 0.1, 1.2, 0.02, 0.45), k("Pattern", 0, 3, 1, 0)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 q = p;
  int n = int(K.x + .5);
  for (int i = 0; i < 6; i++){
    if (i >= n) break;
    float fi = float(i);
    vec2 c = vec2(sin(t * .21 * (.6 + hash11(fi + 2.)) + fi * 2.4) * .55,
                  cos(t * .17 * (.7 + hash11(fi + 6.)) + fi * 1.9) * .32);
    float sgn = mod(fi, 2.) < .5 ? 1. : -1.;
    vec2 d = q - c;
    float ang = sgn * K.y * exp(-dot(d, d) / (K.z * K.z * .25 + 1e-3));
    q = c + rot(ang) * d;
  }
  vec2 g = q * 7.;
  int pm = int(K.w + .5);
  float v;
  if (pm == 0){
    vec2 f = abs(fract(g) - .5);
    v = 1. - smoothstep(.02, .1, min(f.x, f.y));
  } else if (pm == 1){
    v = smoothstep(.3, .7, .5 + .5 * sin(g.x * PI));
  } else if (pm == 2){
    v = smoothstep(.3, .7, .5 + .5 * sin(length(q) * TAU * 3.5));
  } else {
    v = smoothstep(-.12, .12, sin(g.x * PI) * sin(g.y * PI));
  }
  return vec4(v, 0., v, 0.);
}`,
  },
  {
    id: "fluidDye",
    name: "Fluid Dye",
    category: "Fluid",
    description: "Stripes of dye stirred by a curl-noise flow, like marbling paper. Steps controls how many times the flow is folded in.",
    uses: ["vfield"],
    knobs: [k("Stripes", 3, 24, 0.5, 10), k("Turbulence", 0, 3, 0.05, 1.4), k("Steps", 1, 6, 1, 4), k("Flow speed", 0, 3, 0.05, 1)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 a = vfAdvect(p * 1.5, t * K.w, K.y * .4, int(K.z + .5));
  float s = sin(a.x * K.x + a.y * K.x * .35);
  float v = smoothstep(.12, .88, .5 + .5 * s);
  return vec4(v, pow(v, 8.) * .4, v, 0.);
}`,
  },

  /* ───────────────────────────── Geometry ───────────────────────────── */
  {
    id: "sdfShapes",
    name: "Shape Field",
    category: "Geometry",
    description: "One signed-distance shape, optionally tiled. Shape: 0 circle, 1 rounded box, 2 polygon, 3 star, 4 ring, 5 capsule. Detail sets corners, sides or points.",
    uses: ["sdf"],
    knobs: [k("Shape", 0, 5, 1, 3), k("Size", 0.1, 1, 0.01, 0.6), k("Detail", 3, 12, 1, 5), k("Repeat", 1, 8, 1, 1)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  float rep = max(floor(K.w + .5), 1.);
  float cell = 1. / rep;
  vec2 cid = opRepId(p, vec2(cell));
  vec2 q = opRep(p, vec2(cell));
  float hs = hash21(cid + SEED);
  float size = K.y * cell * .5;
  q = rot(t * .22 * (hs - .5) + (rep > 1.5 ? hs * TAU : 0.)) * q;
  int s = int(K.x + .5);
  float m = K.z / 12.;
  float sides = max(floor(K.z + .5), 3.);
  float d;
  if (s == 0) d = sdCircle(q, size);
  else if (s == 1) d = sdRoundBox(q, vec2(size), size * m * .9);
  else if (s == 2) d = sdPolygon(q, size, sides);
  else if (s == 3) d = sdStar(q, size, sides, .42);
  else if (s == 4) d = sdRing(q, size * .75, size * (.1 + .3 * m));
  else d = sdCapsule(q, vec2(-size * .5 * (.3 + m), 0.), vec2(size * .5 * (.3 + m), 0.), size * .45);
  vec3 sh = sdShade(d, size, t);
  return vec4(sh.x, sh.y, sh.z, 0.);
}`,
  },
  {
    id: "sdfBlend",
    name: "Smooth Union",
    category: "Geometry",
    description: "Orbiting circles and rounded boxes merged with a smooth union, with a roaming disc carved out by smooth subtraction.",
    uses: ["sdf"],
    knobs: [k("Smoothness", 0.02, 0.6, 0.01, 0.25), k("Shapes", 2, 6, 1, 4), k("Subtract", 0, 1, 0.02, 0.5), k("Motion", 0, 2, 0.05, 1)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  int n = int(K.y + .5);
  float d = 1e3;
  for (int i = 0; i < 6; i++){
    if (i >= n) break;
    float fi = float(i);
    float sp = K.w * (.5 + hash11(fi + 3.));
    vec2 c = vec2(sin(t * .35 * sp + fi * 2.1) * .5, cos(t * .29 * sp + fi * 1.7) * .26);
    float r = .12 + .08 * hash11(fi + 9.);
    float s = mod(fi, 2.) < .5
      ? sdCircle(p - c, r)
      : sdRoundBox(rot(t * .2 * sp) * (p - c), vec2(r * .9), r * .35);
    d = smin(d, s, K.x);
  }
  vec2 cc = vec2(cos(t * .23 * K.w) * .3, sin(t * .31 * K.w) * .18);
  float cut = mix(1e3, sdCircle(p - cc, .2 * K.z), step(.02, K.z));
  d = smax(d, -cut, K.x);
  vec3 sh = sdShade(d, .16, t);
  return vec4(sh.x, sh.y, sh.z, 0.);
}`,
  },

  /* ───────────────────────────── Math ───────────────────────────── */
  {
    id: "polarRose",
    name: "Polar Rose",
    category: "Math",
    description: "Rose-curve petals drawn in polar coordinates, repeated outward as concentric bands. Twist spirals the petals with radius.",
    uses: [],
    knobs: [k("Petals", 1, 12, 1, 5), k("Rings", 1, 12, 0.1, 6), k("Twist", -3, 3, 0.05, 0.8), k("Sharpness", 0, 1, 0.02, 0.5)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  float r = length(p) * 1.6 + 1e-4;
  float a = atan(p.y, p.x);
  float rose = abs(cos(K.x * .5 * a + K.z * r + t * .12));
  float d = r - .55 * rose - .1;
  float v = .5 + .5 * cos(d * K.y * 7.);
  v = mix(v, smoothstep(.35, .65, v), K.w);
  float fade = smoothstep(1.4, .2, r);
  return vec4(v * (.35 + .65 * fade), pow(v, 6.) * .5, v, 0.);
}`,
  },
  {
    id: "spiralArms",
    name: "Spiral Arms",
    category: "Math",
    description: "Colour arms winding out from the centre. Log mix morphs an Archimedean spiral (even spacing) into a logarithmic one (arms widen outward).",
    uses: [],
    knobs: [k("Arms", 1, 12, 1, 4), k("Tightness", 0, 8, 0.05, 2.5), k("Log mix", 0, 1, 0.02, 0.5), k("Sharpness", 0, 1, 0.02, 0.35)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  float r = length(p) + 1e-4;
  float a = atan(p.y, p.x);
  float f = mix(r * 7., log(r + .08) * 3.2, K.z);
  float ph = floor(K.x + .5) * a - K.y * f + t * .5;
  float s = .5 + .5 * cos(ph);
  float v = mix(s, smoothstep(.35, .65, s), K.w) * smoothstep(0., .12, r);
  return vec4(v, pow(s, 12.) * .5, v, 0.);
}`,
  },
  {
    id: "lissajous",
    name: "Lissajous Curve",
    category: "Math",
    description: "A glowing Lissajous figure, x = sin(a·u + phase), y = sin(b·u), brightening along its length. Whole-number frequency pairs give closed curves.",
    uses: ["sdf"],
    knobs: [k("X frequency", 1, 9, 1, 3), k("Y frequency", 1, 9, 1, 2), k("Phase speed", 0, 2, 0.02, 0.4), k("Thickness", 0.002, 0.04, 0.001, 0.012)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  float fa = floor(K.x + .5), fb = floor(K.y + .5);
  float ph = t * K.z;
  vec2 a0 = vec2(sin(ph), 0.) * vec2(.55, .34);
  float dmin = 1e3, umin = 0.;
  for (int i = 1; i <= 128; i++){
    float u = TAU * float(i) / 128.;
    vec2 a1 = vec2(sin(fa * u + ph) * .55, sin(fb * u) * .34);
    float d = sdSegment(p, a0, a1);
    if (d < dmin){ dmin = d; umin = float(i) / 128.; }
    a0 = a1;
  }
  float core = 1. - smoothstep(K.w * .5, K.w * .5 + fwidth(dmin) + .002, dmin);
  float glow = exp(-dmin / (K.w * 3.5));
  float v = clamp(core + glow * .55, 0., 1.) * (.4 + .6 * umin);
  return vec4(v, core * .6, v, 0.);
}`,
  },
  {
    id: "moire",
    name: "Moiré",
    category: "Math",
    description: "Two slightly different gratings multiplied together; the slow beat between them is the moiré. Type: 0 lines, 1 rings, 2 dots.",
    uses: [],
    knobs: [k("Frequency", 10, 200, 1, 60), k("Offset", 0.005, 0.4, 0.005, 0.06), k("Type", 0, 2, 1, 1), k("Drift", 0, 2, 0.02, 0.6)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  float f = K.x;
  float tp = t * K.w;
  int ty = int(K.z + .5);
  float g1, g2;
  if (ty == 0){
    vec2 a = rot(K.y * .5 + tp * .05) * p;
    vec2 b = rot(-K.y * .5) * p;
    g1 = sin(a.x * f);
    g2 = sin(b.x * f);
  } else if (ty == 1){
    vec2 o = vec2(cos(tp * .3), sin(tp * .3)) * K.y;
    g1 = sin(length(p - o) * f);
    g2 = sin(length(p + o) * f);
  } else {
    vec2 a = rot(K.y * .5 + tp * .05) * p;
    vec2 b = rot(-K.y * .5) * p;
    g1 = sin(a.x * f) * sin(a.y * f);
    g2 = sin(b.x * f) * sin(b.y * f);
  }
  float v = .5 + .5 * g1 * g2;
  return vec4(v, 0., v, 0.);
}`,
  },
  {
    id: "mandelbrot",
    name: "Mandelbrot Zoom",
    category: "Math",
    description: "The Mandelbrot set with smooth colouring. Zoom is a power of two and glides towards Seahorse Valley as it grows; Zoom drift breathes in and out.",
    uses: [],
    knobs: [k("Zoom", 0, 10, 0.05, 2.5), k("Detail", 30, 200, 1, 100), k("Colour cycles", 0.5, 6, 0.1, 2), k("Zoom drift", 0, 3, 0.05, 1.2)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  float zoom = min(K.x + K.w * sin(t * .12), 11.5);
  vec2 ctr = mix(vec2(-.5, 0.), vec2(-.743643887037, .131825904205), smoothstep(0., 4., zoom));
  vec2 c = ctr + p * 3.2 / exp2(zoom);
  vec2 z = vec2(0.);
  float it = 0., m = 0.;
  int maxIt = int(K.y);
  for (int i = 0; i < 200; i++){
    if (i >= maxIt) break;
    z = vec2(z.x * z.x - z.y * z.y, 2. * z.x * z.y) + c;
    m = dot(z, z);
    if (m > 256.) break;
    it += 1.;
  }
  float sm = it - log2(max(log2(max(m, 1.0001)), 1e-4)) + 4.;
  float inside = step(float(maxIt) - .5, it);
  float v = .5 + .5 * sin(sm * .22 * K.z);
  v = mix(v, 0., inside);
  return vec4(v, (1. - inside) * pow(v, 6.) * .35, v, inside);
}`,
  },
  {
    id: "kaliIfs",
    name: "Kaliset IFS",
    category: "Math",
    description: "An iterated function system: fold, invert and shift the plane over and over, and accumulate the orbit. Lace-like filaments in the style of fractal flames.",
    uses: [],
    knobs: [k("Fold", 0.4, 1.3, 0.005, 0.85), k("Iterations", 6, 24, 1, 14), k("Twist", 0, 2, 0.02, 0.3), k("Glow", 0.5, 8, 0.1, 3)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 z = p * 1.6;
  vec2 c = vec2(K.x + .05 * sin(t * .13), K.x * .8 + .04 * cos(t * .11));
  mat2 R = rot(K.z * .25);
  int n = int(K.y + .5);
  float acc = 0., prev = 0.;
  for (int i = 0; i < 24; i++){
    if (i >= n) break;
    z = abs(z) / (dot(z, z) + 1e-3) - c;
    z = R * z;
    float l = length(z);
    acc += exp(-K.w * abs(l - prev));
    prev = l;
  }
  float v = clamp(acc / float(n) * 1.4, 0., 1.);
  return vec4(v, pow(v, 4.) * .5, v, 0.);
}`,
  },

  /* ───────────────────────────── Organic ───────────────────────────── */
  {
    id: "turing",
    name: "Turing Waves",
    category: "Organic",
    description: "Spots, labyrinths and stripes from interfering waves, wobbled by noise. Directions: 1 stripes, 2 labyrinth, 3 hexagonal spots. An analytic look-alike, not a simulation.",
    uses: ["noise"],
    knobs: [k("Scale", 1, 14, 0.1, 6), k("Directions", 1, 6, 1, 3), k("Wobble", 0, 1.5, 0.02, 0.6), k("Sharpness", 0, 1, 0.02, 0.6)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 q = p * K.x;
  q += K.z * .6 * vec2(fbmS(p * 1.7 + t * .03, 3, .5), fbmS(p * 1.7 + 9. - t * .03, 3, .5));
  int n = int(K.y + .5);
  float s = 0.;
  for (int i = 0; i < 6; i++){
    if (i >= n) break;
    float an = PI * float(i) / float(n) + t * .02;
    s += cos(dot(q, vec2(cos(an), sin(an))) * PI + t * .2 * (1. + .3 * float(i)));
  }
  s /= float(n);
  float e = mix(1., .08, K.w);
  float v = smoothstep(-e, e, s - .1);
  return vec4(v, smoothstep(.1, 1., s) * .3, .5 + .5 * s, 0.);
}`,
  },
  {
    id: "membrane",
    name: "Organic Membrane",
    category: "Organic",
    description: "Wobbling cell walls, like stretched membranes between soap bubbles. Thickness is the wall width; Wobble warps the cells with noise.",
    uses: ["noise"],
    knobs: [k("Cells", 2, 12, 0.1, 5), k("Thickness", 0.02, 0.6, 0.01, 0.22), k("Wobble", 0, 1.5, 0.02, 0.7), k("Flow", 0, 2, 0.02, 0.8)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 q = p * K.x + K.z * .35 * vec2(fbmS(p * 2. + t * .05 * K.w, 3, .5), fbmS(p * 2. + 7. - t * .04 * K.w, 3, .5));
  vec3 w = worley(q, 1., t * .35 * K.w);
  float wall = 1. - smoothstep(0., K.y, w.y - w.x);
  float body = .3 + .45 * (1. - clamp(w.x * 1.2, 0., 1.));
  float v = mix(body, 1., wall);
  return vec4(v, wall * .55, .25 + .6 * wall + .2 * (1. - clamp(w.x, 0., 1.)), 0.);
}`,
  },
  {
    id: "veins",
    name: "Branching Veins",
    category: "Organic",
    description: "Thin networks that fork and fork again — leaf veins, river deltas, cracks. Each octave adds a finer layer of branches along noise zero-crossings.",
    uses: ["noise"],
    knobs: [k("Scale", 0.5, 6, 0.05, 2), k("Thickness", 0.01, 0.25, 0.005, 0.06), k("Branch levels", 1, 5, 1, 4), k("Flow", 0, 3, 0.05, 0.6)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 q = p * K.x * 1.3 + vec2(t * .03 * K.w, -t * .02 * K.w);
  float v = 0., th = K.y, amp = 1.;
  int n = int(K.z + .5);
  for (int i = 0; i < 5; i++){
    if (i >= n) break;
    float s = simplex2(q + float(i) * 11.3);
    v = max(v, (1. - smoothstep(0., th, abs(s))) * amp);
    q = NROT * q * 2.1 + vec2(3.3, -1.7);
    th *= .8;
    amp *= .78;
  }
  return vec4(v, v * .5, v, 0.);
}`,
  },
  {
    id: "cellGrowth",
    name: "Cell Growth",
    category: "Organic",
    description: "Cells with glowing nuclei and growth rings that ripple outward, each on its own schedule.",
    uses: ["noise"],
    knobs: [k("Cells", 2, 14, 0.1, 6), k("Rings", 1, 10, 0.1, 4), k("Growth speed", 0, 3, 0.05, 1), k("Nucleus", 0, 1, 0.02, 0.6)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec3 w = worley(p * K.x, .85, t * .4);
  float tm = t * K.z + w.z * TAU;
  float rings = .5 + .5 * cos(w.x * K.y * 9. - tm * 1.4);
  float nucleus = exp(-w.x * w.x * 40.);
  float wall = 1. - smoothstep(0., .1, w.y - w.x);
  float v = clamp(rings * (1. - w.x * .9) * .8 + nucleus * K.w + wall * .25, 0., 1.);
  return vec4(v, wall * .6, clamp(1. - w.x, 0., 1.), 0.);
}`,
  },
];
