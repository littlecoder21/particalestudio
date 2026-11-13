import type { LightBeam, LightBeamStyle } from "./types";
import { MAX_LIGHT_BEAMS } from "./types";
import { newId } from "./behaviors";
import { TAU, anyPerp, clamp } from "./math";

const styleCode: Record<LightBeamStyle, number> = { shaft: 0, fan: 1, arc: 2, helix: 3 };
const smooth = (value: number) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

export function makeLightBeam(over: Partial<LightBeam> = {}): LightBeam {
  const style = over.style ?? "shaft";
  const label = style[0].toUpperCase() + style.slice(1);
  return {
    id: newId("beam"),
    name: `${label} beam`,
    enabled: true,
    style,
    origin: [0, -0.75, 0],
    azimuth: 0,
    elevation: 70,
    length: 1.8,
    width: 0.12,
    spread: 0.8,
    bend: 0.18,
    twist: 1.5,
    intensity: 1.4,
    colorPosition: 0.8,
    fadeIn: 0.08,
    fadeOut: 0.24,
    speed: 0.5,
    motion: 0.65,
    seed: 1,
    ...over,
  };
}

export interface LightBeamFrame {
  count: number;
  originLength: Float32Array;
  directionWidth: Float32Array;
  profile: Float32Array;
  animation: Float32Array;
  tint: Float32Array;
  sideA: Float32Array;
  sideB: Float32Array;
}

export interface LightBeamSample {
  intensity: number;
  colorPosition: number;
  directionX: number;
  directionY: number;
  directionZ: number;
  speed: number;
}

export function createLightBeamFrame(): LightBeamFrame {
  const vectors = () => new Float32Array(MAX_LIGHT_BEAMS * 4);
  return {
    count: 0,
    originLength: vectors(),
    directionWidth: vectors(),
    profile: vectors(),
    animation: vectors(),
    tint: vectors(),
    sideA: vectors(),
    sideB: vectors(),
  };
}

export function updateLightBeamFrame(beams: LightBeam[], time: number, frame: LightBeamFrame) {
  frame.count = 0;
  frame.originLength.fill(0);
  frame.directionWidth.fill(0);
  frame.profile.fill(0);
  frame.animation.fill(0);
  frame.tint.fill(0);
  frame.sideA.fill(0);
  frame.sideB.fill(0);

  for (const beam of beams) {
    if (!beam.enabled || frame.count >= MAX_LIGHT_BEAMS) continue;
    const index = frame.count++, o = index * 4;
    const speed = clamp(beam.speed, 0, 8), motion = clamp(beam.motion, 0, 1);
    const phase = ((beam.seed * 12.9898) % TAU + TAU) % TAU;
    const azimuth = (beam.azimuth + Math.sin(time * speed * 0.11 + phase) * motion * 4) * Math.PI / 180;
    const elevation = clamp(beam.elevation + Math.cos(time * speed * 0.13 + phase) * motion * 2.5, -89, 89) * Math.PI / 180;
    const cp = Math.cos(elevation);
    const dx = Math.sin(azimuth) * cp, dy = Math.sin(elevation), dz = Math.cos(azimuth) * cp;
    const sideA: [number, number, number] = [0, 0, 0];
    anyPerp(dx, dy, dz, sideA);
    const sideB: [number, number, number] = [
      dy * sideA[2] - dz * sideA[1],
      dz * sideA[0] - dx * sideA[2],
      dx * sideA[1] - dy * sideA[0],
    ];
    const sway = motion * 0.035;
    const widthPulse = 1 + 0.12 * motion * Math.sin(time * speed * 0.21 + phase);
    const strengthPulse = 1 - 0.16 * motion * (0.5 + 0.5 * Math.sin(time * speed * 0.23 + phase));

    frame.originLength[o] = beam.origin[0] + sideA[0] * Math.sin(time * speed * 0.09 + phase) * sway + sideB[0] * Math.cos(time * speed * 0.1 + phase) * sway;
    frame.originLength[o + 1] = beam.origin[1] + sideA[1] * Math.sin(time * speed * 0.09 + phase) * sway + sideB[1] * Math.cos(time * speed * 0.1 + phase) * sway;
    frame.originLength[o + 2] = beam.origin[2] + sideA[2] * Math.sin(time * speed * 0.09 + phase) * sway + sideB[2] * Math.cos(time * speed * 0.1 + phase) * sway;
    frame.originLength[o + 3] = Math.max(0.05, beam.length);
    frame.directionWidth[o] = dx;
    frame.directionWidth[o + 1] = dy;
    frame.directionWidth[o + 2] = dz;
    frame.directionWidth[o + 3] = Math.max(0.002, beam.width) * widthPulse;
    frame.profile[o] = styleCode[beam.style];
    frame.profile[o + 1] = clamp(beam.spread, 0, 3);
    frame.profile[o + 2] = clamp(beam.bend, -2, 2);
    frame.profile[o + 3] = clamp(beam.intensity, 0, 2) * strengthPulse;
    frame.animation[o] = speed;
    frame.animation[o + 1] = phase;
    frame.animation[o + 2] = clamp(beam.fadeIn, 0.01, 1);
    frame.animation[o + 3] = clamp(beam.fadeOut, 0.01, 1);
    frame.tint[o] = clamp(beam.colorPosition, 0, 1);
    frame.tint[o + 1] = motion;
    frame.tint[o + 2] = clamp(beam.twist, -8, 8);
    frame.sideA.set(sideA, o);
    frame.sideB.set(sideB, o);
  }
}

