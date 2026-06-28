"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { MOOD_OPTIONS } from "@/features/journal/types";
import { useJournalEntries } from "@/features/journal/hooks/use-journal-entries";
import { SidebarSection } from "../sidebar-section";
import { MiniCalendar } from "./mini-calendar";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/shared/ui/context-menu";
import { copyTextToClipboard } from "@/features/desktop/context-menu-actions";

type JournalSectionProps = {
	isCollapsed: boolean;
	showHeader?: boolean;
	compactMode?: boolean;
	onToggleCollapse: () => void;
	onToggleVisibility?: () => void;
	onMoveUp?: () => void;
	onMoveDown?: () => void;
	canMoveUp?: boolean;
	canMoveDown?: boolean;
	isDraggable?: boolean;
	isDragging?: boolean;
	isDropTarget?: boolean;
	onDragStart?: (event: React.DragEvent) => void;
	onDragOver?: (event: React.DragEvent) => void;
	onDrop?: (event: React.DragEvent) => void;
	onDragEnd?: () => void;
};

export function JournalSection({
	isCollapsed,
	showHeader = true,
	compactMode = false,
	onToggleCollapse,
	onToggleVisibility,
	onMoveUp,
	onMoveDown,
	canMoveUp,
	canMoveDown,
	isDraggable,
	isDragging,
	isDropTarget,
	onDragStart,
	onDragOver,
	onDrop,
	onDragEnd,
}: JournalSectionProps) {
	const router = useRouter();
	const { data: entries = [] } = useJournalEntries();
	const [selectedDate, setSelectedDate] = useState(new Date());
	const [currentMonth, setCurrentMonth] = useState(new Date());
	const [view, setView] = useState<"calendar" | "entries">("calendar");

	const datesWithEntries = useMemo(() => entries.map((entry) => entry.dateKey), [entries]);
	const entryCount = entries.length;
	const selectedDateKey = format(selectedDate, "yyyy-MM-dd");

	const openJournalDate = (date: Date) => {
		const dateKey = format(date, "yyyy-MM-dd");
		router.push(`/app/journal?date=${dateKey}`);
	};

	const goToToday = () => {
		const today = new Date();
		setSelectedDate(today);
		setCurrentMonth(today);
	};

	// Recent entries for the "entries" view
	const recentEntries = useMemo(() => {
		return [...entries]
			.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
			.slice(0, 5);
	}, [entries]);

	const todayButton = (
		<button
			onClick={(event) => {
				event.stopPropagation();
				goToToday();
			}}
			className="flex h-6 items-center gap-1 px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
			title="Go to today"
		>
			<CalendarDays className="h-3 w-3" strokeWidth={1.5} />
			Today
		</button>
	);

	const viewTabs = (
		<div className="flex items-center gap-1">
			<button
				onClick={() => setView("calendar")}
				className={cn(
					"px-2 py-1 text-[10px] font-medium transition-colors",
					compactMode && "px-1.5 py-0.5",
					view === "calendar"
						? "border rounded-sm border-border bg-muted text-foreground"
						: "text-muted-foreground hover:bg-muted hover:text-foreground/75",
				)}
			>
				Calendar
			</button>
			<button
				onClick={() => setView("entries")}
				className={cn(
					"px-2 py-1 text-[10px] font-medium transition-colors",
					view === "entries"
						? "border rounded-sm border-border bg-muted text-foreground"
						: "text-muted-foreground hover:bg-muted hover:text-foreground/75",
				)}
			>
				Recent
			</button>
		</div>
	);

	return (
		<SidebarSection
			id="journal"
			title="Journal"
			isCollapsed={isCollapsed}
			showHeader={showHeader}
			showCollapseToggle
			titleSlot={viewTabs}
			compactMode={compactMode}
			itemCount={entryCount}
			onToggleCollapse={onToggleCollapse}
			onToggleVisibility={onToggleVisibility}
			onMoveUp={onMoveUp}
			onMoveDown={onMoveDown}
			canMoveUp={canMoveUp}
			canMoveDown={canMoveDown}
			actions={todayButton}
			isDraggable={isDraggable}
			isDragging={isDragging}
			isDropTarget={isDropTarget}
			onDragStart={onDragStart}
			onDragOver={onDragOver}
			onDrop={onDrop}
			onDragEnd={onDragEnd}
		>
			<div className={cn("space-y-2", compactMode && "space-y-1")}>
				{view === "calendar" ? (
					<div className={cn("overflow-hidden ", compactMode && "rounded-[16px]")}>
						<MiniCalendar
							selectedDate={selectedDate}
							currentMonth={currentMonth}
							datesWithEntries={datesWithEntries}
							onSelectDate={(date) => {
								setSelectedDate(date);
								openJournalDate(date);
							}}
							onChangeMonth={setCurrentMonth}
							onGoToToday={goToToday}
						/>
					</div>
				) : (
					<div>
						{" "}
						{recentEntries.length === 0 ? (
							<div
								className={cn(
									"border border-dashed border-border bg-accent/[0.08] px-3 py-3",
									compactMode && "px-2 py-2",
								)}
							>
								<p className="text-xs text-muted-foreground/70">
									No journal entries yet. Select a date and start writing.
								</p>
							</div>
						) : (
							recentEntries.map((entry) => {
								const mood = entry.mood ? MOOD_OPTIONS[entry.mood] : null;
								const entryDate = new Date(entry.dateKey + "T00:00:00");
								return (
									<ContextMenu key={entry.id}>
										<ContextMenuTrigger asChild>
											<button
												onClick={() => {
													setSelectedDate(entryDate);
													setCurrentMonth(entryDate);
													router.push(
														`/app/journal?date=${entry.dateKey}`,
													);
												}}
												className={cn(
													"flex w-full items-start gap-2 border-b border-border px-2.5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-accent/[0.14]",
													compactMode && "px-2 py-2",
												)}
											>
												<div className="flex min-w-0 flex-1 flex-col gap-1">
													<div className="flex items-center gap-1.5">
														<span className="text-[11px] font-medium text-foreground/72">
															{format(entryDate, "dd MM yyyy")}
														</span>
														{mood && (
															<span
																className={cn(
																	"text-[10px]",
																	mood.color,
																)}
															>
																{mood.icon}
															</span>
														)}
														{entry.dateKey === selectedDateKey && (
															<span className="text-[9px] text-muted-foreground/45">
																selected
															</span>
														)}
													</div>
													<p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/62">
														{entry.content.slice(0, 100)}
													</p>
													{entry.tags.length > 0 && (
														<div className="mt-0.5 flex flex-wrap gap-1">
															{entry.tags.slice(0, 3).map((tag) => (
																<span
																	key={tag}
																	className="border border-border bg-background/55 px-1.5 py-px text-[9px] text-muted-foreground/70"
																>
																	@{tag}
																</span>
															))}
															{entry.tags.length > 3 && (
																<span className="text-[9px] text-muted-foreground/50">
																	+{entry.tags.length - 3}
																</span>
															)}
														</div>
													)}
												</div>
											</button>
										</ContextMenuTrigger>
										<ContextMenuContent className="w-44">
											<ContextMenuItem
												onClick={() => {
													setSelectedDate(entryDate);
													setCurrentMonth(entryDate);
													router.push(
														`/app/journal?date=${entry.dateKey}`,
													);
												}}
											>
												Open entry
											</ContextMenuItem>
											<ContextMenuItem
												onClick={() => copyTextToClipboard(entry.dateKey)}
											>
												Copy date
											</ContextMenuItem>
											<ContextMenuSeparator />
											<ContextMenuItem
												disabled={!entry.content.trim()}
												onClick={() => copyTextToClipboard(entry.content)}
											>
												Copy entry
											</ContextMenuItem>
										</ContextMenuContent>
									</ContextMenu>
								);
							})
						)}
					</div>
				)}
			</div>
		</SidebarSection>
	);
}
