/**
 * Seeds the active SeedBundle with a real welcome bundle.
 *
 * Run with: bun scripts/seed-welcome-bundle.ts
 *
 * Uses DATABASE_URL from .env (dotenv/config loaded automatically via Bun).
 */

import "dotenv/config";
import { buildTableBlock } from "../apps/web/src/domain/notes/rich-document";
import { PrismaClient } from "../apps/web/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { normalizeDatabaseUrl } from "../apps/web/src/lib/database-url";

const adapter = new PrismaPg({
	connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL!),
});
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
function wiki(title: string): InlineText {
	return t(`[[${title}]]`);
}
function hashTag(name: string): InlineText {
	return t(`#${name}`);
}

type Block = {
	id: string;
	type: string;
	props: Record<string, unknown>;
	content: Inline[] | string;
	children: Block[];
};

function p(...content: Inline[]): Block {
	return { id: bid(), type: "paragraph", props: {}, content, children: [] };
}

function h(level: 1 | 2 | 3, ...content: Inline[]): Block {
	return {
		id: bid(),
		type: "heading",
		props: { level, textColor: "default", backgroundColor: "default", textAlignment: "left" },
		content,
		children: [],
	};
}

function bullet(...content: Inline[]): Block {
	return {
		id: bid(),
		type: "bulletListItem",
		props: { textColor: "default", backgroundColor: "default", textAlignment: "left" },
		content,
		children: [],
	};
}

function check(checked: boolean, ...content: Inline[]): Block {
	return {
		id: bid(),
		type: "checkListItem",
		props: { checked, textColor: "default", backgroundColor: "default", textAlignment: "left" },
		content,
		children: [],
	};
}

function codeBlock(language: string, code: string): Block {
	return { id: bid(), type: "procode", props: { language }, content: code, children: [] };
}

function fileTree(source: string): Block {
	return {
		id: bid(),
		type: "fileTree",
		props: { source, defaultExpanded: true },
		content: [],
		children: [],
	};
}

function table(headers: string[], rows: string[][]): Block {
	return {
		...buildTableBlock(headers, rows),
		id: bid(),
		children: [],
	} as Block;
}

const STARTER_WORKSPACE_TREE = `Skriuw workspace
|-- Welcome to Skriuw
|-- Skriuw handbook
\`-- Guides/
    \`-- Workflows/
        \`-- From idea to published note`;

const EXAMPLE_PROJECT_TREE = `Example project map
|-- Brief.md
|-- Research/
|   |-- Interview notes.md
|   \`-- Competitor scan.md
\`-- Ship/
    |-- Launch checklist.md
    \`-- Post-launch retro.md`;

// ─── Note content ─────────────────────────────────────────────────────────────

const welcomeNote: Block[] = [
	h(1, t("Welcome to Skriuw")),
	p(
		t(
			"Skriuw is a notes workspace that stays out of your way — scratchpad, journal, or linked knowledge base. This note is tagged ",
		),
		hashTag("getting-started"),
		t(". The companion note "),
		wiki("Skriuw handbook"),
		t(" goes deeper."),
	),
	p(),
	h(2, t("Try this in the next two minutes")),
	check(false, t("Type "), code("/"), t(" on a blank line to see everything you can insert")),
	check(
		false,
		t("Press "),
		code("Cmd/Ctrl + Shift + Alt + B"),
		t(
			" to open the inspector — the panel on the right with this note's links, tags, and outline",
		),
	),
	check(
		false,
		t("Click "),
		wiki("Skriuw handbook"),
		t(" below, then look at its Outgoing links and Backlinks in the inspector"),
	),
	check(
		false,
		t("Click "),
		hashTag("getting-started"),
		t(" in the inspector to filter to every note with that tag"),
	),
	p(),
	h(2, t("Block editor")),
	p(
		t(
			"Each paragraph is a block. Hover the handle to reorder. The slash menu gives you headings, lists, quotes, code, tables, and more.",
		),
	),
	bullet(
		t("Type markdown inline — "),
		code("##"),
		t(" becomes a heading, "),
		code("[ ]"),
		t(" becomes a checkbox"),
	),
	bullet(t("Switch to raw MDX in the toolbar when you want source view")),
	bullet(
		t("Insert a "),
		bold("file tree"),
		t(" block with "),
		code("/file tree"),
		t(" — see "),
		wiki("Skriuw handbook"),
		t(" for a live example"),
	),
	p(),
	h(2, t("Link notes")),
	p(
		t("The easy way: type "),
		code("@"),
		t(
			" and pick a note from the list — or type a new name to create and link it in one step. It shows up as ",
		),
		code("[[Note title]]"),
		t(
			", which you can also type by hand. Unresolved links are clickable to create the target note. Open ",
		),
		wiki("Skriuw handbook"),
		t(" for a worked example with backlinks."),
	),
	p(),
	h(2, t("Tags")),
	p(
		t("Add tags inline with "),
		code("#tag"),
		t(" or the "),
		code("/tag"),
		t(
			" slash command. Tags show up in the inspector and can be clicked to filter the workspace.",
		),
	),
	p(),
	h(2, t("Your note web")),
	p(
		t("Open the "),
		bold("Graph"),
		t(" view in the left rail to see how "),
		wiki("Welcome to Skriuw"),
		t(", "),
		wiki("Skriuw handbook"),
		t(", and "),
		wiki("From idea to published note"),
		t(" connect through links and shared tags like "),
		hashTag("getting-started"),
		t(". Hover a node to highlight its neighbors, then click to jump back to the note."),
	),
	p(),
	h(2, t("Handy shortcuts")),
	bullet(
		code("Cmd/Ctrl + N"),
		t(" new note · "),
		code("Cmd/Ctrl + K"),
		t(" command palette · "),
		code("Cmd/Ctrl + Shift + B"),
		t(" toggle sidebar · press "),
		code("?"),
		t(" for the full list"),
	),
	p(
		t("Everything else lives in "),
		wiki("Skriuw handbook"),
		t(". For a longer example of linked notes in folders, open "),
		wiki("From idea to published note"),
		t(" under "),
		bold("Guides → Workflows"),
		t("."),
	),
];

