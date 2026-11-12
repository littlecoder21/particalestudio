/** Tiny safe expression compiler for custom force fields. Generates JS only from a whitelisted grammar. */
export type ExprFn = (x: number, y: number, z: number, t: number, vx: number, vy: number, vz: number, r: number) => number;
const FUNCS: Record<string, string> = { sin: "Math.sin", cos: "Math.cos", tan: "Math.tan", abs: "Math.abs", sqrt: "Math.sqrt", min: "Math.min", max: "Math.max", pow: "Math.pow", floor: "Math.floor", exp: "Math.exp", atan2: "Math.atan2", sign: "Math.sign", fract: "F.fract", mix: "F.mix", clamp: "F.clamp", smoothstep: "F.smoothstep", noise: "F.noise" };
const VARS = new Set(["x", "y", "z", "t", "vx", "vy", "vz", "r", "pi", "tau"]);
const F = {
  fract: (a: number) => a - Math.floor(a), mix: (a: number, b: number, t: number) => a + (b - a) * t, clamp: (a: number, lo: number, hi: number) => (a < lo ? lo : a > hi ? hi : a),
  smoothstep: (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); },
  noise: (x: number, y: number, z: number) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; },
};
export function compileExpression(src: string): ExprFn | null {
  const s = src.trim();
  if (!s || s.length > 240) return null;
  const toks = s.match(/\d*\.?\d+(?:e[+-]?\d+)?|[A-Za-z_]\w*|[-+*/^(),]|\S/gi) ?? [];
  let p = 0;
  const peek = () => toks[p], take = () => toks[p++];
  const fail = (): never => { throw new Error("bad expression"); };
  function primary(): string {
    const t = take();
    if (t === undefined) return fail();
    if (/^\d*\.?\d+(?:e[+-]?\d+)?$/i.test(t)) return t;
    if (t === "(") { const e = add(); if (take() !== ")") fail(); return `(${e})`; }
    if (t === "-") return `(-${unary()})`;
    if (t === "+") return unary();
    if (/^[A-Za-z_]\w*$/.test(t)) {
      if (peek() === "(") {
        const fn = FUNCS[t]; if (!fn) return fail(); take();
        const args: string[] = [];
        if (peek() !== ")") { for (;;) { args.push(add()); if (peek() === ",") take(); else break; } }
        if (take() !== ")") fail();
        return `${fn}(${args.join(",")})`;
      }
      if (!VARS.has(t)) return fail();
      return t === "pi" ? "Math.PI" : t === "tau" ? "(Math.PI*2)" : t;
    }
    return fail();
  }
  function unary(): string { return primary(); }
  function pow(): string { const b = unary(); if (peek() === "^") { take(); return `Math.pow(${b},${pow()})`; } return b; }
  function mul(): string { let e = pow(); while (peek() === "*" || peek() === "/") { const o = take(); e = `(${e}${o}${pow()})`; } return e; }
  function add(): string { let e = mul(); while (peek() === "+" || peek() === "-") { const o = take(); e = `(${e}${o}${mul()})`; } return e; }
  try {
    const code = add();
    if (p !== toks.length) return null;
    // eslint-disable-next-line no-new-func
    const fn = new Function("F", "x", "y", "z", "t", "vx", "vy", "vz", "r", `return (${code});`) as (...a: unknown[]) => number;
    return (x, y, z, t, vx, vy, vz, r) => { const v = fn(F, x, y, z, t, vx, vy, vz, r); return Number.isFinite(v) ? v : 0; };
  } catch { return null; }
}
