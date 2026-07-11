/**
 * Replaces the active starter bundle for both guest workspaces and new accounts.
 *
 * Run with: bun scripts/seed-welcome-bundle.ts
 */

import "dotenv/config";
import { buildTableBlock } from "../apps/web/src/domain/notes/rich-document";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { normalizeDatabaseUrl } from "../apps/web/src/lib/database-url";

const adapter = new PrismaPg({
	connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL!),
});
const prisma = new PrismaClient({ adapter });

let sequence = 0;
function id(): string {
	sequence += 1;
	return `starter-${sequence.toString().padStart(4, "0")}`;
}

type TextStyle = { bold?: true; code?: true };
type Inline = { type: "text"; text: string; styles: TextStyle };
type Block = {
	id: string;
	type: string;
	props: Record<string, unknown>;
	content: Inline[] | string;
	children: Block[];
};

function text(value: string, styles: TextStyle = {}): Inline {
	return { type: "text", text: value, styles };
}
function bold(value: string): Inline {
	return text(value, { bold: true });
}
function code(value: string): Inline {
	return text(value, { code: true });
}
function link(title: string): Inline {
	return text(`[[${title}]]`);
}
function tag(name: string): Inline {
	return text(`#${name}`);
}
function paragraph(...content: Inline[]): Block {
	return { id: id(), type: "paragraph", props: {}, content, children: [] };
}
function heading(level: 1 | 2 | 3, ...content: Inline[]): Block {
	return {
		id: id(),
		type: "heading",
		props: { level, textColor: "default", backgroundColor: "default", textAlignment: "left" },
		content,
		children: [],
	};
}
function bullet(...content: Inline[]): Block {
	return {
		id: id(),
		type: "bulletListItem",
		props: { textColor: "default", backgroundColor: "default", textAlignment: "left" },
		content,
		children: [],
	};
}
function checklist(checked: boolean, ...content: Inline[]): Block {
	return {
		id: id(),
		type: "checkListItem",
		props: { checked, textColor: "default", backgroundColor: "default", textAlignment: "left" },
		content,
		children: [],
	};
}
function fileTree(source: string): Block {
	return {
		id: id(),
		type: "fileTree",
		props: { source, defaultExpanded: true },
		content: [],
		children: [],
	};
}
function table(headers: string[], rows: string[][]): Block {
	return { ...buildTableBlock(headers, rows), id: id(), children: [] } as Block;
}

const WORKSPACE_TREE = `Skriuw workspace
|-- Start here/
|   |-- Skriuw, at a glance
|   \`-- Make this yours
|-- Product launch/
|   |-- Launch brief
|   |-- Research/
|   |   \`-- Audience signals
|   \`-- Delivery/
|       \`-- Ship checklist
\`-- Reference/
    \`-- Your connected workspace`;

const overview: Block[] = [
	heading(1, text("Skriuw, at a glance")),
	paragraph(
		text(
			"A calm workspace for ideas that need somewhere to go. This small sample is a working system: capture a thought, connect it to context, then move it forward.",
		),
	),
	paragraph(
		text("Start with "),
		link("Launch brief"),
		text(" to see a project note connected to research and a delivery checklist. Then open "),
		link("Your connected workspace"),
		text(" to see how links, tags, and the graph fit together."),
	),
	paragraph(),
	heading(2, text("A workspace with a shape")),
	fileTree(WORKSPACE_TREE),
	paragraph(),
	heading(2, text("Try it")),
	checklist(false, text("Open "), link("Launch brief"), text(" and follow one of its links")),
	checklist(false, text("Click "), tag("launch"), text(" to filter the related notes")),
	checklist(false, text("Press "), code("Cmd/Ctrl + K"), text(" and search for “graph”")),
	paragraph(),
	heading(2, text("Keep or clear it")),
	paragraph(
		text(
			"Everything here is safe to edit, rename, or delete. The useful part is the pattern: a few deliberate notes, clear folders, and links where context matters.",
		),
	),
];

