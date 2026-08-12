import type { WorkspaceImage, WorkspaceOperation } from "@/contracts/workspace";
import {
  countWords,
  hasLosslessMarkdownDocument,
  parseProductMarkdown,
  productSchema,
  serializeProductMarkdown,
} from "@/features/editor/schema";
import { noop } from "@/shared/lib/noop";
import type { RendererState } from "@/store/types";

export type MarkdownExportEntry = {
  relativePath: string;
  kind: "folder" | "note" | "image";
  markdown: string | null;
  contentHash?: string;
  mimeType?: string;
};

export type MarkdownTreeFile = {
  relativePath: string;
  content: string;
};

export type MarkdownTree = {
  directories: string[];
  files: MarkdownTreeFile[];
  assets?: string[];
  unsupported?: string[];
  skipped: number;
};

export type MarkdownImportPlan = {
  operations: WorkspaceOperation[];
  contentOperations: WorkspaceOperation[];
  notes: { id: string; relativePath: string }[];
  noteCount: number;
  folderCount: number;
  unresolvedReferences: number;
  remoteImages: number;
  preservedSources: number;
  createdNotes: number;
  updatedNotes: number;
  duplicateTitles: number;
};

export type MarkdownReferenceTarget = {
  id: string;
  title: string;
};

export type MarkdownImportReuseTarget = MarkdownReferenceTarget & {
  revision: number;
};

export type MarkdownImportOptions = {
  destinationParentId?: string | null;
  reuseNotesByPath?: ReadonlyMap<string, MarkdownImportReuseTarget>;
};

type ExportSource = Pick<
  RendererState,
  "nodes" | "childrenByParent" | "documents" | "images"
>;

/** Must stay in sync with `extension_for` in `crates/skriuw-images/src/lib.rs`. */
export function imageFileExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    default:
      return "img";
  }
}

export function collectImageRefIds(documentJson: unknown): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  function visit(value: unknown): void {
    if (typeof value !== "object" || value === null) {
      return;
    }
    const node = value as {
      type?: unknown;
      attrs?: { id?: unknown; refId?: unknown };
      content?: unknown;
    };
    const id =
      node.type === "image_ref"
        ? node.attrs?.id
        : node.type === "media"
          ? node.attrs?.refId
          : undefined;
    if (typeof id === "string" && id.length > 0 && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        visit(child);
      }
    }
  }
  visit(documentJson);
  return ids;
}

function exportImageFileName(image: WorkspaceImage): string {
  return `${image.id}.${imageFileExtension(image.mimeType)}`;
}

/**
 * Canonical markdown references images as `images/<id>`; exported files carry
 * a real extension, so the exported markdown gets the extension appended.
 */
export function rewriteExportedImagePaths(
  markdown: string,
  images: ExportSource["images"],
  imageIds: readonly string[],
): string {
  let rewritten = markdown;
  for (const id of imageIds) {
    const image = images.get(id);
    if (image) {
      rewritten = rewritten.replaceAll(`(images/${id})`, `(images/${exportImageFileName(image)})`);
    }
  }
  return rewritten;
}

export function buildImageExportEntries(
  images: ExportSource["images"],
  imageIds: readonly string[],
  prefix: string,
  taken: Set<string>,
): MarkdownExportEntry[] {
  const entries: MarkdownExportEntry[] = [];
  for (const id of imageIds) {
    const image = images.get(id);
    if (!image) {
      continue;
    }
    const relativePath = `${prefix}images/${exportImageFileName(image)}`;
    if (taken.has(relativePath)) {
      continue;
    }
    taken.add(relativePath);
    entries.push({
      relativePath,
      kind: "image",
      markdown: null,
      contentHash: image.contentHash,
      mimeType: image.mimeType,
    });
  }
  return entries;
}

