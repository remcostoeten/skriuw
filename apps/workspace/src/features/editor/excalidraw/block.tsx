import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  excalidrawSceneLabel,
  emptyExcalidrawScene,
  liveExcalidrawElementCount,
  readStoredExcalidrawScene,
  serializeExcalidrawScene,
} from "./scene";
import { DownloadIcon, PencilIcon, UploadIcon } from "@/shared/icons/static";
import { ExcalidrawEditorOverlay } from "./editor-overlay";
import { pickExcalidrawFile, saveExcalidrawFile } from "./files";
import { loadExcalidraw } from "./library";

type Props = {
  source: string;
  title: string;
  editable: boolean;
  overlayHost: HTMLElement | null;
  onEditingChange: (editing: boolean) => void;
  onCommit: (source: string) => void;
};

type Preview = { kind: "loading" } | { kind: "ready" } | { kind: "failed" };

const actionClass =
  "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-theme-secondary outline-none transition-colors duration-150 hover:bg-theme-hover hover:text-foreground focus-visible:bg-theme-hover focus-visible:text-foreground";

function subscribeColorScheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-color-scheme"],
  });
  return () => observer.disconnect();
}

function isDarkColorScheme(): boolean {
  return document.documentElement.dataset.colorScheme === "dark";
}

function useDarkColorScheme(): boolean {
  return useSyncExternalStore(subscribeColorScheme, isDarkColorScheme, () => false);
}

function useScenePreview(source: string, label: string, dark: boolean, enabled: boolean) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<Preview>({ kind: "loading" });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadExcalidraw()
      .then((module) => {
        const restored = module.restore(JSON.parse(source), null, null);
        return module.exportToSvg({
          elements: restored.elements,
          appState: { ...restored.appState, exportBackground: false, exportWithDarkMode: dark },
          files: restored.files,
          exportPadding: 16,
        });
      })
      .then((svg) => {
        if (cancelled || !hostRef.current) return;
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", label);
        hostRef.current.replaceChildren(svg);
        setPreview({ kind: "ready" });
      })
      .catch((error: unknown) => {
        console.error("excalidraw preview failed", error);
        if (!cancelled) setPreview({ kind: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [source, label, dark, enabled]);
  return { hostRef, preview };
}

export function ExcalidrawBlock({
  source,
  title,
  editable,
  overlayHost,
  onEditingChange,
  onCommit,
}: Props) {
  const editing = overlayHost !== null;
  const scene = readStoredExcalidrawScene(source) ?? emptyExcalidrawScene();
  const empty = liveExcalidrawElementCount(scene) === 0;
  const dark = useDarkColorScheme();
  const { hostRef, preview } = useScenePreview(
    source,
    excalidrawSceneLabel(scene),
    dark,
    !empty && !editing,
  );

  function importFile(): void {
    pickExcalidrawFile()
      .then((picked) => {
        if (picked !== null) onCommit(serializeExcalidrawScene(picked));
      })
      .catch((error: unknown) => console.error("excalidraw import failed", error));
  }

  return (
    <div className="excalidraw-block relative my-3 overflow-hidden rounded-xl border border-theme-divider font-sans">
      <div className="absolute right-1.5 top-1.5 z-[1] flex items-center gap-0.5 rounded-lg bg-background/90 p-0.5 opacity-0 transition-opacity duration-150 group-hover/excalidraw:opacity-100 group-focus-within/excalidraw:opacity-100 group-[.ProseMirror-selectednode]/excalidraw:opacity-100 pointer-coarse:opacity-100">
        {editable && (
          <button type="button" className={actionClass} onClick={() => onEditingChange(true)}>
            <PencilIcon size={12} />
            Edit
          </button>
        )}
        {editable && (
          <button type="button" className={actionClass} onClick={importFile}>
            <UploadIcon size={12} />
            Import
          </button>
        )}
        <button
          type="button"
          className={actionClass}
          onClick={() => void saveExcalidrawFile(scene, title)}
          aria-label="Save as .excalidraw file"
        >
          <DownloadIcon size={12} />
          Save
        </button>
      </div>
      {empty ? (
        <div
          className="flex min-h-36 flex-col items-center justify-center gap-1 px-4 py-8 text-center"
          onDoubleClick={() => {
            if (editable) onEditingChange(true);
          }}
        >
          <span className="text-[13px] font-medium text-foreground">Empty drawing</span>
          <span className="text-xs text-theme-secondary">
            {editable
              ? "Double-click or press Edit to draw, or import an .excalidraw file."
              : "This drawing has no shapes yet."}
          </span>
        </div>
      ) : (
        <div
          className="excalidraw-preview flex min-h-24 cursor-default items-center justify-center px-2 py-3 [&_svg]:block [&_svg]:h-auto [&_svg]:max-h-[32rem] [&_svg]:max-w-full"
          onDoubleClick={() => {
            if (editable) onEditingChange(true);
          }}
        >
          <div ref={hostRef} className="contents" />
          {preview.kind === "loading" && (
            <span className="text-xs text-theme-dim">Rendering drawing…</span>
          )}
          {preview.kind === "failed" && (
            <span role="alert" className="text-xs text-destructive">
              The drawing could not be rendered. Its content is kept unchanged.
            </span>
          )}
        </div>
      )}
      {overlayHost !== null && (
        <ExcalidrawEditorOverlay
          host={overlayHost}
          source={source}
          title={title}
          dark={dark}
          onCommit={onCommit}
          onClose={() => onEditingChange(false)}
        />
      )}
    </div>
  );
}
