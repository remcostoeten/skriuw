import { Fragment, Slice, type Node as ProseMirrorNode } from "prosemirror-model";

export type IdFactory = () => string;

function defaultId(): string {
  return crypto.randomUUID();
}

function linkedTaskAttrs(node: ProseMirrorNode): boolean {
  if (node.type.name !== "check_item") {
    return false;
  }
  const taskId = node.attrs.taskId;
  const blockId = node.attrs.blockId;
  return (
    (typeof taskId === "string" && taskId.length > 0) ||
    (typeof blockId === "string" && blockId.length > 0)
  );
}

function freshIdentity(createId: IdFactory): { taskId: string; blockId: string } {
  const taskId = createId();
  let blockId = createId();
  while (blockId === taskId) {
    blockId = createId();
  }
  return { taskId, blockId };
}

function rewriteFragment(fragment: Fragment, createId: IdFactory): Fragment {
  const children: ProseMirrorNode[] = [];
  let changed = false;
  fragment.forEach((child) => {
    const content = rewriteFragment(child.content, createId);
    if (!linkedTaskAttrs(child)) {
      if (content === child.content) {
        children.push(child);
        return;
      }
      changed = true;
      children.push(child.copy(content));
      return;
    }
    changed = true;
    children.push(
      child.type.create({ ...child.attrs, ...freshIdentity(createId) }, content, child.marks),
    );
  });
  return changed ? Fragment.fromArray(children) : fragment;
}

/**
 * Regenerates the per-note identity of every pasted `check_item`.
 *
 * Task identity survives both clipboard flavours — `data-task-id` on the DOM
 * path and the `<!--skriuw-task:…-->` marker on the Markdown path — so a plain
 * copy/paste otherwise leaves two document links claiming one task.
 * `unique_document_task_link` refuses to pick a winner, which stops the note
 * reconciling that task and makes it untoggleable from every task surface.
 */
export function withFreshPastedTaskIdentities(
  slice: Slice,
  createId: IdFactory = defaultId,
): Slice {
  const content = rewriteFragment(slice.content, createId);
  if (content === slice.content) {
    return slice;
  }
  return new Slice(content, slice.openStart, slice.openEnd);
}
