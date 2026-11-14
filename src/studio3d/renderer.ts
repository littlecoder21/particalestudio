/** WebGL2 particle renderer: instanced-free point sprites, HDR scene target, dual-Kawase bloom, trails, tone mapping. */
import type { LightBeam, Look, PaletteStop, ParticleShape } from "./types";
import type { OrbitCamera } from "./camera";
import { paletteBytes, parseColor } from "./palette";
import { createLightBeamFrame, updateLightBeamFrame } from "./lightBeams";

export interface LayerLook { palette: PaletteStop[] | null; sizeMul: number; opacityMul: number }
export interface RenderInput {
  n: number; pos: Float32Array; vel: Float32Array; nrm: Float32Array; t: Float32Array; size: Float32Array; alpha: Float32Array; phase: Float32Array; layer: Uint8Array;
  attrVersion: number; time: number; camera: OrbitCamera; look: Look; layers: LayerLook[]; beams: LightBeam[]; bloomLevel: number; focus: number; range: number;
}
export interface RendererInfo { kind: "webgl2" | "canvas2d"; gpu: string; hdr: boolean; maxPoint: number }
export interface Renderer {
  readonly info: RendererInfo; renderMs: number;
  resize(cssW: number, cssH: number, dpr: number): void;
  render(inp: RenderInput, transparent?: boolean): void;
  snapshot(inp: RenderInput, w: number, h: number, transparent: boolean): Promise<Blob | null>;
  dispose(): void;
}

