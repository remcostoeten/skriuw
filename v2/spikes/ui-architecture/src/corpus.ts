import type { BlockCount, CanonicalBlock } from "./types";

export const BLOCK_COUNTS: readonly BlockCount[] = [50, 500, 2_000];
export const BOUNDED_BLOCK_LIMIT = 192;

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

export function createBoundedCorpus(
  blockCount: BlockCount,
  noteIndex: number,
): {
  canonical: CanonicalBlock[];
  rendered: CanonicalBlock[];
  start: number;
  end: number;
} {
  const canonical = createCorpus(blockCount, noteIndex);
  const maximumStart = Math.max(0, canonical.length - BOUNDED_BLOCK_LIMIT);
  const positions = [0, Math.floor(maximumStart / 2), maximumStart];
  const start = positions[noteIndex % positions.length] ?? 0;
  const end = Math.min(canonical.length, start + BOUNDED_BLOCK_LIMIT);
  return {
    canonical,
    rendered: canonical.slice(start, end),
    start,
    end,
  };
}
