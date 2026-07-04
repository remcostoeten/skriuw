import { markdownToRichDocument } from "@/domain/notes/rich-document";
import type { AiStreamApplier } from "@/features/ai/service";
import type { EditorInstance } from "./editor-instance";

export const STREAM_APPLY_INTERVAL_MS = 150;

type Params = {
  editor: EditorInstance;
  onHighlight: (ids: string[]) => void;
  // Places the first batch of streamed blocks and returns their ids. Continue
  // merges into the cut-off final paragraph; custom-prompt inserts after the
  // cursor. Every later batch swaps these in place, shared below.
  placeFirst: (blocks: unknown[]) => string[];
};

export function createStreamingApplier({
  editor,
  onHighlight,
  placeFirst,
}: Params): AiStreamApplier {
  let insertedIds: string[] = [];
  let started = false;
  let stopped = false;
  let lastAppliedAt = 0;
  let pendingMarkdown: string | null = null;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;

  const apply = (markdown: string) => {
    const blocks = markdownToRichDocument(markdown);
    if (blocks.length === 0) return;
    if (!started) {
      started = true;
      insertedIds = placeFirst(blocks);
      return;
    }
    const docIds = new Set(editor.document.map((b: { id: string }) => b.id));
    const existing = insertedIds.filter((id) => docIds.has(id));
    if (existing.length === 0) {
      // The user removed the streamed blocks — stop touching the doc.
      stopped = true;
      return;
    }
    const { insertedBlocks } = editor.replaceBlocks(
      existing,
      // biome-ignore lint/suspicious/noExplicitAny: schema-shaped blocks
      blocks as any,
    );
    insertedIds = insertedBlocks.map((b: { id: string }) => b.id);
  };

  return {
    update: (markdown) => {
      if (stopped) return;
      const now = Date.now();
      const elapsed = now - lastAppliedAt;
      if (elapsed >= STREAM_APPLY_INTERVAL_MS) {
        lastAppliedAt = now;
        pendingMarkdown = null;
        apply(markdown);
        return;
      }
      pendingMarkdown = markdown;
      if (pendingTimer === null) {
        pendingTimer = setTimeout(() => {
          pendingTimer = null;
          if (stopped || pendingMarkdown === null) return;
          lastAppliedAt = Date.now();
          const latest = pendingMarkdown;
          pendingMarkdown = null;
          apply(latest);
        }, STREAM_APPLY_INTERVAL_MS - elapsed);
      }
    },
    done: () => {
      if (pendingTimer !== null) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
      if (stopped) return insertedIds;
      if (pendingMarkdown !== null) {
        const latest = pendingMarkdown;
        pendingMarkdown = null;
        apply(latest);
      }
      stopped = true;
      onHighlight(insertedIds);
      return insertedIds;
    },
  };
}