const FORBIDDEN_FILE_CHARS = /[/\\:*?"<>|]/g;

export function sanitizeFileName(title: string): string {
  const cleaned = title
    .replace(FORBIDDEN_FILE_CHARS, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  return cleaned.length > 0 ? cleaned : "Untitled";
}

function claimUniqueName(taken: Set<string>, base: string, extension: string): string {
  let candidate = `${base}${extension}`;
  let counter = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${base} (${counter})${extension}`;
    counter += 1;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

export function buildNoteExportEntry(title: string, markdown: string): MarkdownExportEntry {
  return {
    relativePath: `${sanitizeFileName(title)}.md`,
    kind: "note",
    markdown,
  };
}

export function referenceSafeMarkdown(
  documentJson: unknown,
  storedMarkdown: string,
  nodes: ExportSource["nodes"],
): string {
  if (hasLosslessMarkdownDocument(documentJson)) {
    return storedMarkdown;
  }
  function visit(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map(visit);
    }
    if (typeof value !== "object" || value === null) {
      return value;
    }
    const node = value as {
      type?: unknown;
      attrs?: { kind?: unknown; id?: unknown };
      content?: unknown[];
    };
    if (
      node.type === "mention_ref" &&
      node.attrs?.kind === "note" &&
      typeof node.attrs.id === "string"
    ) {
      const target = nodes.get(node.attrs.id);
      return target
        ? { ...node, attrs: { ...node.attrs, label: target.title } }
        : node;
    }
    return {
      ...node,
      ...(Array.isArray(node.content) ? { content: node.content.map(visit) } : {}),
    };
  }
  try {
    const rendered = serializeProductMarkdown(
      productSchema.nodeFromJSON(visit(documentJson)),
    );
    return rendered.length === 0 && storedMarkdown.length > 0
      ? storedMarkdown
      : rendered;
  } catch {
    return storedMarkdown;
  }
}

export function buildWorkspaceExportEntries(source: ExportSource): MarkdownExportEntry[] {
  const entries: MarkdownExportEntry[] = [];
  const takenImagePaths = new Set<string>();
  function walk(parentId: string | null, prefix: string): void {
    const taken = new Set<string>();
    for (const id of source.childrenByParent.get(parentId) ?? []) {
      const node = source.nodes.get(id);
      if (!node) {
        continue;
      }
      const base = sanitizeFileName(node.title);
      if (node.kind === "folder") {
        const name = claimUniqueName(taken, base, "");
        entries.push({ relativePath: `${prefix}${name}`, kind: "folder", markdown: null });
        walk(id, `${prefix}${name}/`);
      } else {
        const name = claimUniqueName(taken, base, ".md");
        const record = source.documents.get(id);
        const imageIds = collectImageRefIds(record?.documentJson);
        const markdown = referenceSafeMarkdown(
          record?.documentJson,
          record?.markdown ?? "",
          source.nodes,
        );
        entries.push({
          relativePath: `${prefix}${name}`,
          kind: "note",
          markdown: rewriteExportedImagePaths(markdown, source.images, imageIds),
        });
        entries.push(
          ...buildImageExportEntries(source.images, imageIds, prefix, takenImagePaths),
        );
      }
    }
  }
  walk(null, "");
  return entries;
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeTreePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

function collectDirectoryPaths(tree: MarkdownTree): string[] {
  const paths = new Set<string>();
  function addWithAncestors(path: string): void {
    let current = path;
    while (current.length > 0) {
      paths.add(current);
      const cut = current.lastIndexOf("/");
      current = cut === -1 ? "" : current.slice(0, cut);
    }
  }
  for (const directory of tree.directories) {
    addWithAncestors(normalizeTreePath(directory));
  }
  for (const file of tree.files) {
    const normalized = normalizeTreePath(file.relativePath);
    const cut = normalized.lastIndexOf("/");
    if (cut !== -1) {
      addWithAncestors(normalized.slice(0, cut));
    }
  }
  return [...paths].sort(
    (left, right) =>
      left.split("/").length - right.split("/").length || comparePaths(left, right),
  );
}

export function planMarkdownImport(
  tree: MarkdownTree,
  at: number,
  makeId: () => string,
  existingNotes: readonly MarkdownReferenceTarget[] = [],
  options: MarkdownImportOptions = {},
): MarkdownImportPlan {
  const operations: WorkspaceOperation[] = [];
  const contentOperations: WorkspaceOperation[] = [];
  const folderIdByPath = new Map<string, string>();
  const directoryPaths = collectDirectoryPaths(tree);
  for (const path of directoryPaths) {
    const id = makeId();
    folderIdByPath.set(path, id);
    const cut = path.lastIndexOf("/");
    const parentId =
      cut === -1
        ? (options.destinationParentId ?? null)
        : (folderIdByPath.get(path.slice(0, cut)) ??
          options.destinationParentId ??
          null);
    operations.push({
      type: "create_folder",
      id,
      title: cut === -1 ? path : path.slice(cut + 1),
      placement: { parentId, position: { type: "last" } },
      at,
    });
  }
  const files = [...tree.files].sort((left, right) =>
    comparePaths(normalizeTreePath(left.relativePath), normalizeTreePath(right.relativePath)),
  );
  const plannedFiles = files.map((file) => {
    const normalized = normalizeTreePath(file.relativePath);
    const cut = normalized.lastIndexOf("/");
    const fileName = cut === -1 ? normalized : normalized.slice(cut + 1);
    return {
      file,
      normalized,
      parentId:
        cut === -1
          ? (options.destinationParentId ?? null)
          : (folderIdByPath.get(normalized.slice(0, cut)) ??
            options.destinationParentId ??
            null),
      title: fileName.replace(/\.md$/i, ""),
      id: options.reuseNotesByPath?.get(normalized)?.id ?? makeId(),
      reuse: options.reuseNotesByPath?.get(normalized),
    };
  });
  const idsByTitle = new Map<string, string[]>();
  for (const target of [
    ...existingNotes,
    ...plannedFiles.map(({ id, title }) => ({ id, title })),
  ]) {
    const ids = idsByTitle.get(target.title) ?? [];
    if (!ids.includes(target.id)) {
      ids.push(target.id);
    }
    idsByTitle.set(target.title, ids);
  }
  const notes: MarkdownImportPlan["notes"] = [];
  let unresolvedReferences = 0;
  let remoteImages = 0;
  let preservedSources = 0;
  for (const planned of plannedFiles) {
    const document = parseProductMarkdown(planned.file.content);
    if (hasLosslessMarkdownDocument(document.toJSON())) {
      preservedSources += 1;
    }
    const resolved = resolveImportedNoteReferences(document.toJSON(), idsByTitle);
    unresolvedReferences += resolved.unresolved;
    remoteImages += collectRemoteImageSources(resolved.documentJson).length;
    const empty = parseProductMarkdown("");
    const id = planned.id;
    notes.push({ id, relativePath: planned.normalized });
    if (planned.reuse) {
      operations.push({ type: "rename_node", id, title: planned.title, at });
    } else {
      operations.push({
        type: "create_note",
        id,
        title: planned.title,
        placement: { parentId: planned.parentId, position: { type: "last" } },
        documentJson: empty.toJSON(),
        markdown: "",
        at,
      });
    }
    contentOperations.push({
      type: "save_document",
      noteId: id,
      documentJson: resolved.documentJson,
      markdown: planned.file.content,
      wordCount: countDocumentWords(resolved.documentJson),
      expectedRevision: planned.reuse?.revision ?? 1,
      at,
    });
  }
  return {
    operations,
    contentOperations,
    notes,
    noteCount: files.length,
    folderCount: directoryPaths.length,
    unresolvedReferences,
    remoteImages,
    preservedSources,
    createdNotes: plannedFiles.filter((planned) => !planned.reuse).length,
    updatedNotes: plannedFiles.filter((planned) => planned.reuse).length,
    duplicateTitles: [...idsByTitle.values()].filter((ids) => ids.length > 1)
      .length,
  };
}

function countDocumentWords(documentJson: unknown): number {
  try {
    return countWords(productSchema.nodeFromJSON(documentJson));
  } catch {
    return 0;
  }
}

function resolveImportedNoteReferences(
  documentJson: unknown,
  idsByTitle: ReadonlyMap<string, readonly string[]>,
): { documentJson: unknown; unresolved: number } {
  let unresolved = 0;
  function visit(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map(visit);
    }
    if (typeof value !== "object" || value === null) {
      return value;
    }
    const node = value as {
      type?: unknown;
      attrs?: { kind?: unknown; label?: unknown };
      content?: unknown[];
    };
    if (
      node.type === "mention_ref" &&
      node.attrs?.kind === "note" &&
      typeof node.attrs.label === "string"
    ) {
      const ids = idsByTitle.get(node.attrs.label) ?? [];
      if (ids.length === 1) {
        return {
          ...node,
          attrs: { ...node.attrs, id: ids[0] },
        };
      }
      unresolved += 1;
      return { type: "text", text: `[[${node.attrs.label}]]` };
    }
    return {
      ...node,
      ...(Array.isArray(node.content) ? { content: node.content.map(visit) } : {}),
    };
  }
  return { documentJson: visit(documentJson), unresolved };
}

function hasUriScheme(src: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("/") || src.startsWith("#");
}

/**
 * Collects the distinct relative `src` values of plain markdown `image`
 * nodes, which is what `![alt](path)` parses into before the import turns
 * local files into stored `image_ref` blobs.
 */
export function collectLocalImageSources(documentJson: unknown): string[] {
  const sources: string[] = [];
  const seen = new Set<string>();
  function visit(value: unknown): void {
    if (typeof value !== "object" || value === null) {
      return;
    }
    const node = value as { type?: unknown; attrs?: { src?: unknown }; content?: unknown };
    if (
      node.type === "image" &&
      typeof node.attrs?.src === "string" &&
      node.attrs.src.length > 0 &&
      !hasUriScheme(node.attrs.src) &&
      !seen.has(node.attrs.src)
    ) {
      seen.add(node.attrs.src);
      sources.push(node.attrs.src);
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        visit(child);
      }
    }
  }
  visit(documentJson);
  return sources;
}

export function collectRemoteImageSources(documentJson: unknown): string[] {
  const sources: string[] = [];
  const seen = new Set<string>();
  function visit(value: unknown): void {
    if (typeof value !== "object" || value === null) {
      return;
    }
    const node = value as { type?: unknown; attrs?: { src?: unknown }; content?: unknown };
    if (
      node.type === "image" &&
      typeof node.attrs?.src === "string" &&
      hasUriScheme(node.attrs.src) &&
      !seen.has(node.attrs.src)
    ) {
      seen.add(node.attrs.src);
      sources.push(node.attrs.src);
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        visit(child);
      }
    }
  }
  visit(documentJson);
  return sources;
}

export function resolveImportedImagePath(noteRelativePath: string, src: string): string {
  let decoded = src;
  try {
    decoded = decodeURIComponent(src);
  } catch {
    noop();
  }
  const cleaned = normalizeTreePath(decoded.replace(/^\.\//, ""));
  const cut = noteRelativePath.lastIndexOf("/");
  const directory = cut === -1 ? "" : noteRelativePath.slice(0, cut + 1);
  return collapsePathSegments(`${directory}${cleaned}`);
}

/**
 * Resolves `.` and `..` segments so adapter-produced relative links (for
 * example `Sub/../attachments/pic.png`) survive the Rust bridge, which
 * rejects any path still containing `..`. Paths that would escape the
 * import root are returned unchanged and fail later as unreadable.
 */
function collapsePathSegments(path: string): string {
  const resolved: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (resolved.length === 0) {
        return path;
      }
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return resolved.join("/");
}

export function replaceLocalImages(
  documentJson: unknown,
  imageIdBySource: ReadonlyMap<string, string>,
): unknown {
  function visit(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map(visit);
    }
    if (typeof value !== "object" || value === null) {
      return value;
    }
    const node = value as {
      type?: unknown;
      attrs?: { src?: unknown; alt?: unknown };
      content?: unknown;
    };
    if (node.type === "image" && typeof node.attrs?.src === "string") {
      const id = imageIdBySource.get(node.attrs.src);
      if (id) {
        return {
          type: "image_ref",
          attrs: {
            id,
            alt: typeof node.attrs.alt === "string" ? node.attrs.alt : "",
            width: null,
            height: null,
          },
        };
      }
    }
    const mapped: Record<string, unknown> = { ...node };
    if (Array.isArray(node.content)) {
      mapped.content = node.content.map(visit);
    }
    return mapped;
  }
  return visit(documentJson);
}
