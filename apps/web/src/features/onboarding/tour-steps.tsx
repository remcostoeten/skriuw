import { ImageDemo } from "./components/demos/image-demo";
import { MentionDemo } from "./components/demos/mention-demo";
import { PersonDemo } from "./components/demos/person-demo";
import { SlashDemo } from "./components/demos/slash-demo";
import { TagDemo } from "./components/demos/tag-demo";
import type { ComponentType } from "react";
import type { ShortcutId } from "@/core/shortcuts/registry";
import type { WorkspaceCapabilities } from "@/core/workspace-backend";

export type TourStepContext = {
	isDesktop: boolean;
	isGuest: boolean;
	capabilities: WorkspaceCapabilities;
};

/**
 * Side effects a deep-link step can trigger when it becomes active / inactive.
 * The tour engine builds this from the surfaces it has access to.
 */
export type TourEffects = {
	openPalette: () => void;
	closePalette: () => void;
	openShortcutHelp: () => void;
	closeShortcutHelp: () => void;
	openAiSettings: () => void;
	openGeneralSettings: () => void;
	closeSettings: () => void;
	signIn: () => void;
};

export type TourStep = {
	id: string;
	act: 1 | 2 | 3;
	/**
	 * spotlight — dim everything except the `anchor` element;
	 * demo — dimmed backdrop with a canned looping visual;
	 * card — dimmed backdrop, centered card, no visual;
	 * deeplink — no backdrop (the opened surface stays visible), floating card.
	 */
	kind: "spotlight" | "demo" | "card" | "deeplink";
	anchor?: string;
	title: string;
	body: string;
	shortcutId?: ShortcutId;
	demo?: ComponentType;
	predicate?: (ctx: TourStepContext) => boolean;
	onEnter?: (fx: TourEffects) => void;
	onExit?: (fx: TourEffects) => void;
	cta?: { label: string; run: (fx: TourEffects) => void };
};

export const TOUR_STEPS: TourStep[] = [
	{
		id: "welcome",
		act: 1,
		kind: "card",
		title: "Welcome to Skriuw",
		body: "A local-first, keyboard-first notebook. Here's a quick tour of where everything lives and the keystrokes that do the most work.",
	},
	{
		id: "nav",
		act: 1,
		kind: "spotlight",
		anchor: '[data-tour="nav"]',
		title: "Everything on one rail",
		body: "Jump between Notes, Journal, Graph, Tags, and People from here.",
	},
	{
		id: "journal",
		act: 1,
		kind: "spotlight",
		anchor: 'a[href="/app/journal"]',
		title: "A page for every day",
		body: "Quick daily capture with templates — #tags and $people work there too, and entries feed the graph. Export it to your calendar.",
		predicate: (ctx) => ctx.capabilities.journal,
	},
	{
		id: "sidebar",
		act: 1,
		kind: "spotlight",
		anchor: '[data-tour="sidebar"]',
		title: "Your notes live here",
		body: "Nest notes into folders and sections, drag to reorder, and search the tree.",
	},
	{
		id: "new-note",
		act: 1,
		kind: "spotlight",
		anchor: '[aria-label="New note"]',
		title: "Start a note",
		body: "One click — or better, one keystroke — and you're writing.",
		shortcutId: "notes.newNote",
	},
	{
		id: "editor",
		act: 1,
		kind: "spotlight",
		anchor: '[data-tour="editor"]',
		title: "A block editor",
		body: "Headings, lists, code, diagrams, images — everything starts with a keystroke.",
	},
	{
		id: "slash",
		act: 2,
		kind: "demo",
		demo: SlashDemo,
		title: "Type / for blocks",
		body: "Code, Mermaid diagrams, toggles, AI, and more — pick from the menu or keep typing to filter.",
	},
	{
		id: "tags",
		act: 2,
		kind: "demo",
		demo: TagDemo,
		title: "Tag inline with #",
		body: "Tags roll up into the Tags overview and the graph — no separate step to organize.",
	},
	{
		id: "mentions",
		act: 2,
		kind: "demo",
		demo: MentionDemo,
		title: "Link notes with @",
		body: "Mention a note to link it — it creates the note if it doesn't exist yet, and every @ becomes a backlink in the note's inspector.",
	},
	{
		id: "people",
		act: 2,
		kind: "demo",
		demo: PersonDemo,
		title: "Mention people with $",
		body: "Each person gets a profile and a node in the graph.",
	},
	{
		id: "images",
		act: 2,
		kind: "demo",
		demo: ImageDemo,
		title: "Images & covers",
		body: "Drag-drop or paste images; give any page a cover. Nothing to upload now — just showing you.",
	},
	{
		id: "palette",
		act: 3,
		kind: "deeplink",
		title: "Do anything from the palette",
		body: "Fuzzy search across notes and actions, plus bangs like !n, !s and !a.",
		shortcutId: "app.commandPalette",
		onEnter: (fx) => fx.openPalette(),
		onExit: (fx) => fx.closePalette(),
	},
	{
		id: "shortcuts",
		act: 3,
		kind: "deeplink",
		title: "Keyboard-first, remappable",
		body: "Every shortcut is listed here and remappable in Settings.",
		shortcutId: "notes.help",
		onEnter: (fx) => fx.openShortcutHelp(),
		onExit: (fx) => fx.closeShortcutHelp(),
	},
	{
		id: "settings",
		act: 3,
		kind: "deeplink",
		title: "Make it yours",
		body: "Themes, editor behavior, keyboard remapping, quick access, data export — it all lives in Settings.",
		onEnter: (fx) => fx.openGeneralSettings(),
		onExit: (fx) => fx.closeSettings(),
	},
	{
		id: "ai",
		act: 3,
		kind: "spotlight",
		anchor: '[data-tour="ai"]',
		title: "AI in the editor",
		body: "Summarize, continue writing, extract tasks, suggest tags — right where you write.",
		predicate: (ctx) => ctx.capabilities.ai && !ctx.isGuest,
	},
	{
		id: "local-ai",
		act: 3,
		kind: "deeplink",
		title: "Run models 100% locally",
		body: "On desktop, one-click install Ollama and pull a model. Nothing leaves your machine.",
		predicate: (ctx) => ctx.isDesktop,
		onEnter: (fx) => fx.openAiSettings(),
		onExit: (fx) => fx.closeSettings(),
	},
	{
		id: "sync",
		act: 3,
		kind: "card",
		title: "Synced & collaborative",
		body: "Signed in on the web, your notes sync to the cloud and you can collaborate in real time.",
		predicate: (ctx) => !ctx.isDesktop && !ctx.isGuest,
	},
	{
		id: "guest-cta",
		act: 3,
		kind: "card",
		title: "You're in guest mode",
		body: "Everything is saved locally in your browser. Sign in to unlock sync, journal, AI, and history.",
		predicate: (ctx) => ctx.isGuest,
		cta: { label: "Sign in", run: (fx) => fx.signIn() },
	},
	{
		id: "finish",
		act: 3,
		kind: "card",
		title: "You're set",
		body: "Replay this anytime from the command palette — search for “Product tour”.",
		predicate: (ctx) => !ctx.isGuest,
	},
];
