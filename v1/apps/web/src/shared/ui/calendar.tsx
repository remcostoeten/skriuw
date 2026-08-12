import * as React from "react";
import { DayPicker, type ClassNames, DayFlag, SelectionState, UI } from "react-day-picker";

import { cn } from "@/shared/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
	const mergedClassNames: Partial<ClassNames> = {
		[UI.Root]: cn("p-3", classNames?.[UI.Root]),
		[UI.Months]: cn("relative flex flex-col", classNames?.[UI.Months]),
		[UI.Month]: cn("space-y-3", classNames?.[UI.Month]),
		[UI.MonthCaption]: cn(
			"flex h-8 items-center justify-center",
			classNames?.[UI.MonthCaption],
		),
		[UI.CaptionLabel]: cn(
			"text-sm font-semibold text-foreground",
			classNames?.[UI.CaptionLabel],
		),
		[UI.Nav]: cn(
			"absolute inset-x-0 top-0 z-10 flex h-8 items-center justify-between px-0.5",
			classNames?.[UI.Nav],
		),
		[UI.PreviousMonthButton]: cn(
			"flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover disabled:pointer-events-none disabled:opacity-30",
			classNames?.[UI.PreviousMonthButton],
		),
		[UI.NextMonthButton]: cn(
			"flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover disabled:pointer-events-none disabled:opacity-30",
			classNames?.[UI.NextMonthButton],
		),
		[UI.MonthGrid]: cn("w-full border-collapse", classNames?.[UI.MonthGrid]),
		[UI.Weekdays]: cn("flex", classNames?.[UI.Weekdays]),
		[UI.Weekday]: cn(
			"w-9 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground/60",
			classNames?.[UI.Weekday],
		),
		[UI.Week]: cn("mt-1 flex w-full", classNames?.[UI.Week]),
		[UI.Day]: cn(
			"relative size-9 p-0 text-center text-sm focus-within:relative focus-within:z-20",
			classNames?.[UI.Day],
		),
		[UI.DayButton]: cn(
			"flex size-9 items-center justify-center rounded-full p-0 font-normal text-foreground/80 transition-colors hover:bg-accent hover:text-foreground aria-selected:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
			classNames?.[UI.DayButton],
		),
		[DayFlag.today]: cn(
			"[&_button]:font-semibold [&_button]:text-foreground [&_button]:ring-1 [&_button]:ring-inset [&_button]:ring-border",
			classNames?.[DayFlag.today],
		),
		[DayFlag.outside]: cn("text-muted-foreground/30 opacity-60", classNames?.[DayFlag.outside]),
		[DayFlag.disabled]: cn(
			"text-muted-foreground/25 opacity-50",
			classNames?.[DayFlag.disabled],
		),
		[SelectionState.selected]: cn(
			"[&_button]:bg-primary [&_button]:text-primary-foreground [&_button]:font-semibold [&_button]:ring-0 [&_button]:hover:bg-primary [&_button]:hover:text-primary-foreground",
			classNames?.[SelectionState.selected],
		),
		[SelectionState.range_middle]: cn(
			"aria-selected:bg-accent aria-selected:text-accent-foreground",
			classNames?.[SelectionState.range_middle],
		),
		[DayFlag.hidden]: cn("invisible", classNames?.[DayFlag.hidden]),
	};

	return (
		<DayPicker
			showOutsideDays={showOutsideDays}
			className={cn("p-0", className)}
			classNames={mergedClassNames}
			{...props}
		/>
	);
}
Calendar.displayName = "Calendar";

export { Calendar };
