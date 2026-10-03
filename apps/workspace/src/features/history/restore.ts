import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { WorkspaceOperation } from "@skriuw/renderer-core/contracts/workspace";
import { countWords, parseProductMarkdown } from "@/features/editor/schema";

/**
 * @name parseHistoryMarkdown
 * @description Parses a stored revision's markdown into a product-schema document.
 * @example
 * const doc = parseHistoryMarkdown(content.markdown);
 */
export function parseHistoryMarkdown(markdown: string): ProseMirrorNode {
  return parseProductMarkdown(markdown);
}

export type RestoreDocument = {
  documentJson: unknown;
  markdown: string;
  wordCount: number;
};

/**
 * @name buildRestoreDocument
 * @description Derives the document JSON, markdown and word count a restore saves.
 * @example
 * const { documentJson, wordCount } = buildRestoreDocument("# Title\n");
 */
export function buildRestoreDocument(versionMarkdown: string): RestoreDocument {
  const node = parseHistoryMarkdown(versionMarkdown);
  return {
    documentJson: node.toJSON(),
    markdown: versionMarkdown,
    wordCount: countWords(node),
  };
}

export type RestoreOperationParams = {
  noteId: string;
  versionMarkdown: string;
  expectedRevision: number;
  at: number;
};

/**
 * @name buildRestoreOperation
 * @description Builds the save_document operation that restores a note to a revision.
 * @example
 * commit([buildRestoreOperation({ noteId, versionMarkdown, expectedRevision, at: Date.now() })]);
 */
export function buildRestoreOperation(params: RestoreOperationParams): WorkspaceOperation {
  const document = buildRestoreDocument(params.versionMarkdown);
  return {
    type: "save_document",
    noteId: params.noteId,
    documentJson: document.documentJson,
    markdown: document.markdown,
    wordCount: document.wordCount,
    expectedRevision: params.expectedRevision,
    at: params.at,
  };
}
