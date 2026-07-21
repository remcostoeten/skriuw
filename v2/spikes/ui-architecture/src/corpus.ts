import type { BlockCount, CanonicalBlock } from "./types";

export const BLOCK_COUNTS: readonly BlockCount[] = [50, 500, 2_000];

export function createCorpus(
  blockCount: BlockCount,
  noteIndex: number,
): CanonicalBlock[] {
  return Array.from({ length: blockCount }, (_, blockIndex) => {
    const ordinal = blockIndex + 1;
    const text = `Note ${noteIndex + 1}, block ${ordinal}. Deterministic Skriuw editor fixture with representative prose.`;
    if (blockIndex % 20 === 0) {
      return { kind: "heading", text };
    }
    if (blockIndex % 15 === 0) {
      return { kind: "quote", text };
    }
    return { kind: "paragraph", text };
  });
}
