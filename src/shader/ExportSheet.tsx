import { useEffect, useMemo, useRef, useState, type ComponentType, type RefObject } from "react";
import { ChoiceGroup } from "./controls";
import {
  EXPORT_FORMATS,
  buildProjectZip,
  extractProject,
  generateShaderCode,
  projectJson,
  slugify,
  type ExportFormatId,
} from "./exporter";
import { IconClose, IconCode, IconCopy, IconDownload, IconFile, IconImage, IconVideo } from "./icons";
import type { MaskPixels } from "./mask";
import { normalizeProject } from "./project";
import type { ShaderRenderer } from "./renderer";
import type { ShaderProject } from "./types";

/* ───────────────────────── helpers ───────────────────────── */

const IMAGE_SIZES = [
  { id: "preview", label: "Preview size", w: 0, h: 0 },
  { id: "720", label: "1280 × 720", w: 1280, h: 720 },
  { id: "1080", label: "1920 × 1080", w: 1920, h: 1080 },
  { id: "1440", label: "2560 × 1440", w: 2560, h: 1440 },
  { id: "4k", label: "3840 × 2160", w: 3840, h: 2160 },
] as const;
type ImageSizeId = (typeof IMAGE_SIZES)[number]["id"];

const IMAGE_FORMATS = ["PNG", "JPG"] as const;
type ImageFormat = (typeof IMAGE_FORMATS)[number];

type SheetTab = "code" | "image" | "video" | "project";

const TABS: Array<{ id: SheetTab; label: string; icon: ComponentType<{ size?: number }> }> = [
  { id: "code", label: "Code", icon: IconCode },
  { id: "image", label: "Image", icon: IconImage },
  { id: "video", label: "Video", icon: IconVideo },
  { id: "project", label: "Project", icon: IconFile },
];

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const downloadText = (text: string, filename: string, mime: string): void =>
  downloadBlob(new Blob([text], { type: mime }), filename);

/* ───────────────────────── sheet ───────────────────────── */

interface ExportSheetProps {
  open: boolean;
  project: ShaderProject;
  /** the packed image-mask texture currently on screen (embedded into code exports) */
  mask: MaskPixels | null;
  canvasRef: RefObject<HTMLCanvasElement>;
  rendererRef: RefObject<ShaderRenderer | null>;
  onClose: () => void;
  onLoadProject: (project: ShaderProject) => void;
  onRecordingChange: (recording: boolean) => void;
  showToast: (message: string) => void;
}

/**
 * One export menu for everything: code, PNG / JPG images, video and project files.
 * It is a bottom sheet on phones and a centred dialog on larger screens.
 */
