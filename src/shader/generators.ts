import { EXTRA_GENERATORS } from "./generatorsExtra";
import type { GlslModuleId } from "./glslLib";
import type { GeneratorCategory, GeneratorId, Knobs } from "./types";

/**
 * Every generator is one GLSL function:
 *
 *   vec4 FIELD(vec2 p, float t, vec4 K)
 *
 *   p  centred, height-normalised coordinates (already warped / rotated / scaled)
 *   t  shader time in seconds
 *   K  the four generator knobs (see `knobs` below)
 *
 *   returns  x = value 0..1 (mapped through the palette)
 *            y = accent amount 0..1 (mixes towards the accent colour)
 *            z = height 0..1 (drives relief lighting)
 *            w = darkness 0..1 (multiplies the pixel towards black)
 *
 * Generators that colour themselves (black hole, mesh gradient) write `gCol`
 * and set `gHas = 1.` — the palette is then used as a set of colour roles.
 * The token FIELD is renamed per layer, so the same generator can be stacked.
 */
export interface KnobDef {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
}

export interface GeneratorDef {
  id: GeneratorId;
  name: string;
  category: GeneratorCategory;
  description: string;
  knobs: [KnobDef, KnobDef, KnobDef, KnobDef];
  /** Optional label for each palette stop when the generator uses colour roles. */
  roles?: string[];
  /** Shared GLSL modules (glslLib.ts) the code calls. The builder pastes each one once. */
  uses?: readonly GlslModuleId[];
  glsl: string;
}

const k = (label: string, min: number, max: number, step: number, value: number): KnobDef =>
  ({ label, min, max, step, value });

const gradientKnobs: GeneratorDef["knobs"] = [
  k("Scale", 0.4, 4, 0.05, 1.4),
  k("Angle", -3.14, 3.14, 0.02, 0),
  k("Distortion", 0, 2, 0.02, 0.5),
  k("Flow", 0, 2, 0.02, 0.5),
];

