import { activateReference } from "./reference-navigation";
import type { RelationshipGraph } from "./relationship-model";
import type { RendererStore } from "@/store/types";
import { Tooltip } from "@/shared/ui/tooltip";

type Props = {
  store: RendererStore;
  graph: RelationshipGraph;
};

const CENTER = 50;
const RADIUS = 39;

function graphPosition(index: number, count: number): { left: number; top: number } {
  if (index === 0) {
    return { left: CENTER, top: CENTER };
  }
  const angle = ((index - 1) / (count - 1)) * Math.PI * 2 - Math.PI / 2;
  return {
    left: CENTER + Math.cos(angle) * RADIUS,
    top: CENTER + Math.sin(angle) * RADIUS,
  };
}

function graphNodeClass(kind: RelationshipGraph["nodes"][number]["kind"]): string {
  if (kind === "current") {
    return "bg-foreground text-background";
  }
  if (kind === "tag") {
    return "border border-reference-tag/35 bg-background text-reference-tag";
  }
  if (kind === "person") {
    return "border border-reference-person/35 bg-background text-reference-person";
  }
  return "border border-border bg-background text-foreground";
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

  return (
    <section className="border-b border-border/60 px-4 py-3" aria-labelledby="relationship-local-graph">
      <p id="relationship-local-graph" className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
        Local graph
      </p>
      <div className="relative mx-auto aspect-square w-full max-w-[248px]" aria-label="Direct relationships around the current note">
        <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" aria-hidden="true">
          {graph.edges.map((edge) => {
            const from = byId.get(edge.from);
            const to = byId.get(edge.to);
            if (!from || !to) {
              return null;
            }
            return (
              <line
                key={`${edge.from}-${edge.to}`}
                x1={from.left}
                y1={from.top}
                x2={to.left}
                y2={to.top}
                className="stroke-border"
                strokeWidth="0.6"
              />
            );
          })}
        </svg>
        {graph.nodes.map((node, index) => {
          const position = positions[index]!;
          const current = node.kind === "current";
          const label = current ? "Current note" : node.label;
          return (
            <div
              key={node.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${position.left}%`, top: `${position.top}%` }}
            >
              {current ? (
                <span className={`flex size-12 items-center justify-center rounded-full text-center text-[9px] font-medium ${graphNodeClass(node.kind)}`}>
                  Current
                </span>
              ) : (
                <Tooltip label={label}>
                  <button
                    type="button"
                    aria-label={`Open ${label}`}
                    onClick={() => nodeAction(store, node.id, node.kind)}
                    className={`flex size-8 cursor-pointer items-center justify-center rounded-full text-center text-[8px] font-medium shadow-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${graphNodeClass(node.kind)}`}
                  >
                    <span aria-hidden="true" className="max-w-6 truncate">
                      {node.label.slice(0, 1)}
                    </span>
                  </button>
                </Tooltip>
              )}
              {!current && (
                <span aria-hidden="true" className="absolute left-1/2 top-full mt-0.5 w-20 -translate-x-1/2 truncate text-center text-[8px] leading-tight text-muted-foreground">
                  {node.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {graph.hiddenCount > 0 && (
        <p className="m-0 text-[11px] text-muted-foreground">+{graph.hiddenCount} more relationships</p>
      )}
    </section>
  );
}
