"use client";

import { Switch } from "@/shared/ui/switch";
import { useIsGuestWorkspace } from "@/core/workspace-backend";
import { usePreferencesStore } from "@/features/settings/store";
import {
	GroupLabel,
	Row,
	SectionHeader,
	SettingsCard,
} from "@/features/settings/components/settings-primitives";

export function PrivacySection() {
	const isGuest = useIsGuestWorkspace();
	const analyticsEnabled = usePreferencesStore((state) => state.privacy.analyticsEnabled);
	const updatePrivacyPreference = usePreferencesStore((state) => state.updatePrivacyPreference);

	return (
		<>
			<SectionHeader
				title="Privacy"
				description="Control what Skriuw sends outside your workspace."
			/>

			<GroupLabel>ANALYTICS</GroupLabel>
			<SettingsCard>
				{isGuest ? (
					<Row
						focusId="usage-analytics"
						title="Usage analytics"
						description="Anonymous page views and product events are collected while you explore the demo. Create an account to manage analytics preferences."
					>
						<span className="text-xs text-muted-foreground">On</span>
					</Row>
				) : (
					<Row
						focusId="usage-analytics"
						title="Usage analytics"
						description="Tracked: anonymous page views and product events like note creation and sharing. On by default for accounts — turn off to opt out. No note content, no cookies. Sign-in events are recorded separately on the server."
					>
						<Switch
							checked={analyticsEnabled}
							onCheckedChange={(value) =>
								updatePrivacyPreference("analyticsEnabled", value)
							}
						/>
					</Row>
				)}
			</SettingsCard>
		</>
	);
}
