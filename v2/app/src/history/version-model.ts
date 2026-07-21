import { defaultMarkdownParser } from "prosemirror-markdown";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { HistoryHeader, WorkspaceOperation } from "../contracts/workspace";
import { countWords, productSchema, serializeProductMarkdown } from "../editor/schema";

export type VersionListItem = {
  versionId: string;
  createdAt: number;
  summary: string;
};

const EMPTY_DOCUMENT_JSON = { type: "doc", content: [{ type: "paragraph" }] };

export function projectVersionList(
  headers: readonly HistoryHeader[] | null | undefined,
): VersionListItem[] {
  if (!headers || headers.length === 0) {
    return [];
  }
  return [...headers]
    .sort((left, right) => right.createdAt - left.createdAt)
    .map((header) => ({
      versionId: header.versionId,
      createdAt: header.createdAt,
      summary: header.summary,
    }));
}

export function parseHistoryMarkdown(markdown: string): ProseMirrorNode {
  const parsed = defaultMarkdownParser.parse(markdown);
  if (!parsed) {
    return productSchema.nodeFromJSON(EMPTY_DOCUMENT_JSON);
  }
  return productSchema.nodeFromJSON(parsed.toJSON());
}

export type RestoreDocument = {
  documentJson: unknown;
  markdown: string;
  wordCount: number;
};

export function buildRestoreDocument(versionMarkdown: string): RestoreDocument {
  const node = parseHistoryMarkdown(versionMarkdown);
  return {
    documentJson: node.toJSON(),
    markdown: serializeProductMarkdown(node),
    wordCount: countWords(node),
  };
}

export type RestoreOperationParams = {
  noteId: string;
  versionMarkdown: string;
  expectedRevision: number;
  at: number;
};

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
