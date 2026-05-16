import * as React from "react";
import { DayPicker, type ClassNames, DayFlag, SelectionState, UI } from "react-day-picker";

import { cn } from "@/shared/lib/utils";
import { buttonVariants } from "@/shared/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  const mergedClassNames: Partial<ClassNames> = {
    [UI.Root]: cn("p-3", classNames?.[UI.Root]),
    [UI.Months]: cn("flex flex-col gap-4 sm:flex-row sm:gap-6", classNames?.[UI.Months]),
    [UI.Month]: cn("space-y-4", classNames?.[UI.Month]),
    [UI.MonthCaption]: cn("relative flex items-center justify-center pt-1", classNames?.[UI.MonthCaption]),
    [UI.CaptionLabel]: cn("text-sm font-medium text-foreground", classNames?.[UI.CaptionLabel]),
    [UI.Nav]: cn("flex items-center gap-1", classNames?.[UI.Nav]),
    [UI.PreviousMonthButton]: cn(
      buttonVariants({ variant: "outline" }),
      "absolute left-1 size-7 bg-transparent p-0 opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      classNames?.[UI.PreviousMonthButton],
    ),
    [UI.NextMonthButton]: cn(
      buttonVariants({ variant: "outline" }),
      "absolute right-1 size-7 bg-transparent p-0 opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      classNames?.[UI.NextMonthButton],
    ),
    [UI.MonthGrid]: cn("w-full border-collapse", classNames?.[UI.MonthGrid]),
    [UI.Weekdays]: cn("flex", classNames?.[UI.Weekdays]),
    [UI.Weekday]: cn("w-9 rounded-md text-[0.8rem] font-normal text-muted-foreground", classNames?.[UI.Weekday]),
    [UI.Week]: cn("mt-2 flex w-full", classNames?.[UI.Week]),
    [UI.Day]: cn("relative size-9 text-center text-sm focus-within:relative focus-within:z-20", classNames?.[UI.Day]),
    [UI.DayButton]: cn(
      buttonVariants({ variant: "ghost" }),
      "size-9 p-0 font-normal aria-selected:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      classNames?.[UI.DayButton],
    ),
    [DayFlag.today]: cn(
      "border border-border",
      classNames?.[DayFlag.today],
    ),
    [DayFlag.outside]: cn(
      "text-muted-foreground/40 opacity-50",
      classNames?.[DayFlag.outside],
    ),
    [DayFlag.disabled]: cn(
      "text-muted-foreground/30 opacity-50",
      classNames?.[DayFlag.disabled],
    ),
    [SelectionState.selected]: cn(
      "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
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
