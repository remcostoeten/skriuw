"use client";

import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type ForwardRefExoticComponent,
	type RefAttributes,
} from "react";
import {
	Database,
	Eye,
	FlaskConical,
	Keyboard,
	Palette,
	PenLine,
	Search,
	Shield,
	Sparkles,
	Tag,
	User,
	X,
	type LucideIcon,
} from "lucide-react";

import { EyeIcon } from "@/shared/icons/eye";
import { SprayCanIcon } from "@/shared/icons/spray-can";
import { PenIcon } from "@/shared/icons/pen";
import { SparklesIcon } from "@/shared/icons/sparkles";
import { CloudIcon } from "@/shared/icons/cloud";
import type { AnimatedIconHandle } from "@/shared/icons/types";

import { usePreferencesStore } from "@/features/settings/store";
import { openSettings, useSettingsModal } from "@/features/settings/use-settings-modal";
import {
	findSettingsFocusId,
	firstSettingsFocusId,
	bestSettingsMatch,
} from "@/features/settings/settings-command-index";
import {
	isSettingsTabVisible,
	getSettingsTabId,
	type SettingsTabId,
} from "@/features/settings/lib/settings-tabs";
import { flashSettingsFocus } from "@/features/settings/lib/settings-focus-anchor";
import { useIsGuestWorkspace, isTauriRuntime } from "@/core/workspace-backend";
import { GuestSectionNotice, type GuestFeature } from "@/shared/ui/guest-gate";
import { DesktopAiSection } from "@/features/desktop/ai-settings-section";

import { AccountSection } from "@/features/settings/sections/account-section";
import { AppearanceSection } from "@/features/settings/sections/appearance-section";
import { EditorSection } from "@/features/settings/sections/editor-section";
import { ShortcutsSection } from "@/features/settings/sections/shortcuts-section";
import { DataSection } from "@/features/settings/sections/data-section";
import { PrivacySection } from "@/features/settings/sections/privacy-section";
import { SecuritySection } from "@/features/settings/sections/security-section";
import { AiSection } from "@/features/settings/sections/ai-section";
import { TagsSection } from "@/features/settings/sections/tags-section";
import { ExperimentalSection } from "@/features/settings/sections/experimental-section";

type SettingsGroup = "Account" | "Workspace" | "Intelligence" | "Advanced";

const GROUP_ORDER: SettingsGroup[] = ["Account", "Workspace", "Intelligence", "Advanced"];

type AnimatedIconComponent = ForwardRefExoticComponent<
	{ size?: number; className?: string; color?: string } & RefAttributes<AnimatedIconHandle>
>;

type SectionMeta = {
	id: SettingsTabId;
	label: string;
	icon: LucideIcon;
	animatedIcon?: AnimatedIconComponent;
	description: string;
	group: SettingsGroup;
	keywords: string;
};

// Searchable terms from each section's internal settings (toggle labels,
// descriptions, etc.) so the sidebar search finds sections by their content.
const SECTION_DEEP_KEYWORDS: Partial<Record<SettingsTabId, string>> = {
	appearance: "compact sidebar tree guide lines show line numbers reduce motion remember last settings tab reopen persist",
	editor: "vim mode default mode raw placeholder font line height animate numbers open notes in tabs detect tags note properties layout collapsed template custom properties",
	shortcuts: "keyboard shortcuts custom keybinds remap",
	privacy: "analytics telemetry tracking opt out opt in",
	tags: "merge rename delete organize",
	data: "export import backup restore sync download json markdown simplenote migration vault storage",
	ai: "providers api keys ollama groq gemini openai model completion prompts translate language",
	experimental: "preview beta flags features labs early access diary mode",
};

