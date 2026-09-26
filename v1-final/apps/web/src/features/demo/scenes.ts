import type { NoteFile } from "@/types/notes";
import type { Person } from "@/domain/people/models";
import { focusEditor, pressEnter, pressKey, sleep, typeText, waitForEditor } from "./lib/typist";

export type DemoScene = {
	slug: string;
	title: string;
	description: string;
	vimMode?: boolean;
	content: string;
	run: () => Promise<void>;
};

function fakeNote(id: string, name: string, content: string): NoteFile {
	return {
		id,
		name,
		content,
		richContent: [],
		preferredEditorMode: "block",
		createdAt: new Date("2026-01-01T09:00:00Z"),
		modifiedAt: new Date("2026-01-01T09:00:00Z"),
		parentId: null,
	};
}

export const DEMO_NOTES: NoteFile[] = [
	fakeNote("demo-note-1", "Roadmap.md", "The quarterly roadmap."),
	fakeNote("demo-note-2", "Release checklist.md", "Everything before we ship."),
	fakeNote("demo-note-3", "Retro notes.md", "What went well."),
];

export const DEMO_PEOPLE: Person[] = [
	{ id: "demo-person-1", name: "Anna de Vries", color: "blue" },
	{ id: "demo-person-2", name: "Jens Bakker", color: "green" },
];

async function begin(): Promise<void> {
	const editor = await waitForEditor();
	focusEditor(editor);
	await sleep(600);
}

const tagsAndMentions: DemoScene = {
	slug: "tags-and-mentions",
	title: "Tags and mentions",
	description: "Typing a trigger character to open the mention menu.",
	content: "",
	async run() {
		await begin();
		await typeText("Shipped the editor rewrite today ");
		await sleep(400);

		await typeText("#");
		await sleep(900);
		await typeText("rel");
		await sleep(1100);
		await pressEnter();
		await sleep(900);

		await typeText(" — paired with ");
		await typeText("$");
		await sleep(900);
		await typeText("Anna");
		await sleep(1100);
		await pressEnter();
		await sleep(900);

		await typeText(" and it closes ");
		await typeText("@");
		await sleep(900);
		await typeText("Release");
		await sleep(1200);
		await pressEnter();
		await sleep(1600);
	},
};

const diagrams: DemoScene = {
	slug: "diagrams",
	title: "Diagrams",
	description: "Typing a diagram block and watching it render live.",
	content: "",
	async run() {
		await begin();
		await typeText("Here's how a note reaches the vault:");
		await pressEnter();
		await sleep(600);

		await typeText("/");
		await sleep(900);
		await typeText("diagram");
		await sleep(1300);
		await pressEnter();
		await sleep(3000);
	},
};

const vimMode: DemoScene = {
	slug: "vim-mode",
	title: "Vim mode",
	description: "Modal editing with the mode indicator at the bottom.",
	vimMode: true,
	content: "",
	async run() {
		await begin();
		await typeText("Modal editing works right inside the block editor.");
		await sleep(900);

		await pressKey("Escape");
		await sleep(1200);

		await pressKey("0");
		await sleep(500);
		await pressKey("w", 3);
		await sleep(900);

		await pressKey("o");
		await sleep(700);
		await typeText("Press o to open a line below, Escape to go back to normal mode.");
		await sleep(900);
		await pressKey("Escape");
		await sleep(1600);
	},
};

export const DEMO_SCENES: DemoScene[] = [tagsAndMentions, diagrams, vimMode];

export function findScene(slug: string): DemoScene | undefined {
	return DEMO_SCENES.find((scene) => scene.slug === slug);
}
