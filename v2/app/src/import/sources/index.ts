import type { ImportSourceAdapter } from "../model";
import { appleNotesSource } from "./apple-notes";
import { bearSource } from "./bear";
import { markdownSource } from "./markdown";
import { notionSource } from "./notion";
import { obsidianSource } from "./obsidian";
import { plainTextSource } from "./plain-text";
import { simplenoteSource } from "./simplenote";

export const importSources: readonly ImportSourceAdapter[] = [
  simplenoteSource,
  bearSource,
  notionSource,
  obsidianSource,
  appleNotesSource,
  plainTextSource,
  markdownSource,
];
