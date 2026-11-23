import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
  MAX_EXCALIDRAW_SCENE_BYTES,
  excalidrawSceneBytes,
  pruneExcalidrawScene,
  readExcalidrawScene,
  serializeExcalidrawScene,
  type ExcalidrawScene,
} from "./scene";
import { CheckIcon, DownloadIcon, UploadIcon } from "@/shared/icons/static";
import { Button } from "@/shared/ui/button";
import { showToast } from "@/shared/ui/toast";
import { pickExcalidrawFile, saveExcalidrawFile } from "./files";
import { loadExcalidraw } from "./library";

type ExcalidrawModule = Awaited<ReturnType<typeof loadExcalidraw>>;

type SceneSnapshot = {
  elements: readonly OrderedExcalidrawElement[];
  appState: AppState;
  files: BinaryFiles;
};

type Props = {
  source: string;
  title: string;
  dark: boolean;
  onCommit: (source: string) => void;
  onClose: () => void;
  host: HTMLElement;
};

const COMMIT_DELAY_MS = 400;

const UI_OPTIONS = {
  canvasActions: {
    loadScene: false,
    saveToActiveFile: false,
    export: false as const,
    saveAsImage: false,
    toggleTheme: false,
  },
};

function sceneFrom(
  elements: readonly OrderedExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
): ExcalidrawScene | null {
  const scene = readExcalidrawScene({ type: "excalidraw", elements, appState, files });
  return scene === null ? null : pruneExcalidrawScene(scene);
}

function isIdle(appState: AppState): boolean {
  return (
    appState.editingTextElement === null &&
    appState.newElement === null &&
    appState.openMenu === null &&
    appState.openPopup === null &&
    appState.openDialog === null
  );
}

export function ExcalidrawEditorOverlay({ source, title, dark, onCommit, onClose, host }: Props) {
  const [module, setModule] = useState<ExcalidrawModule | null>(null);
  const [failed, setFailed] = useState(false);
  const [initialSource, setInitialSource] = useState(source);
  const overlayRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const committedRef = useRef(source);
  const versionRef = useRef<string | null>(null);
  const latestRef = useRef<SceneSnapshot | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const oversizeWarnedRef = useRef(false);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => {
    let cancelled = false;
    loadExcalidraw().then(
      (loaded) => {
        if (!cancelled) setModule(loaded);
      },
      (error: unknown) => {
        console.error("excalidraw failed to load", error);
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  function currentScene(): ExcalidrawScene | null {
    const api = apiRef.current;
    if (!api) return null;
    return sceneFrom(api.getSceneElements(), api.getAppState(), api.getFiles());
  }

  function commitNow(): void {
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
    const latest = latestRef.current;
    if (latest === null) return;
    const scene = sceneFrom(latest.elements, latest.appState, latest.files);
    if (scene === null) return;
    const next = serializeExcalidrawScene(scene);
    if (next === committedRef.current) return;
    if (excalidrawSceneBytes(next) > MAX_EXCALIDRAW_SCENE_BYTES) {
      if (!oversizeWarnedRef.current) {
        oversizeWarnedRef.current = true;
        showToast({
          message: "This drawing is over 8 MB and is not being saved",
          description: "Remove or shrink an image to save it again.",
        });
      }
      return;
    }
    oversizeWarnedRef.current = false;
    committedRef.current = next;
    commitRef.current(next);
  }

  const commitNowRef = useRef(commitNow);
  commitNowRef.current = commitNow;

  // Layout cleanup runs before Excalidraw unmounts and clears its scene.
  useLayoutEffect(() => () => commitNowRef.current(), []);

  function close(): void {
    commitNow();
    onClose();
  }

  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    function handleKeyDown(event: KeyboardEvent): void {
      const api = apiRef.current;
      const mod = event.metaKey || event.ctrlKey;
      if (
        (event.key === "Escape" && api && isIdle(api.getAppState())) ||
        (mod && event.key === "Enter")
      ) {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }
    }
    function isolate(event: KeyboardEvent): void {
      event.stopPropagation();
    }
    overlay.addEventListener("keydown", handleKeyDown, true);
    // React dispatches the portal's events from `host`, so isolation must sit there, after React's listener.
    host.addEventListener("keydown", isolate);
    return () => {
      overlay.removeEventListener("keydown", handleKeyDown, true);
      host.removeEventListener("keydown", isolate);
    };
  }, [host]);

  function handleChange(
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ): void {
    if (!module) return;
    const version = [
      module.hashElementsVersion(elements),
      Object.keys(files).length,
      appState.viewBackgroundColor,
      appState.gridModeEnabled,
    ].join(":");
    if (versionRef.current === null) {
      versionRef.current = version;
      return;
    }
    if (version === versionRef.current) return;
    versionRef.current = version;
    latestRef.current = { elements, appState, files };
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => commitNowRef.current(), COMMIT_DELAY_MS);
  }

  function importFile(): void {
    pickExcalidrawFile()
      .then((scene) => {
        if (scene === null) return;
        const imported = serializeExcalidrawScene(scene);
        committedRef.current = imported;
        versionRef.current = null;
        latestRef.current = null;
        apiRef.current = null;
        commitRef.current(imported);
        setInitialSource(imported);
      })
      .catch((error: unknown) => console.error("excalidraw import failed", error));
  }

  function saveFile(): void {
    const scene = currentScene();
    if (scene !== null) void saveExcalidrawFile(scene, title);
  }

  const initialData = useMemo(
    () => (module ? module.restore(JSON.parse(initialSource), null, null) : null),
    [module, initialSource],
  );
  const Excalidraw = module?.Excalidraw;
  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Drawing editor"
      className="excalidraw-overlay fixed inset-0 z-[900] flex flex-col bg-background font-sans text-foreground"
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-theme-divider px-3">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {title || "Drawing"}
        </span>
        <Button onClick={importFile} disabled={!module}>
          <UploadIcon size={13} />
          Import file
        </Button>
        <Button onClick={saveFile} disabled={!module}>
          <DownloadIcon size={13} />
          Save .excalidraw
        </Button>
        <Button variant="primary" onClick={close} title="Done (Esc)">
          <CheckIcon size={13} />
          Done
        </Button>
      </header>
      <div className="relative min-h-0 flex-1">
        {failed ? (
          <p role="alert" className="m-0 p-6 text-sm text-destructive">
            The drawing editor could not load. Close this and try again.
          </p>
        ) : Excalidraw && initialData ? (
          <Excalidraw
            key={initialSource}
            initialData={initialData}
            excalidrawAPI={(api) => {
              apiRef.current = api;
            }}
            onChange={handleChange}
            theme={dark ? "dark" : "light"}
            name={title || "Drawing"}
            UIOptions={UI_OPTIONS}
            autoFocus
          />
        ) : (
          <p className="m-0 p-6 text-sm text-theme-secondary">Loading the drawing editor…</p>
        )}
      </div>
    </div>,
    host,
  );
}
