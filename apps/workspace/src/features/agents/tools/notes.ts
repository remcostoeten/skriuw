import type { WorkspaceNode, WorkspaceOperation } from "@skriuw/renderer-core/contracts/workspace";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { serializeProductMarkdown } from "@/features/editor/schema";
import { boundTitle } from "@/features/notes/title";
import type { ToolContext } from "../context";
import { refuse } from "../protocol/input";
import type { AgentTool } from "../protocol/server";
import { readableProperties } from "../properties";
import { taskSummary } from "./tasks";
import {
  POSITIONS,
  createNoteOperation,
  describe,
  displayTitle,
  editableNote,
  isJournal,
  liveFolder,
  liveNode,
  markdownDocument,
  nodePath,
  noteDocument,
  placement,
  saveDocumentOperations,
  titledMarkdown,
} from "../workspace";
import { propertyWrites } from "./databases";

const MAX_LISTED_NODES = 2_000;
const MAX_MARKDOWN_BYTES = 1_000_000;

type TreeEntry = {
  id: string;
  kind: WorkspaceNode["kind"];
  title: string;
  children?: TreeEntry[];
  childCount?: number;
};

const ID = { type: "string", minLength: 1 } as const;
const PARENT_ID = {
  type: ["string", "null"],
  description: "Id of the folder to place the item in. Null or absent is the workspace root.",
} as const;
const POSITION = {
  type: "string",
  enum: POSITIONS,
  description: "Place the item first or last in its folder. Defaults to last.",
} as const;

