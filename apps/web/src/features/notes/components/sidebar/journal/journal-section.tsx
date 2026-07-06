"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useJournalEntries } from "@/features/journal/hooks/use-journal-entries";
import { SidebarSection } from "../sidebar-section";
import { MiniCalendar } from "./mini-calendar";

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

	const datesWithEntries = useMemo(() => entries.map((entry) => entry.dateKey), [entries]);
	const entryCount = entries.length;

	const openJournalDate = (date: Date) => {
		const dateKey = format(date, "yyyy-MM-dd");
		router.push(`/app/journal?date=${dateKey}`);
	};

	const goToToday = () => {
		const today = new Date();
		setSelectedDate(today);
		setCurrentMonth(today);
	};

	const todayButton = (
		<button
			type="button"
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

	return (
		<SidebarSection
			id="journal"
			title="Journal"
			isCollapsed={isCollapsed}
			showHeader={showHeader}
			showCollapseToggle
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
					/>
				</div>
			</div>
		</SidebarSection>
	);
}
