# Particle Studio — update pack

Copy the `src/` folder from this zip over the `src/` folder of your local repo (same paths, overwrite when asked).
Nothing else in the project changes; no new packages.

## What's inside

**Presets — exactly 250**
- New generator "Accretion Smoke" (`generatorsExtra.ts`, id added in `types.ts`) and one black-hole preset, **Event Horizon**, built on it (tilted smoky swirl, brown/blue tails, lens ring). The four older black-hole presets (Ember Singularity, Aurora Maw, Mono Lens, Black Hole) were removed so only one remains.
- `presets.ts` keeps the classic presets and adds 10 groups; the new looks live in `presetPacks/` (palette bank + one file per group). `presetBuilder.ts` holds the shared `mk()` helper.
- The Presets tab gets group chips (`ShaderStudio.tsx`) and shows the presets shelf by shelf.

**Elements library — 700 items, 100 per family**
- Backgrounds, Gradients, Fields, Patterns, Light, Texture, Recipes — each split into named groups (shelves).
- `library.ts` (aggregator + search + thumbnails), `libraryCore.ts` (types/helpers), `libraryItems/<family>.ts` (the data).
- `LibraryPanel.tsx` now has a second chip row for the groups; `thumbs.ts` bakes thumbnails for what you are looking at first. Styles added to `panels.css`.

## Files
- src/shader/LibraryPanel.tsx
- src/shader/ShaderStudio.tsx
- src/shader/generatorsExtra.ts
- src/shader/library.ts
- src/shader/libraryCore.ts
- src/shader/libraryItems/backgrounds.ts
- src/shader/libraryItems/fields.ts
- src/shader/libraryItems/gradients.ts
- src/shader/libraryItems/light.ts
- src/shader/libraryItems/patterns.ts
- src/shader/libraryItems/recipes.ts
- src/shader/libraryItems/texture.ts
- src/shader/panels.css
- src/shader/presetBuilder.ts
- src/shader/presetPacks/cosmic.ts
- src/shader/presetPacks/flow.ts
- src/shader/presetPacks/fluid.ts
- src/shader/presetPacks/gradients.ts
- src/shader/presetPacks/index.ts
- src/shader/presetPacks/layered.ts
- src/shader/presetPacks/light.ts
- src/shader/presetPacks/math.ts
- src/shader/presetPacks/nature.ts
- src/shader/presetPacks/palettes.ts
- src/shader/presetPacks/pattern.ts
- src/shader/presetPacks/shapes.ts
- src/shader/presets.ts
- src/shader/thumbs.ts
- src/shader/types.ts