export function sampleLightBeams(frame: LightBeamFrame, x: number, y: number, z: number, time: number, out: LightBeamSample) {
  let total = 0, colorSum = 0, dirX = 0, dirY = 0, dirZ = 0, speedSum = 0;
  for (let i = 0; i < frame.count; i++) {
    const o = i * 4;
    const ox = frame.originLength[o], oy = frame.originLength[o + 1], oz = frame.originLength[o + 2], length = frame.originLength[o + 3];
    const dx = frame.directionWidth[o], dy = frame.directionWidth[o + 1], dz = frame.directionWidth[o + 2];
    const rx = x - ox, ry = y - oy, rz = z - oz;
    const along = (rx * dx + ry * dy + rz * dz) / length;
    if (along < 0 || along > 1) continue;

    const speed = frame.animation[o], phase = frame.animation[o + 1], motion = frame.tint[o + 1];
    const style = frame.profile[o], spread = frame.profile[o + 1], bend = frame.profile[o + 2];
    const radialX = rx - dx * along * length, radialY = ry - dy * along * length, radialZ = rz - dz * along * length;
    const sideA = (radialX * frame.sideA[o] + radialY * frame.sideA[o + 1] + radialZ * frame.sideA[o + 2]);
    const sideB = (radialX * frame.sideB[o] + radialY * frame.sideB[o + 1] + radialZ * frame.sideB[o + 2]);
    let bendA = 0, bendB = 0;
    if (style === 2) {
      bendA = bend * Math.sin(Math.PI * along) + bend * 0.22 * motion * Math.sin(along * 7.5 + phase + time * speed * 0.31);
    } else if (style === 3) {
      const turn = along * TAU * Math.max(0.25, Math.abs(frame.tint[o + 2])) + phase + time * speed * 0.31;
      const radius = frame.directionWidth[o + 3] * (0.8 + spread * 0.12);
      bendA = Math.cos(turn) * radius;
      bendB = Math.sin(turn) * radius;
    }

    const widen = style === 1 ? spread : spread * 0.12;
    const swell = 1 + 0.38 * motion * Math.sin(along * 4.2 + phase + time * speed * 0.33);
    const radius = frame.directionWidth[o + 3] * (1 + widen * along) * swell;
    const q = Math.hypot(sideA - bendA, sideB - bendB) / Math.max(0.001, radius);
    if (q > 7.4) continue;
    const profile = 0.8 * Math.exp(-q * q) + 0.28 * Math.exp(-Math.pow(q / 2.8, 2));
    const fadeIn = frame.animation[o + 2], fadeOut = frame.animation[o + 3];
    const alongFade = smooth(along / fadeIn) * (1 - smooth((along - (1 - fadeOut)) / fadeOut));
    const wave = 0.84 + 0.16 * Math.sin(along * 9 - time * speed * 0.5 + phase) + 0.07 * Math.sin(along * 23 + q * 0.6 + time * speed * 1.6 + phase);
    const contribution = profile * alongFade * Math.max(0, wave) * frame.profile[o + 3];
    total += contribution;
    colorSum += contribution * frame.tint[o];
    dirX += contribution * dx;
    dirY += contribution * dy;
    dirZ += contribution * dz;
    speedSum += contribution * speed;
  }
  out.intensity = Math.min(3, total);
  out.colorPosition = total > 1e-6 ? colorSum / total : 0;
  const dirLength = Math.hypot(dirX, dirY, dirZ) || 1;
  out.directionX = dirX / dirLength;
  out.directionY = dirY / dirLength;
  out.directionZ = dirZ / dirLength;
  out.speed = total > 1e-6 ? speedSum / total : 0;
}