const makeItYours: Block[] = [
	heading(1, text("Make this yours")),
	paragraph(
		text(
			"You do not need a perfect system. Give each note a job, then let the structure grow only when it earns its place.",
		),
	),
	paragraph(),
	heading(2, text("Three simple moves")),
	bullet(bold("Capture"), text(" — make a note before the thought disappears.")),
	bullet(
		bold("Connect"),
		text(" — link it to the project, decision, or person it belongs with."),
	),
	bullet(
		bold("Return"),
		text(" — use a short checklist or tag to make the next action obvious."),
	),
	paragraph(),
	heading(2, text("Useful shortcuts")),
	bullet(
		code("Cmd/Ctrl + N"),
		text(" creates a note; "),
		code("Cmd/Ctrl + Shift + N"),
		text(" creates a folder."),
	),
	bullet(
		code("/"),
		text(" opens blocks and commands; "),
		code("@"),
		text(" links a note; "),
		code("#"),
		text(" adds a tag."),
	),
	bullet(code("Cmd/Ctrl + K"), text(" opens the command palette.")),
	paragraph(
		text("The sample project in "),
		link("Launch brief"),
		text(" shows those moves in context."),
	),
];

const launchBrief: Block[] = [
	heading(1, text("Launch brief")),
	paragraph(
		tag("launch"),
		text(" "),
		tag("active"),
		text(" — a compact project hub. Keep the decision here; keep the evidence in "),
		link("Audience signals"),
		text("; keep the execution in "),
		link("Ship checklist"),
		text("."),
	),
	paragraph(),
	heading(2, text("The bet")),
	paragraph(
		text(
			"Help first-time visitors understand Skriuw’s connected-note workflow in one focused session.",
		),
	),
	paragraph(),
	heading(2, text("What good looks like")),
	table(
		["Signal", "Target", "Where to look"],
		[
			["People open a linked note", "A clear next step", "[[Audience signals]]"],
			["People finish setup", "No missing context", "[[Ship checklist]]"],
			["The workspace stays calm", "Only useful defaults", "#active"],
		],
	),
	paragraph(),
	heading(2, text("Decision log")),
	bullet(text("Use one clear project hub instead of scattered status notes.")),
	bullet(text("Keep supporting material in folders, but link it from the hub.")),
	bullet(text("Make the next action visible in a checklist.")),
	paragraph(
		text("Related: "),
		link("Audience signals"),
		text(" · "),
		link("Ship checklist"),
		text(" · "),
		link("Your connected workspace"),
	),
];

const audienceSignals: Block[] = [
	heading(1, text("Audience signals")),
	paragraph(
		tag("research"),
		text(" "),
		tag("launch"),
		text(" — lightweight research belongs next to the decision it informs."),
	),
	paragraph(),
	heading(2, text("What people need")),
	bullet(text("A clear first action instead of an empty workspace.")),
	bullet(text("A small example they can understand at a glance.")),
	bullet(text("The freedom to replace the example without cleaning up a mess.")),
	paragraph(),
	heading(2, text("Turn insight into action")),
	paragraph(
		text("The answer is recorded in "),
		link("Launch brief"),
		text(". The work that follows is in "),
		link("Ship checklist"),
		text(". That trail is the value of linking notes: the why and the what stay close."),
	),
];

const shipChecklist: Block[] = [
	heading(1, text("Ship checklist")),
	paragraph(
		tag("launch"),
		text(" "),
		tag("delivery"),
		text(" — a checklist is a good home for the next concrete actions."),
	),
	paragraph(),
	checklist(true, text("Write the intent in "), link("Launch brief")),
	checklist(true, text("Collect supporting signals in "), link("Audience signals")),
	checklist(false, text("Review the first-run experience")),
	checklist(false, text("Share the decision with the team")),
	checklist(false, text("Capture what to improve next")),
	paragraph(),
	heading(2, text("A small ritual")),
	paragraph(
		text(
			"When a task changes shape, link it back to the note that explains why. You get a calm checklist without losing the context behind it.",
		),
	),
];