const SECTIONS: ReadonlyArray<SectionMeta> = [
	{ id: "account", label: "Account", icon: User, description: "Profile and sign-in", group: "Account", keywords: "profile name email avatar display picture username delete account sign out log out session" },
	{ id: "security", label: "Security", icon: Shield, description: "Password and sessions", group: "Account", keywords: "password change reset two factor 2fa authentication active sessions devices revoke login history" },
	{ id: "privacy", label: "Privacy", icon: Eye, animatedIcon: EyeIcon, description: "Analytics and data use", group: "Account", keywords: "analytics usage anonymous page views product events tracking telemetry opt out opt in cookies sign-in events data collection" },
	{ id: "appearance", label: "Appearance", icon: Palette, animatedIcon: SprayCanIcon, description: "Theme and density", group: "Workspace", keywords: "theme themes midnight paper graphite monokai dark light color scheme density compact spacing font typeface accent zoom sidebar line numbers reduce motion remember last tab reopen settings persist" },
	{ id: "editor", label: "Editor", icon: PenLine, animatedIcon: PenIcon, description: "Writing experience", group: "Workspace", keywords: "writing markdown vim mode spellcheck autosave line width typewriter block editor rich text formatting" },
	{ id: "shortcuts", label: "Shortcuts", icon: Keyboard, description: "Keyboard bindings", group: "Workspace", keywords: "keyboard bindings hotkeys keybindings remap commands shortcuts keys" },
	{ id: "tags", label: "Tags", icon: Tag, description: "Manage tags", group: "Workspace", keywords: "tags labels people mentions rename merge delete organize" },
	{ id: "ai", label: "AI", icon: Sparkles, animatedIcon: SparklesIcon, description: "Providers and keys", group: "Intelligence", keywords: "ai artificial intelligence providers api keys ollama groq gemini openai model local cloud completion prompts actions" },
	{ id: "data", label: "Data & sync", icon: Database, animatedIcon: CloudIcon, description: "Export and backup", group: "Advanced", keywords: "export import backup restore sync download data json markdown simplenote migration vault storage" },
	{ id: "experimental", label: "Experimental", icon: FlaskConical, description: "Preview features", group: "Advanced", keywords: "experimental preview beta flags features labs early access" },
];

// Tabs whose features require a server/account. Guests see a sign-up notice
// instead so they can't trigger server actions that would 500.
const GUEST_GATED_TABS: Partial<Record<SettingsTabId, GuestFeature>> = {
	account: "account",
	security: "account",
	ai: "ai",
	tags: "account",
};

function renderSection(id: SettingsTabId, isGuest: boolean) {
	const gatedFeature = GUEST_GATED_TABS[id];
	if (isGuest && gatedFeature) {
		return <GuestSectionNotice feature={gatedFeature} />;
	}

	switch (id) {
		case "account":
			return <AccountSection />;
		case "appearance":
			return <AppearanceSection />;
		case "editor":
			return <EditorSection />;
		case "shortcuts":
			return <ShortcutsSection />;
		case "data":
			return <DataSection />;
		case "privacy":
			return <PrivacySection />;
		case "security":
			return <SecuritySection />;
		case "ai":
			return isTauriRuntime() ? <DesktopAiSection /> : <AiSection />;
		case "tags":
			return <TagsSection />;
		case "experimental":
			return <ExperimentalSection />;
	}
}

/**
 * Renders `text` with the portion matching `query` wrapped in a subtle
 * highlight. Matching is case-insensitive and marks the first occurrence.
 * Returns the plain text unchanged when there is no query or no match.
 */
function highlightMatch(text: string, query: string) {
	const q = query.trim();
	if (!q) return text;
	const idx = text.toLowerCase().indexOf(q.toLowerCase());
	if (idx === -1) return text;
	return (
		<>
			{text.slice(0, idx)}
			<span className="rounded-[2px] bg-foreground/[0.14] text-foreground">
				{text.slice(idx, idx + q.length)}
			</span>
			{text.slice(idx + q.length)}
		</>
	);
}

type Props = {
	section: SectionMeta;
	active: boolean;
	query: string;
	rovingTabId: SettingsTabId | undefined;
	onSelect: (id: SettingsTabId) => void;
};

