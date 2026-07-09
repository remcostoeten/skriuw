"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
	eventToCombo,
	formatBinding,
	getShortcutDef,
	getShortcutDefaultKeys,
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
import { settingsFocusDomId } from "@/features/settings/lib/settings-focus-anchor";
import { cn } from "@/shared/lib/utils";

type GroupedShortcuts = { group: string; ids: ShortcutId[] };
type ShortcutConflict = { label: string; combo: string };

function groupShortcuts(
	registry: ReturnType<typeof useShortcutManager>["registry"],
): GroupedShortcuts[] {
	const groups: GroupedShortcuts[] = [];
	const byGroup = new Map<string, GroupedShortcuts>();
	for (const id of getShortcutIds()) {
		const { group } = registry[id];
		const existing = byGroup.get(group);
		if (existing) {
			existing.ids.push(id);
		} else {
			const entry: GroupedShortcuts = { group, ids: [id] };
			byGroup.set(group, entry);
			groups.push(entry);
		}
	}
	return groups;
}

function combosFor(keys: string | string[]): string[] {
	return Array.isArray(keys) ? keys : [keys];
}

function findShortcutConflict(
	id: ShortcutId,
	combo: string,
	bindings: ReturnType<typeof useShortcutManager>["bindings"],
): ShortcutConflict | null {
	const def = getShortcutDef(id);
	for (const candidate of getShortcutIds()) {
		if (candidate === id) continue;
		const candidateDef = getShortcutDef(candidate);
		if (def.bindingGroup && candidateDef.bindingGroup === def.bindingGroup) continue;
		if (!combosFor(bindings[candidate] ?? getShortcutDefaultKeys(candidate)).includes(combo))
			continue;
		return { label: candidateDef.label, combo };
	}
	return null;
}

export function ShortcutsSection() {
	const { registry, bindings, setBinding, resetBinding, resetAllBindings } = useShortcutManager();
	const [recordingId, setRecordingId] = useState<ShortcutId | null>(null);
	const [conflict, setConflict] = useState<ShortcutConflict | null>(null);
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
			const nextConflict = findShortcutConflict(recordingId as ShortcutId, combo, bindings);
			if (nextConflict) {
				setConflict(nextConflict);
				setRecordingId(null);
				return;
			}
			setConflict(null);
			setBinding(recordingId as ShortcutId, combo);
			setRecordingId(null);
		}

		window.addEventListener("keydown", handleKeyDown, { capture: true });
		return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
	}, [bindings, recordingId, setBinding]);

	return (
		<>
			<SectionHeader
				title="Shortcuts"
				description="Rebind keyboard shortcuts. Changes are saved to this device."
			/>

			{conflict ? (
				<div
					role="status"
					className="mb-3 border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive"
				>
					{formatBinding(conflict.combo)} is already assigned to {conflict.label}. Pick a
					different combination or reset the existing shortcut first.
				</div>
			) : null}

			{hasOverrides ? (
				<div
					id={settingsFocusDomId("reset-all-to-defaults")}
					data-settings-focus="reset-all-to-defaults"
					className="mb-2 flex justify-end scroll-mt-24"
				>
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

			{grouped.map(({ group, ids }) => {
				const groupFocusId = `group-${group.toLowerCase().replace(/\s+/g, "-")}`;
				return (
					<div
						key={group}
						id={settingsFocusDomId(groupFocusId)}
						data-settings-focus={groupFocusId}
						className="scroll-mt-24"
					>
						<GroupLabel>{group.toUpperCase()}</GroupLabel>
						<SettingsCard>
							{ids.map((id) => {
								const def = getShortcutDef(id);
								const isOverridden = id in bindings;
								const isRecording = recordingId === id;
								const description = def.bindingGroup
									? `${def.description ?? "Shared shortcut."} Rebinding this also updates matching ${def.bindingGroup.replace(/-/g, " ")} shortcuts.`
									: def.description;
								return (
									<Row key={id} title={def.label} description={description}>
										<div className="flex items-center gap-2">
											{isOverridden && !isRecording ? (
												<button
													type="button"
													aria-label={`Reset ${def.label} to default`}
													onClick={() => {
														setConflict(null);
														resetBinding(id);
													}}
													className="text-muted-foreground transition-colors hover:text-foreground"
												>
													<RotateCcw
														className="h-3.5 w-3.5"
														strokeWidth={1.8}
													/>
												</button>
											) : null}
											<button
												type="button"
												onClick={() => {
													setConflict(null);
													setRecordingId(isRecording ? null : id);
												}}
												className={cn(
													"min-w-[7rem] border px-2.5 py-1.5 text-center font-mono text-[12px] transition-colors",
													isRecording
														? "border-ring bg-background text-foreground"
														: "border-border bg-card text-muted-foreground hover:border-ring hover:text-foreground",
												)}
											>
												{isRecording
													? "Press keys…"
													: formatBinding(
															bindings[id] ??
																getShortcutDefaultKeys(id),
														)}
											</button>
										</div>
									</Row>
								);
							})}
						</SettingsCard>
					</div>
				);
			})}
		</>
	);
}
