import { showToast } from "@/shared/ui/toast";
import { saveTextFile } from "@/platform/runtime/commands";
import {
  EXCALIDRAW_FILE_EXTENSION,
  EXCALIDRAW_MIME_TYPE,
  MAX_EXCALIDRAW_SCENE_BYTES,
  excalidrawFileName,
  excalidrawFileText,
  parseExcalidrawFile,
  readExcalidrawScene,
  type ExcalidrawParseResult,
  type ExcalidrawScene,
} from "./scene";
import { loadExcalidraw } from "./library";

const EXCALIDRAW_ACCEPT = [
  `.${EXCALIDRAW_FILE_EXTENSION}`,
  ".json",
  ".png",
  ".svg",
  EXCALIDRAW_MIME_TYPE,
  "application/json",
  "image/png",
  "image/svg+xml",
].join(",");

function isImageExport(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".png") ||
    name.endsWith(".svg") ||
    file.type === "image/png" ||
    file.type === "image/svg+xml"
  );
}

/**
 * @name readExcalidrawImport
 * @description Reads a drawing from a file: an official `.excalidraw` file,
 * or a PNG or SVG that Excalidraw exported with its scene embedded. Only the
 * image formats load the Excalidraw library.
 * @example
 * const parsed = await readExcalidrawImport(file);
 * if (parsed.ok) insertExcalidrawScene(view, parsed.scene, null);
 */
export async function readExcalidrawImport(file: File): Promise<ExcalidrawParseResult> {
  if (file.size > MAX_EXCALIDRAW_SCENE_BYTES) {
    return { ok: false, reason: "The drawing is larger than 8 MB." };
  }
  if (!isImageExport(file)) return parseExcalidrawFile(await file.text());
  try {
    const { loadFromBlob } = await loadExcalidraw();
    const loaded = await loadFromBlob(file, null, null);
    const scene = readExcalidrawScene({
      type: "excalidraw",
      elements: loaded.elements,
      appState: loaded.appState,
      files: loaded.files,
    });
    return scene === null
      ? { ok: false, reason: "The image does not contain an Excalidraw drawing." }
      : { ok: true, scene };
  } catch (error) {
    console.warn("excalidraw image import failed", error);
    return {
      ok: false,
      reason: "The image does not contain an Excalidraw drawing. Export it with “Embed scene” on.",
    };
  }
}

/**
 * @name pickExcalidrawFile
 * @description Opens the file chooser for one drawing file and reads it.
 * Resolves to null when the user closes the chooser without picking a file,
 * and shows a toast when the file is not a drawing.
 * @example
 * const scene = await pickExcalidrawFile();
 * if (scene) insertExcalidrawScene(view, scene, null);
 */
export function pickExcalidrawFile(): Promise<ExcalidrawScene | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = EXCALIDRAW_ACCEPT;
    input.hidden = true;
    document.body.append(input);
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve(null);
        return;
      }
      readExcalidrawImport(file)
        .then((parsed) => {
          if (parsed.ok) {
            resolve(parsed.scene);
            return;
          }
          showToast({ message: "Could not import the drawing", description: parsed.reason });
          resolve(null);
        })
        .catch((error: unknown) => {
          console.error("excalidraw import failed", error);
          showToast({ message: "Could not import the drawing" });
          resolve(null);
        });
    });
    input.addEventListener("cancel", () => {
      input.remove();
      resolve(null);
    });
    input.click();
  });
}

/**
 * @name saveExcalidrawFile
 * @description Saves the scene as an official `.excalidraw` file through the
 * native save dialog on the desktop or a download in the browser, named after
 * the note.
 * @example
 * await saveExcalidrawFile(scene, note.title);
 */
export async function saveExcalidrawFile(scene: ExcalidrawScene, title: string): Promise<void> {
  try {
    const saved = await saveTextFile(
      "Save drawing",
      excalidrawFileName(title),
      EXCALIDRAW_FILE_EXTENSION,
      excalidrawFileText(scene),
    );
    if (saved !== null) showToast({ message: "Drawing saved", description: saved });
  } catch (error) {
    console.error("excalidraw save failed", error);
    showToast({
      message: "Could not save the drawing",
      description: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * @name excalidrawSceneFiles
 * @description Drawing files dropped or pasted onto the editor: files named
 * `.excalidraw` or carrying the Excalidraw MIME type. Exported PNG and SVG
 * files stay images when dropped.
 * @example
 * const drawings = excalidrawSceneFiles(event.dataTransfer?.files);
 */
export function excalidrawSceneFiles(files: Iterable<File> | null | undefined): File[] {
  return [...(files ?? [])].filter(
    (file) =>
      file.name.toLowerCase().endsWith(`.${EXCALIDRAW_FILE_EXTENSION}`) ||
      file.type === EXCALIDRAW_MIME_TYPE,
  );
}
