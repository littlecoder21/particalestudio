import { OrbitCamera } from "./camera";
import { PointerController } from "./interaction";
import { COMPOSITE, DOWN, FADE, FRAG, UP, VERT } from "./renderer";
import { createLightBeamFrame, updateLightBeamFrame } from "./lightBeams";
import { paletteBytes, parseColor } from "./palette";
import { Simulation } from "./simulation";
import { QUALITY } from "./types";

const POINT_VERTEX = VERT.replace(/^#version 300 es\s*/, "");
const POINT_FRAGMENT = FRAG.replace(/^#version 300 es\s*/, "");
const DOWN_FRAGMENT = DOWN.replace(/^#version 300 es\s*/, "");
const UP_FRAGMENT = UP.replace(/^#version 300 es\s*/, "");
const FADE_FRAGMENT = FADE.replace(/^#version 300 es\s*/, "");
const COMPOSITE_FRAGMENT = COMPOSITE.replace(/^#version 300 es\s*/, "");
const FULLSCREEN_VERTEX = `precision highp float;
layout(location=0) in vec3 position;
out vec2 uv;
void main(){ uv=position.xy*0.5+0.5; gl_Position=vec4(position.xy,0.0,1.0); }`;
const SHAPES = { soft: 0, hard: 1, ring: 2, spark: 3, square: 4, diamond: 5 };
const THREE = window.THREE;

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

class ThreeParticleRenderer {
  constructor(canvas, project, quality) {
    this.canvas = canvas;
    this.project = project;
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
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
    this.paletteKey = "";
    this.beamFrame = createLightBeamFrame();

    const gl = this.renderer.getContext();
    const hdr = !!(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
    gl.getExtension("OES_texture_float_linear");
    this.targetType = hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;

    this.particleScene = new THREE.Scene();
    this.camera = new THREE.Camera();
    this.geometry = new THREE.BufferGeometry();
    this.points = null;
    this.material = this.createParticleMaterial();
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.particleScene.add(this.points);

    this.passScene = new THREE.Scene();
    this.passCamera = new THREE.Camera();
    const quad = new THREE.BufferGeometry();
    quad.setAttribute("position", new THREE.Float32BufferAttribute([
      -1, -1, 0, 3, -1, 0, -1, 3, 0,
    ], 3));
    this.pass = new THREE.Mesh(quad, null);
    this.pass.frustumCulled = false;
    this.passScene.add(this.pass);
    this.fadeMaterial = shaderMaterial(FULLSCREEN_VERTEX, FADE_FRAGMENT, {
      t: { value: null }, k: { value: 1 },
    });
    this.downMaterial = shaderMaterial(FULLSCREEN_VERTEX, DOWN_FRAGMENT, {
      t: { value: null }, px: { value: new THREE.Vector2() }, off: { value: 1 },
    });
    this.upMaterial = shaderMaterial(FULLSCREEN_VERTEX, UP_FRAGMENT, {
      t: { value: null }, px: { value: new THREE.Vector2() }, off: { value: 1 },
    }, {
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
    });
    this.compositeMaterial = shaderMaterial(FULLSCREEN_VERTEX, COMPOSITE_FRAGMENT, {
      scene: { value: null }, bloom: { value: null }, glow: { value: 0 },
      exposure: { value: 1 }, vignette: { value: 0 }, grain: { value: 0 },
      alphaMode: { value: 0 }, transparent: { value: 0 }, hasBloom: { value: 0 },
      seed: { value: 0 }, bg: { value: new THREE.Vector3() },
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.handleWindowResize = () => this.resize();
    window.addEventListener("resize", this.handleWindowResize);
    this.resize();
  }

  createParticleMaterial() {
    const paletteTexture = new THREE.DataTexture(
      new Uint8Array(256 * 4 * 4),
      256,
      4,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    paletteTexture.magFilter = THREE.LinearFilter;
    paletteTexture.minFilter = THREE.LinearFilter;
    paletteTexture.wrapS = THREE.ClampToEdgeWrapping;
    paletteTexture.wrapT = THREE.ClampToEdgeWrapping;
    paletteTexture.flipY = false;
    this.paletteTexture = paletteTexture;
    const layers = new Float32Array(16);
    return shaderMaterial(POINT_VERTEX, POINT_FRAGMENT, {
      uView: { value: new THREE.Matrix4() },
      uProj: { value: new THREE.Matrix4() },
      uPx: { value: 1 },
      uOrtho: { value: 0 },
      uSize: { value: 1 },
      uSizeVar: { value: 0 },
      uSizeAtt: { value: 1 },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uEmission: { value: 1 },
      uNorm: { value: 1 },
      uEdge: { value: 0 },
      uDepthFade: { value: 0 },
      uDepthColor: { value: 0 },
      uVelColor: { value: 0 },
      uStretch: { value: 0 },
      uLight: { value: 1 },
      uSpin: { value: 0 },
      uFocus: { value: 3 },
      uRange: { value: 1 },
      uLightDir: { value: new THREE.Vector3() },
      uLayer: { value: layers },
      uPalette: { value: paletteTexture },
      uShape: { value: 0 },
      uSoft: { value: 0.5 },
      uBeamCount: { value: 0 },
      uBeamOriginLen: { value: this.beamFrame.originLength },
      uBeamDirWidth: { value: this.beamFrame.directionWidth },
      uBeamProfile: { value: this.beamFrame.profile },
      uBeamAnim: { value: this.beamFrame.animation },
      uBeamTint: { value: this.beamFrame.tint },
      uBeamSideA: { value: this.beamFrame.sideA },
      uBeamSideB: { value: this.beamFrame.sideB },
    }, {
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
    });
  }

  updatePalette(input) {
    if (this.paletteKey) return;
    const rows = [0, 1, 2, 3].map((i) => input.layers[i]?.palette ?? input.look.palette);
    this.paletteKey = "ready";
    this.paletteTexture.image.data.set(paletteBytes(rows));
    this.paletteTexture.needsUpdate = true;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality.dpr);
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

  updateAttributes(input) {
    const { n } = input;
    if (!n) return;
    if (!this.geometry.getAttribute("position") || this.geometry.getAttribute("position").array.length < input.pos.length) {
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

  render(input, transparent = false) {
    if (!input.n) return;
    this.resize();
    this.updatePalette(input);
    this.updateAttributes(input);
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
    this.resizeObserver.disconnect();
    window.removeEventListener("resize", this.handleWindowResize);
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
  }
}

function unpackFormation(payload) {
  const binary = atob(payload.packed);
  const bytes = Uint8Array.from(binary, (value) => value.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const { count: n, radius } = payload;
  const velocity = new Float32Array(n * 3);
  const homeBase = new Float32Array(n * 3);
  const formation = {
    n,
    pos: new Float32Array(n * 3),
    nrm: new Float32Array(n * 3),
    t: new Float32Array(n),
    size: new Float32Array(n),
    alpha: new Float32Array(n),
    phase: new Float32Array(n),
    weight: new Float32Array(n),
    layer: new Uint8Array(n),
    radius,
  };
  for (let i = 0; i < n; i++) {
    const o = i * 3, at = i * 69;
    for (let axis = 0; axis < 3; axis++) {
      formation.pos[o + axis] = view.getFloat32(at + axis * 4, true);
      formation.nrm[o + axis] = view.getFloat32(at + 12 + axis * 4, true);
      velocity[o + axis] = view.getFloat32(at + 24 + axis * 4, true);
      homeBase[o + axis] = view.getFloat32(at + 36 + axis * 4, true);
    }
    formation.t[i] = view.getFloat32(at + 48, true);
    formation.size[i] = view.getFloat32(at + 52, true);
    formation.alpha[i] = view.getFloat32(at + 56, true);
    formation.phase[i] = view.getFloat32(at + 60, true);
    formation.weight[i] = view.getFloat32(at + 64, true);
    formation.layer[i] = bytes[at + 68];
  }
  return { formation, velocity, homeBase };
}

function startExportScene() {
  const payload = window.PARTICLE_SCENE;
  const canvas = document.getElementById("scene");
  if (!payload || !(canvas instanceof HTMLCanvasElement)) return;
  if (!THREE) {
    document.body.textContent = "Unable to start the 3D scene: Three.js did not load from its CDN.";
    return;
  }
  try {
    const project = payload.project;
    const quality = QUALITY[project.quality];
    const simulation = new Simulation();
    const camera = new OrbitCamera();
    const renderer = new ThreeParticleRenderer(canvas, project, quality);
    camera.apply(project.camera);
    camera.yawVel = payload.cameraYawVelocity;
    camera.pitchVel = payload.cameraPitchVelocity;
    simulation.configure(project.sim, project.behaviors, project.deformers, quality);
    const unpacked = unpackFormation(payload);
    simulation.load(unpacked.formation);
    simulation.vel.set(unpacked.velocity);
    simulation.homeBase.set(unpacked.homeBase);
    simulation.active = Math.min(payload.count, Math.max(1, payload.active));
    simulation.time = payload.time;
    simulation.tick = payload.tick;
    const pointer = new PointerController(canvas, camera, simulation, () => project.interaction);
    const layers = project.layers.map((layer) => ({ palette: layer.palette, sizeMul: layer.sizeMul, opacityMul: layer.opacityMul }));
    const toggle = document.getElementById("toggle-animation");
    let animationPaused = false;
    toggle?.addEventListener("click", () => {
      animationPaused = !animationPaused;
      simulation.paused = animationPaused;
      toggle.textContent = animationPaused ? "Resume animation" : "Pause animation";
      toggle.setAttribute("aria-pressed", String(animationPaused));
    });
    let last = performance.now(), frame = 0, disposed = false, firstFrame = true;
    const draw = (now) => {
      if (disposed) return;
      if (firstFrame) {
        firstFrame = false;
        last = now;
      } else {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (!animationPaused) {
          simulation.update(dt);
          camera.update(dt);
        }
      }
      renderer.render({
        n: simulation.active,
        pos: simulation.pos,
        vel: simulation.vel,
        nrm: simulation.nrm,
        t: simulation.t,
        size: simulation.size,
        alpha: simulation.alpha,
        phase: simulation.phase,
        layer: simulation.layer,
        attrVersion: simulation.attrVersion,
        time: simulation.time,
        camera,
        look: project.look,
        layers,
        beams: project.beams,
        bloomLevel: quality.bloom,
        focus: camera.distance,
        range: Math.max(0.5, simulation.radius),
      });
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    window.addEventListener("pagehide", () => {
      disposed = true;
      cancelAnimationFrame(frame);
      pointer.dispose();
      renderer.dispose();
    }, { once: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    document.body.textContent = `Unable to start the 3D scene: ${message}`;
    console.error(error);
  }
}

startExportScene();
