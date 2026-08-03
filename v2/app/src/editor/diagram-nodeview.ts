import type { Node as ProseMirrorNode } from "prosemirror-model";
import { NodeSelection } from "prosemirror-state";
import type { EditorView, NodeView } from "prosemirror-view";
import {
  DIAGRAM_NODE_HEIGHT,
  DIAGRAM_NODE_WIDTH,
  DIAGRAM_RANK_GAP,
} from "./diagram-geometry";
import {
  diagramShapes,
  nextDiagramNodeId,
  parseMermaidFlowchart,
  readDiagramModel,
  reflowDiagram,
  serializeMermaidFlowchart,
  type DiagramEdge,
  type DiagramModel,
  type DiagramNode,
  type DiagramPoint,
  type DiagramShape,
} from "./diagram-model";

const NUDGE_DISTANCE = 8;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
let markerSequence = 0;

export type DiagramBounds = { width: number; height: number };

export function diagramBounds(model: DiagramModel): DiagramBounds {
  return {
    width: Math.max(
      320,
      ...model.nodes.map(({ position }) => position.x + DIAGRAM_NODE_WIDTH + 24),
    ),
    height: Math.max(
      148,
      ...model.nodes.map(({ position }) => position.y + DIAGRAM_NODE_HEIGHT + 28),
    ),
  };
}

export function connectorPath(from: DiagramPoint, to: DiagramPoint): string {
  const startX = from.x + DIAGRAM_NODE_WIDTH;
  const startY = from.y + DIAGRAM_NODE_HEIGHT / 2;
  const endX = to.x;
  const endY = to.y + DIAGRAM_NODE_HEIGHT / 2;
  const bend = Math.max(42, Math.abs(endX - startX) * 0.45);
  const first = startX <= endX ? startX + bend : startX - bend;
  const second = startX <= endX ? endX - bend : endX + bend;
  return `M ${startX} ${startY} C ${first} ${startY}, ${second} ${endY}, ${endX} ${endY}`;
}

