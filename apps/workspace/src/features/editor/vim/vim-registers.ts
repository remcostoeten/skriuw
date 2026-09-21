import type { Node as ProseMirrorNode, Slice } from "prosemirror-model";

/**
 * Register contents keep the plain text every Vim command understands next to
 * the structured copy that lets an in-document put preserve marks and inline
 * nodes. Linewise entries carry whole block nodes when the yank covered whole
 * blocks; otherwise the text is re-wrapped in paragraphs on put.
 */
export type RegisterContent = {
  text: string;
  linewise: boolean;
  slice: Slice | null;
  blocks: readonly ProseMirrorNode[] | null;
};

export type ClipboardBridge = {
  write(text: string): void;
  read(): Promise<string>;
};

const UNNAMED = '"';
const LAST_YANK = "0";
const BLACK_HOLE = "_";

const registers = new Map<string, RegisterContent>();

export function isClipboardRegister(name: string | null): boolean {
  return name === "+" || name === "*";
}

export function readRegister(name: string | null): RegisterContent | null {
  if (name === null || name === UNNAMED) return registers.get(UNNAMED) ?? null;
  if (name === BLACK_HOLE || isClipboardRegister(name)) return null;
  return registers.get(name.toLowerCase()) ?? null;
}

export function writeRegister(
  name: string | null,
  content: RegisterContent,
  options: { yank: boolean; clipboard?: ClipboardBridge },
): void {
  if (name === BLACK_HOLE) return;
  if (isClipboardRegister(name)) {
    options.clipboard?.write(content.text);
    registers.set(UNNAMED, content);
    return;
  }
  registers.set(UNNAMED, content);
  if (options.yank && (name === null || name === UNNAMED)) {
    registers.set(LAST_YANK, content);
  }
  if (name === null || name === UNNAMED) return;
  if (/^[A-Z]$/.test(name)) {
    const existing = registers.get(name.toLowerCase());
    if (!existing) {
      registers.set(name.toLowerCase(), content);
      return;
    }
    const joiner = existing.linewise || content.linewise ? "\n" : "";
    registers.set(name.toLowerCase(), {
      text: `${existing.text}${joiner}${content.text}`,
      linewise: existing.linewise || content.linewise,
      slice: null,
      blocks:
        existing.blocks && content.blocks ? [...existing.blocks, ...content.blocks] : null,
    });
    return;
  }
  registers.set(name.toLowerCase(), content);
}

export function textRegister(text: string, linewise = false): RegisterContent {
  return { text, linewise, slice: null, blocks: null };
}

/** Test seam: forgets every register. */
export function resetRegisters(): void {
  registers.clear();
}