export default function ExportSheet({
  open,
  project,
  mask,
  canvasRef,
  rendererRef,
  onClose,
  onLoadProject,
  onRecordingChange,
  showToast,
}: ExportSheetProps) {
  const [tab, setTab] = useState<SheetTab>("code");
  const [codeFormat, setCodeFormat] = useState<ExportFormatId>("standaloneHtml");
  const [imageSize, setImageSize] = useState<ImageSizeId>("1080");
  const [imageFormat, setImageFormat] = useState<ImageFormat>("PNG");
  const [videoSeconds, setVideoSeconds] = useState(6);
  const [videoFps, setVideoFps] = useState(60);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Esc closes the sheet */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* never leave a recorder running if the studio goes away */
  useEffect(
    () => () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    },
    [],
  );

  /* generating every format is only worth doing while the code tab is on screen */
  const code = useMemo(() => (open && tab === "code" ? generateShaderCode(project, mask) : null), [open, tab, project, mask]);
  const currentFormat = EXPORT_FORMATS.find((f) => f.id === codeFormat) ?? EXPORT_FORMATS[0];
  const currentCode = code ? code[codeFormat] : "";

  /* the embedded mask is a long base64 string — keep it out of the preview box, not out of the download */
  const previewCode = useMemo(() => {
    if (!code || !code.maskUrl || !currentCode.includes(code.maskUrl)) return currentCode;
    const kb = Math.max(1, Math.round(code.maskUrl.length / 1024));
    return currentCode.split(code.maskUrl).join(`data:image/png;base64,…(${kb} KB mask texture — included when you copy or download)`);
  }, [code, currentCode]);

  const copyCode = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied to clipboard");
    } catch {
      showToast("Copy failed — download the file instead");
    }
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const next = normalizeProject(extractProject(await file.text()));
      onLoadProject(next);
      onClose();
    } catch {
      showToast("That file isn't a Shader Studio project");
    }
  };

  const exportImage = async () => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const size = IMAGE_SIZES.find((s) => s.id === imageSize) ?? IMAGE_SIZES[0];
    const w = size.w || renderer.canvas.width;
    const h = size.h || renderer.canvas.height;
    const jpg = imageFormat === "JPG";
    const blob = await renderer.snapshot(w, h, jpg ? "image/jpeg" : "image/png");
    if (!blob) {
      showToast("Couldn't render the image");
      return;
    }
    downloadBlob(blob, `${slugify(project.name)}-${w}x${h}.${jpg ? "jpg" : "png"}`);
    showToast(`${imageFormat} saved · ${w} × ${h}`);
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  };

  const startRecording = () => {
    const canvas = canvasRef.current;
    if (!canvas || typeof MediaRecorder === "undefined" || typeof canvas.captureStream !== "function") {
      showToast("Video recording isn't supported in this browser");
      return;
    }
    const stream = canvas.captureStream(videoFps);
    const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 12_000_000 } : undefined);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      showToast("Couldn't start the video recorder");
      return;
    }
    const isMp4 = (recorder.mimeType || mimeType || "").includes("mp4");
    const fileName = `${slugify(project.name)}.${isMp4 ? "mp4" : "webm"}`;
    const chunks: Blob[] = [];
    const started = performance.now();
    const timer = window.setInterval(() => {
      const ratio = (performance.now() - started) / (videoSeconds * 1000);
      setProgress(Math.min(1, ratio));
      if (ratio >= 1 && recorder.state !== "inactive") recorder.stop();
    }, 100);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      window.clearInterval(timer);
      stream.getTracks().forEach((track) => track.stop());
      setRecording(false);
      onRecordingChange(false);
      setProgress(0);
      if (chunks.length > 0) {
        downloadBlob(new Blob(chunks, { type: isMp4 ? "video/mp4" : "video/webm" }), fileName);
        showToast(isMp4 ? "MP4 video saved" : "WebM video saved");
      }
    };
    recorder.start(250);
    recorderRef.current = recorder;
    setRecording(true);
    onRecordingChange(true);
  };

  /* ───────── panes ───────── */

  const renderPane = () => {
    switch (tab) {
      case "code":
        return (
          <div className="export-pane">
            <p className="field-help">
              Runs anywhere WebGL2 does. The shader, every setting{project.mask.enabled ? ` and the ${project.mask.source.kind === "text" ? "text" : "image"} mask` : ""} are embedded.
            </p>
            <label className="svg-select-control">
              Format
              <select value={codeFormat} onChange={(event) => setCodeFormat(event.target.value as ExportFormatId)}>
                {EXPORT_FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <textarea className="code-preview" readOnly spellCheck={false} value={previewCode} aria-label="Generated code" />
            <div className="export-actions">
              <button type="button" className="svg-upload-button" onClick={() => void copyCode(currentCode)}>
                <IconCopy size={15} /> Copy
              </button>
              <button
                type="button"
                className="svg-upload-button"
                onClick={() => {
                  downloadText(currentCode, currentFormat.file, currentFormat.mime);
                  showToast(`${currentFormat.file} downloaded`);
                }}
              >
                <IconDownload size={15} /> Download
              </button>
            </div>
            <button
              type="button"
              className="svg-upload-button"
              onClick={() => {
                downloadBlob(buildProjectZip(project, mask), `${slugify(project.name)}.zip`);
                showToast("ZIP downloaded");
              }}
            >
              <IconDownload size={15} /> ZIP · HTML · CSS · JS · GLSL · React
            </button>
            <div className="export-actions separate-files">
              {EXPORT_FORMATS.filter((f) => f.id !== "standaloneHtml").map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="text-action"
                  onClick={() => {
                    if (!code) return;
                    downloadText(code[f.id], f.file, f.mime);
                    showToast(`${f.file} downloaded`);
                  }}
                >
                  {f.file}
                </button>
              ))}
            </div>
          </div>
        );

      case "image":
        return (
          <div className="export-pane">
            <p className="field-help">Renders the current frame at full resolution, independent of your screen.</p>
            <label className="svg-select-control">
              Size
              <select value={imageSize} onChange={(event) => setImageSize(event.target.value as ImageSizeId)}>
                {IMAGE_SIZES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <ChoiceGroup label="Format" value={imageFormat} options={IMAGE_FORMATS} onChange={setImageFormat} />
            <button type="button" className="svg-upload-button" onClick={() => void exportImage()}>
              <IconDownload size={15} /> Download {imageFormat}
            </button>
          </div>
        );

      case "video":
        return (
          <div className="export-pane">
            <p className="field-help">Records the live canvas to a video file. Leave the preview running while it records.</p>
            <div className="video-options">
              <label className="svg-select-control">
                Length
                <select value={videoSeconds} onChange={(event) => setVideoSeconds(Number(event.target.value))} disabled={recording}>
                  {[3, 6, 10, 15].map((s) => (
                    <option key={s} value={s}>
                      {s} seconds
                    </option>
                  ))}
                </select>
              </label>
              <label className="svg-select-control">
                Frame rate
                <select value={videoFps} onChange={(event) => setVideoFps(Number(event.target.value))} disabled={recording}>
                  <option value={30}>30 fps</option>
                  <option value={60}>60 fps</option>
                </select>
              </label>
            </div>
            {recording && (
              <div className="record-progress">
                <i style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            )}
            <button
              type="button"
              className={`svg-upload-button ${recording ? "recording-button" : ""}`}
              onClick={recording ? stopRecording : startRecording}
            >
              {recording ? "■ Stop & save" : "● Record video"}
            </button>
          </div>
        );

      case "project":
        return (
          <div className="export-pane">
            <p className="field-help">Save the full project (layers, colours, mask, touch rules) as JSON and load it back any time.</p>
            <div className="export-actions">
              <button
                type="button"
                className="svg-upload-button"
                onClick={() => {
                  downloadText(projectJson(project), `${slugify(project.name)}.json`, "application/json");
                  showToast("Project JSON downloaded");
                }}
              >
                <IconDownload size={15} /> Save JSON
              </button>
              <button type="button" className="svg-upload-button" onClick={() => fileInputRef.current?.click()}>
                Load JSON
              </button>
            </div>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                void loadFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
        );
    }
  };

  return (
    <div className={`export-layer ${open ? "open" : ""}`} aria-hidden={!open}>
      <button type="button" className="export-backdrop" aria-label="Close export" tabIndex={open ? 0 : -1} onClick={onClose} />
      <section className="export-sheet" role="dialog" aria-modal="true" aria-label="Export">
        <header className="export-sheet-head">
          <div className="export-sheet-title">
            <b>Export</b>
            <small>{project.name}</small>
          </div>
          <button type="button" className="bar-icon" aria-label="Close export" tabIndex={open ? 0 : -1} onClick={onClose}>
            <IconClose size={16} />
          </button>
        </header>
        <div className="export-tabs" role="tablist" aria-label="Export type">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                tabIndex={open ? 0 : -1}
                className={tab === t.id ? "active" : ""}
                onClick={() => setTab(t.id)}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="export-sheet-body">{renderPane()}</div>
      </section>
    </div>
  );
}
