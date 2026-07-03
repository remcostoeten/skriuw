"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
	ArrowRight,
	BookOpen,
	Calendar,
	CornerDownLeft,
	FilePlus2,
	FileText,
	FolderPlus,
	HelpCircle,
	PanelLeft,
	PanelRight,
	Search,
	Settings,
	SquarePen,
	Workflow,
	type LucideIcon,
} from "lucide-react";
import { formatShortcut } from "@/shared/lib/format-shortcut";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import { cn } from "@/shared/lib/utils";
import { getCommandFrecency, recordCommandUse } from "@/shared/ui/command-frecency";
import {
	COMMAND_BANGS,
	getCommandPaletteGroups,
	type CommandPaletteItem,
} from "@/shared/ui/command-palette-model";
import { dialogContentMotion, overlayFadeMotion } from "@/shared/ui/overlay-motion";

export type { CommandPaletteItem } from "@/shared/ui/command-palette-model";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title?: string;
	description?: string;
	items: CommandPaletteItem[];
	onQueryChange?: (query: string) => void;
};

function getCommandIcon(item: CommandPaletteItem): LucideIcon {
	const tokens = [item.id, item.label, item.description, item.group, ...(item.keywords ?? [])]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();

	if (tokens.includes("folder")) return FolderPlus;
	if (tokens.includes("settings") || tokens.includes("preferences")) return Settings;
	if (tokens.includes("sidebar")) return PanelLeft;
	if (tokens.includes("metadata") || tokens.includes("details")) return PanelRight;
	if (tokens.includes("journal") || tokens.includes("today")) return Calendar;
	if (tokens.includes("split") || tokens.includes("workflow")) return Workflow;
	if (tokens.includes("tour") || tokens.includes("help")) return HelpCircle;
	if (tokens.includes("route") || tokens.includes("navigate") || tokens.includes("go to")) {
		return BookOpen;
	}
	if (tokens.includes("new") || tokens.includes("create")) return FilePlus2;
	if (tokens.includes("note") || tokens.includes("editor")) return FileText;
	return SquarePen;
}

