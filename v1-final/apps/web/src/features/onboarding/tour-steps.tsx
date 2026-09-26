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
		id: "settings",
		act: 3,
		kind: "deeplink",
		title: "Make it yours",
		body: "Themes, editor behavior, keyboard remapping, quick access, data export — it all lives in Settings.",
		onEnter: (fx) => fx.openGeneralSettings(),
		onExit: (fx) => fx.closeSettings(),
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
