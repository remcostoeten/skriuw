"use client";

import { Switch } from "@/shared/ui/switch";
import { usePreferencesStore } from "@/features/settings/store";
import {
	GroupLabel,
	Row,
	SectionHeader,
	SettingsCard,
} from "@/features/settings/components/settings-primitives";

export function PrivacySection() {
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
				<Row
					title="Usage analytics"
					description="Anonymous page views and product events to a self-hosted analytics service. No note content, no cookies."
				>
					<Switch
						checked={analyticsEnabled}
						onCheckedChange={(value) => updatePrivacyPreference("analyticsEnabled", value)}
					/>
				</Row>
			</SettingsCard>
		</>
	);
}
