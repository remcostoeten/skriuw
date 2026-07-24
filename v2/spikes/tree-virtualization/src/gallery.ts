import { buildTreeIndex } from "./tree";
import { createTreeView } from "./view";
import type { CorrectnessCheck, ProjectedNode } from "./types";

const GALLERY_NODES: ProjectedNode[] = [
  { id: "g-folder-open", parentId: null, kind: "folder", title: "Open folder" },
  { id: "g-note-selected", parentId: "g-folder-open", kind: "note", title: "Selected note" },
  { id: "g-note-disabled", parentId: "g-folder-open", kind: "note", title: "Disabled note" },
  { id: "g-note-focused", parentId: "g-folder-open", kind: "note", title: "Focused note" },
  { id: "g-folder-closed", parentId: null, kind: "folder", title: "Collapsed folder" },
  { id: "g-note-hidden", parentId: "g-folder-closed", kind: "note", title: "Hidden note" },
  { id: "g-note-plain", parentId: null, kind: "note", title: "Plain note" },
];

function section(host: HTMLElement, title: string): HTMLElement {
  const wrapper = document.createElement("section");
  wrapper.className = "gallery-item";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const body = document.createElement("div");
  body.className = "gallery-body";
  wrapper.append(heading, body);
  host.appendChild(wrapper);
  return body;
}

export function renderGallery(host: HTMLElement): CorrectnessCheck[] {
  const checks: CorrectnessCheck[] = [];
  const index = buildTreeIndex(GALLERY_NODES);

  const statesBody = section(host, "Selected, focused, disabled, expanded, collapsed");
  const view = createTreeView(statesBody, "State gallery tree");
  view.setTree(index, ["g-folder-open"]);
  view.setDisabled(["g-note-disabled"]);
  view.select("g-note-selected");
  view.focus("g-note-selected");
  view.handleKey("ArrowDown");
  const skipped = view.focusedId();
  checks.push({
    name: "gallery-disabled-rows-skipped",
    pass: skipped === "g-note-focused" && view.selectedId() === "g-note-focused",
    detail: `ArrowDown from g-note-selected landed on ${skipped ?? "nothing"} across the disabled row`,
  });
  view.select("g-note-selected");

  const emptyBody = section(host, "Empty");
  const emptyView = createTreeView(emptyBody, "Empty tree");
  emptyView.setTree(buildTreeIndex([]), []);
  const emptyMessage = document.createElement("p");
  emptyMessage.className = "tree-empty";
  emptyMessage.textContent = "No notes yet. Create a note to populate the tree.";
  emptyBody.appendChild(emptyMessage);
  checks.push({
    name: "gallery-empty-state",
    pass: emptyView.visibleRows().length === 0 && emptyView.renderedRowCount() === 0,
    detail: "empty projection renders zero rows plus a textual empty state",
  });

  const errorBody = section(host, "Error");
  const errorMessage = document.createElement("p");
  errorMessage.className = "tree-error";
  errorMessage.setAttribute("role", "alert");
  errorMessage.textContent = "Fixture failed to load. Regenerate projections and reload.";
  errorBody.appendChild(errorMessage);

  const motionBody = section(host, "Reduced motion");
  const motionMessage = document.createElement("p");
  motionMessage.className = "gallery-note";
  motionMessage.textContent =
    "Keyboard navigation and scrolling are never animated; prefers-reduced-motion additionally disables every transition.";
  motionBody.appendChild(motionMessage);

  return checks;
}