const SHAPES: Record<ParticleShape, number> = { soft: 0, hard: 1, ring: 2, spark: 3, square: 4, diamond: 5 };
export const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aVel; layout(location=2) in vec3 aNrm; layout(location=3) in vec4 aMisc;
uniform mat4 uView, uProj; uniform float uPx, uOrtho, uSize, uSizeVar, uSizeAtt, uTime, uOpacity, uEmission, uNorm, uEdge, uDepthFade, uDepthColor, uVelColor, uStretch, uLight, uSpin, uFocus, uRange;
uniform vec3 uLightDir; uniform vec4 uLayer[4]; uniform sampler2D uPalette;
uniform int uBeamCount;
uniform vec4 uBeamOriginLen[20], uBeamDirWidth[20], uBeamProfile[20], uBeamAnim[20], uBeamTint[20], uBeamSideA[20], uBeamSideB[20];
out vec4 vCol; out vec2 vDir; out float vStretch;
float h11(float p){ return fract(sin(p*127.1)*43758.5453); }
void main(){
  vec4 vp = uView*vec4(aPos,1.0); float depth = -vp.z; gl_Position = uProj*vp;
  float layer = floor(aMisc.w); float ph = fract(aMisc.w); int li = int(clamp(layer,0.,3.));
  float sz = uSize * mix(1.0-uSizeVar, 1.0+uSizeVar, h11(ph*91.7)) * aMisc.y * uLayer[li].x;
  float persp = uOrtho > 0.5 ? uPx : (uSizeAtt > 0.5 ? uPx/max(depth,0.01) : uPx/max(uFocus,0.01));
  float px = sz*persp;
  float speed = length(aVel); vec2 vv = (uView*vec4(aVel,0.0)).xy; float vl = length(vv);
  float stretch = 1.0 + uStretch*clamp(speed*0.3, 0.0, 5.0);
  vec2 dir = vl > 1e-3 && uStretch > 0.0 ? vv/vl : vec2(cos(ph*6.2832+uSpin*uTime*(ph-0.5)), sin(ph*6.2832+uSpin*uTime*(ph-0.5)));
  float size = clamp(px*stretch, 1.0, 120.0); gl_PointSize = size;
  float energy = min(1.0, (px*px)/1.0);
  float hasN = step(0.01, dot(aNrm,aNrm)); vec3 nv = (uView*vec4(aNrm,0.0)).xyz; nv = hasN > 0.5 ? normalize(nv) : vec3(0.0,0.0,1.0);
  float facing = abs(nv.z); float rim = mix(0.5, 1.0-facing*facing, hasN);
  float b = 1.0 + uEdge*(rim*rim*1.3 - 0.35);
  float lam = mix(0.6, max(0.0, dot(nv, uLightDir)), hasN); b *= mix(1.0, 0.3 + 1.0*lam, uLight);
  float dz = clamp((depth-(uFocus-uRange))/(2.0*uRange),0.0,1.0);
  float fade = mix(1.0, 0.26+0.74*(1.0-dz), uDepthFade);
  float t = clamp(aMisc.x + uDepthColor*(dz-0.5) + uVelColor*clamp(speed*0.25,0.0,1.0), 0.0, 1.0);
  vec3 col = texture(uPalette, vec2(t, (layer+0.5)/4.0)).rgb;
  float a = uOpacity*uNorm*aMisc.z*uLayer[li].y*fade*b*energy;
  float beamEnergy = 0.0; vec3 beamColor = vec3(0.0);
  for(int i=0;i<20;i++){
    if(i>=uBeamCount) break;
    vec4 originLen=uBeamOriginLen[i], dirWidth=uBeamDirWidth[i], profile=uBeamProfile[i], anim=uBeamAnim[i], tint=uBeamTint[i];
    vec3 beamDir=dirWidth.xyz; vec3 rel=aPos-originLen.xyz;
    float alongDistance=dot(rel,beamDir), u=alongDistance/originLen.w;
    if(u<0.0||u>1.0) continue;
    vec3 lateral=rel-beamDir*alongDistance;
    float sa=dot(lateral,uBeamSideA[i].xyz), sb=dot(lateral,uBeamSideB[i].xyz);
    float bendA=0.0, bendB=0.0;
    if(profile.x>1.5&&profile.x<2.5){
      bendA=profile.z*sin(3.14159265*u)+profile.z*0.22*tint.y*sin(u*7.5+anim.y+uTime*anim.x*0.31);
    }else if(profile.x>2.5){
      float turn=u*6.2831853*max(0.25,abs(tint.z))+anim.y+uTime*anim.x*0.31;
      float helixRadius=dirWidth.w*(0.8+profile.y*0.12);
      bendA=cos(turn)*helixRadius; bendB=sin(turn)*helixRadius;
    }
    float widen=profile.x>0.5&&profile.x<1.5?profile.y:profile.y*0.12;
    float swell=1.0+0.38*tint.y*sin(u*4.2+anim.y+uTime*anim.x*0.33);
    float radius=dirWidth.w*(1.0+widen*u)*swell;
    float q=length(vec2(sa-bendA,sb-bendB))/max(0.001,radius);
    if(q>7.4) continue;
    float q2=q*q;
    float beamProfile=0.8*exp(-q2)+0.28*exp(-q2/7.84);
    float alongFade=smoothstep(0.0,anim.z,u)*(1.0-smoothstep(1.0-anim.w,1.0,u));
    float wave=0.84+0.16*sin(u*9.0-uTime*anim.x*0.5+anim.y)+0.07*sin(u*23.0+q*0.6+uTime*anim.x*1.6+anim.y);
    float reflectivity=hasN>0.5?0.3+0.7*max(dot(normalize(aNrm),-beamDir),0.0):0.25+0.75*h11(ph*113.1);
    float glint=pow(max(0.0,sin(uTime*(0.6+anim.x)+ph*6.2832)),8.0);
    float reflected=beamProfile*alongFade*max(0.0,wave)*profile.w*reflectivity*(0.82+0.18*glint);
    beamEnergy+=reflected;
    beamColor+=texture(uPalette,vec2(tint.x,(layer+0.5)/4.0)).rgb*reflected;
  }
  if(beamEnergy>0.0001) col+=beamColor/max(beamEnergy,0.0001)*min(2.5,beamEnergy)*1.25;
  vCol = vec4(col*uEmission, a); vDir = dir; vStretch = stretch;
}`;
export const FRAG = `#version 300 es
precision mediump float;
in vec4 vCol; in vec2 vDir; in float vStretch;
uniform int uShape; uniform float uSoft;
out vec4 o;
void main(){
  vec2 c = gl_PointCoord*2.0-1.0; vec2 q = vec2(dot(c,vDir), dot(c,vec2(-vDir.y,vDir.x))); q.x /= max(vStretch*0.55,1.0); q.x *= 1.0;
  float r2 = dot(q,q), r = sqrt(r2), a;
  if(uShape==0){ a = exp(-r2*mix(7.0,2.2,uSoft)) * smoothstep(1.0,0.72,r); }
  else if(uShape==1){ a = smoothstep(1.0,0.82,r); }
  else if(uShape==2){ a = smoothstep(0.22,0.0,abs(r-0.72)); }
  else if(uShape==3){ a = max(exp(-abs(q.x)*14.0-abs(q.y)*2.5), exp(-abs(q.y)*14.0-abs(q.x)*2.5)) * smoothstep(1.0,0.8,r) + 0.5*exp(-r2*12.0); }
  else if(uShape==4){ a = 1.0-smoothstep(0.78,0.98,max(abs(q.x),abs(q.y))); }
  else { a = 1.0-smoothstep(0.7,0.95,abs(q.x)+abs(q.y)); }
  if(a < 0.004) discard;
  o = vec4(vCol.rgb*vCol.a*a, vCol.a*a);
}`;
const FS_VERT = `#version 300 es
out vec2 uv; void main(){ vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2)); uv = p; gl_Position = vec4(p*2.0-1.0,0.0,1.0); }`;
export const DOWN = `#version 300 es
precision highp float; in vec2 uv; uniform sampler2D t; uniform vec2 px; uniform float off; out vec4 o;
void main(){ vec2 h = px*off; vec4 s = texture(t,uv)*4.0; s += texture(t,uv+vec2(-h.x,-h.y)); s += texture(t,uv+vec2(h.x,-h.y)); s += texture(t,uv+vec2(-h.x,h.y)); s += texture(t,uv+vec2(h.x,h.y)); o = s/8.0; }`;
export const UP = `#version 300 es
precision highp float; in vec2 uv; uniform sampler2D t; uniform vec2 px; uniform float off; out vec4 o;
void main(){ vec2 h = px*off; vec4 s = texture(t,uv+vec2(-h.x*2.0,0.0)); s += texture(t,uv+vec2(-h.x,h.y))*2.0; s += texture(t,uv+vec2(0.0,h.y*2.0)); s += texture(t,uv+vec2(h.x,h.y))*2.0; s += texture(t,uv+vec2(h.x*2.0,0.0)); s += texture(t,uv+vec2(h.x,-h.y))*2.0; s += texture(t,uv+vec2(0.0,-h.y*2.0)); s += texture(t,uv+vec2(-h.x,-h.y))*2.0; o = s/12.0; }`;
export const FADE = `#version 300 es
precision highp float; in vec2 uv; uniform sampler2D t; uniform float k; out vec4 o; void main(){ o = texture(t,uv)*k; }`;
export const COMPOSITE = `#version 300 es
precision highp float; in vec2 uv; uniform sampler2D scene, bloom; uniform float glow, exposure, vignette, grain, alphaMode, transparent, hasBloom, seed; uniform vec3 bg; out vec4 o;
float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233))+seed)*43758.5453); }
void main(){
  vec4 s = texture(scene,uv); vec3 c = s.rgb; if(hasBloom>0.5) c += texture(bloom,uv).rgb*glow;
  c *= exposure; c += (h(gl_FragCoord.xy)-0.5)*grain*0.06*smoothstep(0.0,0.2,max(c.r,max(c.g,c.b)));
  vec3 tm = 1.0-exp(-c);
  float cover = alphaMode>0.5 ? clamp(s.a,0.0,1.0) : clamp(max(tm.r,max(tm.g,tm.b)),0.0,1.0);
  float vg = 1.0 - vignette*smoothstep(0.35,0.95,length(uv-0.5)*1.45);
  if(transparent>0.5){ o = vec4(tm*vg, cover*vg); return; }
  o = vec4((tm + bg*(1.0-cover))*vg, 1.0);
}`;

interface RT { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number }
type Prog = { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };

export class GLRenderer implements Renderer {
  info: RendererInfo = { kind: "webgl2", gpu: "", hdr: false, maxPoint: 64 };
  renderMs = 0;
  private beamFrame = createLightBeamFrame();
  private gl!: WebGL2RenderingContext; private w = 1; private h = 1; private lost = false;
  private progs: Record<string, Prog> = {}; private vao!: WebGLVertexArrayObject; private bPos!: WebGLBuffer; private bVel!: WebGLBuffer; private bNrm!: WebGLBuffer; private bMisc!: WebGLBuffer; private palTex!: WebGLTexture; private emptyVao!: WebGLVertexArrayObject;
  private cap = 0; private seenAttr = -1; private seenN = -1; private misc = new Float32Array(0); private nrm8 = new Int8Array(0); private scene: RT[] = []; private chain: RT[] = []; private sceneIdx = 0; private palKey = ""; private fmtHdr = false; private onLost = (e: Event) => { e.preventDefault(); this.lost = true; }; private onRestored = () => { this.initGL(); this.lost = false; };

  constructor(readonly canvas: HTMLCanvasElement) {
    this.canvas.addEventListener("webglcontextlost", this.onLost); this.canvas.addEventListener("webglcontextrestored", this.onRestored);
    this.initGL();
  }
  static supported(): boolean { try { const c = document.createElement("canvas"); return !!c.getContext("webgl2"); } catch { return false; } }

  private initGL() {
    const gl = this.canvas.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl; this.progs = {}; this.scene = []; this.chain = []; this.cap = 0; this.seenAttr = -1; this.seenN = -1;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    this.info.gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "WebGL2";
    this.info.maxPoint = (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array)[1];
    this.fmtHdr = !!(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
    gl.getExtension("OES_texture_float_linear");
    this.progs.pts = this.prog(VERT, FRAG, ["uView", "uProj", "uPx", "uOrtho", "uSize", "uSizeVar", "uSizeAtt", "uTime", "uOpacity", "uEmission", "uNorm", "uEdge", "uDepthFade", "uDepthColor", "uVelColor", "uStretch", "uLight", "uSpin", "uFocus", "uRange", "uLightDir", "uLayer", "uPalette", "uShape", "uSoft", "uBeamCount", "uBeamOriginLen", "uBeamDirWidth", "uBeamProfile", "uBeamAnim", "uBeamTint", "uBeamSideA", "uBeamSideB"]);
    this.progs.down = this.prog(FS_VERT, DOWN, ["t", "px", "off"]); this.progs.up = this.prog(FS_VERT, UP, ["t", "px", "off"]); this.progs.fade = this.prog(FS_VERT, FADE, ["t", "k"]);
    this.progs.comp = this.prog(FS_VERT, COMPOSITE, ["scene", "bloom", "glow", "exposure", "vignette", "grain", "alphaMode", "transparent", "hasBloom", "seed", "bg"]);
    this.vao = gl.createVertexArray()!; this.emptyVao = gl.createVertexArray()!;
    this.bPos = gl.createBuffer()!; this.bVel = gl.createBuffer()!; this.bNrm = gl.createBuffer()!; this.bMisc = gl.createBuffer()!;
    this.palTex = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, this.palTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.palKey = "";
    this.makeTargets();
  }
  private prog(vs: string, fs: string, names: string[]): Prog {
    const gl = this.gl, mk = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("Shader error: " + gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram()!; gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("Link error: " + gl.getProgramInfoLog(p));
    const u: Record<string, WebGLUniformLocation | null> = {};
    for (const n of names) u[n] = gl.getUniformLocation(p, n);
    return { p, u };
  }
  private rt(w: number, h: number, hdr: boolean): RT {
    const gl = this.gl, tex = gl.createTexture()!, fbo = gl.createFramebuffer()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null); else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo, w, h };
  }
  private freeTargets() { const gl = this.gl; for (const r of [...this.scene, ...this.chain]) { gl.deleteTexture(r.tex); gl.deleteFramebuffer(r.fbo); } this.scene = []; this.chain = []; }
  private makeTargets() {
    const gl = this.gl; this.freeTargets();
    const mk = (w: number, h: number) => { let r = this.rt(w, h, this.fmtHdr); if (this.fmtHdr && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { this.fmtHdr = false; gl.deleteTexture(r.tex); gl.deleteFramebuffer(r.fbo); r = this.rt(w, h, false); } return r; };
    this.scene = [mk(this.w, this.h), mk(this.w, this.h)]; this.info.hdr = this.fmtHdr;
    let cw = this.w, ch = this.h;
    for (let i = 0; i < 6; i++) { cw = Math.max(2, cw >> 1); ch = Math.max(2, ch >> 1); this.chain.push(mk(cw, ch)); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  resize(cssW: number, cssH: number, dpr: number) {
    const w = Math.max(2, Math.floor(cssW * dpr)), h = Math.max(2, Math.floor(cssH * dpr));
    if (w === this.w && h === this.h && this.canvas.width === w) return;
    this.canvas.width = w; this.canvas.height = h; this.w = w; this.h = h;
    if (!this.lost) this.makeTargets();
  }
  private ensureBuffers(n: number) {
    const gl = this.gl;
    if (n <= this.cap) return;
    this.cap = Math.ceil(n * 1.2);
    gl.bindVertexArray(this.vao);
    const set = (buf: WebGLBuffer, loc: number, size: number, type: number, norm: boolean, bytes: number) => { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, this.cap * bytes, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, type, norm, 0, 0); };
    set(this.bPos, 0, 3, gl.FLOAT, false, 12); set(this.bVel, 1, 3, gl.FLOAT, false, 12); set(this.bNrm, 2, 3, gl.BYTE, true, 4 * 3); set(this.bMisc, 3, 4, gl.FLOAT, false, 16);
    this.misc = new Float32Array(this.cap * 4); this.nrm8 = new Int8Array(this.cap * 3); this.seenAttr = -1;
  }
  render(inp: RenderInput, transparent = false) {
    if (this.lost) return;
    const t0 = performance.now(), gl = this.gl, { look, camera: cam, n } = inp;
    if (n <= 0) return;
    this.ensureBuffers(n);
    // static-ish attributes
    if (inp.attrVersion !== this.seenAttr || n !== this.seenN) {
      const m = this.misc, q = this.nrm8;
      for (let i = 0; i < n; i++) { m[i * 4] = inp.t[i]; m[i * 4 + 1] = inp.size[i]; m[i * 4 + 2] = inp.alpha[i]; m[i * 4 + 3] = Math.min(3, inp.layer[i]) + Math.min(0.999, inp.phase[i]); q[i * 3] = inp.nrm[i * 3] * 127; q[i * 3 + 1] = inp.nrm[i * 3 + 1] * 127; q[i * 3 + 2] = inp.nrm[i * 3 + 2] * 127; }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bMisc); gl.bufferSubData(gl.ARRAY_BUFFER, 0, m, 0, n * 4);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bNrm); gl.bufferSubData(gl.ARRAY_BUFFER, 0, q, 0, n * 3);
      this.seenAttr = inp.attrVersion; this.seenN = n;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bPos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, inp.pos, 0, n * 3);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bVel); gl.bufferSubData(gl.ARRAY_BUFFER, 0, inp.vel, 0, n * 3);
    // palette
    const rows = [0, 1, 2, 3].map((i) => inp.layers[i]?.palette ?? look.palette), key = JSON.stringify(rows);
    if (key !== this.palKey) { this.palKey = key; gl.bindTexture(gl.TEXTURE_2D, this.palTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 4, gl.RGBA, gl.UNSIGNED_BYTE, paletteBytes(rows)); }
    const useTrail = look.trails > 0.01;
    const cur = this.scene[this.sceneIdx], prev = this.scene[1 - this.sceneIdx];
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, cur.fbo); gl.viewport(0, 0, this.w, this.h); gl.disable(gl.BLEND);
    if (useTrail) { this.fs("fade"); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, prev.tex); gl.uniform1i(this.progs.fade.u.t, 0); gl.uniform1f(this.progs.fade.u.k, look.trails * 0.96); gl.drawArrays(gl.TRIANGLES, 0, 3); }
    else { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
    // particles
    cam.updateMatrices(this.w / this.h);
    const P = this.progs.pts, U = P.u;
    updateLightBeamFrame(inp.beams, inp.time, this.beamFrame);
    gl.useProgram(P.p); gl.bindVertexArray(this.vao); gl.enable(gl.BLEND);
    if (look.blend === "additive") gl.blendFunc(gl.ONE, gl.ONE); else if (look.blend === "screen") gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR); else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix4fv(U.uView, false, cam.view); gl.uniformMatrix4fv(U.uProj, false, cam.proj);
    const az = (look.lightAzimuth * Math.PI) / 180, el = (look.lightElevation * Math.PI) / 180;
    gl.uniform1f(U.uPx, cam.pixelScale(this.h)); gl.uniform1f(U.uOrtho, cam.ortho ? 1 : 0); gl.uniform1f(U.uSize, look.size); gl.uniform1f(U.uSizeVar, look.sizeVariation); gl.uniform1f(U.uSizeAtt, look.sizeAttenuation ? 1 : 0);
    gl.uniform1f(U.uTime, inp.time); gl.uniform1f(U.uOpacity, look.opacity); gl.uniform1f(U.uEmission, look.emission);
    gl.uniform1f(U.uNorm, look.autoNormalize ? Math.min(3, Math.max(0.35, Math.sqrt(80000 / n))) : 1);
    gl.uniform1f(U.uEdge, look.edgeBrightness); gl.uniform1f(U.uDepthFade, look.depthFade); gl.uniform1f(U.uDepthColor, look.depthColor); gl.uniform1f(U.uVelColor, look.velocityColor); gl.uniform1f(U.uStretch, look.velocityStretch);
    gl.uniform1f(U.uLight, look.lighting); gl.uniform1f(U.uSpin, look.spin); gl.uniform1f(U.uFocus, inp.focus); gl.uniform1f(U.uRange, Math.max(0.1, inp.range));
    gl.uniform3f(U.uLightDir, Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    const lay = new Float32Array(16); for (let i = 0; i < 4; i++) { lay[i * 4] = inp.layers[i]?.sizeMul ?? 1; lay[i * 4 + 1] = inp.layers[i]?.opacityMul ?? 1; }
    gl.uniform4fv(U.uLayer, lay); gl.uniform1i(U.uShape, SHAPES[look.shape] ?? 0); gl.uniform1f(U.uSoft, look.softness);
    gl.uniform1i(U.uBeamCount, this.beamFrame.count);
    gl.uniform4fv(U.uBeamOriginLen, this.beamFrame.originLength); gl.uniform4fv(U.uBeamDirWidth, this.beamFrame.directionWidth);
    gl.uniform4fv(U.uBeamProfile, this.beamFrame.profile); gl.uniform4fv(U.uBeamAnim, this.beamFrame.animation);
    gl.uniform4fv(U.uBeamTint, this.beamFrame.tint); gl.uniform4fv(U.uBeamSideA, this.beamFrame.sideA); gl.uniform4fv(U.uBeamSideB, this.beamFrame.sideB);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.palTex); gl.uniform1i(U.uPalette, 1);
    gl.drawArrays(gl.POINTS, 0, n);
    gl.disable(gl.BLEND);
    // bloom
    const levels = inp.bloomLevel <= 0 ? 0 : inp.bloomLevel === 1 ? 3 : 5, doBloom = levels > 0 && look.glow > 0.001;
    if (doBloom) {
      const off = 0.6 + look.glowRadius * 1.6;
      let src: RT = cur;
      this.fs("down"); gl.uniform1i(this.progs.down.u.t, 0);
      for (let i = 0; i < levels; i++) { const d = this.chain[i]; gl.bindFramebuffer(gl.FRAMEBUFFER, d.fbo); gl.viewport(0, 0, d.w, d.h); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex); gl.uniform2f(this.progs.down.u.px, 1 / src.w, 1 / src.h); gl.uniform1f(this.progs.down.u.off, off); gl.drawArrays(gl.TRIANGLES, 0, 3); src = d; }
      this.fs("up"); gl.uniform1i(this.progs.up.u.t, 0); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = levels - 1; i > 0; i--) { const s = this.chain[i], d = this.chain[i - 1]; gl.bindFramebuffer(gl.FRAMEBUFFER, d.fbo); gl.viewport(0, 0, d.w, d.h); gl.bindTexture(gl.TEXTURE_2D, s.tex); gl.uniform2f(this.progs.up.u.px, 1 / s.w, 1 / s.h); gl.uniform1f(this.progs.up.u.off, off); gl.drawArrays(gl.TRIANGLES, 0, 3); }
      gl.disable(gl.BLEND);
    }
    // composite
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.w, this.h);
    this.fs("comp"); const C = this.progs.comp.u, bg = parseColor(look.background);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur.tex); gl.uniform1i(C.scene, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, doBloom ? this.chain[0].tex : cur.tex); gl.uniform1i(C.bloom, 1);
    gl.uniform1f(C.glow, look.glow * 1.4); gl.uniform1f(C.exposure, look.exposure); gl.uniform1f(C.vignette, look.vignette); gl.uniform1f(C.grain, look.grain); gl.uniform1f(C.alphaMode, look.blend === "alpha" ? 1 : 0);
    gl.uniform1f(C.transparent, transparent || look.transparent ? 1 : 0); gl.uniform1f(C.hasBloom, doBloom ? 1 : 0); gl.uniform1f(C.seed, (inp.time * 7.13) % 100); gl.uniform3f(C.bg, bg[0] / 255, bg[1] / 255, bg[2] / 255);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.sceneIdx = 1 - this.sceneIdx;
    this.renderMs = this.renderMs * 0.9 + (performance.now() - t0) * 0.1;
  }
  private fs(name: string) { const gl = this.gl; gl.useProgram(this.progs[name].p); gl.bindVertexArray(this.emptyVao); }
  snapshot(inp: RenderInput, w: number, h: number, transparent: boolean): Promise<Blob | null> {
    const ow = this.w, oh = this.h;
    this.canvas.width = w; this.canvas.height = h; this.w = w; this.h = h; this.makeTargets();
    this.render(inp, transparent);
    return new Promise((res) => this.canvas.toBlob((b) => { this.canvas.width = ow; this.canvas.height = oh; this.w = ow; this.h = oh; this.makeTargets(); res(b); }, "image/png"));
  }
  dispose() {
    this.canvas.removeEventListener("webglcontextlost", this.onLost); this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    if (!this.lost) { const gl = this.gl; this.freeTargets(); for (const p of Object.values(this.progs)) gl.deleteProgram(p.p); for (const b of [this.bPos, this.bVel, this.bNrm, this.bMisc]) gl.deleteBuffer(b); gl.deleteTexture(this.palTex); gl.deleteVertexArray(this.vao); gl.deleteVertexArray(this.emptyVao); }
  }
}
