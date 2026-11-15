import { createRoot } from "react-dom/client";
import Studio3D from "../../src/studio3d/Studio3D";

/** Mounts the real Studio so ui.ts can drive the Export tab in a browser. */
createRoot(document.getElementById("root")!).render(<Studio3D active modeSwitch={null} />);
