"use client";

import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/shared/ui/dialog";
import { JournalCalendarSubscriptionManager } from "./journal-calendar-subscription-manager";

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export function JournalCalendarSubscriptionsDialog({ open, onOpenChange }: Props) {
	const [view, setView] = useState<"list" | "wizard">("list");

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) setView("list");
				onOpenChange(next);
			}}
		>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{view === "wizard" ? "Add a calendar" : "External calendar subscriptions"}
					</DialogTitle>
					<DialogDescription>
						{view === "wizard"
							? "A short guided setup — Skriuw walks you through getting the link and testing it."
							: "Connected calendars are imported into your journal about once a day."}
					</DialogDescription>
				</DialogHeader>
				<JournalCalendarSubscriptionManager onViewChange={setView} />
			</DialogContent>
		</Dialog>
	);
}
