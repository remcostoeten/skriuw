"use client";

import { CalendarDays, Columns3, LayoutList, Table2 } from "lucide-react";
import { cn } from "@/shared/lib/utils";

export type TaskView = "list" | "board" | "table" | "calendar";

const TASK_VIEWS: Array<{
	id: TaskView;
	label: string;
	icon: typeof LayoutList;
}> = [
	{ id: "list", label: "List", icon: LayoutList },
	{ id: "board", label: "Board", icon: Columns3 },
	{ id: "table", label: "Table", icon: Table2 },
	{ id: "calendar", label: "Calendar", icon: CalendarDays },
];

export function TaskViewSwitcher({
	view,
	onChange,
}: {
	view: TaskView;
	onChange: (view: TaskView) => void;
}) {
	return (
		<div
			role="group"
			aria-label="Task view"
			className="flex min-w-max items-center gap-0.5 rounded-lg border bg-muted/35 p-1"
		>
			{TASK_VIEWS.map(({ id, label, icon: Icon }) => (
				<button
					type="button"
					key={id}
					aria-pressed={view === id}
					onClick={() => onChange(id)}
					className={cn(
						"inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-[background-color,color,box-shadow] duration-150 ease-out hover:text-foreground active:scale-[0.97] motion-reduce:transform-none motion-reduce:transition-none",
						view === id && "bg-background text-foreground shadow-sm",
					)}
				>
					<Icon className="size-3.5" />
					<span className="hidden sm:inline">{label}</span>
				</button>
			))}
		</div>
	);
}