const researchWorkflowNote: Block[] = [
	h(1, t("From idea to published note")),
	p(
		hashTag("workflow"),
		t(" "),
		hashTag("getting-started"),
		t(" — a compact example in "),
		bold("Guides → Workflows"),
		t(". Links to "),
		wiki("Welcome to Skriuw"),
		t(" and "),
		wiki("Skriuw handbook"),
		t("."),
	),
	p(),
	h(2, t("Sidebar layout")),
	p(
		t(
			"This note lives in nested folders. The tree below mirrors the starter workspace (folders open by default):",
		),
	),
	fileTree(STARTER_WORKSPACE_TREE),
	p(),
	h(2, t("Four-step loop")),
	table(
		["Step", "Do this", "Tag"],
		[
			["Capture", "One sentence, no polish", "#inbox"],
			["Connect", "Link to a hub or handbook note", "#workflow"],
			["Compress", "Rewrite in your words; cut the rest", "#reference"],
			["Check back", "Weekly pass on links and tags", "#workflow"],
		],
	),
	p(
		t("Insert tables with "),
		code("/table"),
		t(
			". Edit cells inline, add rows from the block handle, and switch to raw MDX to see the markdown source.",
		),
	),
	p(),
	check(false, t("Open the inspector — confirm outgoing links to the two starter notes")),
	p(
		t("When you are done exploring, edit or delete this note. Mechanics live in "),
		wiki("Skriuw handbook"),
		t("."),
	),
];