export function incidentDiagramEdges(model: DiagramModel, nodeId: string): DiagramEdge[] {
  return model.edges.filter(({ from, to }) => from === nodeId || to === nodeId);
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function button(label: string, text: string): HTMLButtonElement {
  const control = element("button", "diagram-control");
  control.type = "button";
  control.setAttribute("aria-label", label);
  control.textContent = text;
  return control;
}

function cloneModel(model: DiagramModel): DiagramModel {
  return {
    ...model,
    nodes: model.nodes.map((node) => ({ ...node, position: { ...node.position } })),
    edges: model.edges.map((edge) => ({ ...edge })),
  };
}

function closestNode(
  model: DiagramModel,
  currentId: string,
  axis: "x" | "y",
  sign: -1 | 1,
): string | null {
  const current = model.nodes.find(({ id }) => id === currentId);
  if (!current) return model.nodes[0]?.id ?? null;
  const crossAxis = axis === "x" ? "y" : "x";
  const candidates = model.nodes
    .filter((node) => node.id !== currentId && (node.position[axis] - current.position[axis]) * sign > 0)
    .map((node) => ({
      id: node.id,
      distance:
        Math.abs(node.position[axis] - current.position[axis]) +
        Math.abs(node.position[crossAxis] - current.position[crossAxis]) * 0.35,
    }))
    .sort((left, right) => left.distance - right.distance);
  return candidates[0]?.id ?? null;
}

function edgeLabelPosition(from: DiagramPoint, to: DiagramPoint): DiagramPoint {
  return {
    x: (from.x + DIAGRAM_NODE_WIDTH + to.x) / 2,
    y: (from.y + to.y) / 2 + DIAGRAM_NODE_HEIGHT / 2 - 6,
  };
}

function nodeAriaLabel(model: DiagramModel, node: DiagramNode): string {
  const outgoing = model.edges
    .filter(({ from }) => from === node.id)
    .map(({ to, label }) => {
      const target = model.nodes.find(({ id }) => id === to)?.label ?? to;
      return label ? `${label} to ${target}` : `to ${target}`;
    });
  return outgoing.length > 0
    ? `${node.label}, ${node.shape}. Connects ${outgoing.join(", ")}`
    : `${node.label}, ${node.shape}. No outgoing connections`;
}

export function createDiagramNodeView(
  initialNode: ProseMirrorNode,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView {
  let node = initialNode;
  let model = readDiagramModel(node.attrs.model);
  let selectedId = model.nodes[0]?.id ?? null;
  let selectedAsBlock = false;
  let sourceOpen = false;
  let connectingFrom: string | null = null;
  let dragFrame = 0;
  let pendingDrag: { id: string; position: DiagramPoint } | null = null;
  let renderedEdges: Array<{
    edge: DiagramEdge;
    path: SVGPathElement;
    label: SVGTextElement | null;
  }> = [];
  markerSequence += 1;
  const markerId = `skriuw-diagram-arrow-${markerSequence}`;

  const dom = element("section", "diagram-block");
  dom.contentEditable = "false";
  dom.tabIndex = 0;
  dom.setAttribute("role", "figure");

  const toolbar = element("div", "diagram-toolbar");
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Diagram actions");
  const addControl = button("Add a connected step", "+ Step");
  const connectControl = button("Connect selected step", "Connect");
  const layoutControl = button("Arrange diagram", "Arrange");
  const sourceControl = button("Edit Mermaid source", "Source");
  const shapeSelect = element("select", "diagram-control diagram-select");
  shapeSelect.setAttribute("aria-label", "Selected step shape");
  for (const value of diagramShapes) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value[0]!.toUpperCase() + value.slice(1);
    shapeSelect.append(option);
  }
  const fillControl = element("input", "diagram-color");
  fillControl.type = "color";
  fillControl.setAttribute("aria-label", "Selected step color");
  const backgroundControl = element("input", "diagram-color");
  backgroundControl.type = "color";
  backgroundControl.setAttribute("aria-label", "Diagram background color");
  toolbar.append(
    addControl,
    connectControl,
    layoutControl,
    shapeSelect,
    fillControl,
    backgroundControl,
    sourceControl,
  );

  const viewport = element("div", "diagram-viewport");
  const canvas = element("div", "diagram-canvas");
  const connectorSvg = document.createElementNS(SVG_NAMESPACE, "svg");
  connectorSvg.classList.add("diagram-connectors");
  connectorSvg.setAttribute("aria-hidden", "true");
  const nodesLayer = element("div", "diagram-nodes");
  canvas.append(connectorSvg, nodesLayer);
  viewport.append(canvas);

  const sourcePanel = element("div", "diagram-source-panel");
  sourcePanel.hidden = true;
  const sourceLabel = element("label", "diagram-source-label");
  sourceLabel.textContent = "Mermaid flowchart source";
  const sourceTextarea = element("textarea", "diagram-source");
  sourceTextarea.spellcheck = false;
  const sourceError = element("p", "diagram-source-error");
  sourceError.setAttribute("role", "alert");
  const sourceActions = element("div", "diagram-source-actions");
  const applySource = button("Apply Mermaid source", "Apply");
  const cancelSource = button("Cancel source editing", "Cancel");
  sourceActions.append(applySource, cancelSource);
  sourcePanel.append(sourceLabel, sourceTextarea, sourceError, sourceActions);

  const status = element("p", "diagram-status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  dom.append(toolbar, viewport, sourcePanel, status);

  function announce(message: string): void {
    status.textContent = "";
    window.requestAnimationFrame(() => {
      status.textContent = message;
    });
  }

  function commit(next: DiagramModel): void {
    const position = getPos();
    if (position === undefined || !view.editable) return;
    const current = view.state.doc.nodeAt(position);
    if (!current || current.type.name !== "diagram") return;
    model = readDiagramModel(next);
    view.dispatch(view.state.tr.setNodeMarkup(position, undefined, { ...current.attrs, model }));
  }

  function currentSelected(): DiagramNode | null {
    return model.nodes.find(({ id }) => id === selectedId) ?? null;
  }

  function syncControls(): void {
    const current = currentSelected();
    shapeSelect.disabled = current === null || !view.editable;
    fillControl.disabled = current === null || !view.editable;
    connectControl.disabled = current === null || !view.editable;
    addControl.disabled = !view.editable;
    layoutControl.disabled = !view.editable;
    backgroundControl.disabled = !view.editable;
    sourceControl.disabled = !view.editable;
    if (current) {
      shapeSelect.value = current.shape;
      fillControl.value = current.fill ?? "#dbeafe";
    }
    backgroundControl.value = model.background ?? "#ffffff";
    connectControl.dataset.active = connectingFrom ? "true" : "false";
    sourceControl.dataset.active = sourceOpen ? "true" : "false";
  }

  function renderEdges(): void {
    connectorSvg.replaceChildren();
    renderedEdges = [];
    const bounds = diagramBounds(model);
    connectorSvg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
    connectorSvg.setAttribute("width", String(bounds.width));
    connectorSvg.setAttribute("height", String(bounds.height));
    const definitions = document.createElementNS(SVG_NAMESPACE, "defs");
    const marker = document.createElementNS(SVG_NAMESPACE, "marker");
    marker.id = markerId;
    marker.setAttribute("markerWidth", "8");
    marker.setAttribute("markerHeight", "8");
    marker.setAttribute("refX", "7");
    marker.setAttribute("refY", "4");
    marker.setAttribute("orient", "auto");
    const arrow = document.createElementNS(SVG_NAMESPACE, "path");
    arrow.setAttribute("d", "M 0 0 L 8 4 L 0 8 z");
    arrow.setAttribute("fill", "context-stroke");
    marker.append(arrow);
    definitions.append(marker);
    connectorSvg.append(definitions);
    for (const edge of model.edges) {
      const from = model.nodes.find(({ id }) => id === edge.from);
      const to = model.nodes.find(({ id }) => id === edge.to);
      if (!from || !to) continue;
      const path = document.createElementNS(SVG_NAMESPACE, "path");
      path.classList.add("diagram-connector");
      path.setAttribute("d", connectorPath(from.position, to.position));
      path.setAttribute("marker-end", `url(#${markerId})`);
      if (edge.dashed) path.setAttribute("stroke-dasharray", "6 5");
      if (edge.stroke) path.style.stroke = edge.stroke;
      connectorSvg.append(path);
      let renderedLabel: SVGTextElement | null = null;
      if (edge.label) {
        const labelPosition = edgeLabelPosition(from.position, to.position);
        const text = document.createElementNS(SVG_NAMESPACE, "text");
        text.classList.add("diagram-connector-label");
        text.setAttribute("x", String(labelPosition.x));
        text.setAttribute("y", String(labelPosition.y));
        text.textContent = edge.label;
        connectorSvg.append(text);
        renderedLabel = text;
      }
      renderedEdges.push({ edge, path, label: renderedLabel });
    }
  }

  function updateIncidentEdges(nodeId: string): void {
    for (const rendered of renderedEdges) {
      if (rendered.edge.from !== nodeId && rendered.edge.to !== nodeId) continue;
      const from = model.nodes.find(({ id }) => id === rendered.edge.from);
      const to = model.nodes.find(({ id }) => id === rendered.edge.to);
      if (!from || !to) continue;
      rendered.path.setAttribute("d", connectorPath(from.position, to.position));
      if (rendered.label) {
        const position = edgeLabelPosition(from.position, to.position);
        rendered.label.setAttribute("x", String(position.x));
        rendered.label.setAttribute("y", String(position.y));
      }
    }
  }

  function select(id: string, focus = false): void {
    selectedId = id;
    for (const child of nodesLayer.children) {
      if (!(child instanceof HTMLElement)) continue;
      const active = child.dataset.nodeId === id;
      child.dataset.selected = active ? "true" : "false";
      child.tabIndex = active ? 0 : -1;
      if (active && focus) child.focus();
    }
    syncControls();
  }

  function startLabelEdit(target: HTMLElement, diagramNode: DiagramNode): void {
    if (!view.editable) return;
    const input = element("input", "diagram-node-label-input");
    input.value = diagramNode.label;
    input.setAttribute("aria-label", `Rename ${diagramNode.label}`);
    target.replaceChildren(input);
    input.focus();
    input.select();
    let finished = false;
    function finish(save: boolean): void {
      if (finished) return;
      finished = true;
      const nextLabel = input.value.trim().slice(0, 240);
      if (save && nextLabel && nextLabel !== diagramNode.label) {
        const next = cloneModel(model);
        const found = next.nodes.find(({ id }) => id === diagramNode.id);
        if (found) found.label = nextLabel;
        commit(next);
        announce(`Renamed step to ${nextLabel}`);
      } else {
        render();
        select(diagramNode.id, true);
      }
    }
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));
  }

  function removeNode(id: string): void {
    const removed = model.nodes.find((item) => item.id === id);
    if (!removed || model.nodes.length === 1) {
      announce("A diagram needs at least one step");
      return;
    }
    const next = cloneModel(model);
    next.nodes = next.nodes.filter((item) => item.id !== id);
    next.edges = next.edges.filter(({ from, to }) => from !== id && to !== id);
    selectedId = next.nodes[0]?.id ?? null;
    commit(next);
    announce(`Deleted ${removed.label}`);
  }

  function connectTo(targetId: string): boolean {
    const from = connectingFrom;
    if (!from || from === targetId) return false;
    if (model.edges.some((edge) => edge.from === from && edge.to === targetId)) {
      connectingFrom = null;
      syncControls();
      announce("Those steps are already connected");
      return true;
    }
    const next = cloneModel(model);
    next.edges.push({
      id: `${from}-${targetId}-${next.edges.length + 1}`,
      from,
      to: targetId,
      label: "",
      dashed: false,
      stroke: null,
    });
    const fromLabel = next.nodes.find(({ id }) => id === from)?.label ?? from;
    const targetLabel = next.nodes.find(({ id }) => id === targetId)?.label ?? targetId;
    connectingFrom = null;
    commit(next);
    announce(`Connected ${fromLabel} to ${targetLabel}`);
    return true;
  }

  function handleNodeKey(event: KeyboardEvent, target: HTMLElement, diagramNode: DiagramNode): void {
    if (event.key === "Escape") {
      event.preventDefault();
      const position = getPos();
      if (position !== undefined) {
        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, position)));
        view.focus();
      }
      return;
    }
    if (event.key === "Enter" || event.key === "F2") {
      event.preventDefault();
      if (!connectTo(diagramNode.id)) startLabelEdit(target, diagramNode);
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && view.editable) {
      event.preventDefault();
      removeNode(diagramNode.id);
      return;
    }
    const keyDirection = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const axis = event.key === "ArrowLeft" || event.key === "ArrowRight" ? "x" : "y";
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    if (event.shiftKey && view.editable) {
      const next = cloneModel(model);
      const found = next.nodes.find(({ id }) => id === diagramNode.id);
      if (!found) return;
      found.position[axis] += keyDirection * NUDGE_DISTANCE;
      commit(next);
      announce(`Moved ${found.label} ${event.key.replace("Arrow", "").toLowerCase()}`);
      return;
    }
    const closest = closestNode(model, diagramNode.id, axis, keyDirection);
    if (closest) select(closest, true);
  }

  function createNodeElement(diagramNode: DiagramNode): HTMLElement {
    const target = element("div", `diagram-node diagram-node-${diagramNode.shape}`);
    target.dataset.nodeId = diagramNode.id;
    target.dataset.selected = diagramNode.id === selectedId ? "true" : "false";
    target.setAttribute("role", "button");
    target.setAttribute("aria-label", nodeAriaLabel(model, diagramNode));
    target.tabIndex = diagramNode.id === selectedId ? 0 : -1;
    target.style.transform = `translate3d(${diagramNode.position.x}px, ${diagramNode.position.y}px, 0)`;
    if (diagramNode.fill) target.style.backgroundColor = diagramNode.fill;
    if (diagramNode.stroke) target.style.borderColor = diagramNode.stroke;
    target.textContent = diagramNode.label;
    target.addEventListener("focus", () => select(diagramNode.id));
    target.addEventListener("click", () => {
      if (!connectTo(diagramNode.id)) select(diagramNode.id, true);
    });
    target.addEventListener("dblclick", () => startLabelEdit(target, diagramNode));
    target.addEventListener("keydown", (event) => handleNodeKey(event, target, diagramNode));
    target.addEventListener("pointerdown", (event) => {
      if (!view.editable || event.button !== 0) return;
      select(diagramNode.id);
      target.setPointerCapture(event.pointerId);
      const origin = { ...diagramNode.position };
      const start = { x: event.clientX, y: event.clientY };
      let moved = false;
      const move = (moveEvent: PointerEvent) => {
        const position = {
          x: Math.round(origin.x + moveEvent.clientX - start.x),
          y: Math.round(origin.y + moveEvent.clientY - start.y),
        };
        moved ||= Math.abs(position.x - origin.x) + Math.abs(position.y - origin.y) > 3;
        pendingDrag = { id: diagramNode.id, position };
        if (dragFrame !== 0) return;
        dragFrame = window.requestAnimationFrame(() => {
          dragFrame = 0;
          if (!pendingDrag) return;
          const active = model.nodes.find(({ id }) => id === pendingDrag?.id);
          if (!active) return;
          active.position = pendingDrag.position;
          target.style.transform = `translate3d(${active.position.x}px, ${active.position.y}px, 0)`;
          updateIncidentEdges(active.id);
        });
      };
      const finish = () => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", finish);
        target.removeEventListener("pointercancel", finish);
        if (dragFrame !== 0) window.cancelAnimationFrame(dragFrame);
        dragFrame = 0;
        const finalPosition = pendingDrag?.id === diagramNode.id ? pendingDrag.position : origin;
        pendingDrag = null;
        if (moved) {
          const next = cloneModel(model);
          const found = next.nodes.find(({ id }) => id === diagramNode.id);
          if (found) found.position = finalPosition;
          commit(next);
          announce(`Moved ${diagramNode.label}`);
        }
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", finish);
      target.addEventListener("pointercancel", finish);
    });
    return target;
  }

  function render(): void {
    model = readDiagramModel(node.attrs.model ?? model);
    if (!model.nodes.some(({ id }) => id === selectedId)) selectedId = model.nodes[0]?.id ?? null;
    const bounds = diagramBounds(model);
    canvas.style.width = `${bounds.width}px`;
    canvas.style.height = `${bounds.height}px`;
    canvas.style.backgroundColor = model.background ?? "transparent";
    nodesLayer.replaceChildren(...model.nodes.map(createNodeElement));
    renderEdges();
    const count = `${model.nodes.length} ${model.nodes.length === 1 ? "step" : "steps"}, ${model.edges.length} ${model.edges.length === 1 ? "connection" : "connections"}`;
    dom.setAttribute("aria-label", `Diagram, ${count}. Enter a step to rename it; Shift plus arrow keys move it.`);
    dom.dataset.selected = selectedAsBlock ? "true" : "false";
    sourcePanel.hidden = !sourceOpen;
    viewport.hidden = sourceOpen;
    syncControls();
  }

  addControl.addEventListener("click", () => {
    const next = cloneModel(model);
    const current = currentSelected();
    const id = nextDiagramNodeId(next);
    next.nodes.push({
      id,
      label: "New step",
      shape: "rectangle",
      position: current
        ? {
            x: current.position.x + DIAGRAM_NODE_WIDTH + DIAGRAM_RANK_GAP,
            y: current.position.y,
          }
        : { x: 12, y: 24 },
      fill: null,
      stroke: null,
    });
    if (current) {
      next.edges.push({
        id: `${current.id}-${id}-${next.edges.length + 1}`,
        from: current.id,
        to: id,
        label: "",
        dashed: false,
        stroke: null,
      });
    }
    selectedId = id;
    commit(next);
    announce("Added New step");
  });

  connectControl.addEventListener("click", () => {
    const current = currentSelected();
    connectingFrom = connectingFrom ? null : current?.id ?? null;
    syncControls();
    announce(connectingFrom ? `Choose a step to connect from ${current?.label}` : "Connection cancelled");
    if (connectingFrom) nodesLayer.querySelector<HTMLElement>(`[data-node-id="${connectingFrom}"]`)?.focus();
  });

  layoutControl.addEventListener("click", () => {
    commit(reflowDiagram(model));
    announce("Arranged diagram");
  });

  shapeSelect.addEventListener("change", () => {
    const next = cloneModel(model);
    const current = next.nodes.find(({ id }) => id === selectedId);
    if (!current) return;
    current.shape = shapeSelect.value as DiagramShape;
    commit(next);
    announce(`Changed ${current.label} to ${current.shape}`);
  });

  fillControl.addEventListener("input", () => {
    const next = cloneModel(model);
    const current = next.nodes.find(({ id }) => id === selectedId);
    if (!current) return;
    current.fill = fillControl.value;
    commit(next);
  });

  backgroundControl.addEventListener("input", () => {
    const next = cloneModel(model);
    next.background = backgroundControl.value;
    commit(next);
  });

  sourceControl.addEventListener("click", () => {
    sourceOpen = !sourceOpen;
    sourceError.textContent = "";
    sourceTextarea.value = serializeMermaidFlowchart(model);
    render();
    if (sourceOpen) sourceTextarea.focus();
  });

  applySource.addEventListener("click", () => {
    const parsed = parseMermaidFlowchart(sourceTextarea.value, model);
    if (!parsed.ok) {
      sourceError.textContent = parsed.error;
      return;
    }
    sourceOpen = false;
    sourceError.textContent = "";
    commit(parsed.model);
    announce("Applied Mermaid source");
    dom.focus();
  });

  cancelSource.addEventListener("click", () => {
    sourceOpen = false;
    sourceError.textContent = "";
    render();
    dom.focus();
  });

  sourceTextarea.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      cancelSource.click();
    } else if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      applySource.click();
    }
  });

  dom.addEventListener("keydown", (event) => {
    if (event.target !== dom) return;
    if (event.key === "Enter") {
      event.preventDefault();
      const target = selectedId
        ? nodesLayer.querySelector<HTMLElement>(`[data-node-id="${selectedId}"]`)
        : null;
      target?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      view.focus();
    }
  });

  render();

  return {
    dom,
    update(next) {
      if (next.type.name !== "diagram") return false;
      node = next;
      model = readDiagramModel(next.attrs.model);
      render();
      return true;
    },
    selectNode() {
      selectedAsBlock = true;
      dom.dataset.selected = "true";
    },
    deselectNode() {
      selectedAsBlock = false;
      dom.dataset.selected = "false";
    },
    stopEvent: (event) =>
      event.target instanceof HTMLElement &&
      dom.contains(event.target) &&
      event.target.closest("button, input, select, textarea, .diagram-node") !== null,
    ignoreMutation: () => true,
    destroy() {
      if (dragFrame !== 0) window.cancelAnimationFrame(dragFrame);
    },
  };
}

export function diagramEdgeSummary(model: DiagramModel, edge: DiagramEdge): string {
  const from = model.nodes.find(({ id }) => id === edge.from)?.label ?? edge.from;
  const to = model.nodes.find(({ id }) => id === edge.to)?.label ?? edge.to;
  return edge.label ? `${from} to ${to}: ${edge.label}` : `${from} to ${to}`;
}
