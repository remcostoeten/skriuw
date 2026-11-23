export const EXCALIDRAW_FENCE_LANGUAGE = "excalidraw";
export const EXCALIDRAW_FILE_EXTENSION = "excalidraw";
export const EXCALIDRAW_MIME_TYPE = "application/vnd.excalidraw+json";
export const EXCALIDRAW_SCENE_SOURCE = "https://skriuw.com";
export const MAX_EXCALIDRAW_SCENE_BYTES = 8 * 1024 * 1024;
export const MAX_EXCALIDRAW_ELEMENTS = 20_000;

const SCENE_TYPES = new Set(["excalidraw", "excalidraw/clipboard"]);
const SCENE_VERSION = 2;
const PARSE_CACHE_LIMIT = 16;
const RESERVED_FILE_NAME_CHARACTERS = new Set(["<", ">", ":", '"', "/", "\\", "|", "?", "*"]);

type SceneRecord = Readonly<Record<string, unknown>>;

export type ExcalidrawElement = SceneRecord & {
  readonly id: string;
  readonly type: string;
};

export type ExcalidrawFile = SceneRecord & {
  readonly id: string;
  readonly mimeType: string;
  readonly dataURL: string;
};

export type ExcalidrawAppState = {
  viewBackgroundColor?: string;
  gridSize?: number | null;
  gridStep?: number;
  gridModeEnabled?: boolean;
};

export type ExcalidrawScene = {
  elements: readonly ExcalidrawElement[];
  appState: ExcalidrawAppState;
  files: Readonly<Record<string, ExcalidrawFile>>;
};

export type ExcalidrawParseResult =
  | { ok: true; scene: ExcalidrawScene }
  | { ok: false; reason: string };

const parsedSources = new Map<string, ExcalidrawScene | null>();

function isRecord(value: unknown): value is SceneRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readElement(value: unknown): ExcalidrawElement | null {
  if (!isRecord(value)) return null;
  const { id, type } = value;
  if (typeof id !== "string" || id === "" || typeof type !== "string" || type === "") return null;
  return { ...value, id, type };
}

function readFile(value: unknown): ExcalidrawFile | null {
  if (!isRecord(value)) return null;
  const { id, mimeType, dataURL } = value;
  if (typeof id !== "string" || typeof mimeType !== "string" || typeof dataURL !== "string") {
    return null;
  }
  if (!dataURL.startsWith("data:")) return null;
  return { ...value, id, mimeType, dataURL };
}

function readAppState(value: unknown): ExcalidrawAppState {
  if (!isRecord(value)) return {};
  const appState: ExcalidrawAppState = {};
  const { viewBackgroundColor, gridSize, gridStep, gridModeEnabled } = value;
  if (typeof viewBackgroundColor === "string") appState.viewBackgroundColor = viewBackgroundColor;
  if (gridSize === null || (typeof gridSize === "number" && Number.isFinite(gridSize))) {
    appState.gridSize = gridSize;
  }
  if (typeof gridStep === "number" && Number.isFinite(gridStep)) appState.gridStep = gridStep;
  if (typeof gridModeEnabled === "boolean") appState.gridModeEnabled = gridModeEnabled;
  return appState;
}

/**
 * @name readExcalidrawScene
 * @description Reads an already parsed Excalidraw document (a `.excalidraw`
 * file, a clipboard payload or a stored block) into a scene. Elements need an
 * id and a type, embedded files need a data URL, and only the appState keys
 * Excalidraw itself writes to files are kept. Returns null when the value is
 * not a scene or exceeds the element cap.
 * @example
 * const scene = readExcalidrawScene(JSON.parse(text));
 */
export function readExcalidrawScene(value: unknown): ExcalidrawScene | null {
  if (!isRecord(value)) return null;
  if (
    value.type !== undefined &&
    (typeof value.type !== "string" || !SCENE_TYPES.has(value.type))
  ) {
    return null;
  }
  if (!Array.isArray(value.elements) || value.elements.length > MAX_EXCALIDRAW_ELEMENTS) {
    return null;
  }
  const elements: ExcalidrawElement[] = [];
  for (const entry of value.elements) {
    const element = readElement(entry);
    if (element === null) return null;
    elements.push(element);
  }
  const files: Record<string, ExcalidrawFile> = {};
  if (isRecord(value.files)) {
    for (const [id, entry] of Object.entries(value.files)) {
      const file = readFile(entry);
      if (file !== null && file.id === id) files[id] = file;
    }
  }
  return { elements, appState: readAppState(value.appState), files };
}

/**
 * @name parseExcalidrawFile
 * @description Parses the text of an official `.excalidraw` file, or the JSON
 * Excalidraw puts on the clipboard, into a scene. Rejects text over the scene
 * size cap before parsing it.
 * @example
 * const parsed = parseExcalidrawFile(await file.text());
 * if (parsed.ok) insertExcalidrawScene(view, parsed.scene, null);
 */
export function parseExcalidrawFile(text: string): ExcalidrawParseResult {
  if (new TextEncoder().encode(text).byteLength > MAX_EXCALIDRAW_SCENE_BYTES) {
    return { ok: false, reason: "The drawing is larger than 8 MB." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "The file is not valid Excalidraw JSON." };
  }
  const scene = readExcalidrawScene(parsed);
  return scene === null
    ? { ok: false, reason: "The file is not an Excalidraw drawing." }
    : { ok: true, scene };
}

