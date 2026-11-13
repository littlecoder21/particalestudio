/* ============================================================
   Dust in the Light

   How it works
   ------------
   1. Tens of thousands of tiny dust grains drift slowly through a
      shared, gentle air-current field (neighbours move together,
      like real air) with a little random wobble on top. Grains are
      clustered into soft clouds with thin voids between them.
   2. The light exists only as a formula and is NEVER drawn. Each
      beam is a living ribbon of light that keeps changing shape:
        - it slides and rotates as its two ends wander
        - it bends into arcs and S-curves
        - it pinches and swells along its length
        - it fans wider and narrows back into a shaft
        - it breathes brighter and dimmer, with slow waves of
          brightness travelling down it
   3. The formula is baked into a small light-map that is refreshed
      about 30 times a second, so every grain can look up "how much
      beam is on me right now?" in a single read.
   4. Outside the light a grain is a dim, barely-there speck. Inside
      it the grain catches light, and a few grains (high reflectivity,
      tumbling so their face turns toward us) flash brighter.
   5. Brightness eases toward its target, so a grain fades into the
      light as the beam sweeps over it and fades out as it leaves.

   Rendering: grains are written straight into a pixel buffer with
   sub-pixel accuracy (smooth motion, very cheap), and only the
   brightest glints get a soft glow sprite on top.

   Tuning: edit CONFIG below. Press "B" to show a faint guide of the
   invisible beams (or add ?beam to the URL).
   ============================================================ */

