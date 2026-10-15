import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { DocPage } from "@/modules/docs/pages";

export type AdrStatus = "accepted" | "proposed" | "superseded" | "deprecated";

export type AdrRecord = DocPage & {
  number: string;
  file: string;
  date: string;
  status: AdrStatus;
};

const adrDir = path.join(process.cwd(), "../../docs/adr");
const adrFile = /^(\d{4})-[\w-]+\.md$/;
const titlePrefix = /^(?:adr-)?\d+[.:\s—–-]+\s*/i;
const descriptionLimit = 160;

function parseStatus(source: string): AdrStatus {
  if (/^>\s*Superseded/im.test(source)) {
    return "superseded";
  }

  const inline = source.match(/^-\s*Status:\s*(\w+)/im)?.[1];
  const section = source.match(/^##\s+Status\s*\n+\s*(\w+)/im)?.[1];
  const status = (inline ?? section ?? "accepted").toLowerCase();

  return status === "proposed" || status === "deprecated" || status === "superseded"
    ? status
    : "accepted";
}

function parseDate(source: string) {
  return (
    source.match(/Date:\s*(\d{4}-\d{2}-\d{2})/)?.[1] ??
    source.match(/^##\s+Status\s*\n+.*?(\d{4}-\d{2}-\d{2})/m)?.[1] ??
    ""
  );
}

function plainText(markdown: string) {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function describe(source: string, title: string) {
  const context = source.match(/^##\s[^\n]*\n+([\s\S]*?)(?:\n\s*\n|(?![\s\S]))/m)?.[1];
  const text = context ? plainText(context) : title;

  if (text.length <= descriptionLimit) {
    return text;
  }

  const window = text.slice(0, descriptionLimit);
  const sentenceEnd = window.lastIndexOf(". ");

  if (sentenceEnd > descriptionLimit / 2) {
    return window.slice(0, sentenceEnd + 1);
  }

  return `${window.slice(0, window.lastIndexOf(" "))}…`;
}

/**
 * @name readAdrSource
 * @description Reads one decision record's Markdown from docs/adr by file name.
 *
 * @example
 * const source = await readAdrSource("0001-standalone-local-first.md");
 */
export function readAdrSource(file: string) {
  return readFile(path.join(process.cwd(), "../../docs/adr", file), "utf8");
}

async function parseAdr(file: string): Promise<AdrRecord> {
  const source = await readAdrSource(file);
  const number = file.match(adrFile)?.[1] ?? "";
  const heading = source.match(/^#\s+(.+)$/m)?.[1] ?? file;
  const title = plainText(heading.replace(titlePrefix, ""));
  const slug = file.replace(/\.md$/, "");

  return {
    slug: `adr/${slug}`,
    file: slug,
    number,
    title,
    metaTitle: `${title} (ADR-${number})`,
    kicker: `ADR-${number}`,
    description: describe(stripAdrMeta(source), title),
    source: `docs/adr/${file}`,
    date: parseDate(source),
    status: parseStatus(source),
  };
}

/**
 * @name listAdrs
 * @description Reads every architecture decision record in docs/adr and
 * returns them newest first, parsed into doc pages with status and date.
 *
 * @example
 * const records = await listAdrs();
 * records[0].kicker; // "ADR-0056"
 */
export async function listAdrs(): Promise<AdrRecord[]> {
  "use cache";
  const files = (await readdir(adrDir)).filter((file) => adrFile.test(file)).sort();
  const records = await Promise.all(files.map(parseAdr));

  return records.reverse();
}

/**
 * @name findAdr
 * @description Looks up one decision record by the file-derived slug used in
 * its URL, such as `0043-end-to-end-encrypted-sync`.
 *
 * @example
 * const record = await findAdr("0043-end-to-end-encrypted-sync");
 */
export async function findAdr(file: string) {
  const records = await listAdrs();

  return records.find((record) => record.file === file);
}

/**
 * @name stripAdrMeta
 * @description Removes the status and date header lines from an ADR body so
 * the page header can show them once instead of the body repeating them.
 *
 * @example
 * const body = stripAdrMeta(source);
 */
export function stripAdrMeta(source: string) {
  return source
    .replace(/^-\s*(Status|Date):.*\n/gim, "")
    .replace(/^Date:.*\n/gim, "")
    .replace(/^##\s+Status\s*\n[\s\S]*?(?=^##\s)/im, "");
}
