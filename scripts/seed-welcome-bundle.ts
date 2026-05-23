/**
 * Seeds the active SeedBundle with a real welcome bundle.
 *
 * Run with: bun scripts/seed-welcome-bundle.ts
 *
 * Uses DATABASE_URL from .env (dotenv/config loaded automatically via Bun).
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ─── Block helpers ────────────────────────────────────────────────────────────

let _seq = 0;
function bid(): string {
	_seq++;
	return `seed-${_seq.toString().padStart(4, "0")}`;
}

type TextStyle = { bold?: true; italic?: true; code?: true; strike?: true };
type InlineText = { type: "text"; text: string; styles: TextStyle };
type Inline = InlineText;

function t(text: string, styles: TextStyle = {}): InlineText {
	return { type: "text", text, styles };
}
function bold(text: string): InlineText {
	return t(text, { bold: true });
}
function code(text: string): InlineText {
	return t(text, { code: true });
}

type Block = {
	id: string;
	type: string;
	props: Record<string, unknown>;
	content: Inline[];
	children: Block[];
};

function p(...content: Inline[]): Block {
	return { id: bid(), type: "paragraph", props: {}, content, children: [] };
}

function h(level: 1 | 2 | 3, ...content: Inline[]): Block {
	return { id: bid(), type: "heading", props: { level, textColor: "default", backgroundColor: "default", textAlignment: "left" }, content, children: [] };
}

function bullet(...content: Inline[]): Block {
	return { id: bid(), type: "bulletListItem", props: { textColor: "default", backgroundColor: "default", textAlignment: "left" }, content, children: [] };
}

function numbered(...content: Inline[]): Block {
	return { id: bid(), type: "numberedListItem", props: { textColor: "default", backgroundColor: "default", textAlignment: "left" }, content, children: [] };
}

function check(checked: boolean, ...content: Inline[]): Block {
	return { id: bid(), type: "checkListItem", props: { checked, textColor: "default", backgroundColor: "default", textAlignment: "left" }, content, children: [] };
}

function codeBlock(language: string, code: string): Block {
	return { id: bid(), type: "codeBlock", props: { language }, content: [t(code)], children: [] };
}

function divider(): Block {
	return { id: bid(), type: "paragraph", props: {}, content: [t("─────────────────────────────────────────────")], children: [] };
}

// ─── Note content ─────────────────────────────────────────────────────────────

const welcomeNote: Block[] = [
	h(1, t("Welcome to Skriuw")),
	p(t("Your personal knowledge workspace — fast, offline-first, and built around your flow.")),
	p(),
	h(2, t("What you can do here")),
	bullet(bold("Notes"), t(" — write in rich text or markdown; they sync to the cloud automatically")),
	bullet(bold("Folders"), t(" — organise notes into a tree; drag-and-drop to rearrange")),
	bullet(bold("Journal"), t(" — capture daily thoughts with mood tracking")),
	bullet(bold("Wiki links"), t(" — type "), code("[[Note name]]"), t(" to link any note from anywhere")),
	bullet(bold("Tags"), t(" — type "), code("#tag"), t(" inline to tag content for the inspector")),
	p(),
	h(2, t("Tips to get started")),
	check(false, t("Create your first note — hit "), code("N"), t(" or click the "), bold("+"), t(" in the sidebar")),
	check(false, t("Try the block editor — type "), code("/"), t(" on a blank line for block types")),
	check(false, t("Open the inspector panel on any note ("), code("I"), t(") to see backlinks and tags")),
	check(false, t("Check Keyboard Shortcuts in the Reference folder")),
	p(),
	p(t("Have fun building your second brain.")),
];

const keyboardNote: Block[] = [
	h(1, t("Keyboard Shortcuts")),
	p(t("Every action has a shortcut. Here are the most useful ones.")),
	p(),
	h(2, t("Navigation")),
	bullet(code("N"), t(" — New note")),
	bullet(code("Cmd/Ctrl + K"), t(" — Quick switcher / command palette")),
	bullet(code("Cmd/Ctrl + P"), t(" — Search notes")),
	bullet(code("I"), t(" — Toggle inspector (backlinks, tags, metadata)")),
	bullet(code("Cmd/Ctrl + \\"), t(" — Toggle sidebar")),
	p(),
	h(2, t("Editor")),
	bullet(code("/"), t(" — Slash menu — insert any block type")),
	bullet(code("[["), t(" — Create a wiki link to another note")),
	bullet(code("#tag"), t(" — Inline tag (highlighted in inspector)")),
	bullet(code("Cmd/Ctrl + B"), t(" — Bold")),
	bullet(code("Cmd/Ctrl + I"), t(" — Italic")),
	bullet(code("Cmd/Ctrl + `"), t(" — Inline code")),
	bullet(code("Tab"), t(" — Indent list item")),
	bullet(code("Shift + Tab"), t(" — Outdent list item")),
	p(),
	h(2, t("Saving")),
	p(t("Notes save automatically while you type. No "), code("Cmd+S"), t(" needed.")),
];

const editorGuideNote: Block[] = [
	h(1, t("Editor Guide")),
	p(t("Skriuw has two editor modes you can switch between per note.")),
	p(),
	h(2, t("Block editor (default)")),
	p(t("Every line is a structured block. Type "), code("/"), t(" to open the slash menu:")),
	bullet(bold("Heading"), t(" — H1 / H2 / H3")),
	bullet(bold("Bullet list"), t(" — unordered list")),
	bullet(bold("Numbered list"), t(" — ordered list")),
	bullet(bold("Check list"), t(" — interactive todos")),
	bullet(bold("Code block"), t(" — syntax-highlighted code")),
	bullet(bold("Table"), t(" — full spreadsheet-like tables")),
	bullet(bold("File tree"), t(" — ASCII-style directory diagrams")),
	p(),
	h(2, t("Markdown mode")),
	p(t("Prefer raw markdown? Switch in the toolbar. The document round-trips losslessly for most syntax.")),
	p(),
	h(2, t("Wiki links")),
	p(t("Type "), code("[["), t(" followed by a note title to create a link. Skriuw resolves links by title at render time, so renaming a note keeps links working.")),
	p(),
	h(2, t("Code example")),
	codeBlock("typescript", `function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(greet("Skriuw"));`),
];

const writingTemplateNote: Block[] = [
	h(1, t("Meeting Notes")),
	p(bold("Date: "), t("{{date}}")),
	p(bold("Attendees: ")),
	p(),
	h(2, t("Agenda")),
	numbered(t("Item 1")),
	numbered(t("Item 2")),
	p(),
	h(2, t("Notes")),
	p(t("…")),
	p(),
	h(2, t("Action items")),
	check(false, t("Owner — action")),
	check(false, t("Owner — action")),
];

const dailyTemplateNote: Block[] = [
	h(1, t("Daily Note — {{date}}")),
	p(),
	h(2, t("Today's focus")),
	p(t("…")),
	p(),
	h(2, t("Tasks")),
	check(false, t("Task 1")),
	check(false, t("Task 2")),
	check(false, t("Task 3")),
	p(),
	h(2, t("Notes")),
	p(t("…")),
	p(),
	h(2, t("End of day")),
	p(t("What went well: …")),
	p(t("What to improve: …")),
];

// ─── Bundle payload ────────────────────────────────────────────────────────────

type SeedFolder = { ref: string; name: string; parentRef: string | null; order: number };
type SeedNote = { ref: string; name: string; parentRef: string | null; order: number; richContent: Block[] };

const folders: SeedFolder[] = [
	{ ref: "folder-getting-started", name: "Getting Started", parentRef: null, order: 0 },
	{ ref: "folder-reference", name: "Reference", parentRef: null, order: 1 },
	{ ref: "folder-templates", name: "Templates", parentRef: null, order: 2 },
];

const notes: SeedNote[] = [
	{ ref: "note-welcome", name: "Welcome to Skriuw", parentRef: null, order: 0, richContent: welcomeNote },
	{ ref: "note-editor-guide", name: "Editor Guide", parentRef: "folder-getting-started", order: 0, richContent: editorGuideNote },
	{ ref: "note-keyboard-shortcuts", name: "Keyboard Shortcuts", parentRef: "folder-reference", order: 0, richContent: keyboardNote },
	{ ref: "note-meeting-template", name: "Meeting Notes", parentRef: "folder-templates", order: 0, richContent: writingTemplateNote },
	{ ref: "note-daily-template", name: "Daily Note", parentRef: "folder-templates", order: 1, richContent: dailyTemplateNote },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	const bundle = await prisma.seedBundle.findFirst({ where: { isActive: true }, select: { id: true, name: true } });

	if (!bundle) {
		console.error("No active seed bundle found. Run migrations first.");
		process.exit(1);
	}

	console.log(`Updating bundle "${bundle.name}" (${bundle.id}) …`);

	await prisma.seedBundle.update({
		where: { id: bundle.id },
		data: {
			name: "Welcome bundle",
			folders: folders as unknown as object,
			notes: notes as unknown as object,
			tags: [],
			journals: [],
		},
	});

	console.log(`✓ Bundle updated with ${folders.length} folders and ${notes.length} notes.`);
	console.log("\nStructure:");
	console.log("  Welcome to Skriuw");
	for (const f of folders) {
		console.log(`  ${f.name}/`);
		for (const n of notes.filter((n) => n.parentRef === f.ref)) {
			console.log(`    ${n.name}`);
		}
	}
}

main()
	.catch((err) => { console.error(err); process.exit(1); })
	.finally(() => prisma.$disconnect());
