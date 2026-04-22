import type { Block } from "@blocknote/core";
import type { RichTextDocument } from "@/types/notes";

export function markdownToRichDocument(markdown: string): RichTextDocument {
  const lines = markdown.split("\n");
  const blocks: RichTextDocument = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 3) as 1 | 2 | 3;
      blocks.push({
        type: "heading",
        props: { level },
        content: headingMatch[2],
      });
      i++;
      continue;
    }

    if (line.match(/^[-*]\s+/)) {
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        blocks.push({
          type: "bulletListItem",
          content: lines[i].replace(/^[-*]\s+/, ""),
        });
        i++;
      }
      continue;
    }

    if (line.match(/^\d+\.\s+/)) {
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
        blocks.push({
          type: "numberedListItem",
          content: lines[i].replace(/^\d+\.\s+/, ""),
        });
        i++;
      }
      continue;
    }

    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({
        type: "codeBlock",
        props: { language: language || "plaintext" },
        content: codeLines.join("\n"),
      });
      i++;
      continue;
    }

    if (line.startsWith("> ")) {
      blocks.push({
        type: "paragraph",
        content: line.slice(2),
      });
      i++;
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    blocks.push({
      type: "paragraph",
      content: line,
    });
    i++;
  }

  return blocks.length > 0 ? blocks : [{ type: "paragraph", content: "" }];
}

export function cloneRichDocument(document: Block[]): RichTextDocument {
  return JSON.parse(JSON.stringify(document)) as RichTextDocument;
}
