import { EditorState } from "prosemirror-state";
import { dateKeyOf, shiftDay } from "@skriuw/renderer-core/journal/dates";
import { productSchema, serializeProductMarkdown } from "@/features/editor/schema";
import { documentSaveOperations } from "@/features/editor/tasks";
import { planMarkdownImport, type MarkdownTree } from "@/features/transfer/markdown";

/**
 * @name planStarterWorkspace
 * @description Plans fresh preview notes and explicitly linked example tasks with dates on the device's calendar.
 * @example
 * const plan = planStarterWorkspace(tree, Date.now(), () => crypto.randomUUID());
 */
export function planStarterWorkspace(tree: MarkdownTree, at: number, makeId: () => string) {
  const today = dateKeyOf(new Date(at));
  const datedTree = {
    ...tree,
    files: tree.files.map((file) => ({
      ...file,
      content: file.content
        .replaceAll("{{today}}", today)
        .replaceAll("{{tomorrow}}", shiftDay(today, 1)),
    })),
  };
  const plan = planMarkdownImport(datedTree, at, makeId);
  const tasksNoteId = plan.notes.find((note) => note.relativePath === "Guides/Tasks.md")?.id;
  return {
    ...plan,
    contentOperations: plan.contentOperations.flatMap((operation) => {
      if (operation.type !== "save_document" || operation.noteId !== tasksNoteId) {
        return [operation];
      }
      const document = productSchema.nodeFromJSON(operation.documentJson);
      const transaction = EditorState.create({ doc: document }).tr;
      document.descendants((node, position) => {
        if (node.type.name === "check_item") {
          transaction.setNodeMarkup(position, undefined, {
            ...node.attrs,
            taskId: makeId(),
            blockId: makeId(),
          });
        }
      });
      return documentSaveOperations(
        transaction.doc,
        operation.noteId,
        {
          documentJson: transaction.doc.toJSON(),
          markdown: serializeProductMarkdown(transaction.doc),
          wordCount: operation.wordCount,
          expectedRevision: operation.expectedRevision,
        },
        new Map(),
        at,
      );
    }),
  };
}