(() => {
  'use strict';

  /* ---------- CONFIG ---------- */
  const CONFIG = {
    density: 1 / 4.6,      // grains per CSS pixel of screen area
    minCount: 12000,
    maxCount: 58000,
    maxDPR: 2,
    speed: 1,              // global drift speed multiplier
    intensity: 1,          // how strongly the light catches the dust
    nearBeamShare: 0.15,   // share of dust that starts near a beam at load
    pointerRadius: 130,    // px, how far a finger / cursor stirs the air

    // How much the light changes shape.
    // amount: 0 = frozen, 1 = default, 1.6 = dramatic.  speed: how fast it evolves.
    morph: { amount: 1, speed: 1 },

    // Resting position of each beam, in screen fractions (0..1, can go off-screen).
    // "from" is the bright end, "to" is where it fades out. The morph moves them around these.
    // width is a fraction of the shorter screen side; widen makes it fan out along its length.
    beams: [
      { from: [-0.07, 0.03], to: [0.44, 0.62], width: 0.038, widen: 0.9, fadeIn: 0.16, fadeOut: 0.42, strength: 1.0 },
      { from: [1.12, 0.66],  to: [0.66, 0.40], width: 0.032, widen: 0.8, fadeIn: 0.14, fadeOut: 0.5,  strength: 0.9 }
    ]
  };

  /* ---------- Setup ---------- */
  const canvas = document.getElementById('dust');
  const ctx = canvas.getContext('2d', { alpha: false });
  const TAU = Math.PI * 2;
  const PAD = 20;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let showBeamGuide = new URLSearchParams(location.search).has('beam');
  let W = 0, H = 0, cw = 0, ch = 0, dpr = 1, N = 0, cloudScale = 1;
  let beams = [];

  // Pixel buffer the dust is written into
  let img, bytes, buf32;

  // Particle data (typed arrays keep tens of thousands of grains cheap)
  let px, py, pz, pvx, pvy, pix, piy, pph, psp, prf, pam, pcur, psd, psoft, spriteList;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  };
  // Stable pseudo-random phase for (beam, slot): gives every beam its own rhythm
  const phase = (idx, k) => ((idx + 1) * 12.9898 + k * 78.233) % TAU;

  /* ---------- Soft sprites for glints and out-of-focus motes ---------- */
  function makeSprite(size, stops) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const r = size / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    stops.forEach(([o, a]) => grad.addColorStop(o, `rgba(238,240,246,${a})`));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }
  // Tiny bright core with a very faint halo: a speck catching light
  const glowSprite = makeSprite(64, [[0, 1], [0.1, 0.85], [0.26, 0.22], [0.55, 0.04], [1, 0]]);
  // Larger, soft, lens-blurred mote with a hint of rim
  const softSprite = makeSprite(96, [[0, 0.5], [0.6, 0.55], [0.86, 0.7], [1, 0]]);

  /* ---------- Beams: living shapes made of maths, never drawn ---------- */
  function buildBeams() {
    beams = CONFIG.beams.map((cfg, idx) => ({
      cfg, idx,
      ox: 0, oy: 0, dx: 1, dy: 0, nx: 0, ny: 1, len: 1,
      sigma: 1, widen: 1, strength: 1, reach: 1,
      bendA: 0, bendB: 0, bendPhase: 0, swellPhase: 0, waveT: 0,
      m: CONFIG.morph.amount,
      fadeIn: cfg.fadeIn, fadeOut: cfg.fadeOut
    }));
  }

  // Advance every beam to time t: this is where the light changes shape.
  function updateBeams(t) {
    const vmin = Math.min(W, H);
    const m = CONFIG.morph.amount;
    const ts = t * CONFIG.morph.speed * (reduceMotion ? 0.25 : 1);

    for (let n = 0; n < beams.length; n++) {
      const b = beams[n], c = b.cfg, i = b.idx;

      // 1. Both ends wander, so the beam slides and rotates
      const fx = (c.from[0] + 0.08 * m * Math.sin(ts * 0.13 + phase(i, 1))) * W;
      const fy = (c.from[1] + 0.08 * m * Math.cos(ts * 0.11 + phase(i, 2))) * H;
      const ex = (c.to[0]   + 0.12 * m * Math.sin(ts * 0.09 + phase(i, 3))) * W;
      const ey = (c.to[1]   + 0.12 * m * Math.cos(ts * 0.15 + phase(i, 4))) * H;
      const ddx = ex - fx, ddy = ey - fy;
      const len = Math.hypot(ddx, ddy) || 1;
      b.ox = fx; b.oy = fy; b.len = len;
      b.dx = ddx / len; b.dy = ddy / len;
      b.nx = -b.dy; b.ny = b.dx;

      // 2. Width breathes and the beam fans out wider, then narrows back into a shaft
      b.sigma = c.width * vmin * (1 + 0.4 * m * Math.sin(ts * 0.21 + phase(i, 5)));
      b.widen = Math.max(0.1, c.widen * (1 + 0.7 * m * Math.sin(ts * 0.17 + phase(i, 6))));

      // 3. Overall brightness breathes
      b.strength = c.strength * (1 - 0.16 * m * (0.5 + 0.5 * Math.sin(ts * 0.23 + phase(i, 7))));

      // 4. The ribbon bends: a swinging arc plus a wave travelling along it
      b.bendA = 0.12 * m * vmin * Math.sin(ts * 0.19 + phase(i, 8));
      b.bendB = 0.05 * m * vmin;
      b.bendPhase = ts * 0.31 + phase(i, 9);

      // 5. Pinch and swell along its length, and brightness waves running down it
      b.swellPhase = ts * 0.33 + phase(i, 10);
      b.waveT = ts * 0.5 + phase(i, 11);

      b.m = m;
      b.reach = b.sigma * (1 + b.widen) * 1.45 * 7.4 + Math.abs(b.bendA) + b.bendB;
    }
  }

  // How much light falls at (x, y)? 0 = none, ~1 = full beam core.
  function beamAt(x, y) {
    let total = 0;
    for (let k = 0; k < beams.length; k++) {
      const b = beams[k];
      const rx = x - b.ox, ry = y - b.oy;
      const u = (rx * b.dx + ry * b.dy) / b.len;          // 0..1 along the beam
      if (u < 0 || u > 1) continue;
      let s = rx * b.nx + ry * b.ny;                       // distance from the straight axis
      if (s > b.reach || s < -b.reach) continue;           // cheap early reject
      s -= b.bendA * Math.sin(Math.PI * u) + b.bendB * Math.sin(u * 7.5 + b.bendPhase); // follow the bend
      const swell = 1 + 0.38 * b.m * Math.sin(u * 4.2 + b.swellPhase);
      const sig = b.sigma * (1 + b.widen * u) * swell;     // beam spreads as it travels, and pinches / swells
      const q = s / sig;
      if (q * q > 53) continue;                            // far outside: no light
      const q2 = q / 2.8;
      const profile = 0.8 * Math.exp(-q * q) + 0.28 * Math.exp(-q2 * q2); // hot core + wide soft halo
      const along = smooth(u / b.fadeIn) * (1 - smooth((u - (1 - b.fadeOut)) / b.fadeOut));
      const wave = 0.84 + 0.16 * Math.sin(u * 9 - b.waveT) + 0.07 * Math.sin(u * 23 + q * 0.6 + b.waveT * 1.6);
      total += profile * along * wave * b.strength;
    }
    return total > 1.2 ? 1.2 : total;
  }

  /* ---------- Light map: the beams baked, refreshed ~30x a second ---------- */
  let CELL = 4;
  let invCell = 1 / CELL;
  let lutW = 0, lutH = 0, lut;

  function buildLut() {
    CELL = Math.max(3, Math.round(Math.min(W, H) / 90));   // cell size scales with the screen
    invCell = 1 / CELL;
    lutW = Math.ceil(W / CELL) + 3;
    lutH = Math.ceil(H / CELL) + 3;
    lut = new Float32Array(lutW * lutH);
    fillLut();
  }

  function fillLut() {
    for (let gy = 0; gy < lutH; gy++) {
      const y = gy * CELL;
      const row = gy * lutW;
      for (let gx = 0; gx < lutW; gx++) lut[row + gx] = beamAt(gx * CELL, y);
    }
  }

  function lightAt(x, y) {
    let fx = x * invCell, fy = y * invCell;
    if (fx < 0) fx = 0; else if (fx > lutW - 1.001) fx = lutW - 1.001;
    if (fy < 0) fy = 0; else if (fy > lutH - 1.001) fy = lutH - 1.001;
    const ix = fx | 0, iy = fy | 0;
    const tx = fx - ix, ty = fy - iy;
    const o = iy * lutW + ix;
    return (lut[o] * (1 - tx) + lut[o + 1] * tx) * (1 - ty) +
           (lut[o + lutW] * (1 - tx) + lut[o + lutW + 1] * tx) * ty;
  }

  /* ---------- Air-current field on a coarse grid (cheap, shared) ---------- */
  const FC = 48;
  const invFC = 1 / FC;
  const FLOW = 9;          // px/s strength of the air-current field
  let fgW = 0, fgH = 0, fgx, fgy;

  function buildFlowGrid() {
    fgW = Math.ceil((W + PAD * 2) / FC) + 3;
    fgH = Math.ceil((H + PAD * 2) / FC) + 3;
    fgx = new Float32Array(fgW * fgH);
    fgy = new Float32Array(fgW * fgH);
  }

  function updateFlow(t) {
    for (let gy = 0; gy < fgH; gy++) {
      const y = gy * FC - PAD;
      for (let gx = 0; gx < fgW; gx++) {
        const x = gx * FC - PAD;
        const o = gy * fgW + gx;
        fgx[o] = (Math.sin(y * 0.0041 + x * 0.0019 + t * 0.21) + 0.5 * Math.sin(y * 0.0113 - x * 0.0047 - t * 0.13)) * FLOW;
        fgy[o] = (Math.cos(x * 0.0037 - y * 0.0023 - t * 0.17) + 0.5 * Math.cos(x * 0.0097 + y * 0.0051 + t * 0.11)) * FLOW;
      }
    }
  }

  /* ---------- Dust clouds: where grains like to gather ---------- */
  function cloud(x, y) {
    const xs = x * cloudScale, ys = y * cloudScale;
    const a = Math.sin(xs * 0.0125 + 1.7) * Math.sin(ys * 0.0092 + 0.6);
    const b = Math.sin((xs * 0.7 + ys) * 0.0058 + 2.3);
    const c = Math.sin(xs * 0.031 - ys * 0.027 + 0.9);
    return clamp(0.5 + 0.34 * a + 0.26 * b + 0.12 * c, 0, 1);
  }

  /* ---------- Particles ---------- */
  function spawn(i) {
    let x = 0, y = 0;

    // Uniform scatter, thinned by the cloud map so there are denser veils and thin voids
    for (let t = 0; t < 7; t++) {
      x = Math.random() * W;
      y = Math.random() * H;
      const c = cloud(x, y);
      if (Math.random() < 0.18 + 0.82 * Math.pow(c, 1.4)) break;
    }

    // A little extra dust where the light starts. The light moves on, the dust stays: it is only air.
    if (beams.length && Math.random() < CONFIG.nearBeamShare) {
      const b = beams[(Math.random() * beams.length) | 0];
      const u = Math.random();
      const s = gauss() * 2.4 * b.sigma * (1 + b.widen * u);
      const cx = b.ox + b.dx * b.len * u + b.nx * s;
      const cy = b.oy + b.dy * b.len * u + b.ny * s;
      if (cx > -10 && cx < W + 10 && cy > -10 && cy < H + 10) { x = cx; y = cy; }
    }

    const z = Math.pow(Math.random(), 1.7);          // depth: most dust is far away and tiny
    const soft = Math.random() < 0.0014;             // a rare near, out-of-focus mote

    px[i] = x;
    py[i] = y;
    pz[i] = z;
    pvx[i] = (Math.random() - 0.5) * 8;
    pvy[i] = (Math.random() - 0.5) * 8;
    pix[i] = 0;
    piy[i] = 0;
    pph[i] = Math.random() * TAU;                    // tumbling phase
    psp[i] = 0.7 + Math.random() * 2.5;              // tumbling speed
    prf[i] = soft ? 0.6 + Math.random() * 0.4 : Math.pow(Math.random(), 2.0); // few grains are very reflective
    pam[i] = soft ? 0.06 : (0.09 + 0.26 * z) * (0.65 + Math.random() * 0.7);  // dim ambient visibility
    psd[i] = Math.random() * TAU;
    psoft[i] = soft ? 1 : 0;
    pcur[i] = pam[i];
  }

  function allocate(count) {
    N = count;
    px = new Float32Array(N); py = new Float32Array(N); pz = new Float32Array(N);
    pvx = new Float32Array(N); pvy = new Float32Array(N);
    pix = new Float32Array(N); piy = new Float32Array(N);
    pph = new Float32Array(N); psp = new Float32Array(N);
    prf = new Float32Array(N); pam = new Float32Array(N);
    pcur = new Float32Array(N); psd = new Float32Array(N);
    psoft = new Uint8Array(N);
    spriteList = new Int32Array(N);
    for (let i = 0; i < N; i++) spawn(i);
  }

  function resize() {
    const nW = canvas.clientWidth || window.innerWidth;
    const nH = canvas.clientHeight || window.innerHeight;
    const oW = W, oH = H;
    W = nW; H = nH;
    dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDPR);
    cw = Math.round(W * dpr);
    ch = Math.round(H * dpr);
    canvas.width = cw;
    canvas.height = ch;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    img = ctx.createImageData(cw, ch);
    bytes = img.data;
    buf32 = new Uint32Array(bytes.buffer);

    cloudScale = 360 / Math.min(W, H);
    buildBeams();
    updateBeams(time);
    buildLut();
    buildFlowGrid();

    const wanted = clamp(Math.round(W * H * CONFIG.density), CONFIG.minCount, CONFIG.maxCount);
    if (!px || Math.abs(wanted - N) / N > 0.25) {
      allocate(wanted);
    } else if (oW && oH) {
      // Small resize (e.g. mobile address bar): keep the dust where it is, proportionally
      const sx = W / oW, sy = H / oH;
      for (let i = 0; i < N; i++) { px[i] *= sx; py[i] *= sy; }
    }
  }

  /* ---------- Pointer / touch: gently stirs the air ---------- */
  const ptr = { x: -9999, y: -9999, vx: 0, vy: 0, active: false, t: 0 };

  window.addEventListener('pointermove', (e) => {
    const now = performance.now();
    if (ptr.active) {
      const dt = Math.max(8, now - ptr.t) / 1000;
      ptr.vx += ((e.clientX - ptr.x) / dt - ptr.vx) * 0.35;
      ptr.vy += ((e.clientY - ptr.y) / dt - ptr.vy) * 0.35;
    }
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.t = now; ptr.active = true;
  }, { passive: true });

  const endPointer = () => { ptr.active = false; ptr.x = ptr.y = -9999; };
  window.addEventListener('pointerleave', endPointer);
  window.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') endPointer(); });
  window.addEventListener('pointercancel', endPointer);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'b' || e.key === 'B') showBeamGuide = !showBeamGuide;
  });

  /* ---------- Main loop ---------- */
  const GX = -2.2;         // slow global drift (px/s)
  const GY = -3.4;
  const MAX_SPRITES = 3500;
  const BLACK = 0xff000000;

  let last = performance.now();
  let time = 0;
  let frameNo = 0;
  let started = false;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    time += dt;

    const k = 1 - Math.exp(-dt * 8);       // brightness easing
    const decay = Math.exp(-dt * 1.6);     // stirred-air impulse fades out
    const sp = CONFIG.speed * (reduceMotion ? 0.2 : 1);
    const gain = CONFIG.intensity;
    const stride = cw * 4;

    updateFlow(time);

    // The light changes shape: refresh the light-map every other frame
    if ((frameNo++ & 1) === 0) {
      updateBeams(time);
      fillLut();
    }

    ptr.vx *= Math.exp(-dt * 4);
    ptr.vy *= Math.exp(-dt * 4);
    const pSpeed = Math.hypot(ptr.vx, ptr.vy);
    const pOn = ptr.active && pSpeed > 12;
    const R = CONFIG.pointerRadius, R2 = R * R;
    const radial = Math.min(1, pSpeed / 300) * 7;

    buf32.fill(BLACK);
    let nSprites = 0;

    for (let i = 0; i < N; i++) {
      let x = px[i], y = py[i];
      const z = pz[i];
      const ds = 0.35 + 0.9 * z;            // nearer dust drifts a little faster (parallax)

      // Shared air-current field (bilinear read from the coarse grid): neighbours move together
      const gxp = (x + PAD) * invFC, gyp = (y + PAD) * invFC;
      const g0 = gxp | 0, g1 = gyp | 0;
      const tx = gxp - g0, ty = gyp - g1;
      const go = g1 * fgW + g0;
      const fxv = (fgx[go] * (1 - tx) + fgx[go + 1] * tx) * (1 - ty) +
                  (fgx[go + fgW] * (1 - tx) + fgx[go + fgW + 1] * tx) * ty;
      const fyv = (fgy[go] * (1 - tx) + fgy[go + 1] * tx) * (1 - ty) +
                  (fgy[go + fgW] * (1 - tx) + fgy[go + fgW + 1] * tx) * ty;

      let ixv = pix[i], iyv = piy[i];
      if (pOn) {
        const ddx = x - ptr.x, ddy = y - ptr.y;
        if (ddx < R && ddx > -R && ddy < R && ddy > -R) {
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < R2) {
            const d = Math.sqrt(d2) + 0.001;
            const f = 1 - d / R;
            const ff = f * f * (0.3 + z);
            ixv = clamp(ixv + (ptr.vx * 0.02 + (ddx / d) * radial) * ff, -60, 60);
            iyv = clamp(iyv + (ptr.vy * 0.02 + (ddy / d) * radial) * ff, -60, 60);
          }
        }
      }
      ixv *= decay; iyv *= decay;
      pix[i] = ixv; piy[i] = iyv;

      x += ((pvx[i] + GX + fxv + ixv) * dt + (Math.random() - 0.5) * 9 * dt) * ds * sp;
      y += ((pvy[i] + GY + fyv + iyv) * dt + (Math.random() - 0.5) * 9 * dt) * ds * sp;

      if (x < -PAD) x += W + PAD * 2; else if (x > W + PAD) x -= W + PAD * 2;
      if (y < -PAD) y += H + PAD * 2; else if (y > H + PAD) y -= H + PAD * 2;
      px[i] = x; py[i] = y;

      // Light: how much beam is on this grain right now, and how well it reflects
      const bi = lightAt(x, y) * gain;
      let target = pam[i];
      let glinting = false;
      if (bi > 0.004) {
        pph[i] += psp[i] * dt * (reduceMotion ? 0.3 : 1);
        const g = 0.5 + 0.5 * Math.sin(pph[i]);
        const glint = g * g * g * g * g * g;               // sharp, occasional flash as it tumbles
        target += bi * (0.52 + 0.9 * prf[i] * (0.2 + 0.8 * glint));
        glinting = true;
      }
      if (target > 1) target = 1;

      const cur = pcur[i] + (target - pcur[i]) * k;        // fade into / out of the light smoothly
      pcur[i] = cur;

      if (cur < 0.012) continue;

      if ((psoft[i] === 1 || (glinting && cur > 0.55)) && nSprites < MAX_SPRITES) {
        spriteList[nSprites++] = i;                        // bright or blurred: soft sprite on top
        if (psoft[i] === 1) continue;
      }

      // Write the grain into the pixel buffer with sub-pixel accuracy
      const fx = x * dpr, fy = y * dpr;
      if (fx < 0 || fy < 0) continue;
      const ix = fx | 0, iy = fy | 0;
      if (ix >= cw - 1 || iy >= ch - 1) continue;
      let wx = fx - ix, wy = fy - iy;
      wx = wx * wx * (3 - 2 * wx);                         // bias toward the nearest pixel: crisper specks
      wy = wy * wy * (3 - 2 * wy);

      const A = cur * 255 * (0.95 + 0.5 * z) * 1.15;
      const w00 = (1 - wx) * (1 - wy) * A;
      const w10 = wx * (1 - wy) * A;
      const w01 = (1 - wx) * wy * A;
      const w11 = wx * wy * A;
      const o = (iy * cw + ix) << 2;
      const o2 = o + stride;

      bytes[o]      += w00 * 0.91; bytes[o + 1]  += w00 * 0.92; bytes[o + 2]  += w00 * 0.96;
      bytes[o + 4]  += w10 * 0.91; bytes[o + 5]  += w10 * 0.92; bytes[o + 6]  += w10 * 0.96;
      bytes[o2]     += w01 * 0.91; bytes[o2 + 1] += w01 * 0.92; bytes[o2 + 2] += w01 * 0.96;
      bytes[o2 + 4] += w11 * 0.91; bytes[o2 + 5] += w11 * 0.92; bytes[o2 + 6] += w11 * 0.96;
    }

    ctx.putImageData(img, 0, 0);

    // Glints and blurred motes
    for (let n = 0; n < nSprites; n++) {
      const i = spriteList[n];
      const cur = pcur[i];
      const x = px[i], y = py[i];
      if (psoft[i] === 1) {
        const D = 9 + 8 * pz[i];
        ctx.globalAlpha = Math.min(0.4, cur * 0.5);
        ctx.drawImage(softSprite, x - D * 0.5, y - D * 0.5, D, D);
      } else {
        const D = 2.6 + 2.6 * pz[i] + 4 * Math.max(0, cur - 0.55);
        ctx.globalAlpha = cur > 1 ? 1 : cur;
        ctx.drawImage(glowSprite, x - D * 0.5, y - D * 0.5, D, D);
      }
    }
    ctx.globalAlpha = 1;

    if (showBeamGuide) drawBeamGuides();

    if (!started) { started = true; canvas.classList.add('is-ready'); }
    requestAnimationFrame(frame);
  }

  // Debug only: traces the centre line of each invisible beam
  function drawBeamGuides() {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const b of beams) {
      ctx.beginPath();
      for (let i = 0; i <= 48; i++) {
        const u = i / 48;
        const off = b.bendA * Math.sin(Math.PI * u) + b.bendB * Math.sin(u * 7.5 + b.bendPhase);
        const x = b.ox + b.dx * b.len * u + b.nx * off;
        const y = b.oy + b.dy * b.len * u + b.ny * off;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(255,190,60,0.14)';
      ctx.lineWidth = b.sigma * 2.2;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,190,60,0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  /* ---------- Go ---------- */
  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });
})();
