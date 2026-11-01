import { Suspense, lazy, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import App from "./App";
import ModeSwitch, { type StudioMode } from "./ModeSwitch";

// The shader studio is a separate chunk: it only loads the first time it is opened.
const ShaderStudio = lazy(() => import("./shader/ShaderStudio"));

const MODE_KEY = "particle-studio-mode";

function readMode(): StudioMode {
  try {
    return localStorage.getItem(MODE_KEY) === "shaders" ? "shaders" : "particles";
  } catch {
    return "particles";
  }
}

/**
 * Hosts both studios. The Particle studio (App) is never modified: it stays
 * mounted while you are in the Shader studio, so nothing in it is lost when you
 * switch back. The mode switch is placed into App's own top bar.
 */
export default function Root() {
  const [mode, setMode] = useState<StudioMode>(readMode);
  const [shadersOpened, setShadersOpened] = useState(mode === "shaders");
  const [switchHost, setSwitchHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* storage can be unavailable in private windows */
    }
    if (mode === "shaders") setShadersOpened(true);
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
            <ShaderStudio active={mode === "shaders"} modeSwitch={<ModeSwitch mode={mode} onChange={setMode} />} />
          </Suspense>
        </div>
      )}
      {switchHost && createPortal(<ModeSwitch mode={mode} onChange={setMode} />, switchHost)}
    </>
  );
}