const handbookNote: Block[] = [
	h(1, t("Skriuw handbook")),
	p(
		hashTag("getting-started"),
		t(" "),
		hashTag("reference"),
		t(" — links, tags, editor modes, shortcuts, and copy-paste templates."),
	),
	p(
		t("Linked from "),
		wiki("Welcome to Skriuw"),
		t(". Keep both notes open in split view while you explore the inspector."),
	),
	p(),
	h(2, t("Links and backlinks")),
	p(
		t("This note links back to "),
		wiki("Welcome to Skriuw"),
		t(
			". That creates an outgoing link here and a backlink there. Use the inspector Links section to jump between notes.",
		),
	),
	p(
		t("Create links with "),
		code("[["),
		t("title"),
		code("]]"),
		t(", the "),
		code("/link note"),
		t(
			" slash command, or the note mention menu. Titles resolve against note names and H1 headings.",
		),
	),
	p(),
	h(2, t("Tags")),
	p(
		t("Tags such as "),
		hashTag("getting-started"),
		t(" and "),
		hashTag("reference"),
		t(
			" are plain text markers upgraded into chips when the note loads. Click a tag in the inspector to see every note that uses it.",
		),
	),
	p(
		t("Shared tag example: both this handbook and "),
		wiki("Welcome to Skriuw"),
		t(" use "),
		hashTag("getting-started"),
		t("."),
	),
	p(),
	h(2, t("Editor modes")),
	p(
		t(
			"Block mode (default) keeps structured blocks and the slash menu. Raw MDX mode shows markdown source and round-trips most syntax.",
		),
	),
	bullet(bold("Headings"), t(" — H1 / H2 / H3")),
	bullet(bold("Lists"), t(" — bullet, numbered, and check lists")),
	bullet(bold("Code"), t(" — fenced code blocks with language tags")),
	bullet(bold("Tables"), t(" — full grid editing")),
	bullet(
		bold("File tree"),
		t(" — "),
		code("/file tree"),
		t(" inserts a collapsible directory map"),
	),
	p(),
	h(2, t("File tree blocks")),
	p(
		t(
			"Use a file tree when a list of paths is clearer than prose — project layouts, repo maps, or “where does this live?” diagrams. Type ",
		),
		code("/file tree"),
		t(" or paste a tree inside a "),
		code("```filetree"),
		t(" fence."),
	),
	fileTree(EXAMPLE_PROJECT_TREE),
	p(
		t(
			"Click a folder row to expand or collapse. Use the edit control on the block to change paths — handy for planning before you create real folders.",
		),
	),
	p(),
	h(2, t("Keyboard shortcuts")),
	bullet(
		code("Cmd/Ctrl + N"),
		t(" — New note · "),
		code("Cmd/Ctrl + Shift + N"),
		t(" — New folder"),
	),
	bullet(
		code("Cmd/Ctrl + K"),
		t(" — Command palette (or "),
		code("Cmd/Ctrl + Shift + P"),
		t(")"),
	),
	bullet(
		code("Cmd/Ctrl + Shift + B"),
		t(" — Toggle sidebar · "),
		code("Cmd/Ctrl + Shift + Alt + B"),
		t(" — Toggle inspector"),
	),
	bullet(code("Cmd/Ctrl + E"), t(" — Switch between blocks and raw MDX")),
	bullet(
		code("/"),
		t(" — Slash menu · "),
		code("@"),
		t(" — link a note · "),
		code("#"),
		t(" — add a tag"),
	),
	bullet(code("?"), t(" — Show every shortcut")),
	bullet(
		t("While editing text: "),
		code("Cmd/Ctrl + B"),
		t(" bold · "),
		code("Cmd/Ctrl + I"),
		t(" italic · "),
		code("Cmd/Ctrl + `"),
		t(" inline code"),
	),
	p(t("Notes save automatically while you type.")),
	p(
		t("For a compact example with a table and nested folders, see "),
		wiki("From idea to published note"),
		t(" under "),
		bold("Guides → Workflows"),
		t("."),
	),
	p(),
	h(2, t("Templates")),
	p(bold("Meeting notes")),
	p(bold("Date:"), t(" …")),
	p(bold("Attendees:"), t(" …")),
	bullet(t("Agenda item")),
	check(false, t("Action item — owner")),
	p(),
	p(bold("Daily note")),
	p(bold("Today's focus:"), t(" …")),
	check(false, t("Task")),
	p(bold("End of day:"), t(" What went well? What to improve?")),
	p(),
	h(2, t("Code sample")),
	codeBlock(
		"typescript",
		`function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(greet("Skriuw"));`,
	),
];

// ─── Bundle payload ────────────────────────────────────────────────────────────

type SeedFolder = { ref: string; name: string; parentRef: string | null; order: number };
type SeedNote = {
	ref: string;
	name: string;
	parentRef: string | null;
	order: number;
	richContent: Block[];
	tags?: string[];
};

const folders: SeedFolder[] = [
	{ ref: "folder-guides", name: "Guides", parentRef: null, order: 2 },
	{ ref: "folder-workflows", name: "Workflows", parentRef: "folder-guides", order: 0 },
];

const notes: SeedNote[] = [
	{
		ref: "note-welcome",
		name: "Welcome to Skriuw",
		parentRef: null,
		order: 0,
		tags: ["getting-started"],
		richContent: welcomeNote,
	},
	{
		ref: "note-handbook",
		name: "Skriuw handbook",
		parentRef: null,
		order: 1,
		tags: ["getting-started", "reference"],
		richContent: handbookNote,
	},
	{
		ref: "note-research-workflow",
		name: "From idea to published note",
		parentRef: "folder-workflows",
		order: 0,
		tags: ["getting-started", "workflow", "inbox"],
		richContent: researchWorkflowNote,
	},
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	const bundle = await prisma.seedBundle.findFirst({
		where: { isActive: true },
		select: { id: true, name: true },
	});

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
	for (const note of notes.filter((item) => !item.parentRef)) {
		console.log(`  ${note.name}`);
	}
	for (const folder of folders.filter((item) => !item.parentRef)) {
		console.log(`  ${folder.name}/`);
		for (const childFolder of folders.filter((item) => item.parentRef === folder.ref)) {
			console.log(`    ${childFolder.name}/`);
			for (const note of notes.filter((item) => item.parentRef === childFolder.ref)) {
				console.log(`      ${note.name}`);
			}
		}
	}
}

main()
	.catch((err) => {
		console.error(err);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
