/**
 * Bootstrap for the standalone HTML export. The exporter prepends
 *   const __PS_EMBED__ = { enc, data, config, label, hint, capture? };
 * to this bundle, so the page needs no other files. Everything below runs in module scope (no globals).
 */
import { createParticleScene } from "./particleEngine";

const embed = __PS_EMBED__;
const root = document.getElementById("ps-root");

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === "undefined") throw new Error('This browser cannot unpack the compressed particle data (DecompressionStream is missing). Export again with "Embedded encoding: Base64".');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function showFailure(message) {
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "ps-retry";
  retry.textContent = "Try again";
  retry.addEventListener("click", () => location.reload());
  if (!root.querySelector(".ps-particle__message")) {
    const note = document.createElement("div");
    note.className = "ps-particle__message";
    note.setAttribute("role", "alert");
    note.textContent = `3D scene unavailable: ${message}`;
    root.appendChild(note);
  }
  root.querySelector(".ps-particle__message").appendChild(retry);
}

async function main() {
  const capture = embed.capture;
  if (capture) {
    root.style.cssText = `width:${capture.width}px;height:${capture.height}px;position:relative`;
    document.body.style.overflow = "hidden";
  }
  let scene;
  try {
    let bytes = base64ToBytes(embed.data);
    if (embed.enc === "b64z") bytes = await inflateRaw(bytes);
    scene = await createParticleScene({
      container: root, data: bytes.buffer, config: embed.config, lazy: false, errorUI: "message",
      autoplay: capture ? false : undefined, pixelRatio: capture ? 1 : undefined,
      respectReducedMotion: !capture, label: embed.label,
    });
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    if (capture) parent.postMessage({ type: "ps-capture-error", message }, "*");
    else showFailure(message);
    return;
  }
  if (capture) {
    parent.postMessage({ type: "ps-capture", png: scene.capture(), info: scene.info }, "*");
    return;
  }
  const label = document.getElementById("ps-label");
  if (label) label.textContent = embed.hint;
  const toggle = document.getElementById("ps-toggle");
  if (!toggle) return;
  const sync = () => {
    toggle.textContent = scene.isPlaying ? "Pause animation" : "Resume animation";
    toggle.setAttribute("aria-pressed", String(!scene.isPlaying));
  };
  toggle.addEventListener("click", () => { if (scene.isPlaying) scene.pause(); else scene.play(); sync(); });
  sync();
}

main();
