"use client";

import { useMemo, useState } from "react";
import { CalendarArrowDown } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/ui/dialog";
import { cn } from "@/shared/lib/utils";
import type { JournalEntry } from "@/domain/journal/models";
import { buildJournalIcs, filterEntriesByRange } from "@/domain/journal/ics-export";
import { useWorkspacePeople } from "@/features/people/hooks/use-people";
import { showUserToast } from "@/shared/lib/user-toast";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	entries: JournalEntry[];
};

type RangeMode = "all" | "range";

export function JournalIcsExportDialog({ open, onOpenChange, entries }: Props) {
	const [mode, setMode] = useState<RangeMode>("all");
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const { data: people = [] } = useWorkspacePeople();

	const personNameById = useMemo(
		() => new Map(people.map((person) => [person.id, person.name])),
		[people],
	);

	const selectedCount =
		mode === "all"
			? entries.length
			: filterEntriesByRange(entries, from || undefined, to || undefined).length;

	function handleExport() {
		const ics = buildJournalIcs(entries, {
			from: mode === "range" && from ? from : undefined,
			to: mode === "range" && to ? to : undefined,
			resolvePersonName: (id) => personNameById.get(id),
		});
		const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = "skriuw-journal.ics";
		anchor.click();
		URL.revokeObjectURL(url);
		showUserToast(
			`Exported ${selectedCount} ${selectedCount === 1 ? "entry" : "entries"} — open the file to add it to Apple Calendar, Outlook, or Google Calendar.`,
			"success",
		);
		onOpenChange(false);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-sm">
				<DialogHeader>
					<DialogTitle>Export journal to calendar</DialogTitle>
					<DialogDescription>
						Downloads an .ics file with one all-day event per entry — mood, tags, and
						people ride along in the event description. Opening the file imports it into
						Apple Calendar, Outlook, or Google Calendar.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-3">
					<div className="flex items-center gap-1.5">
						{(
							[
								{ id: "all", label: "All entries" },
								{ id: "range", label: "Date range" },
							] as const
						).map((option) => (
							<button
								key={option.id}
								type="button"
								onClick={() => setMode(option.id)}
								aria-pressed={mode === option.id}
								className={cn(
									"h-7 rounded-md border px-2.5 text-xs font-medium transition-colors",
									mode === option.id
										? "border-ring bg-muted text-foreground"
										: "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
								)}
							>
								{option.label}
							</button>
						))}
					</div>

					{mode === "range" && (
						<div className="flex items-center gap-2">
							<label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] font-medium text-muted-foreground">
								From
								<input
									type="date"
									value={from}
									max={to || undefined}
									onChange={(event) => setFrom(event.target.value)}
									className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring"
								/>
							</label>
							<label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] font-medium text-muted-foreground">
								Till
								<input
									type="date"
									value={to}
									min={from || undefined}
									onChange={(event) => setTo(event.target.value)}
									className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring"
								/>
							</label>
						</div>
					)}

					<p className="text-xs text-muted-foreground">
						{selectedCount} {selectedCount === 1 ? "entry" : "entries"} selected
					</p>
				</div>

				<DialogFooter>
					<button
						type="button"
						onClick={handleExport}
						disabled={selectedCount === 0}
						className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
					>
						<CalendarArrowDown className="h-3.5 w-3.5" />
						Download .ics
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
