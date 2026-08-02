export const DIAGRAM_MODEL_VERSION = 1;
export const MAX_DIAGRAM_NODES = 150;
export const MAX_DIAGRAM_EDGES = 300;

export const diagramDirections = ["TD", "TB", "BT", "LR", "RL"] as const;
export type DiagramDirection = (typeof diagramDirections)[number];

export const diagramShapes = ["rectangle", "rounded", "decision", "terminal", "circle"] as const;
export type DiagramShape = (typeof diagramShapes)[number];

export type DiagramPoint = { x: number; y: number };

export type DiagramNode = {
  id: string;
  label: string;
  shape: DiagramShape;
  position: DiagramPoint;
  fill: string | null;
  stroke: string | null;
};

export type DiagramEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  dashed: boolean;
  stroke: string | null;
};

export type DiagramModel = {
  version: typeof DIAGRAM_MODEL_VERSION;
  direction: DiagramDirection;
  background: string | null;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
};

export type DiagramParseResult =
  | { ok: true; model: DiagramModel }
  | { ok: false; error: string };

const NODE_ID = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const MAX_LABEL_LENGTH = 240;
const POSITION_LIMIT = 100_000;
const NODE_WIDTH = 148;
const NODE_HEIGHT = 52;
const RANK_GAP = 92;
const LANE_GAP = 36;

function finiteCoordinate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= POSITION_LIMIT
    ? Math.round(value)
    : null;
}

function color(value: unknown): string | null {
  return typeof value === "string" && HEX_COLOR.test(value) ? value.toLowerCase() : null;
}

function direction(value: unknown): DiagramDirection {
  return typeof value === "string" && diagramDirections.includes(value as DiagramDirection)
    ? value as DiagramDirection
    : "LR";
}

function shape(value: unknown): DiagramShape {
  return typeof value === "string" && diagramShapes.includes(value as DiagramShape)
    ? value as DiagramShape
    : "rectangle";
}

function label(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.slice(0, MAX_LABEL_LENGTH) : fallback;
}

export function createDefaultDiagram(): DiagramModel {
  return {
    version: DIAGRAM_MODEL_VERSION,
    direction: "LR",
    background: null,
    nodes: [
      {
        id: "start",
        label: "Start",
        shape: "rounded",
        position: { x: 12, y: 44 },
        fill: null,
        stroke: null,
      },
      {
        id: "idea",
        label: "Shape the idea",
        shape: "rectangle",
        position: { x: 252, y: 44 },
        fill: null,
        stroke: null,
      },
      {
        id: "share",
        label: "Share",
        shape: "terminal",
        position: { x: 492, y: 44 },
        fill: null,
        stroke: null,
      },
    ],
    edges: [
      { id: "start-idea", from: "start", to: "idea", label: "", dashed: false, stroke: null },
      { id: "idea-share", from: "idea", to: "share", label: "", dashed: false, stroke: null },
    ],
  };
}

export function readDiagramModel(value: unknown): DiagramModel {
  if (typeof value !== "object" || value === null) return createDefaultDiagram();
  const record = value as Record<string, unknown>;
  const rawNodes = Array.isArray(record.nodes) ? record.nodes.slice(0, MAX_DIAGRAM_NODES) : [];
  const nodes: DiagramNode[] = [];
  const ids = new Set<string>();
  for (const raw of rawNodes) {
    if (typeof raw !== "object" || raw === null) continue;
    const node = raw as Record<string, unknown>;
    const id = typeof node.id === "string" && NODE_ID.test(node.id) ? node.id : "";
    if (!id || ids.has(id)) continue;
    const position = typeof node.position === "object" && node.position !== null
      ? node.position as Record<string, unknown>
      : {};
    const x = finiteCoordinate(position.x);
    const y = finiteCoordinate(position.y);
    ids.add(id);
    nodes.push({
      id,
      label: label(node.label, id),
      shape: shape(node.shape),
      position: { x: x ?? 0, y: y ?? nodes.length * (NODE_HEIGHT + LANE_GAP) },
      fill: color(node.fill),
      stroke: color(node.stroke),
    });
  }
  if (nodes.length === 0) return createDefaultDiagram();
  const rawEdges = Array.isArray(record.edges) ? record.edges.slice(0, MAX_DIAGRAM_EDGES) : [];
  const edges: DiagramEdge[] = [];
  const edgeIds = new Set<string>();
  for (const raw of rawEdges) {
    if (typeof raw !== "object" || raw === null) continue;
    const edge = raw as Record<string, unknown>;
    const from = typeof edge.from === "string" ? edge.from : "";
    const to = typeof edge.to === "string" ? edge.to : "";
    const fallbackId = `${from}-${to}-${edges.length + 1}`;
    const id = typeof edge.id === "string" && NODE_ID.test(edge.id) ? edge.id : fallbackId;
    if (!ids.has(from) || !ids.has(to) || edgeIds.has(id)) continue;
    edgeIds.add(id);
    edges.push({
      id,
      from,
      to,
      label: label(edge.label, ""),
      dashed: edge.dashed === true,
      stroke: color(edge.stroke),
    });
  }
  return {
    version: DIAGRAM_MODEL_VERSION,
    direction: direction(record.direction),
    background: color(record.background),
    nodes,
    edges,
  };
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
  return trimmed;
}

