import type { MarkdownTree } from "@/features/transfer/export/markdown-transfer-model";
import { sanitizeFileName } from "@/features/transfer/export/markdown-transfer-model";
import type {
  ImportBundle,
  ImportSourceAdapter,
  ImportedNote,
  ImportWarning,
} from "@/features/transfer/import/model";
import { decodeXmlEntities, enmlToMarkdown } from "./enml-to-markdown";

const ENEX_FILE = /\.enex$/i;
const NOTE_BLOCK = /<note[\s>][\s\S]*?<\/note>/gi;
const EVERNOTE_TIMESTAMP = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;

function isEnexExport(content: string): boolean {
  return /<en-export[\s>]/i.test(content);
}

function textElement(block: string, name: string): string | null {
  const match = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return match ? decodeXmlEntities((match[1] ?? "").trim()) : null;
}

function noteContent(block: string): string {
  const match = /<content[^>]*>([\s\S]*?)<\/content>/i.exec(block);
  const raw = (match?.[1] ?? "").trim();
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(raw);
  return cdata ? (cdata[1] ?? "") : decodeXmlEntities(raw);
}

function noteTags(block: string): string[] {
  const withoutContent = block.replace(/<content[^>]*>[\s\S]*?<\/content>/i, "");
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const match of withoutContent.matchAll(/<tag>([\s\S]*?)<\/tag>/gi)) {
    const tag = decodeXmlEntities((match[1] ?? "").trim());
    if (tag.length > 0 && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      tags.push(tag);
    }
  }
  return tags;
}

export function evernoteTimestampToMillis(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const match = EVERNOTE_TIMESTAMP.exec(value.trim());
  if (!match) {
    return undefined;
  }
  const [, year, month, day, hour, minute, second] = match;
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
}

function enexBaseName(relativePath: string): string {
  const cut = relativePath.lastIndexOf("/");
  const fileName = cut === -1 ? relativePath : relativePath.slice(cut + 1);
  return fileName.replace(ENEX_FILE, "");
}

function parse(tree: MarkdownTree): ImportBundle {
  const notes: ImportedNote[] = [];
  const warnings: ImportWarning[] = [];
  const exports = tree.files.filter(
    (file) => ENEX_FILE.test(file.relativePath) && isEnexExport(file.content),
  );
  const useFolders = exports.length > 1;
  const directories: string[] = [];
  const taken = new Set<string>();
  let mediaCount = 0;
  let encryptedCount = 0;
  for (const file of exports) {
    const blocks = file.content.match(NOTE_BLOCK) ?? [];
    if (blocks.length === 0) {
      warnings.push({
        path: file.relativePath,
        message: "No notes found in this Evernote export",
      });
      continue;
    }
    const folder = useFolders ? sanitizeFileName(enexBaseName(file.relativePath)) : "";
    if (folder.length > 0) {
      directories.push(folder);
    }
    for (const [index, block] of blocks.entries()) {
      const conversion = enmlToMarkdown(noteContent(block));
      mediaCount += conversion.mediaCount;
      encryptedCount += conversion.encryptedCount;
      const title = textElement(block, "title") || `Untitled ${index + 1}`;
      const baseName = sanitizeFileName(title);
      const prefix = folder.length > 0 ? `${folder}/` : "";
      let relativePath = `${prefix}${baseName}.md`;
      let counter = 2;
      while (taken.has(relativePath.toLowerCase())) {
        relativePath = `${prefix}${baseName} (${counter}).md`;
        counter += 1;
      }
      taken.add(relativePath.toLowerCase());
      const tags = noteTags(block);
      notes.push({
        relativePath,
        title,
        markdown: conversion.markdown,
        ...(tags.length > 0 ? { tags } : {}),
        createdAt: evernoteTimestampToMillis(textElement(block, "created")),
        modifiedAt: evernoteTimestampToMillis(textElement(block, "updated")),
      });
    }
  }
  if (mediaCount > 0) {
    warnings.push({
      message: `${mediaCount} attachment${mediaCount === 1 ? "" : "s"} became "(attachment)" placeholders; ENEX embeds are not imported`,
    });
  }
  if (encryptedCount > 0) {
    warnings.push({
      message: `${encryptedCount} encrypted block${encryptedCount === 1 ? "" : "s"} could not be imported`,
      severity: "error",
    });
  }
  return {
    sourceId: evernoteSource.id,
    sourceLabel: evernoteSource.label,
    directories,
    notes,
    warnings,
  };
}

export const evernoteSource: ImportSourceAdapter = {
  id: "evernote",
  label: "Evernote",
  detect(tree) {
    return tree.files.some(
      (file) => ENEX_FILE.test(file.relativePath) && isEnexExport(file.content),
    )
      ? 0.95
      : 0;
  },
  parse,
};
