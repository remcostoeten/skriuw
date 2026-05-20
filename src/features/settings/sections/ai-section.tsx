"use client";

import dynamic from "next/dynamic";
import { useAuthSnapshot } from "@/platform/auth/use-auth";

function SettingsPanelLoading({ rows = 3 }: { rows?: number }) {
	return (
		<div className="rounded-lg border border-border/60 bg-card/40 px-5" aria-hidden="true">
			{Array.from({ length: rows }, (_, index) => (
				<div
					key={index}
					className="flex items-start justify-between gap-6 border-b border-border/50 py-4 last:border-b-0"
				>
					<div className="min-w-0 flex-1 space-y-2">
						<div className="h-px w-32 bg-foreground/[0.08]" />
						<div className="h-px w-56 max-w-full bg-foreground/[0.06]" />
					</div>
					<div className="h-8 w-40 shrink-0 border border-border bg-background" />
				</div>
			))}
		</div>
	);
}

const AiSettings = dynamic(
	() =>
		import("@/features/settings/components/ai-settings").then((mod) => ({
			default: mod.AiSettings,
		})),
	{ ssr: false, loading: () => <SettingsPanelLoading rows={2} /> },
);

const AiKeysManager = dynamic(
	() =>
		import("@/features/settings/components/ai/ai-keys-manager").then((mod) => ({
			default: mod.AiKeysManager,
		})),
	{ ssr: false, loading: () => <SettingsPanelLoading rows={3} /> },
);

export function AiSection() {
	const auth = useAuthSnapshot();
	const isSignedIn = auth.phase === "authenticated" && auth.user !== null;

	return (
		<div className="space-y-6">
			<div>
				<h3 className="text-sm font-medium text-foreground">AI</h3>
				<p className="text-xs text-muted-foreground mt-1">
					Bring-your-own-key configuration and usage diagnostics.
				</p>
			</div>
			<div className="border-t border-border" />
			<AiKeysManager isSignedIn={isSignedIn} />
			<div className="border-t border-border" />
			<AiSettings />
		</div>
	);
}
