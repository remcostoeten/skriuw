import type { MarkdownTree } from "@/features/transfer/export/markdown-transfer-model";
import type {
  ImportBundle,
  ImportSourceAdapter,
  ImportedNote,
  ImportedPropertyValue,
  ImportWarning,
} from "@/features/transfer/import/model";
import { relativeLinkBetween } from "@/features/transfer/import/model";
import { sanitizeFileName } from "@/features/transfer/export/markdown-transfer-model";

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

function isCsvFile(relativePath: string): boolean {
  return /\.csv$/i.test(relativePath);
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

type CsvParseResult = {
  rows: string[][];
  valid: boolean;
};

function parseCsv(content: string): CsvParseResult {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index] ?? "";
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  while (
    rows.length > 0 &&
    rows[rows.length - 1]?.every((value) => value.length === 0)
  ) {
    rows.pop();
  }
  return { rows, valid: !quoted };
}

function csvPropertyValue(value: string): ImportedPropertyValue {
  const trimmed = value.trim();
  if (/^(true|false)$/i.test(trimmed)) {
    return { type: "checkbox", value: trimmed.toLowerCase() === "true" };
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return { type: "number", value: Number(trimmed) };
  }
  if (/^\d{4}-\d{2}-\d{2}(?:[T ][^ ]+)?$/.test(trimmed)) {
    return { type: "date", value: trimmed };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return { type: "url", value: trimmed };
  }
  return { type: "text", value };
}

function csvTitleIndex(headers: readonly string[]): number {
  const named = headers.findIndex((header) => /^(name|title)$/i.test(header.trim()));
  return named === -1 ? 0 : named;
}

function appendDatabaseNotes(
  tree: MarkdownTree,
  mapping: PathMapping,
  notes: ImportedNote[],
  directories: string[],
  warnings: ImportWarning[],
): void {
  const takenDirectories = new Set(directories.map((path) => path.toLowerCase()));
  const takenNotes = new Set(notes.map((note) => note.relativePath.toLowerCase()));
  const csvFiles = tree.files
    .filter((file) => isCsvFile(file.relativePath))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  for (const file of csvFiles) {
    const parsed = parseCsv(file.content);
    const [headers = [], ...rows] = parsed.rows;
    if (!parsed.valid || headers.length === 0) {
      warnings.push({
        path: file.relativePath,
        message: "Database CSV is malformed and was skipped",
        severity: "error",
      });
      continue;
    }
    const { directory: originalParent, name } = splitPath(file.relativePath);
    const mappedParent = mapping.directoryMap.get(originalParent) ?? originalParent;
    const base = stripUuidSuffix(name.replace(/\.csv$/i, "")) || "Database";
    let folderName = base;
    let counter = 2;
    let folderPath = joinPath(mappedParent, folderName);
    while (takenDirectories.has(folderPath.toLowerCase())) {
      folderName = `${base} (${counter})`;
      folderPath = joinPath(mappedParent, folderName);
      counter += 1;
    }
    takenDirectories.add(folderPath.toLowerCase());
    directories.push(folderPath);
    const titleIndex = csvTitleIndex(headers);
    for (const [rowIndex, row] of rows.entries()) {
      if (row.every((value) => value.trim().length === 0)) {
        continue;
      }
      const rawTitle = row[titleIndex]?.trim() || `Untitled ${rowIndex + 1}`;
      const titleBase = sanitizeFileName(rawTitle);
      let title = titleBase;
      let titleCounter = 2;
      let relativePath = `${folderPath}/${title}.md`;
      while (takenNotes.has(relativePath.toLowerCase())) {
        title = `${titleBase} (${titleCounter})`;
        relativePath = `${folderPath}/${title}.md`;
        titleCounter += 1;
      }
      takenNotes.add(relativePath.toLowerCase());
      const properties = headers.flatMap((header, index) => {
        const name = header.trim();
        const value = row[index] ?? "";
        return index === titleIndex || name.length === 0 || value.length === 0
          ? []
          : [{ name, value: csvPropertyValue(value) }];
      });
      notes.push({
        relativePath,
        title,
        markdown: "",
        ...(properties.length > 0 ? { properties } : {}),
      });
    }
  }
}

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
  appendDatabaseNotes(tree, mapping, notes, directories, warnings);
  if (databaseLinks > 0) {
    warnings.push({
      message: `Kept ${databaseLinks} source link${databaseLinks === 1 ? "" : "s"} to imported Notion database CSV files`,
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
    const notionCsvFiles = tree.files.filter(
      (file) =>
        isCsvFile(file.relativePath) &&
        hasUuidSuffix(splitPath(file.relativePath).name.replace(/\.csv$/i, "")),
    );
    if (markdownFiles.length === 0) {
      return notionCsvFiles.length > 0 ? 0.85 : 0;
    }
    const suffixed = markdownFiles.filter((file) => {
      const { name } = splitPath(file.relativePath);
      return hasUuidSuffix(name.replace(/\.(md|markdown)$/i, ""));
    }).length;
    return suffixed / markdownFiles.length >= 0.5 ? 0.9 : 0;
  },
  parse,
};