const connectedWorkspace: Block[] = [
	heading(1, text("Your connected workspace")),
	paragraph(
		tag("reference"),
		text(
			" — Skriuw keeps notes independent, then lets you connect them when the relationship is useful.",
		),
	),
	paragraph(),
	heading(2, text("Links create a trail")),
	paragraph(
		text("Open "),
		link("Launch brief"),
		text(
			" and its connected notes. The inspector shows outgoing links and backlinks; the graph turns those relationships into a map.",
		),
	),
	paragraph(),
	heading(2, text("Tags create useful views")),
	paragraph(
		text("The shared "),
		tag("launch"),
		text(
			" tag brings the brief, research, and delivery notes together without forcing them into one folder.",
		),
	),
	paragraph(),
	heading(2, text("Use the right shape")),
	bullet(text("Folders for stable homes.")),
	bullet(text("Links for context across those homes.")),
	bullet(text("Tags for temporary or cross-cutting views.")),
	paragraph(
		text("Return to "),
		link("Skriuw, at a glance"),
		text(" whenever you want a fresh starting point."),
	),
];

type SeedFolder = { ref: string; name: string; parentRef: string | null; order: number };
type SeedNote = {
	ref: string;
	name: string;
	parentRef: string | null;
	order: number;
	richContent: Block[];
	tags: string[];
};

const folders: SeedFolder[] = [
	{ ref: "folder-start", name: "Start here", parentRef: null, order: 0 },
	{ ref: "folder-launch", name: "Product launch", parentRef: null, order: 1 },
	{ ref: "folder-research", name: "Research", parentRef: "folder-launch", order: 0 },
	{ ref: "folder-delivery", name: "Delivery", parentRef: "folder-launch", order: 1 },
	{ ref: "folder-reference", name: "Reference", parentRef: null, order: 2 },
];

const notes: SeedNote[] = [
	{
		ref: "note-welcome",
		name: "Skriuw, at a glance",
		parentRef: "folder-start",
		order: 0,
		tags: ["start-here"],
		richContent: overview,
	},
	{
		ref: "note-make-it-yours",
		name: "Make this yours",
		parentRef: "folder-start",
		order: 1,
		tags: ["start-here"],
		richContent: makeItYours,
	},
	{
		ref: "note-launch-brief",
		name: "Launch brief",
		parentRef: "folder-launch",
		order: 0,
		tags: ["launch", "active"],
		richContent: launchBrief,
	},
	{
		ref: "note-audience-signals",
		name: "Audience signals",
		parentRef: "folder-research",
		order: 0,
		tags: ["research", "launch"],
		richContent: audienceSignals,
	},
	{
		ref: "note-ship-checklist",
		name: "Ship checklist",
		parentRef: "folder-delivery",
		order: 0,
		tags: ["launch", "delivery"],
		richContent: shipChecklist,
	},
	{
		ref: "note-connected-workspace",
		name: "Your connected workspace",
		parentRef: "folder-reference",
		order: 0,
		tags: ["reference"],
		richContent: connectedWorkspace,
	},
];

async function main() {
	const bundle = await prisma.seedBundle.findFirst({
		where: { isActive: true },
		select: { id: true, name: true },
	});
	if (!bundle) throw new Error("No active seed bundle found. Run migrations first.");
	await prisma.seedBundle.update({
		where: { id: bundle.id },
		data: {
			name: "Connected workspace starter",
			folders: folders as unknown as object,
			notes: notes as unknown as object,
			tags: [],
			journals: [],
		},
	});
	console.log(`Updated ${bundle.name} with ${folders.length} folders and ${notes.length} notes.`);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
