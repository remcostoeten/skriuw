"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { saveSeedBundle } from "../server/actions";
import { useSeedEditorStore } from "../store";

export function SeedToolbar() {
	const { bundleId, bundleName, folders, notes, dirty, setBundleName, markSaved } =
		useSeedEditorStore();
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	function handleSave() {
		setError(null);
		startTransition(async () => {
			try {
				await saveSeedBundle({
					id: bundleId,
					name: bundleName,
					payload: { folders, notes, tags: [], journals: [] },
				});
				markSaved();
			} catch (err) {
				setError(err instanceof Error ? err.message : "Save failed");
			}
		});
	}

	return (
		<header className="flex items-center gap-3 px-4 py-2 border-b border-border/40 bg-background/80 backdrop-blur-sm">
			<input
				className="flex-1 min-w-0 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/50"
				value={bundleName}
				onChange={(e) => setBundleName(e.target.value)}
				placeholder="Bundle name"
			/>

			<div className="flex items-center gap-2">
				{error && <span className="text-xs text-destructive">{error}</span>}
				<span
					className={cn("text-xs", dirty ? "text-amber-500" : "text-muted-foreground/50")}
				>
					{isPending ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}
				</span>
				<button
					type="button"
					disabled={!dirty || isPending}
					onClick={handleSave}
					className={cn(
						"flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
						dirty && !isPending
							? "bg-primary text-primary-foreground hover:bg-primary/90"
							: "bg-muted text-muted-foreground cursor-not-allowed opacity-60",
					)}
				>
					<Save className="h-3.5 w-3.5" />
					Save
				</button>
			</div>
		</header>
	);
}
