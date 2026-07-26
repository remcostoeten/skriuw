import type { ImportSourceAdapter } from "../model";
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
  plainTextSource,
  markdownSource,
];
