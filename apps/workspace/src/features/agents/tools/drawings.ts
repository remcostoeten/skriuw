import { Fragment, type Node as ProseMirrorNode } from "prosemirror-model";
import { Transform } from "prosemirror-transform";
import {
  excalidrawEditorIsOpen,
  MAX_EXCALIDRAW_ELEMENTS,
  MAX_EXCALIDRAW_SCENE_BYTES,
  emptyExcalidrawScene,
  excalidrawSceneBytes,
  excalidrawSceneLabel,
  liveExcalidrawElementCount,
  pruneExcalidrawScene,
  readStoredExcalidrawScene,
  serializeExcalidrawScene,
  type ExcalidrawElement,
  type ExcalidrawScene,
} from "@/features/editor/drawings";
import { productSchema } from "@/features/editor/schema";
import type { ToolContext } from "../context";
import { refuse, type ToolInput } from "../protocol/input";
import type { JsonValue } from "../protocol/json";
import type { AgentTool } from "../protocol/server";
import { editableNote, noteDocument, saveDocumentOperations } from "../workspace";

const ELEMENT_TYPES = ["rectangle", "ellipse", "diamond", "line", "arrow", "text"] as const;
const FILL_STYLES = ["solid", "hachure", "cross-hatch"] as const;
const STROKE_STYLES = ["solid", "dashed", "dotted"] as const;
const MAX_POINTS = 2_000;
const DEFAULT_FONT_SIZE = 20;
const TEXT_LINE_HEIGHT = 1.25;
const AVERAGE_GLYPH_WIDTH = 0.6;
const HAND_DRAWN_FONT_FAMILY = 5;

type Drawing = { index: number; position: number; node: ProseMirrorNode };
type Point = [number, number];

const NOTE_ID = { type: "string", minLength: 1 } as const;
const DRAWING_INDEX = {
  type: "integer",
  minimum: 0,
  description: "Which drawing in the note, counted from 0 as list_drawings returns them.",
} as const;
const STYLE_PROPERTIES = {
  strokeColor: { type: "string", description: "CSS color. Defaults to #1e1e1e." },
  backgroundColor: { type: "string", description: "CSS color. Defaults to transparent." },
  fillStyle: { type: "string", enum: FILL_STYLES },
  strokeStyle: { type: "string", enum: STROKE_STYLES },
  strokeWidth: { type: "number", exclusiveMinimum: 0 },
  opacity: { type: "number", minimum: 0, maximum: 100 },
  x: { type: "number" },
  y: { type: "number" },
  width: { type: "number", exclusiveMinimum: 0 },
  height: { type: "number", exclusiveMinimum: 0 },
  text: { type: "string", description: "The words of a text element." },
  fontSize: { type: "number", exclusiveMinimum: 0 },
  points: {
    type: "array",
    minItems: 2,
    items: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
    description: "Line or arrow points as [x, y], relative to the element's x and y.",
  },
} as const;
const NEW_ELEMENT = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
    type: { type: "string", enum: ELEMENT_TYPES },
    ...STYLE_PROPERTIES,
  },
  required: ["type", "x", "y"],
  additionalProperties: false,
} as const;
const ELEMENT_PATCH = {
  type: "object",
  properties: { id: { type: "string", minLength: 1 }, ...STYLE_PROPERTIES },
  required: ["id"],
  additionalProperties: false,
} as const;