function parseNodeExpression(expression: string): Omit<DiagramNode, "position" | "fill" | "stroke"> | null {
  const source = expression.trim().replace(/;$/, "");
  const idMatch = /^([A-Za-z_][A-Za-z0-9_-]{0,63})/.exec(source);
  if (!idMatch) return null;
  const id = idMatch[1]!;
  const rest = source.slice(id.length).trim();
  if (!rest) return { id, label: id, shape: "rectangle" };
  const forms: Array<[RegExp, DiagramShape]> = [
    [/^\(\[([\s\S]*)\]\)$/, "terminal"],
    [/^\(\(([\s\S]*)\)\)$/, "circle"],
    [/^\{([\s\S]*)\}$/, "decision"],
    [/^\[([\s\S]*)\]$/, "rectangle"],
    [/^\(([\s\S]*)\)$/, "rounded"],
  ];
  for (const [pattern, nodeShape] of forms) {
    const match = pattern.exec(rest);
    if (match) return { id, label: unquote(match[1] ?? id), shape: nodeShape };
  }
  return null;
}

function arrange(model: DiagramModel, previous?: DiagramModel): DiagramModel {
  const previousById = new Map(previous?.nodes.map((node) => [node.id, node]));
  const incoming = new Map(model.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(model.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of model.edges) {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }
  const rank = new Map<string, number>();
  const queue = model.nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id);
  for (const id of queue) rank.set(id, 0);
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index]!;
    for (const target of outgoing.get(id) ?? []) {
      rank.set(target, Math.max(rank.get(target) ?? 0, (rank.get(id) ?? 0) + 1));
      incoming.set(target, (incoming.get(target) ?? 1) - 1);
      if (incoming.get(target) === 0) queue.push(target);
    }
  }
  for (const node of model.nodes) {
    if (!rank.has(node.id)) rank.set(node.id, 0);
  }
  const lanes = new Map<number, number>();
  const horizontal = model.direction === "LR" || model.direction === "RL";
  const reversed = model.direction === "RL" || model.direction === "BT";
  const maxRank = Math.max(0, ...rank.values());
  return {
    ...model,
    nodes: model.nodes.map((node) => {
      const retained = previousById.get(node.id);
      if (retained) {
        return {
          ...node,
          position: retained.position,
          fill: node.fill ?? retained.fill,
          stroke: node.stroke ?? retained.stroke,
        };
      }
      const rawRank = rank.get(node.id) ?? 0;
      const nodeRank = reversed ? maxRank - rawRank : rawRank;
      const lane = lanes.get(nodeRank) ?? 0;
      lanes.set(nodeRank, lane + 1);
      return {
        ...node,
        position: horizontal
          ? { x: 12 + nodeRank * (NODE_WIDTH + RANK_GAP), y: 20 + lane * (NODE_HEIGHT + LANE_GAP) }
          : { x: 20 + lane * (NODE_WIDTH + LANE_GAP), y: 12 + nodeRank * (NODE_HEIGHT + RANK_GAP) },
      };
    }),
  };
}

export function reflowDiagram(value: unknown): DiagramModel {
  return arrange(readDiagramModel(value));
}