/**
 * @name readStoredExcalidrawScene
 * @description Reads the serialized scene a drawing block stores, memoizing
 * recent sources so re-rendering an unchanged block does not parse it again.
 * Returns null for a source that is not a scene.
 * @example
 * const scene = readStoredExcalidrawScene(String(node.attrs.scene));
 */
export function readStoredExcalidrawScene(source: string): ExcalidrawScene | null {
  const cached = parsedSources.get(source);
  if (cached !== undefined) return cached;
  const parsed = parseExcalidrawFile(source);
  const scene = parsed.ok ? parsed.scene : null;
  if (parsedSources.size >= PARSE_CACHE_LIMIT) {
    const oldest = parsedSources.keys().next().value;
    if (oldest !== undefined) parsedSources.delete(oldest);
  }
  parsedSources.set(source, scene);
  return scene;
}

/**
 * @name emptyExcalidrawScene
 * @description A scene with no elements, the content of a new drawing block.
 * @example
 * node.create({ scene: serializeExcalidrawScene(emptyExcalidrawScene()) });
 */
export function emptyExcalidrawScene(): ExcalidrawScene {
  return { elements: [], appState: {}, files: {} };
}

/**
 * @name pruneExcalidrawScene
 * @description Drops deleted elements and embedded files no image element
 * points at, which Excalidraw keeps around for undo but a saved drawing never
 * needs.
 * @example
 * const saved = pruneExcalidrawScene({ elements, appState, files });
 */
export function pruneExcalidrawScene(scene: ExcalidrawScene): ExcalidrawScene {
  const elements = scene.elements.filter((element) => element.isDeleted !== true);
  const referenced = new Set(
    elements.flatMap((element) => (typeof element.fileId === "string" ? [element.fileId] : [])),
  );
  const files = Object.fromEntries(
    Object.entries(scene.files).filter(([id]) => referenced.has(id)),
  );
  return { elements, appState: scene.appState, files };
}

function sceneDocument(scene: ExcalidrawScene) {
  return {
    type: "excalidraw",
    version: SCENE_VERSION,
    source: EXCALIDRAW_SCENE_SOURCE,
    elements: scene.elements,
    appState: scene.appState,
    files: scene.files,
  };
}

/**
 * @name serializeExcalidrawScene
 * @description The compact official Excalidraw document a drawing block
 * stores and its Markdown fence carries.
 * @example
 * tr.setNodeMarkup(pos, undefined, { scene: serializeExcalidrawScene(scene) });
 */
export function serializeExcalidrawScene(scene: ExcalidrawScene): string {
  return JSON.stringify(sceneDocument(scene));
}

/**
 * @name excalidrawFileText
 * @description The text of a `.excalidraw` file for the scene, indented the
 * way Excalidraw writes its own files so excalidraw.com and other tools open
 * it unchanged.
 * @example
 * saveTextFile("Sketch.excalidraw", excalidrawFileText(scene));
 */
export function excalidrawFileText(scene: ExcalidrawScene): string {
  return JSON.stringify(sceneDocument(scene), null, 2);
}

/**
 * @name excalidrawSceneBytes
 * @description The UTF-8 size of a serialized scene, checked against
 * `MAX_EXCALIDRAW_SCENE_BYTES` before a drawing is saved.
 * @example
 * if (excalidrawSceneBytes(source) > MAX_EXCALIDRAW_SCENE_BYTES) return;
 */
export function excalidrawSceneBytes(source: string): number {
  return new TextEncoder().encode(source).byteLength;
}

/**
 * @name liveExcalidrawElementCount
 * @description How many elements of the scene are not deleted.
 * @example
 * if (liveExcalidrawElementCount(scene) === 0) showEmptyState();
 */
export function liveExcalidrawElementCount(scene: ExcalidrawScene): number {
  return scene.elements.filter((element) => element.isDeleted !== true).length;
}

/**
 * @name excalidrawSceneLabel
 * @description An accessible name for a drawing preview: its element count
 * and the text written in it, shortened to a readable length.
 * @example
 * svg.setAttribute("aria-label", excalidrawSceneLabel(scene));
 */
export function excalidrawSceneLabel(scene: ExcalidrawScene): string {
  const live = scene.elements.filter((element) => element.isDeleted !== true);
  const text = live
    .flatMap((element) =>
      element.type === "text" && typeof element.text === "string" ? [element.text.trim()] : [],
    )
    .filter((entry) => entry !== "")
    .join(", ")
    .replace(/\s+/g, " ");
  const summary = `Drawing with ${live.length} ${live.length === 1 ? "element" : "elements"}`;
  if (text === "") return summary;
  return `${summary}: ${text.length > 200 ? `${text.slice(0, 199)}…` : text}`;
}

/**
 * @name excalidrawFileName
 * @description A file name for saving a drawing, built from the note title
 * with characters that are invalid in file names removed.
 * @example
 * excalidrawFileName("Q3 plan / draft"); // "Q3 plan draft.excalidraw"
 */
export function excalidrawFileName(title: string): string {
  const base = [...title]
    .map((character) =>
      character.charCodeAt(0) < 0x20 || RESERVED_FILE_NAME_CHARACTERS.has(character)
        ? " "
        : character,
    )
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  return `${base === "" ? "Drawing" : base.slice(0, 120)}.${EXCALIDRAW_FILE_EXTENSION}`;
}

export const EMPTY_EXCALIDRAW_SCENE_SOURCE = serializeExcalidrawScene(emptyExcalidrawScene());
