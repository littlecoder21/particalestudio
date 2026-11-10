/**
 * Palette bank shared by the preset packs. Every palette is five colours, ordered
 * dark → light (the shader ramps through them from the shadows to the highlights).
 * Names describe the mood; reuse them freely when you build your own presets.
 */
export const P = {
  /* ── blues ── */
  abyss: ["#010611", "#06204a", "#0c5aa8", "#3fa9e6", "#d8f3ff"],
  cobalt: ["#040a24", "#0b2a8c", "#1f5cff", "#7aa8ff", "#f0f5ff"],
  denim: ["#0a1020", "#1d2f5a", "#3c5f9e", "#8aa7d6", "#e6edf9"],
  indigo: ["#07041a", "#1b0f5e", "#4a2fd0", "#8e7bff", "#efeaff"],
  iceBlue: ["#06141f", "#14506f", "#4fb3d6", "#b4ebf7", "#ffffff"],
  /* ── teals & greens ── */
  lagoon: ["#00141a", "#005a63", "#00a6a6", "#59e0c8", "#e0fff6"],
  jade: ["#02150f", "#0a5a3f", "#14a371", "#6fe3b0", "#e8fff3"],
  moss: ["#0a1405", "#2a4a12", "#5e8c1f", "#a8c85a", "#f1f7d0"],
  fern: ["#04120a", "#14452a", "#2f8f4e", "#8fd694", "#eaffe6"],
  lime: ["#0a1200", "#2f5d00", "#7ed100", "#d4ff4a", "#fbffd6"],
  seafoam: ["#08181a", "#1f6a6a", "#5fc4b4", "#b6f0e0", "#f4fffb"],
  /* ── yellows & oranges ── */
  honey: ["#140a00", "#6a3d00", "#d68a00", "#ffc83d", "#fff6d0"],
  amber: ["#1a0800", "#7a2e00", "#e06a00", "#ffae3d", "#fff0c8"],
  saffron: ["#1a0b00", "#8a3a00", "#e8791a", "#ffc247", "#fff5d6"],
  rust: ["#120502", "#5a1a0a", "#a8401c", "#e08a4a", "#ffe6c8"],
  brass: ["#100c04", "#4a3a12", "#9a7a2a", "#d8bb6a", "#fbf2d2"],
  /* ── reds & pinks ── */
  crimson: ["#0c0104", "#4a0816", "#b3132e", "#f2506a", "#ffd9de"],
  cherry: ["#10020a", "#58061f", "#c2184d", "#ff6f98", "#ffe3ec"],
  coral: ["#1a0604", "#7a1f14", "#e0583c", "#ff9a7a", "#fff0e6"],
  rose: ["#12040a", "#5a1030", "#c0356a", "#f59ab8", "#fff0f5"],
  blush: ["#2a1218", "#8a4560", "#e08aa6", "#f9c8d6", "#fff7f9"],
  fuchsia: ["#10011a", "#5a0a6e", "#c21fb0", "#ff6fe0", "#ffe6fb"],
  /* ── purples ── */
  grape: ["#0a0214", "#3a0d6e", "#7a2fd0", "#b98aff", "#f3eaff"],
  amethyst: ["#0c0518", "#3d1c70", "#7b4fc9", "#bf9cf2", "#f6efff"],
  plum: ["#10040f", "#4a1245", "#8f2a85", "#d27ac8", "#fbe6f8"],
  lilac: ["#1b1230", "#5b4a96", "#a392e0", "#d4c8f7", "#faf7ff"],
  violet: ["#08021a", "#2d0f7a", "#6a2cf0", "#a98aff", "#efe8ff"],
  /* ── neutrals ── */
  graphite: ["#050607", "#1d2025", "#4a4f58", "#9096a3", "#eceef2"],
  ash: ["#0a0a0b", "#34343a", "#6e6e78", "#b4b4be", "#f4f4f6"],
  slate: ["#080b10", "#232b3a", "#4f5d78", "#97a6c2", "#eef2f9"],
  bone: ["#1a1712", "#5c5444", "#a89d85", "#dccfb4", "#fbf6ea"],
  sand: ["#2a2216", "#7a6a48", "#c4ac7a", "#e8d6aa", "#fff8e4"],
  ivory: ["#2b2a26", "#8a867a", "#cfc9b8", "#ece7d8", "#fffdf6"],
  /* ── multi-hue moods ── */
  sunrise: ["#2a1240", "#9a2f6a", "#f0566a", "#ffa14d", "#ffeaa8"],
  dusk: ["#0c0824", "#3a1d6e", "#a23d9a", "#ff7a6e", "#ffd2a1"],
  vapor: ["#14052e", "#5a1fa8", "#ff4fc3", "#4fe3ff", "#f4fffe"],
  cyber: ["#02020c", "#1a0f5a", "#ff2fa0", "#00e5ff", "#fffd8a"],
  tropical: ["#021a1c", "#04696a", "#1ac9a0", "#ffd43d", "#ff6a6a"],
  autumn: ["#150602", "#6a1f06", "#c2501a", "#e8a13a", "#f6e2a0"],
  spring: ["#0e2a1a", "#3a8a4a", "#9bd86a", "#f6e37a", "#ffd0e0"],
  fireIce: ["#06021a", "#1a3a9a", "#2fb6ff", "#ff8a3a", "#fff0c8"],
  holo: ["#10122a", "#6a7bff", "#9af0ff", "#ffb8f0", "#fff7d6"],
  oilSlick: ["#05060a", "#14325a", "#2a8a7a", "#a14fc9", "#f2d36a"],
  candy: ["#3a1a5a", "#ff5fa8", "#ffb26a", "#9af0d6", "#fff4fb"],
  pastelDream: ["#6a5acd", "#c89bf5", "#ffb8d9", "#bff0e6", "#fff9ec"],
  macaron: ["#7a5a6a", "#e8a3b8", "#f5d19a", "#a8dcc8", "#fffaf0"],
  toxic: ["#050a00", "#16420a", "#4ad11f", "#d6ff3a", "#fffbb0"],
  lava: ["#0c0100", "#5a0a00", "#d12a00", "#ff8a00", "#ffee9a"],
  magma: ["#050004", "#3a0a2e", "#a3132f", "#ff6a1a", "#ffe9a0"],
  midnightGold: ["#030510", "#10204a", "#3a4a8a", "#c8a24a", "#fff0b8"],
  royal: ["#0a0420", "#2a1380", "#5a35c8", "#d4a93a", "#fff2c2"],
  mojito: ["#04180f", "#0f6a4a", "#44c78f", "#d8f58a", "#fffce0"],
  bubblegum: ["#2a0a4a", "#a82fd0", "#ff5fb8", "#7fd8ff", "#fff0fb"],
  opal: ["#1a1830", "#5a6aa8", "#9ad0d8", "#f0c8e0", "#fffcf6"],
  nebulaPink: ["#05020f", "#2a0f5a", "#8a2fb0", "#ff6fa8", "#ffe0d0"],
  deepSpace: ["#010108", "#0a0f3a", "#2a3a9a", "#7a9aff", "#f2f5ff"],
  solar: ["#0a0200", "#6a1a00", "#e8590c", "#ffc233", "#fffbe0"],
  emeraldNight: ["#010a08", "#064a3a", "#0f9a74", "#5ee8b8", "#e8fff6"],
  sapphire: ["#020418", "#0a2a8a", "#1a63e0", "#6fb0ff", "#e6f2ff"],
  ruby: ["#0a0104", "#5a0a1a", "#b3142f", "#ff5f75", "#ffe6ea"],
  mint: ["#0a1a16", "#1f6a58", "#52c2a0", "#b6f2dc", "#f4fffa"],
  peach: ["#2a0f0a", "#a8503a", "#f2906a", "#ffcaa0", "#fff3e6"],
  lavenderMist: ["#1a1430", "#5a4a9a", "#a898e0", "#dcd2f8", "#fbf9ff"],
  steel: ["#07090d", "#252f3f", "#566884", "#a0b2cf", "#eef3fb"],
  copper: ["#120602", "#5a2410", "#b5602e", "#e8a070", "#ffe8d2"],
  mauve: ["#150a18", "#52305a", "#9a6aa8", "#d8b0e0", "#fbeffd"],
  neonGreen: ["#00080a", "#003a2a", "#00c47a", "#58ffb0", "#e6fff4"],
  electric: ["#02030c", "#0a1a6a", "#2a5cff", "#38e8ff", "#ffffff"],
} as const satisfies Record<string, readonly string[]>;

export type PaletteName = keyof typeof P;

/** A palette as a mutable array (the preset builder expects string[]). */
export const pal = (name: PaletteName): string[] => [...P[name]];

/** Reverse a palette (light → dark), handy for inverted looks. */
export const palRev = (name: PaletteName): string[] => [...P[name]].reverse();