export const noteTools: readonly AgentTool<ToolContext>[] = [
  {
    name: "list_workspace",
    title: "List folders and notes",
    description:
      "Returns the folder and note tree with ids and titles. Start here to find where things live. Use parentId to list one folder and depth to limit how far down it goes.",
    inputSchema: {
      type: "object",
      properties: {
        parentId: PARENT_ID,
        depth: {
          type: "integer",
          minimum: 1,
          maximum: 12,
          description: "How many levels to include. Defaults to 3.",
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, context) {
      const state = context.store.getState();
      const parentId = liveFolder(state, input.nullableString("parentId") ?? null);
      const depth = input.optionalInteger("depth", 1, 12) ?? 3;
      const budget = { remaining: MAX_LISTED_NODES };
      const items = listChildren(state, parentId, depth, budget);
      return {
        folder: parentId === null ? null : { id: parentId, path: nodePath(state, parentId) },
        items,
        truncated: budget.remaining <= 0,
      };
    },
  },
  {
    name: "search_notes",
    title: "Search notes",
    description:
      "Full-text search over note titles and bodies, ranked by relevance. Returns note ids, paths and matching snippets.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1 },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Defaults to 20." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, context) {
      const hits = await context.search(
        input.text("query"),
        input.optionalInteger("limit", 1, 50) ?? 20,
      );
      const state = context.store.getState();
      return hits
        .filter((hit) => {
          const node = state.sourceNodes.get(hit.noteId);
          return node !== undefined && state.nodes.has(hit.noteId) && node.lockedAt == null;
        })
        .map((hit) => ({
          noteId: hit.noteId,
          title: hit.title,
          path: nodePath(state, hit.noteId),
          snippet: hit.snippet,
        }));
    },
  },
  {
    name: "read_note",
    title: "Read a note",
    description:
      "Returns a note's Markdown body, its properties and the tasks linked from its checklist. Locked notes are refused.",
    inputSchema: {
      type: "object",
      properties: { noteId: ID },
      required: ["noteId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    async run(input, context) {
      await context.flush();
      const state = context.store.getState();
      const note = editableNote(state, input.text("noteId"));
      const document = noteDocument(state, note.id);
      return {
        id: note.id,
        title: displayTitle(note),
        path: nodePath(state, note.id),
        parentId: note.parentId,
        properties: readableProperties(state, note.id),
        tasks: [...state.tasks.values()]
          .filter((task) => task.source?.noteId === note.id)
          .map((task) => taskSummary(state, task)),
        markdown: serializeProductMarkdown(document),
      };
    },
  },
  {
    name: "create_folder",
    title: "Create a folder",
    description: "Creates a folder, optionally inside another folder. Returns its id.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1 },
        parentId: PARENT_ID,
        position: POSITION,
      },
      required: ["title"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run(input, context) {
      const state = context.store.getState();
      const parentId = liveFolder(state, input.nullableString("parentId") ?? null);
      const id = context.createId();
      await context.commit([
        {
          type: "create_folder",
          id,
          title: boundTitle(input.text("title")),
          placement: placement(state, parentId, {
            position: input.optionalChoice("position", POSITIONS),
          }),
          at: context.now(),
        },
      ]);
      return { id, path: nodePath(context.store.getState(), id) };
    },
  },
  {
    name: "create_note",
    title: "Create a note",
    description:
      "Creates a note from Markdown. The title becomes the note's first heading unless the Markdown already starts with a heading. Checklist lines (- [ ] item) stay plain checklists; use create_task with noteId to add tracked tasks. Optional properties are set on the new note.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1 },
        markdown: { type: "string", description: "The body in Markdown." },
        parentId: PARENT_ID,
        position: POSITION,
        properties: {
          type: "object",
          description: "Property values keyed by property name.",
          additionalProperties: true,
        },
      },
      required: ["title"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run(input, context) {
      const state = context.store.getState();
      const parentId = liveFolder(state, input.nullableString("parentId") ?? null);
      const markdown = boundedMarkdown(input.optionalString("markdown") ?? "");
      const document = markdownDocument(titledMarkdown(input.text("title"), markdown));
      const id = context.createId();
      const at = context.now();
      await context.commit([
        createNoteOperation({
          id,
          document,
          placement: placement(state, parentId, {
            position: input.optionalChoice("position", POSITIONS),
          }),
          at,
        }),
        { type: "set_active_note", noteId: state.activeNoteId },
      ]);
      const entries = input.optionalEntries("properties");
      if (entries !== undefined && entries.length > 0) {
        await context.commit(propertyWrites(context, id, entries));
      }
      const after = context.store.getState();
      return { id, title: after.sourceNodes.get(id)?.title ?? "", path: nodePath(after, id) };
    },
  },
  {
    name: "write_note",
    title: "Write to a note",
    description:
      "Changes a note's body with Markdown: replace the whole body, append to the end or prepend to the start. A note's title follows its first line, so replacing the first heading renames it. Read the note first when replacing.",
    inputSchema: {
      type: "object",
      properties: {
        noteId: ID,
        markdown: { type: "string" },
        mode: { type: "string", enum: ["replace", "append", "prepend"] },
      },
      required: ["noteId", "markdown", "mode"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true },
    async run(input, context) {
      await context.flush();
      const state = context.store.getState();
      const note = editableNote(state, input.text("noteId"));
      const mode = input.choice("mode", ["replace", "append", "prepend"]);
      const written = markdownDocument(boundedMarkdown(input.string("markdown")));
      const current = noteDocument(state, note.id);
      const document =
        mode === "replace"
          ? written
          : current.copy(
              mode === "append"
                ? withoutTrailingEmpty(current).append(written.content)
                : written.content.append(current.content),
            );
      await context.commit(saveDocumentOperations(state, note.id, document, context.now()));
      const after = context.store.getState();
      return {
        id: note.id,
        title: after.sourceNodes.get(note.id)?.title ?? "",
        path: nodePath(after, note.id),
      };
    },
  },
  {
    name: "rename_item",
    title: "Rename a folder or note",
    description: "Renames a folder or a note in the sidebar.",
    inputSchema: {
      type: "object",
      properties: { id: ID, title: { type: "string", minLength: 1 } },
      required: ["id", "title"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run(input, context) {
      const state = context.store.getState();
      const node = liveNode(state, input.text("id"));
      if (isJournal(node.id)) refuse("The journal folder cannot be renamed.");
      if (node.kind === "note") editableNote(state, node.id);
      await context.commit([
        {
          type: "rename_node",
          id: node.id,
          title: boundTitle(input.text("title")),
          at: context.now(),
        },
      ]);
      return { id: node.id, path: nodePath(context.store.getState(), node.id) };
    },
  },
  {
    name: "move_items",
    title: "Move folders and notes",
    description:
      "Moves folders and notes into a folder (or the root), keeping their contents. Place them first or last, or right before or after a sibling that already lives in the destination.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: ID, minItems: 1 },
        parentId: PARENT_ID,
        position: POSITION,
        beforeId: { ...ID, description: "Place the items right before this sibling." },
        afterId: { ...ID, description: "Place the items right after this sibling." },
      },
      required: ["ids", "parentId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run(input, context) {
      const state = context.store.getState();
      const parentId = liveFolder(state, input.nullableString("parentId") ?? null);
      const ids = input.idList("ids");
      for (const id of ids) {
        const node = liveNode(state, id);
        if (isJournal(id)) refuse("The journal folder cannot be moved.");
        if (parentId !== null && (parentId === id || isInside(state, parentId, id))) {
          refuse(`${describe(node)} cannot move into itself.`);
        }
      }
      const beforeId = input.optionalText("beforeId");
      const afterId = input.optionalText("afterId");
      if (beforeId !== undefined && afterId !== undefined)
        refuse("Give beforeId or afterId, not both.");
      if ([beforeId, afterId].some((anchor) => anchor !== undefined && ids.includes(anchor))) {
        refuse("An item cannot be placed next to itself.");
      }
      const first = placement(state, parentId, {
        position: input.optionalChoice("position", POSITIONS),
        beforeId,
        afterId,
      });
      const at = context.now();
      const operations: WorkspaceOperation[] = ids.map((id, index) => ({
        type: "move_node",
        id,
        placement:
          index === 0
            ? first
            : { parentId, position: { type: "after", anchorId: ids[index - 1]! } },
        at,
      }));
      await context.commit(operations);
      const after = context.store.getState();
      return ids.map((id) => ({ id, path: nodePath(after, id) }));
    },
  },
  {
    name: "trash_items",
    title: "Move to trash",
    description:
      "Moves folders and notes, with everything inside them, to the trash. Nothing is deleted permanently; restore_items brings them back.",
    inputSchema: {
      type: "object",
      properties: { ids: { type: "array", items: ID, minItems: 1 } },
      required: ["ids"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    async run(input, context) {
      const state = context.store.getState();
      const ids = input.idList("ids");
      for (const id of ids) {
        const node = liveNode(state, id);
        if (isJournal(id)) refuse("The journal folder cannot be trashed.");
        if (node.kind === "note") editableNote(state, id);
      }
      const roots = ids.filter(
        (id) => !ids.some((other) => other !== id && isInside(state, id, other)),
      );
      const at = context.now();
      await context.commit(roots.map((rootId) => ({ type: "trash_subtree", rootId, at })));
      return { trashed: roots.map((id) => ({ id, path: nodePath(context.store.getState(), id) })) };
    },
  },
  {
    name: "restore_items",
    title: "Restore from trash",
    description:
      "Restores trashed folders and notes. Each goes back to its old folder when that folder still exists, otherwise to the root.",
    inputSchema: {
      type: "object",
      properties: { ids: { type: "array", items: ID, minItems: 1 } },
      required: ["ids"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run(input, context) {
      const state = context.store.getState();
      const at = context.now();
      const ids = input.idList("ids");
      const operations: WorkspaceOperation[] = ids.map((id) => {
        const node = state.sourceNodes.get(id);
        if (node === undefined) refuse(`Nothing in the workspace has id ${id}.`);
        if (node.deletedAt === null) {
          if (state.nodes.has(id)) refuse(`${describe(node)} is not in the trash.`);
          refuse(`${describe(node)} is inside a trashed folder. Restore that folder instead.`);
        }
        const parentAvailable = node.parentId !== null && state.nodes.has(node.parentId);
        return {
          type: "restore_subtree",
          rootId: id,
          placement: {
            parentId: parentAvailable ? node.parentId : null,
            position: { type: "last" },
          },
          at,
        };
      });
      await context.commit(operations);
      const after = context.store.getState();
      return ids.map((id) => ({ id, path: nodePath(after, id) }));
    },
  },
];

function listChildren(
  state: RendererState,
  parentId: string | null,
  depth: number,
  budget: { remaining: number },
): TreeEntry[] {
  const children = state.childrenByParent.get(parentId) ?? [];
  const entries: TreeEntry[] = [];
  for (const id of children) {
    if (budget.remaining <= 0) break;
    const node = state.sourceNodes.get(id);
    if (node === undefined || !state.nodes.has(id)) continue;
    budget.remaining -= 1;
    const entry: TreeEntry = { id, kind: node.kind, title: displayTitle(node) };
    if (node.kind === "folder") {
      if (depth > 1) entry.children = listChildren(state, id, depth - 1, budget);
      else entry.childCount = (state.childrenByParent.get(id) ?? []).length;
    }
    entries.push(entry);
  }
  return entries;
}

function isInside(state: RendererState, id: string, ancestorId: string): boolean {
  let current = state.sourceNodes.get(id)?.parentId ?? null;
  for (let hops = 0; current !== null && hops < 256; hops += 1) {
    if (current === ancestorId) return true;
    current = state.sourceNodes.get(current)?.parentId ?? null;
  }
  return false;
}

function boundedMarkdown(markdown: string): string {
  if (new TextEncoder().encode(markdown).length > MAX_MARKDOWN_BYTES) {
    refuse("That Markdown is larger than 1 MB. Split it across notes.");
  }
  return markdown;
}

function withoutTrailingEmpty(document: ReturnType<typeof noteDocument>) {
  const last = document.lastChild;
  const content = document.content;
  if (
    last !== null &&
    last.type.name === "paragraph" &&
    last.content.size === 0 &&
    content.childCount > 1
  ) {
    return content.cut(0, content.size - last.nodeSize);
  }
  return content;
}
