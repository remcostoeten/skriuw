import { describe, expect, test } from "bun:test";
import {
  DEFAULT_FILE_TREE_SOURCE,
  countFileTreeNodes,
  isFileTreeFence,
  parseFileTreeSource,
} from "@/shared/lib/file-tree";
import { markdownToRichDocument, flattenInlineChips } from "@/shared/lib/rich-document";

type BlockWithProps = {
  type?: string;
  props?: Record<string, unknown>;
  content?: unknown;
};

describe("file tree block data", () => {
  test("parses the starter workspace tree into nested nodes", () => {
    const parsed = parseFileTreeSource(DEFAULT_FILE_TREE_SOURCE);
    const totals = countFileTreeNodes(parsed.children);

    expect(parsed.rootName).toBe("Skriuw starter workspace");
    expect(parsed.children.map((node) => [node.name, node.kind])).toEqual([
      ["Start here - editor field guide.md", "file"],
      ["Product Studio", "folder"],
      ["Playground", "folder"],
      ["Templates", "folder"],
    ]);
    expect(parsed.children[1]?.children[1]?.name).toBe("Research");
    expect(totals).toEqual({ folders: 6, files: 9 });
  });

  test("detects explicit filetree fences and legacy text tree fences", () => {
    expect(isFileTreeFence("filetree", DEFAULT_FILE_TREE_SOURCE)).toBe(true);
    expect(isFileTreeFence("tree", DEFAULT_FILE_TREE_SOURCE)).toBe(true);
    expect(isFileTreeFence("text", DEFAULT_FILE_TREE_SOURCE)).toBe(true);
    expect(isFileTreeFence("text", "hello\nworld")).toBe(false);
  });

  test("round-trips filetree markdown through the rich document shape", () => {
    const document = markdownToRichDocument(`\`\`\`filetree\n${DEFAULT_FILE_TREE_SOURCE}\n\`\`\``);
    const firstBlock = document[0] as BlockWithProps | undefined;

    expect(firstBlock?.type).toBe("fileTree");
    expect(firstBlock?.props?.source).toContain("Skriuw starter workspace");

    const flattened = flattenInlineChips(document);
    const firstFlattenedBlock = flattened[0] as BlockWithProps | undefined;

    expect(firstFlattenedBlock?.type).toBe("codeBlock");
    expect(firstFlattenedBlock?.props?.language).toBe("filetree");
    expect(firstFlattenedBlock?.content).toContain("Product Studio/");
  });
});
