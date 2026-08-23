import assert from "node:assert/strict";
import test from "node:test";
import {
  DRAWING_LAYER_VERSION,
  MAX_DRAWING_ELEMENTS,
  MAX_STROKE_POINTS,
  type DrawingLayer,
  drawingCapacity,
  drawingFence,
  extractDrawingFence,
  isEmptyDrawingLayer,
  parseDrawingLayer,
  simplifyStrokePoints,
} from "../../../src/features/editor/drawing-layer";
import {
  parseProductMarkdown,
  productSchema,
  serializeProductMarkdown,
} from "../../../src/features/editor/schema";

function stroke(id: string, points: number[]) {
  return { id, kind: "stroke" as const, tool: "pen" as const, color: "ink", width: 2, points };
}

function layerWith(...elements: DrawingLayer["elements"]): DrawingLayer {
  return { version: DRAWING_LAYER_VERSION, elements };
}

function documentWith(layer: DrawingLayer | null, text = "Notes") {
  return productSchema.node("doc", { drawing: layer }, [
    productSchema.node("paragraph", null, [productSchema.text(text)]),
  ]);
}

test("a layer round-trips from document_json through the markdown fence", () => {
  const layer = layerWith(
    stroke("s1", [10, 20, 30.25, 41.5]),
    {
      id: "r1",
      kind: "rect",
      color: "#ff8787",
      width: 4,
      filled: true,
      x1: 0,
      y1: 0,
      x2: 120,
      y2: 60,
    },
  );
  const document = documentWith(layer);

  const markdown = serializeProductMarkdown(document);
  const reparsed = parseProductMarkdown(markdown);

  assert.match(markdown, /```drawing\n/);
  assert.deepEqual(reparsed.attrs.drawing, layer);
  assert.equal(reparsed.textContent, "Notes");
  assert.deepEqual(
    JSON.parse(JSON.stringify(reparsed.toJSON())),
    JSON.parse(JSON.stringify(document.toJSON())),
  );
});

test("a note without ink emits no fence", () => {
  assert.doesNotMatch(serializeProductMarkdown(documentWith(null)), /drawing/);
  assert.doesNotMatch(serializeProductMarkdown(documentWith(layerWith())), /drawing/);
  assert.equal(parseProductMarkdown("Just text").attrs.drawing, null);
});

test("a layer with no prose still round-trips", () => {
  const layer = layerWith(stroke("s1", [1, 2, 3, 4]));
  const markdown = serializeProductMarkdown(
    productSchema.node("doc", { drawing: layer }, [productSchema.node("paragraph")]),
  );

  assert.deepEqual(parseProductMarkdown(markdown).attrs.drawing, layer);
});

test("an unreadable drawing fence survives as a code block instead of vanishing", () => {
  const markdown = "Notes\n\n```drawing\n{ not json at all\n```";

  const parsed = parseProductMarkdown(markdown);

  assert.equal(parsed.attrs.drawing, null);
  const kinds: string[] = [];
  parsed.forEach((node) => kinds.push(node.type.name));
  assert.ok(kinds.includes("code_block"), `expected a code block, saw ${kinds.join(", ")}`);
  assert.match(parsed.textContent, /not json at all/);
});

test("a fence from a future version is preserved rather than downgraded", () => {
  const payload = JSON.stringify({ version: DRAWING_LAYER_VERSION + 1, elements: [] });
  const markdown = `Notes\n\n\`\`\`drawing\n${payload}\n\`\`\``;

  const parsed = parseProductMarkdown(markdown);

  assert.equal(parsed.attrs.drawing, null);
  assert.match(parsed.textContent, /"version"/);
});

test("extracting a fence leaves the surrounding markdown intact", () => {
  const layer = layerWith(stroke("s1", [0, 0, 5, 5]));
  const source = `# Title\n\nBody text\n\n${drawingFence(layer)}`;

  const extracted = extractDrawingFence(source);

  assert.deepEqual(extracted.layer, layer);
  assert.equal(extracted.markdown, "# Title\n\nBody text");
});

test("a malformed element rejects the whole layer rather than half-loading it", () => {
  assert.equal(parseDrawingLayer({ version: DRAWING_LAYER_VERSION, elements: [{}] }), null);
  assert.equal(
    parseDrawingLayer(layerWith(stroke("s1", [0, 0, Number.NaN, 1]))),
    null,
    "non-finite coordinates",
  );
  assert.equal(
    parseDrawingLayer(layerWith(stroke("s1", [0, 0, 1]))),
    null,
    "an odd number of coordinates cannot be points",
  );
  assert.equal(
    parseDrawingLayer(layerWith(stroke("s1", [0, 0]), stroke("s1", [1, 1]))),
    null,
    "ids must be unique to stay addressable",
  );
  assert.equal(
    parseDrawingLayer(layerWith({ ...stroke("s1", [0, 0]), color: "javascript:alert(1)" })),
    null,
    "colors are preset ids or hex literals",
  );
});

test("caps reject a layer that would exceed its bounds", () => {
  const tooMany = Array.from({ length: MAX_DRAWING_ELEMENTS + 1 }, (_, index) =>
    stroke(`s${index}`, [0, 0, 1, 1]),
  );
  assert.equal(parseDrawingLayer(layerWith(...tooMany)), null);

  const longStroke = stroke("s1", new Array((MAX_STROKE_POINTS + 1) * 2).fill(1));
  assert.equal(parseDrawingLayer(layerWith(longStroke)), null);
});

test("capacity reports what is left before the caps", () => {
  const empty = drawingCapacity(null);
  assert.equal(empty.elements, MAX_DRAWING_ELEMENTS);

  const used = drawingCapacity(layerWith(stroke("s1", [0, 0, 1, 1, 2, 2])));
  assert.equal(used.elements, MAX_DRAWING_ELEMENTS - 1);
  assert.equal(empty.points - used.points, 3);
});

test("simplification drops collinear samples and keeps the endpoints", () => {
  const straight = [0, 0, 1, 0, 2, 0, 3, 0, 4, 0, 5, 0];

  const simplified = simplifyStrokePoints(straight);

  assert.deepEqual(simplified, [0, 0, 5, 0]);
});

test("simplification keeps a corner that carries the shape", () => {
  const corner = [0, 0, 5, 0, 10, 0, 10, 5, 10, 10];

  const simplified = simplifyStrokePoints(corner);

  assert.deepEqual(simplified, [0, 0, 10, 0, 10, 10]);
});

test("simplified strokes stay a valid layer and round-trip", () => {
  const noisy: number[] = [];
  for (let index = 0; index <= 200; index += 1) {
    noisy.push(index, Math.sin(index / 12) * 40);
  }
  const simplified = simplifyStrokePoints(noisy);
  assert.ok(simplified.length < noisy.length, "simplification should shrink the stroke");

  const layer = layerWith(stroke("s1", simplified));
  const reparsed = parseProductMarkdown(serializeProductMarkdown(documentWith(layer)));

  assert.deepEqual(reparsed.attrs.drawing, layer);
  assert.equal(isEmptyDrawingLayer(parseDrawingLayer(reparsed.attrs.drawing)), false);
});