function gradientGenerator(
  id: GeneratorId,
  name: string,
  description: string,
  expression: string,
): GeneratorDef {
  return {
    id,
    name,
    category: "Gradient",
    description,
    knobs: gradientKnobs,
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 q = rot(K.y) * p * K.x;
  float drift = t * K.w * .12;
  vec2 flow = vec2(fbm(q + vec2(drift)), fbm(q + vec2(4.1, -drift))) - .5;
  q += flow * K.z * .55;
  float v = ${expression};
  return vec4(clamp(v, 0., 1.), smoothstep(.72, 1., v) * .3, v, 0.);
}`,
  };
}

const GRADIENT_GENERATORS: GeneratorDef[] = [
  gradientGenerator("linearGradient", "Linear Blend", "A clean directional ramp with gentle flowing distortion.", ".5 + q.x * .38"),
  gradientGenerator("radialGradient", "Radial Bloom", "A soft radial gradient that blooms out from the centre.", "1. - length(q) * .38"),
  gradientGenerator("conicGradient", "Conic Spectrum", "A smooth colour wheel swept around a central point.", "fract(atan(q.y, q.x) / TAU + 1.)"),
  gradientGenerator("diamondGradient", "Diamond Fade", "A crisp, adjustable diamond-shaped colour falloff.", "1. - (abs(q.x) + abs(q.y)) * .3"),
  gradientGenerator("spiralGradient", "Spiral Sweep", "A swirling gradient that coils outward from the centre.", "fract(atan(q.y, q.x) / TAU + length(q) * .22 + drift * .2)"),
  gradientGenerator("reflectedGradient", "Reflected Spectrum", "A mirrored linear gradient with a luminous central seam.", ".5 + abs(q.x) * .4"),
  gradientGenerator("sunsetGradient", "Sunset Horizon", "Layered sunset colours with a softly rippling horizon.", ".5 + q.y * .32 + sin(q.x * 2. + drift) * .12"),
  gradientGenerator("iridescentGradient", "Iridescent Film", "Pearlescent colour bands that shift like a thin oil film.", ".5 + .5 * sin(q.x * 2. + sin(q.y * 1.6) + drift)"),
  gradientGenerator("holographicGradient", "Holographic Foil", "Fine spectral bands with a subtle holographic shimmer.", ".5 + .22 * sin((q.x + q.y * .7) * 7. + drift * 2.) + .12 * sin(q.y * 14. - q.x * 3.)"),
  gradientGenerator("liquidGradient", "Liquid Marble", "Marbled ribbons made by warping a flowing noise field.", ".5 + fbm(q * 1.8 + flow * 2. + drift) * 1.25"),
  gradientGenerator("noiseGradient", "Noise Wash", "An organic colour wash with soft, evolving noise.", ".5 + fbm(q * 1.4 + vec2(drift)) * 1.5"),
  gradientGenerator("topographicGradient", "Topographic", "Flowing elevation bands inspired by illustrated terrain maps.", "fract((.5 + fbm(q * 1.2 + vec2(drift)) * 1.3) * 7.)"),
  gradientGenerator("prismaticGradient", "Prismatic Bands", "Radiating spectral waves with a colourful interference pattern.", ".5 + .5 * sin(length(q) * 3. - atan(q.y, q.x) * .7 + drift)"),
];

export const GENERATORS: GeneratorDef[] = [
  /* ───────────────────────────── Fluid ───────────────────────────── */
  {
    id: "fluid",
    name: "Liquid Smoke",
    category: "Fluid",
    description: "Domain-warped turbulence, like ink dropped into water.",
    knobs: [k("Turbulence", 0.2, 2.5, 0.05, 1.2), k("Detail", 0.5, 3, 0.05, 1), k("Density", 0.5, 2, 0.05, 1), k("Ridges", 0, 1, 0.05, 0)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 q = p * K.y * 2.2;
  vec2 w = vec2(fbm(q * .9 + vec2(0., t * .06)), fbm(q * .9 + vec2(5.2, 1.3) - t * .05));
  vec2 w2 = vec2(fbm(q + 2. * K.x * w + vec2(1.7, 9.2) + t * .04), fbm(q + 2. * K.x * w + vec2(8.3, 2.8) - t * .035));
  float n = fbm(q * 1.4 + 2.2 * K.x * w2);
  float v = clamp(.5 + n * 1.5 * K.z, 0., 1.);
  float rd = 1. - abs(n * 2.6);
  v = mix(v, clamp(rd * rd, 0., 1.), K.w);
  return vec4(v, smoothstep(.72, 1., v) * .22, v, 0.);
}`,
  },
  {
    id: "silk",
    name: "Silk Ribbons",
    category: "Fluid",
    description: "Flowing satin bands that fold and drift.",
    knobs: [k("Ribbons", 2, 24, 0.1, 8), k("Waviness", 0, 3, 0.05, 0.9), k("Sharpness", 0, 1, 0.02, 0.35), k("Angle", 0, 6.28, 0.05, 0.8)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 q = rot(K.w) * p;
  float w = fbm(q * 1.2 + vec2(t * .05, 0.)) * K.y;
  float w2 = fbm(q * 2.1 + w + 4. - t * .03) * .5 * K.y;
  float x = q.x * K.x + (w + w2) * 1.8;
  float s = sin(x + t * .15);
  float v = .5 + .5 * s;
  v = mix(v, v * v * (3. - 2. * v), K.z);
  return vec4(v, pow(v, 14.) * .5, .5 + .5 * s, 0.);
}`,
  },
  {
    id: "waves",
    name: "Ocean Swell",
    category: "Fluid",
    description: "Layered travelling waves with sharp crests and foam.",
    knobs: [k("Frequency", 1, 10, 0.1, 3), k("Choppy", 0, 1, 0.02, 0.5), k("Distortion", 0, 1.5, 0.02, 0.5), k("Wind", 0, 6.28, 0.05, 0.6)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 q = p + K.z * .16 * vec2(fbm(p * 1.4 + vec2(t * .05, 0.)), fbm(p * 1.4 + vec2(4., -t * .04)));
  float h = 0., amp = .5, fr = K.x * 4., norm = 0.;
  for (int i = 0; i < 5; i++){
    float fi = float(i);
    float an = K.w + (fi - 2.) * .42 + sin(fi * 5.3) * .15;
    vec2 dir = vec2(cos(an), sin(an));
    float ph = dot(q, dir) * fr + t * (.55 + fi * .12) + fi * 2.1;
    float s = sin(ph);
    float w = mix(s * .5 + .5, 1. - abs(s), K.y);
    w = mix(w, w * w, K.y * .5);
    h += amp * w;
    norm += amp;
    q += vec2(-dir.y, dir.x) * w * .02 * K.z;
    fr *= 1.5;
    amp *= .6;
  }
  float v = clamp((h / norm - .3) * 2.2, 0., 1.);
  return vec4(v, smoothstep(.8, 1., v) * .55, v, 0.);
}`,
  },
  {
    id: "lava",
    name: "Lava Lamp",
    category: "Fluid",
    description: "Metaballs that merge and split like slow molten wax.",
    knobs: [k("Blobs", 2, 8, 1, 5), k("Size", 0.4, 2, 0.02, 1), k("Gooeyness", 0, 1, 0.02, 0.5), k("Wobble", 0, 1, 0.02, 0.3)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  p += K.w * .05 * vec2(sin(p.y * 7. + t * .8), cos(p.x * 6. - t * .7));
  float s = 0.;
  int n = int(K.x + .5);
  for (int i = 0; i < 8; i++){
    if (i >= n) break;
    float fi = float(i);
    vec2 c = vec2(sin(t * .24 * (.6 + hash11(fi + 1.)) + fi * 2.1) * .55,
                  cos(t * .21 * (.7 + hash11(fi + 9.)) + fi * 1.7) * .34);
    float r = (.08 + .09 * hash11(fi + 3.)) * K.y;
    vec2 d = p - c;
    s += r * r / (dot(d, d) + 1e-4);
  }
  float v = smoothstep(1. - .6 * K.z, 1.4 + 2.2 * K.z, s);
  float u = (s - 1.) * 3.;
  float rim = exp(-u * u);
  return vec4(v, rim * .5, 1. - exp(-s * .8), 0.);
}`,
  },
  {
    id: "mesh",
    name: "Mesh Gradient",
    category: "Gradient",
    description: "Soft colour blobs blended into a living gradient. Palette stops are the blob colours.",
    knobs: [k("Blobs", 3, 8, 1, 5), k("Sharpness", 0.5, 3, 0.05, 1.2), k("Motion", 0, 2.5, 0.05, 1), k("Wobble", 0, 1, 0.02, 0.3)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  p += K.w * .14 * vec2(fbm(p * 2. + t * .08), fbm(p * 2. + 9. - t * .08));
  int n = int(K.x + .5);
  vec3 sum = vec3(0.);
  float den = 0.;
  for (int i = 0; i < 8; i++){
    if (i >= n) break;
    float fi = float(i);
    vec2 c = vec2(sin(t * .16 * K.z * (.7 + hash11(fi + 2.)) + fi * 2.4) * .62,
                  cos(t * .14 * K.z * (.6 + hash11(fi + 7.)) + fi * 1.9) * .38);
    vec2 d = p - c;
    float w = pow(1. / (dot(d, d) + .02), K.y);
    sum += w * palCycle(i);
    den += w;
  }
  gCol = sum / max(den, 1e-5);
  gHas = 1.;
  float lum = dot(gCol, vec3(.333));
  return vec4(lum, 0., lum, 0.);
}`,
  },
  {
    id: "caustics",
    name: "Pool Caustics",
    category: "Fluid",
    description: "Bright refracted light networks, as on a swimming-pool floor.",
    knobs: [k("Scale", 0.2, 3, 0.02, 0.7), k("Intensity", 0.2, 3, 0.05, 1), k("Sharpness", 3, 14, 0.2, 8), k("Iterations", 2, 5, 1, 5)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 q = p * K.x * TAU - 250.;
  vec2 i = q;
  float c = 1.;
  float inten = .005 / K.y;
  float tm = t * .5 + 23.;
  int n = int(K.w + .5);
  for (int k = 0; k < 5; k++){
    if (k >= n) break;
    float tt = tm * (1. - 3.5 / float(k + 1));
    i = q + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1. / length(vec2(q.x / (sin(i.x + tt) / inten), q.y / (cos(i.y + tt) / inten)));
  }
  c /= float(n);
  c = 1.17 - pow(max(c, 0.), 1.4);
  float v = clamp(pow(abs(c), K.z), 0., 1.);
  return vec4(v, pow(v, 3.) * .5, v, 0.);
}`,
  },

  /* ───────────────────────────── Cosmic ───────────────────────────── */
  {
    id: "blackhole",
    name: "Event Horizon",
    category: "Cosmic",
    description: "A fluid black hole with a lensing ring. Reacts to the pointer; hold to feed it.",
    roles: ["Warm edge", "Cool edge", "Mid glow", "Hot core", "Lens ring"],
    knobs: [k("Mass", 0.5, 1.8, 0.01, 1), k("Turbulence", 0.4, 1.8, 0.01, 1), k("Spin", 0, 2, 0.01, 1), k("Tilt", -1, 1.6, 0.01, 0.66)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 ctr = vec2(-.03, .02) + uMouse * .12;
  vec2 q = p - ctr;
  float rho = length(q);
  float R = .115 * K.x * (1. + .2 * uPress);
  float tilt = K.w + uMouse.x * .06;
  vec2 ax = rot(-tilt) * q;
  float a = ax.x;
  float b = ax.y - .07 * a * abs(a);
  float tw = 1.4 * exp(-rho * 3.2);
  float stretch = 1. + 2.2 * smoothstep(.12, .8, rho);
  float spin = K.z * (1. + 1.2 * uPress);
  float n = 0.;
  for (int j = 0; j < 2; j++){
    float ph = fract(t / 12. + .5 * float(j));
    float wgt = 1. - abs(2. * ph - 1.);
    float ang = tw + spin * .5 * (ph * 12.) / (rho * 3. + .7);
    vec2 s = rot(ang - tilt) * q;
    s.x = s.x / stretch + t * .05;
    s.y *= 1. + .8 * smoothstep(.2, .8, rho);
    vec2 w = vec2(fbm(s * 1.8 + vec2(0., t * .05)), fbm(s * 1.8 + vec2(5.2, 1.3) - t * .04));
    n += wgt * fbm(s * 3. + 2. * K.y * w);
  }
  n = clamp(.5 + n * 1.5, 0., 1.);

  float kk = smoothstep(-.3, .3, a);
  float wU = .22 + .2 * smoothstep(0., 1., a);
  float wL = .22 - .11 * smoothstep(0., .9, -a);
  float wd = mix(wL, wU, kk);
  float across = exp(-b * b / (wd * wd));
  float la = max(-a, 0.) / .8;
  float ra = pow(max(a, 0.) / 1.15, 1.6);
  float along = mix(exp(-la * la), exp(-ra), kk);
  float cr = rho / .34;
  float core = exp(-cr * cr);
  float dens = across * along * (.25 + 1.25 * n) + core * (.35 + .8 * n);
  float rb = (rho - R * 1.7) / (R * .9);
  dens += .3 * exp(-rb * rb) * (.4 + n);
  dens *= 1. + .25 * uPress;

  float hole = 1. - smoothstep(R * .6, R * 1.3, rho + (n - .5) * .07);
  dens *= 1. - .97 * hole;

  vec3 edge = mix(palAt(1), palAt(0), smoothstep(-.1, .5, a));
  float d = max(dens, 0.);
  vec3 col = mix(vec3(0.), edge, smoothstep(0., .4, d));
  col = mix(col, palAt(2), smoothstep(.35, .9, d));
  col = mix(col, palAt(3), smoothstep(.85, 1.5, d));
  col += palAt(0) * .2 * (.2 + n) * hole;

  float rr = rho + (n - .5) * .035;
  float ringW = .014 * K.x + .004;
  float rg = (rr - R * 1.42) / ringW;
  float ring = exp(-rg * rg);
  float dop = .3 + .7 * smoothstep(-.6, .9, dot(q / (rho + 1e-4), vec2(.85, -.5)));
  col += palAt(4) * ring * dop * (.9 + .9 * uPress) * (.55 + .9 * n);
  gCol = col;
  gHas = 1.;
  return vec4(d, 0., d, 0.);
}`,
  },
  {
    id: "nebula",
    name: "Deep Nebula",
    category: "Cosmic",
    description: "Layered gas clouds with dust lanes and twinkling stars.",
    knobs: [k("Cloud scale", 0.4, 3, 0.05, 1.2), k("Stars", 0, 1, 0.02, 0.5), k("Dust lanes", 0, 1, 0.02, 0.5), k("Drift", 0, 3, 0.05, 1)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 q = p * K.x * 2.;
  float d = t * .03 * K.w;
  float c = fbm(q + vec2(d, -d * .7));
  float c2 = fbm(q * 2. + c * 2. - vec2(d * 1.3, 0.) + 4.);
  float v = clamp(.5 + c * .9 + c2 * .55 - .08, 0., 1.);
  float lane = clamp(1. - abs(fbm(q * 1.3 + c * 1.5 + 9.) * 2.6), 0., 1.);
  lane *= lane;
  v = clamp(v * (1. - .4 * K.z * lane) + .22 * K.z * lane * v, 0., 1.);
  vec2 sp = p * (26. + 44. * K.y);
  vec2 gi = floor(sp), gf = fract(sp) - .5;
  float h = hash21(gi + SEED);
  vec2 off = (hash22(gi + 17.3 + SEED) - .5) * .6;
  float dd = length(gf - off);
  float tw = .6 + .4 * sin(t * 1.8 + h * 60.);
  float star = step(1. - K.y * .1, h) * smoothstep(.16, 0., dd) * tw;
  return vec4(v, star, v, 0.);
}`,
  },
  {
    id: "galaxy",
    name: "Spiral Galaxy",
    category: "Cosmic",
    description: "Logarithmic spiral arms around a bright core, dusted with stars.",
    knobs: [k("Arms", 1, 6, 1, 2), k("Twist", 0.5, 8, 0.1, 3), k("Core", 0.2, 2, 0.05, 1), k("Dust", 0, 1, 0.02, 0.6)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 q = rot(-t * .03) * p * 1.6;
  float r = length(q) + 1e-4;
  float a = atan(q.y, q.x);
  float arms = floor(K.x + .5);
  float ph = arms * a - K.y * 2. * log(r + .05) + t * .06;
  float arm = pow(.5 + .5 * cos(ph), 2.2);
  float fall = exp(-r * 1.9);
  float dn = fbm(q * 5. + arm);
  float body = arm * fall * (.55 + 1.3 * mix(.4, .5 + dn, K.w));
  float core = exp(-r * r / (K.z * K.z * .06 + 1e-3));
  float v = clamp(body * 1.2 + core, 0., 1.);
  vec2 sp = q * 38.;
  vec2 gi = floor(sp), gf = fract(sp) - .5;
  float h = hash21(gi + SEED);
  float star = step(.97 - .02 * arm, h) * smoothstep(.2, 0., length(gf)) * (.5 + .5 * sin(t * 2. + h * 50.));
  return vec4(v, clamp(core * .6 + star, 0., 1.), v, 0.);
}`,
  },
  {
    id: "tunnel",
    name: "Wormhole",
    category: "Cosmic",
    description: "An endless perspective tunnel of rings and spiralling arms.",
    knobs: [k("Rings", 1, 12, 0.1, 4), k("Twist", 0, 5, 0.1, 1.5), k("Arms", 1, 10, 1, 3), k("Fade", 0, 2, 0.05, 1)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  float r = length(p) + 1e-4;
  float a = atan(p.y, p.x);
  float depth = .28 / r;
  float rings = .5 + .5 * sin(depth * K.x * 3. - t * 1.2);
  float arms = .5 + .5 * sin(a * floor(K.z + .5) + depth * K.y * 2. - t * .6);
  vec2 cp = vec2(cos(a), sin(a)) * 1.3;
  float n = fbm(cp + vec2(depth * .6 - t * .15, depth * .4));
  float v = clamp(.35 * rings + .35 * arms + .5 * n + .15, 0., 1.);
  float fade = smoothstep(0., .08 + .3 * K.w, r);
  float streak = pow(rings * arms, 5.);
  return vec4(v * fade, streak * fade, v, 1. - fade);
}`,
  },
  {
    id: "fractal",
    name: "Julia Bloom",
    category: "Cosmic",
    description: "An animated Julia set with smooth, banding-free colouring.",
    knobs: [k("Shape", 0, 6.28, 0.02, 1.2), k("Radius", 0.55, 0.9, 0.005, 0.78), k("Colour cycles", 0.5, 6, 0.1, 2), k("Detail", 24, 96, 1, 64)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 z = p * 2.2;
  float ang = K.x + t * .06;
  vec2 c = K.y * vec2(cos(ang), sin(ang));
  float it = 0.;
  float m = 0.;
  int maxIt = int(K.w);
  for (int i = 0; i < 96; i++){
    if (i >= maxIt) break;
    z = vec2(z.x * z.x - z.y * z.y, 2. * z.x * z.y) + c;
    m = dot(z, z);
    if (m > 256.) break;
    it += 1.;
  }
  float sm = it - log2(max(log2(max(m, 1.0001)), 1e-4)) + 4.;
  float inside = step(float(maxIt) - .5, it);
  float v = .5 + .5 * sin(sm * .22 * K.z - t * .1);
  v = mix(v, 0., inside);
  return vec4(v, (1. - inside) * pow(v, 6.) * .35, v, inside);
}`,
  },
  {
    id: "stars",
    name: "Starfield",
    category: "Cosmic",
    description: "Three parallax layers of twinkling stars. Great as an overlay.",
    knobs: [k("Density", 8, 80, 1, 36), k("Size", 0.3, 2, 0.05, 1), k("Twinkle", 0, 1, 0.02, 0.6), k("Coverage", 0.02, 0.6, 0.01, 0.18)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  float v = 0.;
  for (int l = 0; l < 3; l++){
    float fl = float(l);
    vec2 sp = p * (K.x * (1. + fl * .8)) + vec2(fl * 17.3, fl * 5.1);
    vec2 gi = floor(sp), gf = fract(sp) - .5;
    float h = hash21(gi + SEED + fl * 3.7);
    vec2 off = (hash22(gi + SEED + 11.1 + fl) - .5) * .7;
    float d = length(gf - off);
    float tw = 1. - K.z * .5 * (.5 + .5 * sin(t * (1.5 + h * 3.) + h * 60.));
    float on = step(1. - K.w, h);
    float rad = (.06 + .12 * hash21(gi + 5.5 + SEED)) * K.y;
    float star = on * (1. - smoothstep(0., rad, d));
    v += star * star * tw * (1. - .25 * fl);
  }
  v = clamp(v, 0., 1.);
  return vec4(v, smoothstep(.6, 1., v), v, 0.);
}`,
  },

  /* ───────────────────────────── Light ───────────────────────────── */
  {
    id: "aurora",
    name: "Aurora Curtains",
    category: "Gradient",
    description: "Vertical curtains of light that ripple and flicker.",
    knobs: [k("Height", 0.4, 2.5, 0.05, 1), k("Ray density", 0, 1, 0.02, 0.5), k("Waviness", 0, 2, 0.05, 1), k("Gain", 0.5, 2, 0.05, 1)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  float acc = 0.;
  for (int i = 0; i < 4; i++){
    float fi = float(i);
    float x = p.x * (1. + .22 * fi) + fi * 4.7;
    float base = -.14 + .1 * fi + K.z * .3 * fbm(vec2(x * .8 + t * .05, fi * 3.3 + t * .04));
    float d = p.y - base;
    float body = smoothstep(-.015, .035, d) * exp(-max(d, 0.) / (.2 * K.x));
    float rays = clamp(.55 + .6 * gnoise(vec2(x * (4. + K.y * 14.), t * .22 + fi * 2.)), 0., 1.);
    rays *= rays;
    acc += body * (.5 + .9 * rays) * (1. - .18 * fi);
  }
  float v = clamp(acc * .55 * K.w, 0., 1.);
  return vec4(v, 0., v, 0.);
}`,
  },
  {
    id: "plasma",
    name: "Plasma",
    category: "Light",
    description: "Interfering sine fields, bent by a gentle distortion.",
    knobs: [k("Frequency", 1, 10, 0.1, 3.5), k("Complexity", 0, 2, 0.05, 0.8), k("Distortion", 0, 2.5, 0.05, 1), k("Sharpen", 0, 1, 0.05, 0)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 q = p * K.x;
  q += K.z * vec2(sin(q.y * .9 + t * .5), cos(q.x * .8 - t * .4));
  float v = sin(q.x + t * .6) + sin(q.y * 1.3 + t * .45) + sin((q.x + q.y) * .7 + t * .3);
  v += sin(length(q) * 1.2 - t * .8);
  v += K.y * sin(q.x * q.y * .35 + t * .2);
  v = clamp(.5 + v * .14, 0., 1.);
  v = mix(v, smoothstep(.2, .8, v), K.w);
  return vec4(v, 0., v, 0.);
}`,
  },
  {
    id: "rays",
    name: "Sunburst",
    category: "Light",
    description: "Noisy light shafts radiating from a glowing source.",
    knobs: [k("Ray count", 3, 60, 1, 16), k("Falloff", 0.1, 3, 0.05, 1), k("Contrast", 0, 1, 0.02, 0.5), k("Source X", -0.6, 0.6, 0.02, 0)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 d = p - vec2(K.w, .2);
  float r = length(d) + 1e-4;
  float a = atan(d.y, d.x);
  vec2 ca = vec2(cos(a), sin(a)) * K.x * .28;
  float n = fbm(ca + vec2(t * .12, 0.));
  float ray = pow(clamp(.5 + n * 1.7, 0., 1.), 1. + K.z * 3.5);
  float fall = exp(-r * K.y * 1.6);
  float core = exp(-r * r * 50.);
  float v = clamp(ray * fall * 1.3 + core, 0., 1.);
  return vec4(v, core, v, 0.);
}`,
  },
  {
    id: "electric",
    name: "Plasma Arcs",
    category: "Light",
    description: "Glowing tendrils that crawl along noise contours.",
    knobs: [k("Scale", 0.5, 6, 0.05, 2), k("Thickness", 0.01, 0.2, 0.005, 0.05), k("Speed", 0, 3, 0.05, 1.2), k("Branching", 0, 1, 0.02, 0.6)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 q = p * K.x * 1.5;
  float n1 = fbm(q + vec2(0., t * .22 * K.z));
  float n2 = fbm(q * 2. + vec2(5., -t * .3 * K.z) + n1 * 1.5);
  float a1 = exp(-abs(n1) / K.y);
  float a2 = exp(-abs(n2) / (K.y * 1.2));
  float v = clamp(a1 + K.w * a2 * .8, 0., 1.);
  v *= .85 + .15 * sin(t * 6. + n1 * 20.);
  return vec4(v, pow(v, 3.) * .7, v, 0.);
}`,
  },
  {
    id: "bokeh",
    name: "Bokeh Lights",
    category: "Light",
    description: "Out-of-focus discs drifting in two depth layers.",
    knobs: [k("Density", 1.5, 10, 0.1, 4), k("Size", 0.2, 1.4, 0.02, 0.8), k("Drift", 0, 3, 0.05, 1), k("Softness", 0, 1, 0.02, 0.5)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  float v = 0.;
  for (int l = 0; l < 2; l++){
    float fl = float(l);
    vec2 q = p * K.x * (1. + fl * .8) + vec2(t * .05 * K.z * (1. + fl), t * .035 * K.z + fl * 3.1);
    vec2 ip = floor(q), fp = fract(q);
    for (int j = -1; j <= 1; j++){
      for (int i = -1; i <= 1; i++){
        vec2 g = vec2(float(i), float(j));
        vec2 id = ip + g + fl * 31.7;
        vec2 o = .5 + (hash22(id + SEED) - .5) * .7;
        float rr = (.1 + .2 * hash21(id + SEED + 3.3)) * K.y;
        float b = .35 + .65 * hash21(id + SEED + 9.1);
        float d = length(g + o - fp);
        float edge = mix(.03, .85, K.w);
        float disc = 1. - smoothstep(rr * (1. - edge), rr, d);
        float ring = (1. - K.w) * smoothstep(rr * .75, rr, d) * (1. - smoothstep(rr, rr * 1.08, d));
        v += (disc * .45 + ring * .5) * b * (1. - .35 * fl);
      }
    }
  }
  v = clamp(v, 0., 1.);
  return vec4(v, 0., v, 0.);
}`,
  },

  /* ───────────────────────────── Pattern ───────────────────────────── */
  {
    id: "voronoi",
    name: "Cells",
    category: "Pattern",
    description: "Animated Voronoi cells with glowing, adjustable edges.",
    knobs: [k("Cells", 2, 16, 0.5, 7), k("Edge width", 0, 1, 0.02, 0.35), k("Jitter", 0, 1, 0.02, 1), k("Shading", 0, 1, 0.02, 0.5)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 q = p * K.x;
  vec2 ip = floor(q), fp = fract(q);
  float d1 = 8., d2 = 8., id = 0.;
  for (int j = -1; j <= 1; j++){
    for (int i = -1; i <= 1; i++){
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(ip + g + SEED);
      o = mix(vec2(.5), .5 + .5 * sin(t * .45 + TAU * o), K.z);
      vec2 r = g + o - fp;
      float d = dot(r, r);
      if (d < d1){ d2 = d1; d1 = d; id = hash21(ip + g + SEED + 7.3); }
      else if (d < d2){ d2 = d; }
    }
  }
  float e = sqrt(d2) - sqrt(d1);
  float edge = 1. - smoothstep(0., .02 + K.y * .22, e);
  float v = mix(id, clamp(1. - sqrt(d1) * .9, 0., 1.), K.w);
  return vec4(v, edge * .9, smoothstep(0., .3, e), 0.);
}`,
  },
  {
    id: "facets",
    name: "Low-Poly Facets",
    category: "Pattern",
    description: "A triangulated mosaic that shimmers facet by facet.",
    knobs: [k("Density", 1, 12, 0.2, 4), k("Randomness", 0, 1, 0.02, 0.6), k("Edge glow", 0, 1, 0.02, 0.35), k("Shimmer", 0, 1, 0.02, 0.4)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 q = p * K.x;
  vec2 sk = q + (q.x + q.y) * .366025404;
  vec2 ip = floor(sk), f = fract(sk);
  float tri = step(f.y, f.x);
  float id = hash21(ip + tri * 17.3 + SEED);
  float base = clamp(.5 + .9 * fbm(p * 1.1 + t * .03), 0., 1.);
  float v = mix(base, id, K.y);
  v += K.w * .12 * sin(t * .9 + id * TAU);
  float e = min(abs(f.x - f.y) * .7071, min(min(f.x, 1. - f.x), min(f.y, 1. - f.y)));
  float line = 1. - smoothstep(0., .015 + .03 * K.z, e);
  return vec4(clamp(v, 0., 1.), line * K.z, id, 0.);
}`,
  },
  {
    id: "hex",
    name: "Hex Pulse",
    category: "Pattern",
    description: "A honeycomb grid with pulses travelling across the cells.",
    knobs: [k("Cell size", 2, 16, 0.2, 6), k("Border", 0, 1, 0.02, 0.2), k("Pulse speed", 0, 3, 0.05, 1), k("Randomness", 0, 1, 0.02, 0.7)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 uv = p * K.x;
  vec2 r = vec2(1., 1.7320508);
  vec2 h = r * .5;
  vec2 a = mod(uv, r) - h;
  vec2 b = mod(uv - h, r) - h;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  vec2 id = floor((uv - gv) * 100. + .5) / 100.;
  float edge = .5 - hexDist(gv);
  float hsh = hash21(id + SEED);
  float wave = .5 + .5 * sin(t * K.z * 1.2 + hsh * TAU);
  float ripple = .5 + .5 * sin(length(id) * .8 - t * K.z);
  float v = mix(ripple, wave, K.w);
  float border = 1. - smoothstep(0., .02 + K.y * .12, edge);
  float inner = smoothstep(0., .18, edge);
  return vec4(v * mix(1., inner * .6 + .4, K.y), border * .9, v, 0.);
}`,
  },
  {
    id: "lattice",
    name: "Warped Lattice",
    category: "Pattern",
    description: "A glowing grid bent by noise, with a pulse wave running through it.",
    knobs: [k("Cells", 2, 30, 0.5, 12), k("Line width", 0.01, 0.3, 0.005, 0.08), k("Warp", 0, 1.5, 0.02, 0.6), k("Pulse", 0, 1, 0.02, 0.5)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 q = p + K.z * .07 * vec2(sin(p.y * 6. + t * .8) + fbm(p * 3. + t * .1), cos(p.x * 5. - t * .7) + fbm(p * 3. + 5. - t * .1));
  vec2 g = q * K.x;
  vec2 d = abs(fract(g + .5) - .5);
  float aa = fwidth(g.x) * 1.2 + 1e-4;
  float lw = K.y * .5;
  float lx = 1. - smoothstep(lw - aa, lw + aa, d.x);
  float ly = 1. - smoothstep(lw - aa, lw + aa, d.y);
  float line = max(lx, ly);
  float node = lx * ly;
  float pulse = .5 + .5 * sin(length(p) * 9. - t * 2.2);
  float env = exp(-dot(p, p) * 1.2);
  float v = clamp(line * (.55 + .45 * mix(1., pulse, K.w)) * (.35 + .65 * env) + node * .4, 0., 1.);
  return vec4(v, node * .8, v, 0.);
}`,
  },
  {
    id: "contours",
    name: "Contour Bands",
    category: "Pattern",
    description: "Topographic or agate-like bands that follow a flowing height field.",
    knobs: [k("Scale", 0.3, 3, 0.05, 1.1), k("Bands", 3, 48, 1, 16), k("Line width", 0, 1, 0.02, 0.35), k("Fill", 0, 1, 0.02, 0.35)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 q = p * K.x * 1.6;
  float n = fbm(q + 2. * fbm(q * .6 - t * .02) + vec2(t * .03, -t * .02));
  float h = clamp(.5 + n * 1.35, 0., 1.);
  float b = h * K.y;
  float f = fract(b);
  float dEdge = min(f, 1. - f);
  float aa = fwidth(b) + 1e-4;
  float line = 1. - smoothstep(0., K.z * .35 + aa, dEdge);
  float v = mix(floor(b) / K.y, h, K.w);
  return vec4(clamp(v, 0., 1.), line, h, 0.);
}`,
  },
  {
    id: "interference",
    name: "Wave Interference",
    category: "Pattern",
    description: "Ripples from orbiting sources that add up to moiré patterns.",
    knobs: [k("Sources", 2, 6, 1, 3), k("Frequency", 6, 60, 1, 26), k("Wave speed", 0, 3, 0.05, 1), k("Orbit", 0, 0.9, 0.02, 0.45)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  float s = 0.;
  int n = int(K.x + .5);
  for (int i = 0; i < 6; i++){
    if (i >= n) break;
    float fi = float(i);
    float an = fi * TAU / float(n) + t * .1 * (1. + .25 * fi);
    vec2 c = vec2(cos(an), sin(an)) * K.w * (.55 + .25 * sin(t * .2 + fi));
    float d = length(p - c);
    s += sin(d * K.y - t * K.z * 2.) / (1. + d * 1.5);
  }
  float v = clamp(.5 + s / float(n) * 1.25, 0., 1.);
  return vec4(v, pow(v, 10.) * .6, v, 0.);
}`,
  },
  {
    id: "halftone",
    name: "Halftone Bloom",
    category: "Pattern",
    description: "A print-style dot screen whose dot size follows a flowing field.",
    knobs: [k("Dot grid", 10, 90, 1, 40), k("Dot size", 0.3, 1.2, 0.02, 0.9), k("Angle", 0, 1.57, 0.02, 0.5), k("Field scale", 0.4, 3, 0.05, 1.2)],
    glsl: /* glsl */`
vec4 FIELD(vec2 p, float t, vec4 K){
  vec2 g = rot(K.z) * p * K.x;
  vec2 cid = floor(g) + .5;
  vec2 pc = rot(-K.z) * (cid / K.x);
  float n = clamp(.5 + fbm(pc * K.w + vec2(t * .04, t * .02)) * 1.3, 0., 1.);
  vec2 gf = g - cid;
  float rad = n * .62 * K.y;
  float dd = length(gf);
  float aa = fwidth(dd) + 1e-3;
  float m = 1. - smoothstep(rad - aa, rad + aa, dd);
  float v = m * (.25 + .75 * n);
  return vec4(v, 0., n, 0.);
}`,
  },
  ...GRADIENT_GENERATORS,
  ...EXTRA_GENERATORS,
];

export const GENERATOR_MAP: Record<GeneratorId, GeneratorDef> =
  Object.fromEntries(GENERATORS.map((g) => [g.id, g])) as Record<GeneratorId, GeneratorDef>;

export function defaultKnobs(id: GeneratorId): Knobs {
  const [a, b, c, d] = GENERATOR_MAP[id].knobs;
  return [a.value, b.value, c.value, d.value];
}

export function clampKnobs(id: GeneratorId, values: readonly number[]): Knobs {
  const defs = GENERATOR_MAP[id].knobs;
  const pick = (i: 0 | 1 | 2 | 3): number => {
    const def = defs[i];
    const v = values[i];
    return typeof v === "number" && Number.isFinite(v) ? Math.min(def.max, Math.max(def.min, v)) : def.value;
  };
  return [pick(0), pick(1), pick(2), pick(3)];
}
