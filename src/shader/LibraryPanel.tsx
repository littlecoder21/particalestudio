import { useEffect, useMemo, useRef, useState } from "react";
import { ChoiceGroup, SoftTip } from "./controls";
import { LIBRARY_FAMILIES, LIBRARY_GROUPS, LIBRARY_ITEMS, cssSwatch, librarySearch, type LibraryFamily, type LibraryItem } from "./library";
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
  const ref = useRef<HTMLButtonElement>(null);

  /* bake a card's thumbnail as soon as it scrolls near the screen, instead of working through 700 in order */
  useEffect(() => {
    const node = ref.current;
    if (css || baked || !node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        thumbStore.prioritize([libraryThumbKey(item.id)]);
        observer.disconnect();
      },
      { rootMargin: "160px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [css, baked, item.id]);

  const style = css ? { background: css } : baked ? undefined : { background: "linear-gradient(135deg, #2d365a, #10142a)" };
  return (
    <button ref={ref} type="button" className="element-card" onClick={onPick} title={`${item.label} — ${item.family} · ${item.group}`}>
      <span className="element-thumb" style={style}>
        {!css && baked ? <img src={baked} alt="" draggable={false} /> : null}
        {item.layers.length > 1 && <span className="element-badge">{item.layers.length} layers</span>}
      </span>
      <span className="element-name">{item.label}</span>
    </button>
  );
}

interface Section {
  key: string;
  family: LibraryFamily;
  group: string;
  items: LibraryItem[];
}

/** Items split into one section per family + group, keeping the library's own order. */
function toSections(items: LibraryItem[]): Section[] {
  const sections: Section[] = [];
  const index = new Map<string, Section>();
  for (const item of items) {
    const key = `${item.family}/${item.group}`;
    let section = index.get(key);
    if (!section) {
      section = { key, family: item.family, group: item.group, items: [] };
      index.set(key, section);
      sections.push(section);
    }
    section.items.push(item);
  }
  return sections;
}

/**
 * The Elements library — 700 ready-made layers in seven families of 100, each family split
 * into named shelves. Tap one to add it to the stack: use backgrounds and gradients
 * underneath, fields, patterns and light on top, texture to finish, or recipes that add
 * several layers at once.
 */
export default function LibraryPanel({ layerCount, onAdd, onOpenStack }: LibraryPanelProps) {
  const [family, setFamily] = useState<LibraryFamily | "All">("All");
  const [group, setGroup] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [at, setAt] = useState<InsertAt>("Top");

  /* render the shader-based thumbnails of the shelf being looked at first, then the rest in the background */
  useEffect(() => {
    thumbStore.startLibrary(family, group);
  }, [family, group]);

  const pickFamily = (next: LibraryFamily | "All"): void => {
    setFamily(next);
    setGroup("All");
  };

  const items = useMemo(() => librarySearch(LIBRARY_ITEMS, family, query, group), [family, query, group]);
  const sections = useMemo(() => (query.trim() ? [] : toSections(items)), [items, query]);
  const groups = family === "All" ? [] : LIBRARY_GROUPS[family];
  const full = layerCount >= MAX_LAYERS;

  const countIn = (g: string): number => LIBRARY_ITEMS.filter((it) => it.family === family && it.group === g).length;

  return (
    <>
      <div className="preset-search">
        <input type="search" placeholder="Search 700 elements…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search elements" />
        <small>{items.length}</small>
      </div>

      <div className="family-row" role="tablist" aria-label="Element families">
        {(["All", ...LIBRARY_FAMILIES] as Array<LibraryFamily | "All">).map((f) => (
          <button key={f} type="button" role="tab" aria-selected={f === family} className={`family-chip ${f === family ? "active" : ""}`} onClick={() => pickFamily(f)}>
            {f}
          </button>
        ))}
      </div>

      {groups.length > 0 && (
        <div className="family-row group-row" role="tablist" aria-label={`${family} groups`}>
          {["All", ...groups].map((g) => (
            <button key={g} type="button" role="tab" aria-selected={g === group} className={`family-chip small ${g === group ? "active" : ""}`} onClick={() => setGroup(g)}>
              {g}
              <span className="chip-count">{g === "All" ? LIBRARY_ITEMS.filter((it) => it.family === family).length : countIn(g)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="library-bar">
        <ChoiceGroup label="Add to" value={at} options={["Top", "Bottom"] as const} onChange={setAt} />
        <button type="button" className="text-action" onClick={onOpenStack}>
          {layerCount} / {MAX_LAYERS} · Open stack →
        </button>
      </div>

      {full && <p className="field-help">The stack is full. Delete a layer in the Stack tab to add more.</p>}

      {query.trim() ? (
        <div className="element-grid">
          {items.map((item) => (
            <ElementCard key={item.id} item={item} onPick={() => onAdd(item, at)} />
          ))}
        </div>
      ) : (
        sections.map((section, index) => (
          <section key={section.key} className="element-section">
            {(family === "All" || group === "All") && (
              <h3 className="element-heading">
                {family === "All" && (index === 0 || sections[index - 1]?.family !== section.family) ? <span className="element-family">{section.family}</span> : null}
                <span>{section.group}</span>
                <small>{section.items.length}</small>
              </h3>
            )}
            <div className="element-grid">
              {section.items.map((item) => (
                <ElementCard key={item.id} item={item} onPick={() => onAdd(item, at)} />
              ))}
            </div>
          </section>
        ))
      )}
      {items.length === 0 && <p className="field-help">No element matches “{query}”.</p>}

      <SoftTip>
        <b>Bottom</b> puts an element under the main field — then lower the field's opacity or switch its blend to <b>Screen</b> / <b>Multiply</b> in the Stack tab to let it show through.
      </SoftTip>
    </>
  );
}