function SettingsTabButton({ section, active, query, rovingTabId, onSelect }: Props) {
	const iconRef = useRef<AnimatedIconHandle>(null);
	const AnimatedIcon = section.animatedIcon;
	const Icon = section.icon;
	const match = query.trim() ? bestSettingsMatch(query, section.id) : null;
	const subtitle = match ? match.title : section.description;

	const play = () => iconRef.current?.startAnimation();

	return (
		<li role="presentation">
			<button
				id={getSettingsTabId(section.id)}
				role="tab"
				aria-selected={active}
				aria-controls="settings-tabpanel"
				tabIndex={section.id === rovingTabId ? 0 : -1}
				onClick={() => {
					onSelect(section.id);
					play();
				}}
				onMouseEnter={play}
				className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors focus-visible:shadow-none focus-visible:outline-none focus-visible:bg-foreground/[0.22] focus-visible:text-foreground ${
					active
						? "bg-sidebar-accent text-sidebar-accent-foreground"
						: "text-sidebar-foreground hover:bg-sidebar-accent/50"
				}`}
			>
				<span className={active ? "text-foreground" : "text-muted-foreground"}>
					{AnimatedIcon ? (
						<AnimatedIcon ref={iconRef} size={16} />
					) : (
						<Icon className="h-4 w-4" />
					)}
				</span>
				<span className="min-w-0 flex-1">
					<span className="block truncate">{highlightMatch(section.label, query)}</span>
					{query.trim() && (
						<span className="block truncate text-[11px] text-muted-foreground">
							{highlightMatch(subtitle, query)}
						</span>
					)}
				</span>
			</button>
		</li>
	);
}

export function SettingsModal() {
	const open = useSettingsModal((state) => state.isOpen);
	const tab = useSettingsModal((state) => state.tab);
	const focusId = useSettingsModal((state) => state.focusId);
	const setTab = useSettingsModal((state) => state.setTab);
	const close = useSettingsModal((state) => state.close);

	const isGuest = useIsGuestWorkspace();
	const initializePreferences = usePreferencesStore((state) => state.initialize);
	const logActivity = usePreferencesStore((state) => state.logActivity);

	// Keep the modal mounted while the exit animation plays.
	const [mounted, setMounted] = useState(open);
	// Drives the enter/exit transition (false = off-screen/faded, true = settled).
	const [visible, setVisible] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const navRef = useRef<HTMLElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	const [searchFocused, setSearchFocused] = useState(false);

	const visibleSections = useMemo(
		() => SECTIONS.filter((section) => isSettingsTabVisible(section.id)),
		[],
	);

	const filteredSections = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return visibleSections;
		return visibleSections.filter(
			(section) =>
				`${section.label} ${section.description} ${section.group} ${section.keywords} ${SECTION_DEEP_KEYWORDS[section.id] ?? ""}`
					.toLowerCase()
					.includes(q) || bestSettingsMatch(query, section.id) !== null,
		);
	}, [visibleSections, query]);

	useEffect(() => {
		if (!open) return;
		initializePreferences();
		logActivity("settings_opened");
	}, [open, initializePreferences, logActivity]);

	// Mount immediately on open, then flip `visible` on the next frame so the
	// browser can transition from the initial (hidden) state. On close, play the
	// exit transition first, then unmount after it finishes (500ms drawer curve).
	useEffect(() => {
		if (open) {
			setMounted(true);
			const raf = requestAnimationFrame(() => {
				requestAnimationFrame(() => setVisible(true));
			});
			return () => cancelAnimationFrame(raf);
		}
		setVisible(false);
		setQuery("");
		const timeout = setTimeout(() => setMounted(false), 500);
		return () => clearTimeout(timeout);
	}, [open]);

	// Lock background scroll while the modal is on screen.
	useEffect(() => {
		if (!mounted) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = previous;
		};
	}, [mounted]);

	// Accessibility: move focus into the dialog on open, mark the rest of the app
	// `inert` so it's hidden from AT / not focusable, and restore focus on close.
	useEffect(() => {
		if (!open || !mounted) return;
		const previouslyFocused = document.activeElement as HTMLElement | null;

		const container = rootRef.current;
		const backgrounded: Element[] = [];
		if (container?.parentElement) {
			for (const sibling of Array.from(container.parentElement.children)) {
				if (sibling !== container && !sibling.hasAttribute("inert")) {
					sibling.setAttribute("inert", "");
					backgrounded.push(sibling);
				}
			}
		}

		panelRef.current?.focus();

		return () => {
			backgrounded.forEach((el) => el.removeAttribute("inert"));
			previouslyFocused?.focus?.();
		};
	}, [open, mounted]);

	useEffect(() => {
		if (!open) return;
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") {
				close();
				return;
			}
			// "/" focuses search, unless already typing in a field.
			if (e.key === "/") {
				const active = document.activeElement;
				const typing =
					active instanceof HTMLInputElement ||
					active instanceof HTMLTextAreaElement ||
					(active instanceof HTMLElement && active.isContentEditable);
				if (!typing) {
					e.preventDefault();
					searchRef.current?.focus();
					return;
				}
			}
			// Ctrl+E: move focus to the active section in the sidebar, mirroring
			// the notes file tree's "focus tree" shortcut.
			if (e.key.toLowerCase() === "e" && e.ctrlKey && !e.metaKey && !e.altKey) {
				e.preventDefault();
				navRef.current
					?.querySelector<HTMLElement>('[role="tab"][tabindex="0"]')
					?.focus();
				return;
			}
			// F6 / Shift+F6: jump between the dialog's panes (search → section
			// list → content) from anywhere, without tabbing through controls.
			if (e.key === "F6") {
				e.preventDefault();
				const activeTab = navRef.current?.querySelector<HTMLElement>(
					'[role="tab"][tabindex="0"]',
				);
				const regions = [searchRef.current, activeTab, contentRef.current];
				const activeEl = document.activeElement;
				const currentIdx =
					activeEl === searchRef.current
						? 0
						: navRef.current?.contains(activeEl)
							? 1
							: 2;
				for (let step = 1; step <= regions.length; step++) {
					const next =
						regions[
							(currentIdx + (e.shiftKey ? -step : step) + regions.length * step) %
								regions.length
						];
					if (next && (next.checkVisibility?.() ?? true)) {
						next.focus();
						return;
					}
				}
				return;
			}
			// Focus trap: keep Tab / Shift+Tab cycling within the dialog.
			if (e.key === "Tab") {
				const panel = panelRef.current;
				if (!panel) return;
				const focusables = Array.from(
					panel.querySelectorAll<HTMLElement>(
						'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
					),
				).filter(
					(el) => el.tabIndex >= 0 && (el.checkVisibility?.() ?? true),
				);
				if (focusables.length === 0) return;
				const first = focusables[0];
				const last = focusables[focusables.length - 1];
				const active = document.activeElement;
				if (e.shiftKey && (active === first || active === panel)) {
					e.preventDefault();
					last.focus();
				} else if (!e.shiftKey && active === last) {
					e.preventDefault();
					first.focus();
				}
			}
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, close]);

	// Deep-link: once the target tab is mounted, scroll + flash the requested
	// control. Retries across frames until the section renders it.
	useEffect(() => {
		if (!open || !focusId) return;

		let attempts = 0;
		let frame = 0;
		const tryFlash = () => {
			if (flashSettingsFocus(focusId) || attempts >= 20) return;
			attempts += 1;
			frame = requestAnimationFrame(tryFlash);
		};
		frame = requestAnimationFrame(tryFlash);
		return () => cancelAnimationFrame(frame);
	}, [open, focusId, tab]);

	const content = useMemo(() => renderSection(tab, isGuest), [tab, isGuest]);

	const orderedSections = useMemo(
		() => GROUP_ORDER.flatMap((group) => filteredSections.filter((s) => s.group === group)),
		[filteredSections],
	);
	// Roving tabindex: exactly one tab is reachable via Tab. Falls back to the
	// first match when the active tab is filtered out by the search query.
	const rovingTabId = orderedSections.some((s) => s.id === tab)
		? tab
		: orderedSections[0]?.id;

	function focusContent() {
		requestAnimationFrame(() => contentRef.current?.focus());
	}

	if (!mounted) return null;

	return (
		<div
			ref={rootRef}
			className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-8"
		>
			<button
				aria-label="Close settings"
				className={`absolute inset-0 cursor-default bg-black/60 backdrop-blur-[1px] transition-opacity duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] sm:duration-300 motion-reduce:transition-none ${
					visible ? "opacity-100" : "opacity-0"
				}`}
				onClick={close}
			/>

			<div
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-label="Settings"
				tabIndex={-1}
				className={`relative flex max-h-[88vh] w-full max-w-none flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl shadow-black/50 outline-none will-change-transform sm:h-full sm:max-h-[720px] sm:max-w-4xl sm:flex-row sm:rounded-xl transition duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] sm:duration-300 motion-reduce:transition-none motion-reduce:transform-none ${
					visible
						? "translate-y-0 sm:scale-100 sm:opacity-100"
						: "translate-y-full sm:translate-y-0 sm:scale-95 sm:opacity-0"
				}`}
			>
				<div
					aria-hidden
					className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30 sm:hidden"
				/>

				<nav
					ref={navRef}
					aria-label="Settings sections"
					className="hidden w-[220px] shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar py-3 sm:flex"
					onKeyDown={(e) => {
						const target = e.currentTarget.querySelector<HTMLElement>(
							'[role="tab"]:focus',
						);
						if (!target) return;
						const idx = orderedSections.findIndex(
							(s) => getSettingsTabId(s.id) === target.id,
						);
						if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
							e.preventDefault();
							const focused = orderedSections[idx];
							if (focused) setTab(focused.id);
							focusContent();
							return;
						}
						const isArrow = e.key === "ArrowDown" || e.key === "ArrowUp";
						if (!isArrow && e.key !== "Home" && e.key !== "End") return;
						e.preventDefault();
						if (e.key === "ArrowUp" && idx === 0) {
							searchRef.current?.focus();
							return;
						}
						const nextIdx =
							e.key === "Home"
								? 0
								: e.key === "End"
									? orderedSections.length - 1
									: (idx + (e.key === "ArrowDown" ? 1 : -1) + orderedSections.length) %
										orderedSections.length;
						const next = orderedSections[nextIdx];
						if (!next) return;
						setTab(next.id);
						document.getElementById(getSettingsTabId(next.id))?.focus();
					}}
				>
					<div className="px-4 pb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
						Settings
					</div>
					<div className="px-3 pb-3">
						<div className="relative">
							<Search
								className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
								aria-hidden
							/>
							<input
								ref={searchRef}
								type="text"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								onFocus={() => setSearchFocused(true)}
								onBlur={() => setSearchFocused(false)}
								onKeyDown={(e) => {
									if (e.key === "Escape" && query) {
										e.stopPropagation();
										setQuery("");
										return;
									}
									if (e.key === "Enter" && orderedSections.length > 0) {
										e.preventDefault();
										const target = orderedSections[0];
										const focusId =
											findSettingsFocusId(query, target.id) ??
											firstSettingsFocusId(target.id);
										setTab(target.id);
										if (focusId) {
											openSettings(target.id, focusId);
											return;
										}
										document.getElementById(getSettingsTabId(target.id))?.focus();
									}
									if (e.key === "ArrowDown" && orderedSections.length > 0) {
										e.preventDefault();
										document.getElementById(getSettingsTabId(orderedSections[0].id))?.focus();
									}
								}}
								placeholder="Search settings"
								aria-label="Search settings"
								className="w-full rounded-md border border-sidebar-border bg-background/60 py-1.5 pl-8 pr-9 text-[13px] text-sidebar-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-sidebar-border focus-visible:shadow-none focus-visible:outline-none"
							/>
							{/* Animated kbd hint — slide+fade between "/" and "Enter" */}
							<div
								className="absolute right-2 top-1/2 -translate-y-1/2 h-5 overflow-hidden rounded border border-sidebar-border bg-background transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
								style={{ width: searchFocused && query ? 44 : 20 }}
								aria-hidden
							>
								<kbd
									onClick={() => searchRef.current?.focus()}
									className="pointer-events-auto absolute inset-0 flex cursor-pointer select-none items-center justify-center px-1.5 py-0.5 font-mono text-[11px] leading-none text-muted-foreground"
									style={{
										opacity: !searchFocused || !query ? 1 : 0,
										transform: !searchFocused || !query ? "translateY(0)" : "translateY(-6px)",
										pointerEvents: !searchFocused || !query ? "auto" : "none",
										transition: "opacity 200ms cubic-bezier(0.32, 0.72, 0, 1), transform 200ms cubic-bezier(0.32, 0.72, 0, 1)",
									}}
									aria-hidden
								>
									/
								</kbd>
								<kbd
									className="pointer-events-none absolute inset-0 flex select-none items-center justify-center px-1.5 py-0.5 font-mono text-[11px] leading-none text-muted-foreground"
									style={{
										opacity: searchFocused && query ? 1 : 0,
										transform: searchFocused && query ? "translateY(0)" : "translateY(6px)",
										pointerEvents: searchFocused && query ? "auto" : "none",
										transition: "opacity 200ms cubic-bezier(0.32, 0.72, 0, 1), transform 200ms cubic-bezier(0.32, 0.72, 0, 1)",
									}}
									aria-hidden
								>
									Enter
								</kbd>
							</div>
						</div>
					</div>
					{filteredSections.length === 0 && (
						<div className="px-4 py-2 text-[13px] text-muted-foreground">
							No settings match “{query.trim()}”.
						</div>
					)}
					<div role="tablist" aria-orientation="vertical" aria-label="Settings sections">
					{GROUP_ORDER.map((group) => {
						const groupSections = filteredSections.filter(
							(section) => section.group === group,
						);
						if (groupSections.length === 0) return null;
						return (
							<div key={group} className="mb-2">
								<div className="px-4 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
									{group}
								</div>
								<ul role="presentation" className="flex flex-col gap-0.5 px-2">
									{groupSections.map((section) => (
										<SettingsTabButton
											key={section.id}
											section={section}
											active={tab === section.id}
											query={query}
											rovingTabId={rovingTabId}
											onSelect={setTab}
										/>
									))}
								</ul>
							</div>
						);
					})}
					</div>
				</nav>

				<div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-background px-3 py-2 sm:hidden">
					{visibleSections.map((section) => (
						<button
							key={section.id}
							onClick={() => setTab(section.id)}
							className={`shrink-0 rounded-md px-2.5 py-1 text-xs focus-visible:shadow-none focus-visible:outline-none focus-visible:bg-foreground/[0.22] focus-visible:text-foreground ${
								tab === section.id
									? "bg-sidebar-accent text-sidebar-accent-foreground"
									: "text-muted-foreground"
							}`}
						>
							{section.label}
						</button>
					))}
				</div>

				<div
					ref={contentRef}
					id="settings-tabpanel"
					role="tabpanel"
					aria-labelledby={getSettingsTabId(tab)}
					tabIndex={0}
					onKeyDown={(e) => {
						// ArrowLeft on the pane itself (not inside a control) hands
						// focus back to the active section in the sidebar.
						if (e.key !== "ArrowLeft" || e.target !== e.currentTarget) return;
						e.preventDefault();
						navRef.current
							?.querySelector<HTMLElement>('[role="tab"][tabindex="0"]')
							?.focus();
					}}
					className="relative min-w-0 flex-1 overflow-y-auto px-6 pb-12 pt-6 focus-visible:bg-foreground/[0.03] sm:px-10 sm:pt-8"
				>
					<button
						onClick={close}
						aria-label="Close settings"
						className="absolute right-4 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						<X className="h-4 w-4" />
					</button>

					<div className="mx-auto w-full max-w-3xl">{content}</div>
				</div>
			</div>
		</div>
	);
}
