import { useSyncExternalStore } from "react";
import { thumbStore } from "./thumbs";

/** The baked thumbnail for a key (a data URL), or undefined until it has been rendered. */
export function useThumb(key: string): string | undefined {
  return useSyncExternalStore(thumbStore.subscribe, () => thumbStore.get(key));
}
