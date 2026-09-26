"use client";

import { useWorkspaceBackend } from "@/core/workspace-backend";
import {
	GroupLabel,
	SectionHeader,
	SettingsCard,
} from "@/features/settings/components/settings-primitives";
import { JournalCalendarSubscriptionManager } from "@/features/journal/components/journal-calendar-subscription-manager";
import { JournalCalendarFeedManager } from "@/features/journal/components/journal-calendar-feed-manager";

export function CalendarSection() {
	const backend = useWorkspaceBackend();
	const isServer = backend.mode === "server";

	return (
		<>
			<SectionHeader
				title="Calendar"
				description="Every calendar connection into and out of your journal — status, last sync, edit, and delete."
			/>

			<GroupLabel>INCOMING — AUTO-IMPORT</GroupLabel>
			<SettingsCard>
				<div className="py-4">
					<p className="mb-3 text-xs text-muted-foreground">
						External Google or iCloud calendars imported into your journal about once a
						day.
					</p>
					<JournalCalendarSubscriptionManager />
				</div>
			</SettingsCard>

			{isServer && (
				<>
					<GroupLabel>OUTGOING — LIVE FEED</GroupLabel>
					<SettingsCard>
						<div className="py-4">
							<p className="mb-3 text-xs text-muted-foreground">
								Secret links other calendar apps subscribe to. Journal changes
								appear whenever the app refreshes the feed.
							</p>
							<JournalCalendarFeedManager />
						</div>
					</SettingsCard>

					<GroupLabel>MOBILE</GroupLabel>
					<SettingsCard>
						<div className="py-4">
							<p className="text-xs text-muted-foreground">
								On the Skriuw mobile app, journal entries can sync straight into
								Apple Calendar after every save. Turn it on in the mobile app under
								Settings → Calendar.
							</p>
						</div>
					</SettingsCard>
				</>
			)}
		</>
	);
}
