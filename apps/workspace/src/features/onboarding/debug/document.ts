export type Chip =
  | { kind: "tag"; id: string; label: string }
  | { kind: "person"; id: string; label: string }
  | { kind: "note"; id: string; label: string };

export type Inline = string | Chip;

export type Block =
  | { block: "paragraph"; inline: Inline[] }
  | { block: "heading"; level: number; text: string }
  | { block: "bullets"; items: Inline[][] }
  | { block: "checks"; items: { checked: boolean; text: string }[] }
  | { block: "quote"; text: string }
  | { block: "code"; params: string; text: string };

export function paragraph(...inline: Inline[]): Block {
  return { block: "paragraph", inline };
}

export function heading(level: number, text: string): Block {
  return { block: "heading", level, text };
}

export function bullets(...items: Inline[][]): Block {
  return { block: "bullets", items };
}

export function checks(...items: { checked: boolean; text: string }[]): Block {
  return { block: "checks", items };
}

export function quote(text: string): Block {
  return { block: "quote", text };
}

export function code(params: string, text: string): Block {
  return { block: "code", params, text };
}

function chipNode(chip: Chip): unknown {
  if (chip.kind === "tag") {
    return { type: "tag_ref", attrs: { id: chip.id, label: chip.label } };
  }
  return { type: "mention_ref", attrs: { kind: chip.kind, id: chip.id, label: chip.label } };
}

function chipMarkdown(chip: Chip): string {
  if (chip.kind === "tag") return `#${chip.label}`;
  if (chip.kind === "person") return `$${chip.label}`;
  return `[[${chip.label}]]`;
}

function inlineJson(inline: readonly Inline[]): unknown[] {
  return inline.map((entry) =>
    typeof entry === "string" ? { type: "text", text: entry } : chipNode(entry),
  );
}

function inlineMarkdown(inline: readonly Inline[]): string {
  return inline.map((entry) => (typeof entry === "string" ? entry : chipMarkdown(entry))).join("");
}

function blockJson(block: Block): unknown {
  if (block.block === "heading") {
    return {
      type: "heading",
      attrs: { level: block.level },
      content: [{ type: "text", text: block.text }],
    };
  }
  if (block.block === "bullets") {
    return {
      type: "bullet_list",
      content: block.items.map((item) => ({
        type: "list_item",
        content: [{ type: "paragraph", content: inlineJson(item) }],
      })),
    };
  }
  if (block.block === "checks") {
    return {
      type: "check_list",
      content: block.items.map((item) => ({
        type: "check_item",
        attrs: { checked: item.checked, taskId: null, blockId: null },
        content: [{ type: "paragraph", content: [{ type: "text", text: item.text }] }],
      })),
    };
  }
  if (block.block === "quote") {
    return {
      type: "blockquote",
      content: [{ type: "paragraph", content: [{ type: "text", text: block.text }] }],
    };
  }
  if (block.block === "code") {
    return {
      type: "code_block",
      attrs: { params: block.params },
      content: [{ type: "text", text: block.text }],
    };
  }
  return { type: "paragraph", content: inlineJson(block.inline) };
}

function blockMarkdown(block: Block): string {
  if (block.block === "heading") return `${"#".repeat(block.level)} ${block.text}`;
  if (block.block === "bullets") {
    return block.items.map((item) => `- ${inlineMarkdown(item)}`).join("\n");
  }
  if (block.block === "checks") {
    return block.items.map((item) => `- [${item.checked ? "x" : " "}] ${item.text}`).join("\n");
  }
  if (block.block === "quote") return `> ${block.text}`;
  if (block.block === "code") return `\`\`\`${block.params}\n${block.text}\n\`\`\``;
  return inlineMarkdown(block.inline);
}

export function documentJson(body: readonly Block[]): unknown {
  return { type: "doc", content: body.map(blockJson) };
}

export function markdown(body: readonly Block[]): string {
  return body.map(blockMarkdown).join("\n\n");
}

export function emptyDocument(): unknown {
  return { type: "doc", content: [{ type: "paragraph" }] };
}
