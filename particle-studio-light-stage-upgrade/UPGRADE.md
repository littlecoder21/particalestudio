# Light Stage + Particle FX upgrade

## Install (about a minute)
1. Unzip into the root of your repo. Say yes to overwrite `src/studio3d/lightBeams.ts`.
2. `node tools/apply-light-stage-upgrade.mjs --check` (dry run), then `node tools/apply-light-stage-upgrade.mjs`
   It edits `types.ts`, `project.ts`, `renderer.ts` and `Studio3D.tsx`. Every edit is an exact-text anchor. If any anchor
   does not match, nothing is written. Running it twice is safe. Undo with `git checkout -- <those four files>`.
3. `npm run build` then `npm run test:3d`

## What you get
**Dust & beams tab**
- Light looks: one tap sets formation, beams, light response, particle FX and colours (Dust in the light, Cathedral rays, Laser sweep, Spotlight on a shape).
- Light response: Reveal by light (particles outside the beams fade into the dark), visibility outside light, far-particle dimming, beam gain, lit threshold.
- Glints: amount, sharpness, speed, flash boost, lit-particle growth, "few very reflective", surface-normal response.
- Light colour: colour + mix, and a preview-only beam guide overlay (axis + cross-sections; never in PNG).
- Per beam: core sharpness, halo strength and size, shimmer, own colour + mix.

**New "Particle FX" tab**
- Simulation speed (slow-mo to 3x), size distribution curve, min/max pixel size.
- Soft motes (share, size, brightness), opacity variation, colour variation.
- Twinkle (amount, speed, sharpness), depth of field (blur, brightness compensation).
- Air motion: per-particle wobble and a shared air-current flow field.

## Compatibility
- Defaults reproduce the old look. Checked in a real WebGL2 context: pixel-identical to the old shader with and without beams.
- Project schema 3 -> 4. Older projects and older beams load with defaults. New fields are optional.
- WebGL only. The Canvas 2D fallback ignores the new effects.
- Stage and FX apply to preview, PNG and video. **The Code/HTML export is not updated yet** (see below).

## Verified here
- 8 unit tests (`tests/studio3d/lightStage.test.ts`) and 23 shader checks in headless Chromium/SwiftShader, plus a beam-guide GL test.
- The patch script was tested on stand-ins for your four files (apply, re-run, CRLF, abort-on-mismatch) and its anchors were checked by eye against your current `renderer.ts` and `Studio3D.tsx`.
- NOT run: `npm run build` in your repo, and `tests/studio3d/lightStage.project.test.ts` (needs your full repo).

## Standalone HTML export: not fixed in this zip
`codeExport.ts` builds a separate, simplified Canvas 2D viewer. It draws square dots from the saved formation, with no simulation,
no shape/softness/glow/bloom/exposure/vignette/grain, no normals/lighting and no beams, and it sizes from its own formula.
That is why it differs from the preview. The real fix is to run the same engine (simulation, camera, renderer and shaders)
inside the exported file with the same resize logic. I have not built that yet.
