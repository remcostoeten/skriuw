import type { WorkspaceImage } from "@skriuw/renderer-core/contracts/workspace";
import {
  hasLosslessMarkdownDocument,
  productSchema,
  serializeProductMarkdown,
} from "@/features/editor/schema";
import type { RendererState } from "@skriuw/renderer-core/store/types";

export type MarkdownExportEntry = {
  relativePath: string;
  kind: "folder" | "note" | "image";
  markdown: string | null;
  contentHash?: string;
  mimeType?: string;
};

type ExportSource = Pick<RendererState, "nodes" | "childrenByParent" | "documents" | "images">;

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
    case "video/quicktime":
      return "mov";
    case "image/svg+xml":
      return "svg";
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
      return target ? { ...node, attrs: { ...node.attrs, label: target.title } } : node;
    }
    return {
      ...node,
      ...(Array.isArray(node.content) ? { content: node.content.map(visit) } : {}),
    };
  }
  try {
    const rendered = serializeProductMarkdown(productSchema.nodeFromJSON(visit(documentJson)));
    return rendered.length === 0 && storedMarkdown.length > 0 ? storedMarkdown : rendered;
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
        entries.push(...buildImageExportEntries(source.images, imageIds, prefix, takenImagePaths));
      }
    }
  }
  walk(null, "");
  return entries;
}
