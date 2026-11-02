import { useEffect, useMemo, useState } from "react";
import { ChoiceGroup, SoftTip } from "./controls";
import { LIBRARY_FAMILIES, LIBRARY_ITEMS, cssSwatch, librarySearch, type LibraryFamily, type LibraryItem } from "./library";
import { MAX_LAYERS } from "./types";
import { libraryThumbKey, thumbStore } from "./thumbs";
import { useThumb } from "./useThumb";

export type InsertAt = "Top" | "Bottom";

interface LibraryPanelProps {
  layerCount: number;
  onAdd: (item: LibraryItem, at: InsertAt) => void;
  onOpenStack: () => void;
}

function ElementCard({ item, onPick }: { item: LibraryItem; onPick: () => void }) {
  const baked = useThumb(libraryThumbKey(item.id));
  const css = useMemo(() => cssSwatch(item), [item]);
  const style = css ? { background: css } : baked ? undefined : { background: "linear-gradient(135deg, #2d365a, #10142a)" };
  return (
    <button type="button" className="element-card" onClick={onPick} title={`${item.label} — ${item.family}`}>
      <span className="element-thumb" style={style}>
        {!css && baked ? <img src={baked} alt="" draggable={false} /> : null}
        {item.layers.length > 1 && <span className="element-badge">{item.layers.length} layers</span>}
      </span>
      <span className="element-name">{item.label}</span>
    </button>
  );
}

/**
 * The Elements library — a searchable shelf of ready-made layers. Tap one to add
 * it to the stack: use backgrounds and gradients underneath, fields, patterns and
 * light on top, grain and noise to finish, or recipes that add several at once.
 */
export default function LibraryPanel({ layerCount, onAdd, onOpenStack }: LibraryPanelProps) {
  const [family, setFamily] = useState<LibraryFamily | "All">("All");
  const [query, setQuery] = useState("");
  const [at, setAt] = useState<InsertAt>("Top");

  /* render the shader-based thumbnails (fields, patterns, light, texture) in the background */
  useEffect(() => {
    thumbStore.startLibrary();
  }, []);

  const items = useMemo(() => librarySearch(LIBRARY_ITEMS, family, query), [family, query]);
  const full = layerCount >= MAX_LAYERS;

  return (
    <>
      <div className="preset-search">
        <input type="search" placeholder="Search elements…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search elements" />
        <small>{items.length}</small>
      </div>

      <div className="family-row" role="tablist" aria-label="Element families">
        {(["All", ...LIBRARY_FAMILIES] as Array<LibraryFamily | "All">).map((f) => (
          <button key={f} type="button" role="tab" aria-selected={f === family} className={`family-chip ${f === family ? "active" : ""}`} onClick={() => setFamily(f)}>
            {f}
          </button>
        ))}
      </div>

      <div className="library-bar">
        <ChoiceGroup label="Add to" value={at} options={["Top", "Bottom"] as const} onChange={setAt} />
        <button type="button" className="text-action" onClick={onOpenStack}>
          {layerCount} / {MAX_LAYERS} · Open stack →
        </button>
      </div>

      {full && <p className="field-help">The stack is full. Delete a layer in the Stack tab to add more.</p>}

      <div className="element-grid">
        {items.map((item) => (
          <ElementCard key={item.id} item={item} onPick={() => onAdd(item, at)} />
        ))}
      </div>
      {items.length === 0 && <p className="field-help">No element matches “{query}”.</p>}

      <SoftTip>
        <b>Bottom</b> puts an element under the main field — then lower the field's opacity or switch its blend to <b>Screen</b> / <b>Multiply</b> in the Stack tab to let it show through.
      </SoftTip>
    </>
  );
}
