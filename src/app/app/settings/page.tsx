import { Suspense } from "react";
import { SettingsPage } from "@/features/settings/components/settings-page";
import { SettingsLoadingShell } from "@/features/layout/components/app-loading-shell";

export default function SettingsRoute() {
	return (
		<Suspense fallback={<SettingsLoadingShell />}>
			<SettingsPage />
		</Suspense>
	);
}