export function CommandPalette({
	open,
	onOpenChange,
	title = "Command palette",
	description = "Run actions without leaving the keyboard.",
	items,
	onQueryChange,
}: Props) {
	const [query, setQuery] = useState("");

	function updateQuery(next: string) {
		setQuery(next);
		onQueryChange?.(next);
	}
	const [activeIndex, setActiveIndex] = useState(0);
	const [isApple, setIsApple] = useState(false);
	const [frecency, setFrecency] = useState<Record<string, number>>({});
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const listboxId = useId();

	const groups = useMemo(
		() => getCommandPaletteGroups(items, query, frecency),
		[items, query, frecency],
	);
	const flatItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);

	useEffect(() => {
		if (!open) return;

		setQuery("");
		onQueryChange?.("");
		setActiveIndex(0);
		setFrecency(getCommandFrecency());
	}, [open, onQueryChange]);

	useEffect(() => {
		setActiveIndex(0);
	}, [query]);

	useEffect(() => {
		const platform =
			(navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
				?.platform ??
			navigator.platform ??
			"";
		setIsApple(/mac|iphone|ipad|ipod/i.test(platform));
	}, []);

	useEffect(() => {
		if (activeIndex < flatItems.length) return;
		setActiveIndex(flatItems.length > 0 ? flatItems.length - 1 : 0);
	}, [activeIndex, flatItems.length]);

	useEffect(() => {
		const activeElement = listRef.current?.querySelector<HTMLElement>(
			`[data-index="${activeIndex}"]`,
		);
		activeElement?.scrollIntoView({ block: "nearest" });
	}, [activeIndex]);

	function runItem(item: CommandPaletteItem) {
		triggerNativeFeedback("selection");
		recordCommandUse(item.id);
		onOpenChange(false);
		item.action();
	}

	function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setActiveIndex((index) =>
				flatItems.length > 0 ? Math.min(index + 1, flatItems.length - 1) : 0,
			);
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			setActiveIndex((index) => Math.max(index - 1, 0));
		} else if (event.key === "Enter") {
			event.preventDefault();
			const activeItem = flatItems[activeIndex];
			if (activeItem) runItem(activeItem);
		}
	}

	let runningIndex = -1;
	const activeItem = flatItems[activeIndex];

	return (
		<DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Overlay
					className={cn(
						"fixed inset-0 z-50 bg-black/55 backdrop-blur-[1px]",
						overlayFadeMotion,
					)}
				/>
				<DialogPrimitive.Content
					onOpenAutoFocus={(event) => {
						event.preventDefault();
						inputRef.current?.focus();
					}}
					className={cn(
						"fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-1.5rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl shadow-black/40 focus:outline-none focus:ring-0",
						dialogContentMotion,
					)}
				>
					<DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
					<DialogPrimitive.Description className="sr-only">
						{description}
					</DialogPrimitive.Description>

					<div className="flex items-center gap-2.5 border-b border-border px-3.5 py-3">
						<Search className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.7} />
						<input
							ref={inputRef}
							value={query}
							onChange={(event) => updateQuery(event.target.value)}
							onKeyDown={handleInputKeyDown}
							placeholder="Search notes or type a command..."
							role="combobox"
							aria-expanded={open}
							aria-controls={listboxId}
							aria-autocomplete="list"
							aria-activedescendant={
								activeItem ? `${listboxId}-item-${activeIndex}` : undefined
							}
							className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none focus:outline-none focus-visible:shadow-none focus-visible:outline-none placeholder:text-muted-foreground"
						/>
						<kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
							Esc
						</kbd>
					</div>

					<div
						ref={listRef}
						id={listboxId}
						role="listbox"
						className="max-h-[52vh] overflow-y-auto py-1.5"
					>
						{flatItems.length === 0 ? (
							<div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
								No results for “{query}”
							</div>
						) : (
							groups.map((group) => (
								<div key={group.group} className="px-1.5 pb-1">
									<div className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
										{group.group}
									</div>
									{group.items.map((item) => {
										runningIndex += 1;
										const index = runningIndex;
										const isActive = index === activeIndex;
										const Icon = getCommandIcon(item);

										return (
											<button
												key={item.id}
												type="button"
												id={`${listboxId}-item-${index}`}
												data-index={index}
												role="option"
												aria-selected={isActive}
												onMouseMove={() => setActiveIndex(index)}
												onClick={() => runItem(item)}
												className={cn(
													"flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors",
													isActive
														? "bg-sidebar-accent text-sidebar-accent-foreground"
														: "text-sidebar-foreground hover:bg-sidebar-accent/50",
												)}
											>
												<span
													className={cn(
														"shrink-0",
														isActive
															? "text-foreground"
															: "text-muted-foreground",
													)}
												>
													<Icon className="h-4 w-4" strokeWidth={1.7} />
												</span>
												<span className="truncate">{item.label}</span>
												{(item.hint ?? item.description) ? (
													<span className="min-w-0 truncate text-[11px] text-muted-foreground">
														{item.hint ?? item.description}
													</span>
												) : null}
												<span className="ml-auto flex shrink-0 items-center gap-1.5">
													{item.shortcut ? (
														<kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
															{formatShortcut(item.shortcut, isApple)}
														</kbd>
													) : null}
													{isActive ? (
														<CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />
													) : null}
												</span>
											</button>
										);
									})}
								</div>
							))
						)}
					</div>

					<div className="flex items-center gap-4 border-t border-border px-3.5 py-2 text-[11px] text-muted-foreground">
						<span className="flex items-center gap-1">
							<ArrowRight className="h-3 w-3 rotate-90" />
							<ArrowRight className="h-3 w-3 -rotate-90" />
							navigate
						</span>
						<span className="flex items-center gap-1">
							<CornerDownLeft className="h-3 w-3" />
							select
						</span>
						<span className="flex items-center gap-1.5">
							{Object.entries(COMMAND_BANGS).map(([key, bang]) => (
								<span key={key} className="flex items-center gap-1">
									<kbd className="rounded border border-border bg-muted px-1 text-[10px]">
										!{key}
									</kbd>
									<span className="hidden sm:inline">{bang.label.toLowerCase()}</span>
								</span>
							))}
						</span>
						<span className="ml-auto flex items-center gap-1">
							<kbd className="rounded border border-border bg-muted px-1 text-[10px]">
								{formatShortcut("mod+k", isApple)}
							</kbd>
							command palette
						</span>
					</div>
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
