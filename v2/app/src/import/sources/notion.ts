import type { MarkdownTree } from "../../export/markdown-transfer-model";
import type {
  ImportBundle,
  ImportSourceAdapter,
  ImportedNote,
  ImportWarning,
} from "../model";
import { relativeLinkBetween } from "../model";

const UUID_SUFFIX_PATTERN =
  /\s+(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const MARKDOWN_LINK_PATTERN = /(!?)\[([^\]\n]*)\]\(([^)\s]+)\)/g;

type MappedNote = {
  newPath: string;
  title: string;
  strippedName: string;
};

function isMarkdownFile(relativePath: string): boolean {
  return /\.(md|markdown)$/i.test(relativePath);
}

function splitPath(path: string): { directory: string; name: string } {
  const cut = path.lastIndexOf("/");
  return cut === -1
    ? { directory: "", name: path }
    : { directory: path.slice(0, cut), name: path.slice(cut + 1) };
}

function stripUuidSuffix(name: string): string {
  return name.replace(UUID_SUFFIX_PATTERN, "");
}

function hasUuidSuffix(name: string): boolean {
  return UUID_SUFFIX_PATTERN.test(name);
}

function hasUriScheme(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("/") || target.startsWith("#");
}

function resolvePath(baseDirectory: string, relative: string): string {
  const segments = baseDirectory.length === 0 ? [] : baseDirectory.split("/");
  for (const segment of relative.split("/")) {
    if (segment.length === 0 || segment === ".") {
      continue;
    }
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

function claimName(taken: Map<string, Set<string>>, parent: string, name: string): string {
  let names = taken.get(parent);
  if (!names) {
    names = new Set();
    taken.set(parent, names);
  }
  let candidate = name;
  let counter = 2;
  while (names.has(candidate.toLowerCase())) {
    candidate = `${name} (${counter})`;
    counter += 1;
  }
  names.add(candidate.toLowerCase());
  return candidate;
}

function joinPath(directory: string, name: string): string {
  return directory.length === 0 ? name : `${directory}/${name}`;
}

type PathMapping = {
  directoryMap: Map<string, string>;
  noteMap: Map<string, MappedNote>;
};

function buildPathMapping(tree: MarkdownTree): PathMapping {
  const directoryMap = new Map<string, string>();
  const noteMap = new Map<string, MappedNote>();
  const takenDirectories = new Map<string, Set<string>>();
  const takenNotes = new Map<string, Set<string>>();
  const sortedDirectories = [...tree.directories].sort(
    (left, right) => left.split("/").length - right.split("/").length,
  );
  for (const directory of sortedDirectories) {
    const { directory: parent, name } = splitPath(directory);
    const mappedParent = directoryMap.get(parent) ?? parent;
    const stripped = claimName(takenDirectories, mappedParent, stripUuidSuffix(name));
    directoryMap.set(directory, joinPath(mappedParent, stripped));
  }
  for (const file of tree.files) {
    if (!isMarkdownFile(file.relativePath)) {
      continue;
    }
    const { directory: parent, name } = splitPath(file.relativePath);
    const mappedParent = directoryMap.get(parent) ?? parent;
    const base = name.replace(/\.(md|markdown)$/i, "");
    const strippedName = stripUuidSuffix(base);
    const title = claimName(takenNotes, mappedParent, strippedName);
    noteMap.set(file.relativePath, {
      newPath: joinPath(mappedParent, `${title}.md`),
      title,
      strippedName,
    });
  }
  return { directoryMap, noteMap };
}

/**
 * Notion writes the page title back into the body as a leading H1, which
 * would duplicate the workspace note title.
 */
function stripLeadingTitle(markdown: string, title: string): string {
  const match = /^#\s+(.+?)\s*(?:\r?\n)+/.exec(markdown);
  if (match && match[1]?.trim() === title) {
    return markdown.slice(match[0].length);
  }
  return markdown;
}

type LinkRewrite = {
  markdown: string;
  databaseLinks: number;
};

function rewriteLinks(
  markdown: string,
  originalPath: string,
  mapping: PathMapping,
  mappedNote: MappedNote,
): LinkRewrite {
  const { directory: originalDirectory } = splitPath(originalPath);
  let databaseLinks = 0;
  const rewritten = markdown.replace(
    MARKDOWN_LINK_PATTERN,
    (whole, bang: string, label: string, target: string) => {
      if (hasUriScheme(target)) {
        return whole;
      }
      let decoded = target;
      try {
        decoded = decodeURIComponent(target);
      } catch {
        return whole;
      }
      const withoutFragment = decoded.replace(/#[^#]*$/, "");
      const resolved = resolvePath(originalDirectory, withoutFragment);
      if (bang === "!") {
        return `![${label}](${relativeLinkBetween(mappedNote.newPath, resolved)})`;
      }
      if (/\.(md|markdown)$/i.test(withoutFragment)) {
        const linked = mapping.noteMap.get(resolved);
        return linked ? `[[${linked.title}]]` : whole;
      }
      if (/\.csv$/i.test(withoutFragment)) {
        databaseLinks += 1;
      }
      return whole;
    },
  );
  return { markdown: rewritten, databaseLinks };
}

function parse(tree: MarkdownTree): ImportBundle {
  const mapping = buildPathMapping(tree);
  const notes: ImportedNote[] = [];
  const warnings: ImportWarning[] = [];
  let databaseLinks = 0;
  for (const file of tree.files) {
    const mappedNote = mapping.noteMap.get(file.relativePath);
    if (!mappedNote) {
      continue;
    }
    const body = stripLeadingTitle(file.content, mappedNote.strippedName);
    const rewrite = rewriteLinks(body, file.relativePath, mapping, mappedNote);
    databaseLinks += rewrite.databaseLinks;
    notes.push({
      relativePath: mappedNote.newPath,
      title: mappedNote.title,
      markdown: rewrite.markdown,
    });
  }
  const notePaths = notes.map((note) => note.relativePath);
  const directories = [...mapping.directoryMap.values()].filter((directory) =>
    notePaths.some((path) => path.startsWith(`${directory}/`)),
  );
  if (databaseLinks > 0) {
    warnings.push({
      message: `Kept ${databaseLinks} link${databaseLinks === 1 ? "" : "s"} to Notion database CSV files; databases are not imported`,
    });
  }
  return {
    sourceId: notionSource.id,
    sourceLabel: notionSource.label,
    directories,
    notes,
    warnings,
  };
}

export const notionSource: ImportSourceAdapter = {
  id: "notion",
  label: "Notion",
  detect(tree) {
    const markdownFiles = tree.files.filter((file) => isMarkdownFile(file.relativePath));
    if (markdownFiles.length === 0) {
      return 0;
    }
    const suffixed = markdownFiles.filter((file) => {
      const { name } = splitPath(file.relativePath);
      return hasUuidSuffix(name.replace(/\.(md|markdown)$/i, ""));
    }).length;
    return suffixed / markdownFiles.length >= 0.5 ? 0.9 : 0;
  },
  parse,
};
