import { Suspense, lazy, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import App from "./App";
import ModeSwitch, { type StudioMode } from "./ModeSwitch";
import type { GeometryDocument } from "./geometry/model";

// The shader studio is a separate chunk: it only loads the first time it is opened.
const ShaderStudio = lazy(() => import("./shader/ShaderStudio"));
const ShapeDesigner = lazy(() => import("./designer/ShapeDesigner"));
// The 3D studio (WebGL2 particle engine + 20 shape presets) is also its own lazy chunk.
const Studio3D = lazy(() => import("./studio3d/Studio3D"));

const MODE_KEY = "particle-studio-mode";

function readMode(): StudioMode {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    return saved === "shaders" || saved === "designer" || saved === "3d" ? saved : "particles";
  } catch {
    return "particles";
  }
}

/**
 * Hosts all studios. The Particle studio (App) is never modified: it stays
 * mounted while you are in another studio, so nothing in it is lost when you
 * switch back. The mode switch is placed into App's own top bar.
 */
export default function Root() {
  const [mode, setMode] = useState<StudioMode>(readMode);
  const [shadersOpened, setShadersOpened] = useState(mode === "shaders");
  const [studio3dOpened, setStudio3dOpened] = useState(mode === "3d");
  const [switchHost, setSwitchHost] = useState<HTMLElement | null>(null);
  const [designerRequest, setDesignerRequest] = useState<{ id: number; document: GeometryDocument } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* storage can be unavailable in private windows */
    }
    if (mode === "shaders") setShadersOpened(true);
    if (mode === "3d") setStudio3dOpened(true);
    // Make the particle canvas re-measure after being hidden.
    if (mode === "particles") window.dispatchEvent(new Event("resize"));
  }, [mode]);

  useEffect(() => {
    const bar = document.querySelector<HTMLElement>(".particle-pane .topbar");
    if (!bar) return;
    const host = document.createElement("div");
    host.className = "mode-switch-host";
    bar.insertBefore(host, bar.querySelector(".top-actions"));
    setSwitchHost(host);
    return () => {
      host.remove();
      setSwitchHost(null);
    };
  }, []);

  return (
    <>
      <div className="mode-pane particle-pane" hidden={mode !== "particles"}>
        <App />
      </div>
      {shadersOpened && (
        <div className="mode-pane" hidden={mode !== "shaders"}>
          <Suspense fallback={<div className="studio shader-loading">Loading shader studio…</div>}>
            <ShaderStudio
              active={mode === "shaders"}
              modeSwitch={<ModeSwitch mode={mode} onChange={setMode} />}
              designerRequest={designerRequest}
            />
          </Suspense>
        </div>
      )}
      {studio3dOpened && (
        <div className="mode-pane" hidden={mode !== "3d"}>
          <Suspense fallback={<div className="studio shader-loading">Loading 3D studio…</div>}>
            <Studio3D active={mode === "3d"} modeSwitch={<ModeSwitch mode={mode} onChange={setMode} />} />
          </Suspense>
        </div>
      )}
      {mode === "designer" && (
        <Suspense fallback={<div className="studio shader-loading">Loading Shape Designer…</div>}>
          <ShapeDesigner
            onBack={() => setMode("particles")}
            onUseInParticles={(document) => {
              window.dispatchEvent(new CustomEvent("particle-studio-use-designer", { detail: document }));
              setMode("particles");
            }}
            onUseInShaders={(document) => {
              setDesignerRequest({ id: Date.now(), document });
              setShadersOpened(true);
              setMode("shaders");
            }}
          />
        </Suspense>
      )}
      {switchHost && createPortal(<ModeSwitch mode={mode} onChange={setMode} />, switchHost)}
    </>
  );
}