export function parseMermaidFlowchart(source: string, previous?: DiagramModel): DiagramParseResult {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const headerIndex = lines.findIndex((line) => /^(?:flowchart|graph)\s+/i.test(line.trim()));
  if (headerIndex < 0) return { ok: false, error: "Start with ‘flowchart LR’ or another direction." };
  const header = /^(?:flowchart|graph)\s+(TD|TB|BT|LR|RL)\s*$/i.exec(lines[headerIndex]!.trim());
  if (!header) return { ok: false, error: "Use TD, TB, BT, LR, or RL after ‘flowchart’." };
  const nodes = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];
  const styles = new Map<string, { fill: string | null; stroke: string | null }>();
  let unsupportedLine: number | null = null;

  function remember(expression: string): DiagramNode | null {
    const parsed = parseNodeExpression(expression);
    if (!parsed) return null;
    const existing = nodes.get(parsed.id);
    const node: DiagramNode = {
      id: parsed.id,
      label: existing && parsed.label === parsed.id ? existing.label : parsed.label,
      shape: existing && parsed.label === parsed.id ? existing.shape : parsed.shape,
      position: existing?.position ?? { x: 0, y: 0 },
      fill: existing?.fill ?? null,
      stroke: existing?.stroke ?? null,
    };
    nodes.set(node.id, node);
    return node;
  }

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (!line || line.startsWith("%%")) continue;
    const styleMatch = /^style\s+([A-Za-z_][\w-]*)\s+(.+)$/i.exec(line);
    if (styleMatch) {
      const declarations = styleMatch[2]!.split(",");
      let fill: string | null = null;
      let stroke: string | null = null;
      for (const declaration of declarations) {
        const [rawKey, rawValue] = declaration.split(":", 2);
        if (rawKey?.trim() === "fill") fill = color(rawValue?.trim());
        if (rawKey?.trim() === "stroke") stroke = color(rawValue?.trim());
      }
      styles.set(styleMatch[1]!, { fill, stroke });
      continue;
    }
    const edgeMatch = /^(.+?)\s*(-\.->|-->)\s*(?:\|([^|]*)\|\s*)?(.+?)\s*;?$/.exec(line);
    if (edgeMatch) {
      const from = remember(edgeMatch[1]!);
      const to = remember(edgeMatch[4]!);
      if (!from || !to) {
        unsupportedLine = index + 1;
        break;
      }
      edges.push({
        id: `${from.id}-${to.id}-${edges.length + 1}`,
        from: from.id,
        to: to.id,
        label: label(unquote(edgeMatch[3] ?? ""), ""),
        dashed: edgeMatch[2] === "-.->",
        stroke: null,
      });
      continue;
    }
    if (!remember(line)) {
      unsupportedLine = index + 1;
      break;
    }
  }
  if (unsupportedLine !== null) {
    return { ok: false, error: `Line ${unsupportedLine} is outside Skriuw’s editable flowchart syntax.` };
  }
  if (nodes.size === 0) return { ok: false, error: "Add at least one diagram node." };
  if (nodes.size > MAX_DIAGRAM_NODES || edges.length > MAX_DIAGRAM_EDGES) {
    return { ok: false, error: `Visual editing supports ${MAX_DIAGRAM_NODES} nodes and ${MAX_DIAGRAM_EDGES} connectors.` };
  }
  for (const [id, style] of styles) {
    const node = nodes.get(id);
    if (node) nodes.set(id, { ...node, ...style });
  }
  return {
    ok: true,
    model: arrange({
      version: DIAGRAM_MODEL_VERSION,
      direction: direction(header[1]?.toUpperCase()),
      background: previous?.background ?? null,
      nodes: [...nodes.values()],
      edges,
    }, previous),
  };
}

function escapedLabel(value: string): string {
  return value.replaceAll('"', "'").replaceAll("\n", " ");
}

function nodeSource(node: DiagramNode): string {
  const text = `"${escapedLabel(node.label)}"`;
  if (node.shape === "rounded") return `${node.id}(${text})`;
  if (node.shape === "decision") return `${node.id}{${text}}`;
  if (node.shape === "terminal") return `${node.id}([${text}])`;
  if (node.shape === "circle") return `${node.id}((${text}))`;
  return `${node.id}[${text}]`;
}

export function serializeMermaidFlowchart(value: unknown): string {
  const model = readDiagramModel(value);
  const lines = [`flowchart ${model.direction}`];
  for (const node of model.nodes) lines.push(`  ${nodeSource(node)}`);
  for (const edge of model.edges) {
    const connector = edge.dashed ? "-.->" : "-->";
    const edgeLabel = edge.label ? `|"${escapedLabel(edge.label)}"|` : "";
    lines.push(`  ${edge.from} ${connector}${edgeLabel} ${edge.to}`);
  }
  for (const node of model.nodes) {
    const declarations = [node.fill ? `fill:${node.fill}` : "", node.stroke ? `stroke:${node.stroke}` : ""]
      .filter(Boolean);
    if (declarations.length > 0) lines.push(`  style ${node.id} ${declarations.join(",")}`);
  }
  return lines.join("\n");
}

export function nextDiagramNodeId(model: DiagramModel): string {
  let index = model.nodes.length + 1;
  while (model.nodes.some((node) => node.id === `step${index}`)) index += 1;
  return `step${index}`;
}
