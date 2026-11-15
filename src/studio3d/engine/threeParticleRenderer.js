/**
 * The Three.js particle renderer used by every export target (legacy runtime, standalone HTML, website engine).
 *
 * It does not import three: the host passes the THREE namespace in (`makeParticleRenderer(THREE)`), which lets the
 * legacy IIFE runtime use `window.THREE` while the ES module engine uses a shared module import.
 *
 * It renders with the studio's own GLSL (VERT / FRAG / DOWN / UP / FADE / COMPOSITE from renderer.ts): additive
 * HDR scene target, dual-Kawase bloom, optional trails, then the tone-mapping composite pass. Only the GL plumbing
 * (Three.js instead of raw WebGL2) differs from the studio preview.
 */
import { COMPOSITE, DOWN, FADE, FRAG, UP, VERT } from "../renderer";
import { createLightBeamFrame, updateLightBeamFrame } from "../lightBeams";
import { paletteBytes, parseColor } from "../palette";

const strip = (source) => source.replace(/^#version 300 es\s*/, "");
const POINT_VERTEX = strip(VERT);
const POINT_FRAGMENT = strip(FRAG);
const DOWN_FRAGMENT = strip(DOWN);
const UP_FRAGMENT = strip(UP);
const FADE_FRAGMENT = strip(FADE);
const COMPOSITE_FRAGMENT = strip(COMPOSITE);
const FULLSCREEN_VERTEX = `precision highp float;
layout(location=0) in vec3 position;
out vec2 uv;
void main(){ uv=position.xy*0.5+0.5; gl_Position=vec4(position.xy,0.0,1.0); }`;
const SHAPES = { soft: 0, hard: 1, ring: 2, spark: 3, square: 4, diamond: 5 };

/** Normals as the GL_BYTE values the renderer uploads: trunc(n * 127), identical to the studio's GLRenderer. */
export function toInt8Normals(nrm, n) {
  const out = new Int8Array(n * 3);
  for (let i = 0; i < n * 3; i++) out[i] = nrm[i] * 127;
  return out;
}

/** Per-particle vec4 (colour position, size, alpha, layer + phase), the studio's `aMisc` attribute. */
export function buildMisc(n, t, size, alpha, layer, phase) {
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    out[o] = t[i];
    out[o + 1] = size[i];
    out[o + 2] = alpha[i];
    out[o + 3] = Math.min(3, layer[i]) + Math.min(0.999, phase[i]);
  }
  return out;
}

