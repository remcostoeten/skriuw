"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
	eventToCombo,
	formatBinding,
	getShortcutDef,
	getShortcutIds,
	useShortcutManager,
	type ShortcutId,
} from "@/core/shortcuts";
import {
	SectionHeader,
	Row,
	SettingsCard,
	GroupLabel,
} from "@/features/settings/components/settings-primitives";
import { cn } from "@/shared/lib/utils";

type GroupedShortcuts = { group: string; ids: ShortcutId[] };

function groupShortcuts(registry: ReturnType<typeof useShortcutManager>["registry"]): GroupedShortcuts[] {
	const groups: GroupedShortcuts[] = [];
	for (const id of getShortcutIds()) {
		const { group } = registry[id];
		const existing = groups.find((g) => g.group === group);
		if (existing) existing.ids.push(id);
		else groups.push({ group, ids: [id] });
	}
	return groups;
}

export function ShortcutsSection() {
	const { registry, bindings, setBinding, resetBinding, resetAllBindings } = useShortcutManager();
	const [recordingId, setRecordingId] = useState<ShortcutId | null>(null);
	const grouped = useMemo(() => groupShortcuts(registry), [registry]);
	const hasOverrides = Object.keys(bindings).length > 0;

	useEffect(() => {
		if (!recordingId) return;

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				setRecordingId(null);
				return;
			}
			const combo = eventToCombo(event);
			if (!combo) return;
			event.preventDefault();
			setBinding(recordingId as ShortcutId, combo);
			setRecordingId(null);
		}

		window.addEventListener("keydown", handleKeyDown, { capture: true });
		return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
	}, [recordingId, setBinding]);

	return (
		<>
			<SectionHeader
				title="Shortcuts"
				description="Rebind keyboard shortcuts. Changes are saved to this device."
			/>

			{hasOverrides ? (
				<div className="mb-2 flex justify-end">
					<button
						type="button"
						onClick={resetAllBindings}
						className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
					>
						<RotateCcw className="h-3.5 w-3.5" strokeWidth={1.8} />
						Reset all to defaults
					</button>
				</div>
			) : null}

			{grouped.map(({ group, ids }) => (
				<div key={group}>
					<GroupLabel>{group.toUpperCase()}</GroupLabel>
					<SettingsCard>
						{ids.map((id) => {
							const def = getShortcutDef(id);
							const isOverridden = id in bindings;
							const isRecording = recordingId === id;
							return (
								<Row key={id} title={def.label} description={def.description}>
									<div className="flex items-center gap-2">
										{isOverridden && !isRecording ? (
											<button
												type="button"
												aria-label={`Reset ${def.label} to default`}
												onClick={() => resetBinding(id)}
												className="text-muted-foreground transition-colors hover:text-foreground"
											>
												<RotateCcw className="h-3.5 w-3.5" strokeWidth={1.8} />
											</button>
										) : null}
										<button
											type="button"
											onClick={() => setRecordingId(isRecording ? null : id)}
											className={cn(
												"min-w-[7rem] border px-2.5 py-1.5 text-center font-mono text-[12px] transition-colors",
												isRecording
													? "border-ring bg-background text-foreground"
													: "border-border bg-card text-muted-foreground hover:border-ring hover:text-foreground",
											)}
										>
											{isRecording
												? "Press keys…"
												: formatBinding(bindings[id] ?? def.keys)}
										</button>
									</div>
								</Row>
							);
						})}
					</SettingsCard>
				</div>
			))}
		</>
	);
}