export const drawingTools: readonly AgentTool<ToolContext>[] = [
  {
    name: "list_drawings",
    title: "List a note's drawings",
    description:
      "Lists the Excalidraw drawings in a note in document order, with each drawing's index, element count and a summary of its text.",
    inputSchema: {
      type: "object",
      properties: { noteId: NOTE_ID },
      required: ["noteId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, context) {
      await context.flush();
      const state = context.store.getState();
      const note = editableNote(state, input.text("noteId"));
      return {
        noteId: note.id,
        drawings: drawingsIn(noteDocument(state, note.id)).map((drawing) => {
          const scene = storedScene(drawing);
          return {
            index: drawing.index,
            elementCount: liveExcalidrawElementCount(scene),
            imageCount: Object.keys(scene.files).length,
            summary: excalidrawSceneLabel(scene),
          };
        }),
      };
    },
  },
  {
    name: "read_drawing",
    title: "Read a drawing",
    description:
      "Returns one drawing's Excalidraw elements and background. Embedded images are listed by id and type without their data.",
    inputSchema: {
      type: "object",
      properties: { noteId: NOTE_ID, index: DRAWING_INDEX },
      required: ["noteId", "index"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, context) {
      await context.flush();
      const state = context.store.getState();
      const note = editableNote(state, input.text("noteId"));
      const drawing = drawingAt(noteDocument(state, note.id), input);
      const scene = storedScene(drawing);
      const stored: { elements: JsonValue; appState: JsonValue } = JSON.parse(
        serializeExcalidrawScene({ ...scene, files: {} }),
      );
      return {
        noteId: note.id,
        index: drawing.index,
        elements: stored.elements,
        appState: stored.appState,
        files: Object.values(scene.files).map((file) => ({
          id: file.id,
          mimeType: file.mimeType,
        })),
      };
    },
  },
  {
    name: "create_drawing",
    title: "Create a drawing",
    description:
      "Adds an Excalidraw drawing to the end of a note. Shapes need x, y, width and height; lines and arrows need points; text needs text. Coordinates are pixels and y grows downward.",
    inputSchema: {
      type: "object",
      properties: {
        noteId: NOTE_ID,
        elements: { type: "array", items: NEW_ELEMENT, maxItems: MAX_EXCALIDRAW_ELEMENTS },
      },
      required: ["noteId", "elements"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run(input, context) {
      refuseWhileEditing();
      await context.flush();
      const state = context.store.getState();
      const note = editableNote(state, input.text("noteId"));
      const document = noteDocument(state, note.id);
      const elements = withNewElements([], input.objectList("elements"), context);
      const source = sceneSource({ ...emptyExcalidrawScene(), elements });
      const drawing = productSchema.nodes.excalidraw!.create({ scene: source });
      const paragraph = productSchema.nodes.paragraph!.create();
      const next = document.copy(
        contentBeforeTrailingEmpty(document).append(Fragment.fromArray([drawing, paragraph])),
      );
      await context.commit(saveDocumentOperations(state, note.id, next, context.now()));
      return {
        noteId: note.id,
        index: drawingsIn(document).length,
        elementIds: elements.map((element) => element.id),
      };
    },
  },
  {
    name: "update_drawing",
    title: "Update a drawing",
    description:
      "Changes one drawing: add elements, patch existing elements by id, and remove elements by id. Elements not named stay as they are. Refused while the drawing editor is open in Skriuw.",
    inputSchema: {
      type: "object",
      properties: {
        noteId: NOTE_ID,
        index: DRAWING_INDEX,
        add: { type: "array", items: NEW_ELEMENT },
        update: { type: "array", items: ELEMENT_PATCH },
        remove: { type: "array", items: { type: "string", minLength: 1 } },
      },
      required: ["noteId", "index"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
    async run(input, context) {
      refuseWhileEditing();
      await context.flush();
      const state = context.store.getState();
      const note = editableNote(state, input.text("noteId"));
      const document = noteDocument(state, note.id);
      const drawing = drawingAt(document, input);
      const scene = storedScene(drawing);
      const at = context.now();
      const removed = new Set(input.optionalStringList("remove") ?? []);
      const known = new Set(scene.elements.map((element) => element.id));
      const missing = [...removed].find((id) => !known.has(id));
      if (missing !== undefined) refuse(`The drawing has no element with id ${missing}.`);
      const patches = new Map(
        (input.optionalObjectList("update") ?? []).map((patch) => [patch.text("id"), patch]),
      );
      for (const id of patches.keys()) {
        if (!known.has(id)) refuse(`The drawing has no element with id ${id}.`);
        if (removed.has(id)) refuse(`Element ${id} cannot be both updated and removed.`);
      }
      const kept = scene.elements
        .filter((element) => !removed.has(element.id))
        .map((element) => {
          const patch = patches.get(element.id);
          return patch === undefined ? element : patchedElement(element, patch, at);
        });
      const elements = withNewElements(kept, input.optionalObjectList("add") ?? [], context);
      const source = sceneSource({ ...scene, elements });
      const next = new Transform(document).setNodeMarkup(drawing.position, undefined, {
        ...drawing.node.attrs,
        scene: source,
      }).doc;
      await context.commit(saveDocumentOperations(state, note.id, next, at));
      return {
        noteId: note.id,
        index: drawing.index,
        elementCount: elements.length,
        elementIds: elements.map((element) => element.id),
      };
    },
  },
];

function refuseWhileEditing(): void {
  if (excalidrawEditorIsOpen()) {
    refuse("A drawing is open in the Skriuw editor. Ask the user to close it, then try again.");
  }
}

function drawingsIn(document: ProseMirrorNode): Drawing[] {
  const drawings: Drawing[] = [];
  document.descendants((node, position) => {
    if (node.type.name === "excalidraw") {
      drawings.push({ index: drawings.length, position, node });
    }
    return true;
  });
  return drawings;
}

function drawingAt(document: ProseMirrorNode, input: ToolInput): Drawing {
  const index = input.optionalInteger("index", 0, Number.MAX_SAFE_INTEGER);
  if (index === undefined) refuse("index is required.");
  const drawing = drawingsIn(document)[index];
  if (drawing === undefined) refuse(`The note has no drawing at index ${index}.`);
  return drawing;
}

function storedScene(drawing: Drawing): ExcalidrawScene {
  const scene = readStoredExcalidrawScene(String(drawing.node.attrs.scene));
  if (scene === null) refuse(`Drawing ${drawing.index} could not be read.`);
  return pruneExcalidrawScene(scene);
}

function sceneSource(scene: ExcalidrawScene): string {
  if (scene.elements.length > MAX_EXCALIDRAW_ELEMENTS) {
    refuse(`A drawing holds at most ${MAX_EXCALIDRAW_ELEMENTS} elements.`);
  }
  const source = serializeExcalidrawScene(pruneExcalidrawScene(scene));
  if (excalidrawSceneBytes(source) > MAX_EXCALIDRAW_SCENE_BYTES) {
    refuse("That drawing would be larger than 8 MB.");
  }
  return source;
}

function contentBeforeTrailingEmpty(document: ProseMirrorNode): Fragment {
  const last = document.lastChild;
  if (last?.type.name === "paragraph" && last.content.size === 0 && document.childCount > 1) {
    return document.content.cut(0, document.content.size - last.nodeSize);
  }
  return document.content;
}

function withNewElements(
  existing: readonly ExcalidrawElement[],
  additions: readonly ToolInput[],
  context: ToolContext,
): ExcalidrawElement[] {
  const ids = new Set(existing.map((element) => element.id));
  const at = context.now();
  const created = additions.map((input) => {
    const id = input.optionalText("id") ?? context.createId();
    if (ids.has(id)) refuse(`The drawing already has an element with id ${id}.`);
    ids.add(id);
    return newElement(id, input, at);
  });
  return [...existing, ...created];
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

function numberField(input: ToolInput, key: string): number | undefined {
  if (!input.has(key)) return undefined;
  const value = input.raw(key);
  if (typeof value !== "number" || !Number.isFinite(value)) refuse(`${key} must be a number.`);
  return value;
}

function positiveField(input: ToolInput, key: string): number | undefined {
  const value = numberField(input, key);
  if (value !== undefined && value <= 0) refuse(`${key} must be greater than 0.`);
  return value;
}

function requiredNumber(input: ToolInput, key: string): number {
  const value = numberField(input, key);
  if (value === undefined) refuse(`${key} is required.`);
  return value;
}

function opacityField(input: ToolInput): number | undefined {
  const value = numberField(input, "opacity");
  if (value !== undefined && (value < 0 || value > 100)) refuse("opacity must be from 0 to 100.");
  return value;
}

function pointsField(input: ToolInput): Point[] | undefined {
  if (!input.has("points")) return undefined;
  const raw = input.raw("points");
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > MAX_POINTS) {
    refuse(`points must list from 2 to ${MAX_POINTS} [x, y] pairs.`);
  }
  return raw.map((entry, index): Point => {
    if (!Array.isArray(entry) || entry.length !== 2) refuse(`points[${index}] must be [x, y].`);
    const [x, y] = entry;
    if (typeof x !== "number" || typeof y !== "number") refuse(`points[${index}] must be [x, y].`);
    if (!Number.isFinite(x) || !Number.isFinite(y)) refuse(`points[${index}] must be [x, y].`);
    return [x, y];
  });
}

function styleFields(input: ToolInput): Record<string, string | number> {
  const fields = {
    strokeColor: input.optionalText("strokeColor"),
    backgroundColor: input.optionalText("backgroundColor"),
    fillStyle: input.optionalChoice("fillStyle", FILL_STYLES),
    strokeStyle: input.optionalChoice("strokeStyle", STROKE_STYLES),
    strokeWidth: positiveField(input, "strokeWidth"),
    opacity: opacityField(input),
    x: numberField(input, "x"),
    y: numberField(input, "y"),
    width: positiveField(input, "width"),
    height: positiveField(input, "height"),
  };
  return Object.fromEntries(
    Object.entries(fields).filter(
      (entry): entry is [string, string | number] => entry[1] !== undefined,
    ),
  );
}

function linearGeometry(x: number, y: number, points: readonly Point[]) {
  const [originX, originY] = points[0]!;
  const relative = points.map(([px, py]): Point => [px - originX, py - originY]);
  const xs = relative.map(([px]) => px);
  const ys = relative.map(([, py]) => py);
  return {
    x: x + originX,
    y: y + originY,
    points: relative,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function textGeometry(text: string, fontSize: number) {
  const lines = text.split("\n");
  const longest = Math.max(...lines.map((line) => line.length), 1);
  return {
    text,
    originalText: text,
    fontSize,
    width: longest * fontSize * AVERAGE_GLYPH_WIDTH,
    height: lines.length * fontSize * TEXT_LINE_HEIGHT,
  };
}

function typeFields(
  type: (typeof ELEMENT_TYPES)[number],
  input: ToolInput,
  x: number,
  y: number,
): Record<string, unknown> {
  if (type === "text") {
    return {
      ...textGeometry(input.text("text"), positiveField(input, "fontSize") ?? DEFAULT_FONT_SIZE),
      fontFamily: HAND_DRAWN_FONT_FAMILY,
      textAlign: "left",
      verticalAlign: "top",
      containerId: null,
      lineHeight: TEXT_LINE_HEIGHT,
      autoResize: true,
    };
  }
  if (type === "line" || type === "arrow") {
    const points = pointsField(input);
    if (points === undefined) refuse(`A ${type} needs points.`);
    return {
      ...linearGeometry(x, y, points),
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: type === "arrow" ? "arrow" : null,
    };
  }
  const width = positiveField(input, "width");
  const height = positiveField(input, "height");
  if (width === undefined || height === undefined) refuse(`A ${type} needs width and height.`);
  return { width, height };
}

function newElement(id: string, input: ToolInput, at: number): ExcalidrawElement {
  const type = input.choice("type", ELEMENT_TYPES);
  const x = requiredNumber(input, "x");
  const y = requiredNumber(input, "y");
  const { width: _width, height: _height, ...style } = styleFields(input);
  return {
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    boundElements: null,
    link: null,
    locked: false,
    isDeleted: false,
    seed: randomSeed(),
    version: 1,
    versionNonce: randomSeed(),
    updated: at,
    ...style,
    ...typeFields(type, input, x, y),
    id,
    type,
  };
}

function patchedElement(
  element: ExcalidrawElement,
  patch: ToolInput,
  at: number,
): ExcalidrawElement {
  const fields: Record<string, unknown> = styleFields(patch);
  const points = pointsField(patch);
  if (points !== undefined) {
    if (element.type !== "line" && element.type !== "arrow") {
      refuse(`Element ${element.id} is a ${element.type}, which has no points.`);
    }
    const x = typeof fields.x === "number" ? fields.x : Number(element.x);
    const y = typeof fields.y === "number" ? fields.y : Number(element.y);
    Object.assign(fields, linearGeometry(x, y, points));
  }
  if (patch.has("text") || patch.has("fontSize")) {
    if (element.type !== "text") {
      refuse(`Element ${element.id} is a ${element.type}, which has no text.`);
    }
    const text = patch.has("text") ? patch.text("text") : String(element.text);
    const fontSize =
      positiveField(patch, "fontSize") ?? (Number(element.fontSize) || DEFAULT_FONT_SIZE);
    Object.assign(fields, textGeometry(text, fontSize));
  }
  const version = typeof element.version === "number" ? element.version : 1;
  return {
    ...element,
    ...fields,
    version: version + 1,
    versionNonce: randomSeed(),
    updated: at,
  };
}
