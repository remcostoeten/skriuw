import { activateReference } from "./reference-navigation";
import type { RelationshipGraph } from "./relationship-model";
import type { RendererStore } from "@/store/types";
import { Tooltip } from "@/shared/ui/tooltip";

type Props = {
  store: RendererStore;
  graph: RelationshipGraph;
};

const CENTER = 50;
const RADIUS = 33;
const OUTER_RADIUS = 42;
const INNER_RADIUS = 24;
const LABELED_NODE_LIMIT = 9;

type GraphPoint = { left: number; top: number };

function polar(angle: number, radius: number): GraphPoint {
  return {
    left: CENTER + Math.cos(angle) * radius,
    top: CENTER + Math.sin(angle) * radius,
  };
}

/**
 * Radial layout around the current note. Past LABELED_NODE_LIMIT nodes a single
 * ring runs out of room, so neighbours alternate between an outer and an inner
 * ring with staggered start angles.
 */
function graphPosition(index: number, count: number): GraphPoint {
  if (index === 0) {
    return { left: CENTER, top: CENTER };
  }
  const neighbors = count - 1;
  const slot = index - 1;
  if (count <= LABELED_NODE_LIMIT) {
    return polar((slot / neighbors) * Math.PI * 2 - Math.PI / 2, RADIUS);
  }
  const ring = slot % 2;
  const ringCount = ring === 0 ? Math.ceil(neighbors / 2) : Math.floor(neighbors / 2);
  const ringIndex = Math.floor(slot / 2);
  const stagger = ring === 0 ? 0 : Math.PI / ringCount;
  const angle = (ringIndex / ringCount) * Math.PI * 2 - Math.PI / 2 + stagger;
  return polar(angle, ring === 0 ? OUTER_RADIUS : INNER_RADIUS);
}

function edgePath(from: GraphPoint, to: GraphPoint, bend: number): string {
  const midLeft = (from.left + to.left) / 2;
  const midTop = (from.top + to.top) / 2;
  const deltaLeft = to.left - from.left;
  const deltaTop = to.top - from.top;
  const length = Math.hypot(deltaLeft, deltaTop) || 1;
  const controlLeft = midLeft - (deltaTop / length) * bend;
  const controlTop = midTop + (deltaLeft / length) * bend;
  return `M ${from.left} ${from.top} Q ${controlLeft} ${controlTop} ${to.left} ${to.top}`;
}

function graphEdgeClass(kind: RelationshipGraph["nodes"][number]["kind"] | undefined): string {
  if (kind === "tag") {
    return "stroke-reference-tag/30";
  }
  if (kind === "person") {
    return "stroke-reference-person/30";
  }
  return "stroke-border";
}

function graphNodeClass(kind: RelationshipGraph["nodes"][number]["kind"]): string {
  if (kind === "tag") {
    return "border border-reference-tag/40 bg-reference-tag/10 text-reference-tag hover:border-reference-tag/70 hover:bg-reference-tag/20";
  }
  if (kind === "person") {
    return "border border-reference-person/40 bg-reference-person/10 text-reference-person hover:border-reference-person/70 hover:bg-reference-person/20";
  }
  return "border border-border bg-muted/40 text-foreground hover:border-foreground/30 hover:bg-muted";
}

function graphGlyph(node: RelationshipGraph["nodes"][number]): string {
  if (node.kind === "tag") {
    return "#";
  }
  if (node.kind === "person") {
    return "$";
  }
  return node.label.slice(0, 1).toUpperCase();
}

function nodeAction(store: RendererStore, id: string, kind: RelationshipGraph["nodes"][number]["kind"]): void {
  if (kind === "note") {
    activateReference(store, "note", id);
    return;
  }
  if (kind === "tag" || kind === "person") {
    activateReference(store, kind, id.slice(kind.length + 1));
  }
}

/** A static, bounded local graph. Edges are SVG; every actionable node is a native button. */
export function RelationshipGraphView({ store, graph }: Props) {
  if (graph.nodes.length <= 1) {
    return null;
  }
  const positions = graph.nodes.map((_node, index) => graphPosition(index, graph.nodes.length));
  const byId = new Map(graph.nodes.map((node, index) => [node.id, positions[index]! ]));
  const labeled = graph.nodes.length <= LABELED_NODE_LIMIT;

  return (
    <section className="border-b border-border/60 px-4 py-3" aria-labelledby="relationship-local-graph">
      <p id="relationship-local-graph" className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
        Local graph
      </p>
      <div className="relative mx-auto aspect-square w-full max-w-[248px]" aria-label="Direct relationships around the current note">
        <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" aria-hidden="true">
          <circle
            cx={CENTER}
            cy={CENTER}
            r={labeled ? RADIUS : OUTER_RADIUS}
            fill="none"
            className="stroke-border/40"
            strokeWidth="0.4"
            strokeDasharray="1.5 3"
            strokeLinecap="round"
          />
          {graph.edges.map((edge, index) => {
            const from = byId.get(edge.from);
            const to = byId.get(edge.to);
            if (!from || !to) {
              return null;
            }
            const neighborId = edge.from === graph.nodes[0]!.id ? edge.to : edge.from;
            const neighborKind = graph.nodes.find((node) => node.id === neighborId)?.kind;
            return (
              <path
                key={`${edge.from}-${edge.to}`}
                d={edgePath(from, to, index % 2 === 0 ? 4 : -4)}
                fill="none"
                className={graphEdgeClass(neighborKind)}
                strokeWidth="0.7"
                strokeLinecap="round"
              />
            );
          })}
        </svg>
        {graph.nodes.map((node, index) => {
          const position = positions[index]!;
          const current = node.kind === "current";
          const label = node.label;
          return (
            <div
              key={node.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${position.left}%`, top: `${position.top}%` }}
            >
              {current ? (
                <Tooltip label={label}>
                  <span className="flex size-11 items-center justify-center rounded-full bg-foreground text-[13px] font-semibold text-background ring-4 ring-foreground/10">
                    {graphGlyph(node)}
                  </span>
                </Tooltip>
              ) : (
                <Tooltip label={label}>
                  <button
                    type="button"
                    aria-label={`Open ${label}`}
                    onClick={() => nodeAction(store, node.id, node.kind)}
                    className={`flex cursor-pointer items-center justify-center rounded-full text-center font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${labeled ? "size-9 text-[11px]" : "size-7 text-[10px]"} ${graphNodeClass(node.kind)}`}
                  >
                    <span aria-hidden="true">{graphGlyph(node)}</span>
                  </button>
                </Tooltip>
              )}
              {!current && labeled && (
                <span aria-hidden="true" className="absolute left-1/2 top-full mt-1 w-16 -translate-x-1/2 truncate text-center text-[9px] leading-tight text-muted-foreground">
                  {node.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {graph.hiddenCount > 0 && (
        <p className="m-0 mt-1 text-center text-[10px] text-muted-foreground/80">
          +{graph.hiddenCount} more relationships
        </p>
      )}
    </section>
  );
}