export function makeParticleRenderer(THREE) {
  function renderTarget(width, height, type) {
    return new THREE.WebGLRenderTarget(width, height, {
      format: THREE.RGBAFormat,
      type,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
  }

  function shaderMaterial(vertexShader, fragmentShader, uniforms, options = {}) {
    return new THREE.RawShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      ...options,
    });
  }

  const ADDITIVE = {
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendEquationAlpha: THREE.AddEquation,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
  };

  return class ThreeParticleRenderer {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {{ pixelRatioCap?: number, autoResize?: boolean, preserveDrawingBuffer?: boolean, powerPreference?: string }} [options]
     */
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.pixelRatioCap = options.pixelRatioCap ?? 2;
      this.resolutionScale = 1;
      this.autoResize = options.autoResize !== false;
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: !!options.preserveDrawingBuffer,
        powerPreference: options.powerPreference ?? "high-performance",
      });
      this.renderer.autoClear = false;
      this.renderer.setClearColor(0x000000, 0);
      this.width = 0;
      this.height = 0;
      this.cssWidth = -1;
      this.cssHeight = -1;
      this.pixelRatio = 0;
      this.drawingBufferSize = new THREE.Vector2();
      this.targets = [];
      this.chain = [];
      this.sceneIndex = 0;
      this.hasHistory = false;
      this.attrVersion = -1;
      this.seenCount = -1;
      this.paletteDirty = true;
      this.fixedData = null;
      this.disposed = false;
      this.beamFrame = createLightBeamFrame();

      const gl = this.renderer.getContext();
      const hdr = !!(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
      gl.getExtension("OES_texture_float_linear");
      this.hdr = hdr;
      this.targetType = hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;

      this.particleScene = new THREE.Scene();
      this.camera = new THREE.Camera();
      this.geometry = new THREE.BufferGeometry();
      this.material = this.createParticleMaterial();
      this.points = new THREE.Points(this.geometry, this.material);
      this.points.frustumCulled = false;
      this.particleScene.add(this.points);

      this.passScene = new THREE.Scene();
      this.passCamera = new THREE.Camera();
      const quad = new THREE.BufferGeometry();
      quad.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
      this.pass = new THREE.Mesh(quad, null);
      this.pass.frustumCulled = false;
      this.passScene.add(this.pass);
      this.fadeMaterial = shaderMaterial(FULLSCREEN_VERTEX, FADE_FRAGMENT, { t: { value: null }, k: { value: 1 } });
      this.downMaterial = shaderMaterial(FULLSCREEN_VERTEX, DOWN_FRAGMENT, { t: { value: null }, px: { value: new THREE.Vector2() }, off: { value: 1 } });
      this.upMaterial = shaderMaterial(FULLSCREEN_VERTEX, UP_FRAGMENT, { t: { value: null }, px: { value: new THREE.Vector2() }, off: { value: 1 } }, ADDITIVE);
      this.compositeMaterial = shaderMaterial(FULLSCREEN_VERTEX, COMPOSITE_FRAGMENT, {
        scene: { value: null }, bloom: { value: null }, glow: { value: 0 },
        exposure: { value: 1 }, vignette: { value: 0 }, grain: { value: 0 },
        alphaMode: { value: 0 }, transparent: { value: 0 }, hasBloom: { value: 0 },
        seed: { value: 0 }, bg: { value: new THREE.Vector3() },
      });

      this.onContextRestored = () => { this.hasHistory = false; this.paletteDirty = true; this.paletteTexture.needsUpdate = true; this.cssWidth = -1; };
      canvas.addEventListener("webglcontextrestored", this.onContextRestored);
      if (this.autoResize) {
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(canvas);
        this.handleWindowResize = () => this.resize();
        window.addEventListener("resize", this.handleWindowResize);
      }
      this.resize();
    }

    get info() {
      return { hdr: this.hdr, width: this.width, height: this.height, pixelRatio: this.pixelRatio, lost: this.renderer.getContext().isContextLost() };
    }

    createParticleMaterial() {
      const paletteTexture = new THREE.DataTexture(new Uint8Array(256 * 4 * 4), 256, 4, THREE.RGBAFormat, THREE.UnsignedByteType);
      paletteTexture.magFilter = THREE.LinearFilter;
      paletteTexture.minFilter = THREE.LinearFilter;
      paletteTexture.wrapS = THREE.ClampToEdgeWrapping;
      paletteTexture.wrapT = THREE.ClampToEdgeWrapping;
      paletteTexture.flipY = false;
      this.paletteTexture = paletteTexture;
      const layers = new Float32Array(16);
      const material = shaderMaterial(POINT_VERTEX, POINT_FRAGMENT, {
        uView: { value: new THREE.Matrix4() },
        uProj: { value: new THREE.Matrix4() },
        uPx: { value: 1 }, uOrtho: { value: 0 }, uSize: { value: 1 }, uSizeVar: { value: 0 }, uSizeAtt: { value: 1 },
        uTime: { value: 0 }, uOpacity: { value: 1 }, uEmission: { value: 1 }, uNorm: { value: 1 }, uEdge: { value: 0 },
        uDepthFade: { value: 0 }, uDepthColor: { value: 0 }, uVelColor: { value: 0 }, uStretch: { value: 0 },
        uLight: { value: 1 }, uSpin: { value: 0 }, uFocus: { value: 3 }, uRange: { value: 1 },
        uLightDir: { value: new THREE.Vector3() },
        uLayer: { value: layers },
        uPalette: { value: paletteTexture },
        uShape: { value: 0 }, uSoft: { value: 0.5 }, uBeamCount: { value: 0 },
        uBeamOriginLen: { value: this.beamFrame.originLength },
        uBeamDirWidth: { value: this.beamFrame.directionWidth },
        uBeamProfile: { value: this.beamFrame.profile },
        uBeamAnim: { value: this.beamFrame.animation },
        uBeamTint: { value: this.beamFrame.tint },
        uBeamSideA: { value: this.beamFrame.sideA },
        uBeamSideB: { value: this.beamFrame.sideB },
      }, ADDITIVE);
      // Scenes without per-particle velocity leave aVel unbound: give the shader a constant zero instead.
      material.defaultAttributeValues = { ...material.defaultAttributeValues, aVel: [0, 0, 0] };
      return material;
    }

    markPaletteDirty() { this.paletteDirty = true; }

    setPixelRatioCap(cap) { this.pixelRatioCap = cap; this.cssWidth = -1; }

    setResolutionScale(scale) { this.resolutionScale = scale; this.cssWidth = -1; }

    resize() {
      if (this.disposed) return;
      const rect = this.canvas.getBoundingClientRect();
      const cap = Math.max(0.25, this.pixelRatioCap);
      const dpr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, cap) * this.resolutionScale);
      if (rect.width === this.cssWidth && rect.height === this.cssHeight && dpr === this.pixelRatio) return;
      this.cssWidth = rect.width;
      this.cssHeight = rect.height;
      this.pixelRatio = dpr;
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
      const size = this.renderer.getDrawingBufferSize(this.drawingBufferSize);
      const width = Math.max(2, size.x | 0);
      const height = Math.max(2, size.y | 0);
      if (width === this.width && height === this.height) return;
      this.width = width;
      this.height = height;
      this.targets.forEach((target) => target.dispose());
      this.chain.forEach((target) => target.dispose());
      this.targets = [renderTarget(width, height, this.targetType), renderTarget(width, height, this.targetType)];
      this.chain = [];
      let w = width, h = height;
      for (let i = 0; i < 6; i++) {
        w = Math.max(2, w >> 1);
        h = Math.max(2, h >> 1);
        this.chain.push(renderTarget(w, h, this.targetType));
      }
      this.hasHistory = false;
    }

    /** Fixed (non-simulated) particle set: exact-size buffers, uploaded once. Zero-copy for float32 positions. */
    setFixedData(data) {
      this.fixedData = data;
      this.geometry.deleteAttribute("position");
      this.geometry.deleteAttribute("aPos");
      this.geometry.deleteAttribute("aVel");
      this.geometry.deleteAttribute("aNrm");
      this.geometry.deleteAttribute("aMisc");
      const position = new THREE.BufferAttribute(data.pos, 3);
      this.geometry.setAttribute("position", position);
      this.geometry.setAttribute("aPos", position);
      if (data.vel) this.geometry.setAttribute("aVel", new THREE.BufferAttribute(data.vel, 3));
      this.geometry.setAttribute("aNrm", new THREE.BufferAttribute(data.nrm8, 3, true));
      this.geometry.setAttribute("aMisc", new THREE.BufferAttribute(data.misc, 4));
      this.geometry.setDrawRange(0, data.n);
      this.attrVersion = -1;
      this.seenCount = -1;
    }

    /** Simulated particle set: positions and velocities stream every frame, the rest only when attrVersion changes. */
    updateAttributes(input) {
      const { n } = input;
      if (!n) return;
      if (!this.geometry.getAttribute("position") || this.fixedData || this.geometry.getAttribute("position").array.length < input.pos.length) {
        this.fixedData = null;
        const position = new THREE.BufferAttribute(input.pos, 3).setUsage(THREE.DynamicDrawUsage);
        const velocity = new THREE.BufferAttribute(input.vel, 3).setUsage(THREE.DynamicDrawUsage);
        const normal = new THREE.BufferAttribute(new Int8Array(input.nrm.length), 3, true);
        const particleData = new THREE.BufferAttribute(new Float32Array(input.t.length * 4), 4);
        this.geometry.setAttribute("position", position);
        this.geometry.setAttribute("aPos", position);
        this.geometry.setAttribute("aVel", velocity);
        this.geometry.setAttribute("aNrm", normal);
        this.geometry.setAttribute("aMisc", particleData);
        this.attrVersion = -1;
        this.seenCount = -1;
      }
      const pos = this.geometry.getAttribute("position");
      const vel = this.geometry.getAttribute("aVel");
      if (pos.array !== input.pos) pos.array = input.pos;
      if (vel.array !== input.vel) vel.array = input.vel;
      pos.needsUpdate = true;
      vel.needsUpdate = true;
      if (input.attrVersion !== this.attrVersion || n !== this.seenCount) {
        const nrm = this.geometry.getAttribute("aNrm");
        const misc = this.geometry.getAttribute("aMisc");
        const q = nrm.array;
        const m = misc.array;
        for (let i = 0; i < n; i++) {
          const o = i * 3;
          const mo = i * 4;
          m[mo] = input.t[i];
          m[mo + 1] = input.size[i];
          m[mo + 2] = input.alpha[i];
          m[mo + 3] = Math.min(3, input.layer[i]) + Math.min(0.999, input.phase[i]);
          q[o] = input.nrm[o] * 127;
          q[o + 1] = input.nrm[o + 1] * 127;
          q[o + 2] = input.nrm[o + 2] * 127;
        }
        nrm.needsUpdate = true;
        misc.needsUpdate = true;
        this.attrVersion = input.attrVersion;
        this.seenCount = n;
      }
      this.geometry.setDrawRange(0, n);
    }

    updateUniforms(input) {
      const { look, camera, n } = input;
      camera.updateMatrices(this.width / this.height);
      const uniforms = this.material.uniforms;
      uniforms.uView.value.fromArray(camera.view);
      uniforms.uProj.value.fromArray(camera.proj);
      uniforms.uPx.value = camera.pixelScale(this.height);
      uniforms.uOrtho.value = camera.ortho ? 1 : 0;
      uniforms.uSize.value = look.size;
      uniforms.uSizeVar.value = look.sizeVariation;
      uniforms.uSizeAtt.value = look.sizeAttenuation ? 1 : 0;
      uniforms.uTime.value = input.time;
      uniforms.uOpacity.value = look.opacity;
      uniforms.uEmission.value = look.emission;
      uniforms.uNorm.value = look.autoNormalize ? Math.min(3, Math.max(0.35, Math.sqrt(80000 / n))) : 1;
      uniforms.uEdge.value = look.edgeBrightness;
      uniforms.uDepthFade.value = look.depthFade;
      uniforms.uDepthColor.value = look.depthColor;
      uniforms.uVelColor.value = look.velocityColor;
      uniforms.uStretch.value = look.velocityStretch;
      uniforms.uLight.value = look.lighting;
      uniforms.uSpin.value = look.spin;
      uniforms.uFocus.value = input.focus;
      uniforms.uRange.value = Math.max(0.1, input.range);
      const az = look.lightAzimuth * Math.PI / 180;
      const el = look.lightElevation * Math.PI / 180;
      uniforms.uLightDir.value.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
      const layers = uniforms.uLayer.value;
      for (let i = 0; i < 4; i++) {
        layers[i * 4] = input.layers[i]?.sizeMul ?? 1;
        layers[i * 4 + 1] = input.layers[i]?.opacityMul ?? 1;
        layers[i * 4 + 2] = 0;
        layers[i * 4 + 3] = 0;
      }
      uniforms.uShape.value = SHAPES[look.shape] ?? 0;
      uniforms.uSoft.value = look.softness;
      updateLightBeamFrame(input.beams, input.time, this.beamFrame);
      uniforms.uBeamCount.value = this.beamFrame.count;
      uniforms.uBeamOriginLen.value = this.beamFrame.originLength;
      uniforms.uBeamDirWidth.value = this.beamFrame.directionWidth;
      uniforms.uBeamProfile.value = this.beamFrame.profile;
      uniforms.uBeamAnim.value = this.beamFrame.animation;
      uniforms.uBeamTint.value = this.beamFrame.tint;
      uniforms.uBeamSideA.value = this.beamFrame.sideA;
      uniforms.uBeamSideB.value = this.beamFrame.sideB;
    }

    renderPass(material, target) {
      this.renderer.setRenderTarget(target);
      this.pass.material = material;
      this.renderer.render(this.passScene, this.passCamera);
    }

    /**
     * @param input  { n, look, camera, layers, beams, bloomLevel, focus, range, time } plus either
     *               `fixed` ({ n, pos, vel, nrm8, misc }) or the simulation arrays (pos, vel, nrm, t, size, alpha, phase, layer, attrVersion).
     */
    render(input, transparent = false) {
      if (!input.n || this.disposed) return;
      if (this.autoResize) this.resize();
      if (this.paletteDirty) {
        const rows = [0, 1, 2, 3].map((i) => input.layers[i]?.palette ?? input.look.palette);
        this.paletteTexture.image.data.set(paletteBytes(rows));
        this.paletteTexture.needsUpdate = true;
        this.paletteDirty = false;
      }
      if (input.fixed) { if (this.fixedData !== input.fixed) this.setFixedData(input.fixed); }
      else this.updateAttributes(input);
      this.updateUniforms(input);
      const look = input.look;
      const current = this.targets[this.sceneIndex];
      const previous = this.targets[1 - this.sceneIndex];
      this.renderer.setRenderTarget(current);
      if (look.trails > 0.01 && this.hasHistory) {
        this.fadeMaterial.uniforms.t.value = previous.texture;
        this.fadeMaterial.uniforms.k.value = look.trails * 0.96;
        this.renderPass(this.fadeMaterial, current);
      } else {
        this.renderer.clear(true, false, false);
      }
      this.material.blendDst = look.blend === "additive"
        ? THREE.OneFactor
        : look.blend === "screen" ? THREE.OneMinusSrcColorFactor : THREE.OneMinusSrcAlphaFactor;
      this.material.blendDstAlpha = look.blend === "additive" ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor;
      this.renderer.setRenderTarget(current);
      this.renderer.render(this.particleScene, this.camera);

      const levels = input.bloomLevel <= 0 ? 0 : input.bloomLevel === 1 ? 3 : 5;
      const doBloom = levels > 0 && look.glow > 0.001;
      if (doBloom) {
        const off = 0.6 + look.glowRadius * 1.6;
        let source = current;
        for (let i = 0; i < levels; i++) {
          const dest = this.chain[i];
          this.downMaterial.uniforms.t.value = source.texture;
          this.downMaterial.uniforms.px.value.set(1 / source.width, 1 / source.height);
          this.downMaterial.uniforms.off.value = off;
          this.renderPass(this.downMaterial, dest);
          source = dest;
        }
        for (let i = levels - 1; i > 0; i--) {
          const src = this.chain[i], dest = this.chain[i - 1];
          this.upMaterial.uniforms.t.value = src.texture;
          this.upMaterial.uniforms.px.value.set(1 / src.width, 1 / src.height);
          this.upMaterial.uniforms.off.value = off;
          this.renderPass(this.upMaterial, dest);
        }
      }

      const bg = parseColor(look.background);
      const composite = this.compositeMaterial.uniforms;
      composite.scene.value = current.texture;
      composite.bloom.value = doBloom ? this.chain[0].texture : current.texture;
      composite.glow.value = look.glow * 1.4;
      composite.exposure.value = look.exposure;
      composite.vignette.value = look.vignette;
      composite.grain.value = look.grain;
      composite.alphaMode.value = look.blend === "alpha" ? 1 : 0;
      composite.transparent.value = transparent || look.transparent ? 1 : 0;
      composite.hasBloom.value = doBloom ? 1 : 0;
      composite.seed.value = (input.time * 7.13) % 100;
      composite.bg.value.set(bg[0] / 255, bg[1] / 255, bg[2] / 255);
      this.renderPass(this.compositeMaterial, null);
      this.renderer.setRenderTarget(null);
      this.sceneIndex = 1 - this.sceneIndex;
      this.hasHistory = true;
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
      if (this.resizeObserver) this.resizeObserver.disconnect();
      if (this.handleWindowResize) window.removeEventListener("resize", this.handleWindowResize);
      this.targets.forEach((target) => target.dispose());
      this.chain.forEach((target) => target.dispose());
      this.geometry.dispose();
      this.material.dispose();
      this.paletteTexture.dispose();
      this.pass.geometry.dispose();
      this.fadeMaterial.dispose();
      this.downMaterial.dispose();
      this.upMaterial.dispose();
      this.compositeMaterial.dispose();
      this.renderer.dispose();
      this.renderer.forceContextLoss();
    }
  };
}
