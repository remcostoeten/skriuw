import { noop } from "@skriuw/shared/helpers/noop";
import { normalizeTreePath } from "@/features/transfer/import/parsing/tree";

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
      marks?: unknown;
      content?: unknown;
    };
    if (node.type === "image" && typeof node.attrs?.src === "string") {
      const id = imageIdBySource.get(node.attrs.src);
      if (id) {
        const imageRef: Record<string, unknown> = {
          type: "image_ref",
          attrs: {
            id,
            alt: typeof node.attrs.alt === "string" ? node.attrs.alt : "",
            width: null,
            height: null,
          },
        };
        if (Array.isArray(node.marks)) {
          imageRef.marks = node.marks;
        }
        return imageRef;
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
