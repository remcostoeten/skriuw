"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/shared/ui/dialog";
import { JournalCalendarFeedManager } from "./journal-calendar-feed-manager";

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export function JournalCalendarFeedDialog({ open, onOpenChange }: Props) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Live calendar subscription</DialogTitle>
					<DialogDescription>
						Subscribe once in Apple Calendar, Outlook, or Google Calendar. Journal
						changes then appear when that app refreshes the feed.
					</DialogDescription>
				</DialogHeader>
				<JournalCalendarFeedManager />
			</DialogContent>
		</Dialog>
	);
}
