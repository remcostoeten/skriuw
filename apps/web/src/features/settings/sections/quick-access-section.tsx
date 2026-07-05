"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
	eventToCombo,
	formatBinding,
	getShortcutDef,
	getShortcutIds,
	useShortcutManager,
} from "@/core/shortcuts";
import {
	comboHasModifier,
	parseDurationMs,
	type GotoIndicatorPosition,
	type GotoIndicatorSize,
} from "@/core/quick-access";
import {
	GroupLabel,
	Row,
	SectionHeader,
	SettingsCard,
} from "@/features/settings/components/settings-primitives";
import { usePreferencesStore } from "@/features/settings/store";
import { cn } from "@/shared/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Switch } from "@/shared/ui/switch";

const GOTO_SHORTCUT_ID = "app.gotoMode";

const POSITION_LABELS: Record<GotoIndicatorPosition, string> = {
	"top-right": "Top right",
	"top-left": "Top left",
	"bottom-right": "Bottom right",
	"bottom-left": "Bottom left",
};

const SIZE_LABELS: Record<GotoIndicatorSize, string> = {
	small: "Small",
	medium: "Medium",
	large: "Large",
};

function combosFor(keys: string | string[]): string[] {
	return Array.isArray(keys) ? keys : [keys];
}

export function QuickAccessSection() {
	const quickAccess = usePreferencesStore((state) => state.quickAccess);
	const update = usePreferencesStore((state) => state.updateQuickAccessPreference);
	const { bindings, setBinding, resetBinding } = useShortcutManager();

	const [isRecording, setIsRecording] = useState(false);
	const [recordError, setRecordError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [durationDraft, setDurationDraft] = useState(quickAccess.gotoModeDuration);

	const durationValid = parseDurationMs(durationDraft) !== null;
	const isOverridden = GOTO_SHORTCUT_ID in bindings;

	useEffect(() => {
		if (!isRecording) return;

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				setIsRecording(false);
				return;
			}
			const combo = eventToCombo(event);
			if (!combo) return;
			event.preventDefault();
			if (combo === "escape") {
				setRecordError("Escape always cancels go-to mode and cannot activate it.");
				setIsRecording(false);
				return;
			}
			if (quickAccess.allowInEditor && !comboHasModifier(combo)) {
				setRecordError(
					"With go-to mode allowed inside notes, the shortcut must include a modifier (e.g. Ctrl or Alt) — a plain key would fire while typing.",
				);
				setIsRecording(false);
				return;
			}
			for (const candidate of getShortcutIds()) {
				if (candidate === GOTO_SHORTCUT_ID) continue;
				const candidateDef = getShortcutDef(candidate);
				if (!combosFor(bindings[candidate] ?? candidateDef.keys).includes(combo)) continue;
				setRecordError(
					`${formatBinding(combo)} is already assigned to ${candidateDef.label}.`,
				);
				setIsRecording(false);
				return;
			}
			setRecordError(null);
			setBinding(GOTO_SHORTCUT_ID, combo);
			setIsRecording(false);
		}

		window.addEventListener("keydown", handleKeyDown, { capture: true });
		return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
	}, [bindings, isRecording, quickAccess.allowInEditor, setBinding]);

	function handleAllowInEditorChange(checked: boolean) {
		setNotice(null);
		if (checked) {
			const combos = combosFor(
				bindings[GOTO_SHORTCUT_ID] ?? getShortcutDef(GOTO_SHORTCUT_ID).keys,
			);
			if (!combos.every(comboHasModifier)) {
				resetBinding(GOTO_SHORTCUT_ID);
				setNotice(
					"The activation shortcut was reset to its default because a plain key would fire on every keystroke while writing.",
				);
			}
		}
		update("allowInEditor", checked);
	}

	function commitDuration(value: string) {
		setDurationDraft(value);
		if (parseDurationMs(value) !== null) {
			update("gotoModeDuration", value);
		}
	}

	return (
		<>
			<SectionHeader
				title="Quick Access"
				description="Jump anywhere with the keyboard. Activate go-to mode, then press a target's key."
			/>

			{recordError ? (
				<div
					role="status"
					className="mb-3 border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive"
				>
					{recordError}
				</div>
			) : null}

			{notice ? (
				<div
					role="status"
					className="mb-3 border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground"
				>
					{notice}
				</div>
			) : null}

			<GroupLabel>GO-TO MODE</GroupLabel>
			<SettingsCard>
				<Row title="Enable Quick Access" description="Turn go-to mode on or off entirely.">
					<Switch
						checked={quickAccess.enabled}
						onCheckedChange={(checked) => update("enabled", checked)}
					/>
				</Row>
				<Row
					title="Allow inside notes"
					description="Let the activation shortcut fire while typing in a note. Requires a modifier combo like Ctrl+G — plain letters and digits are rejected."
					disabled={!quickAccess.enabled}
				>
					<Switch
						checked={quickAccess.allowInEditor}
						onCheckedChange={handleAllowInEditorChange}
						disabled={!quickAccess.enabled}
					/>
				</Row>
				<Row
					title="Activation shortcut"
					description="Enters go-to mode and shows the navigation hints."
					disabled={!quickAccess.enabled}
				>
					<div className="flex items-center gap-2">
						{isOverridden && !isRecording ? (
							<button
								type="button"
								aria-label="Reset go-to shortcut to default"
								onClick={() => {
									setRecordError(null);
									resetBinding(GOTO_SHORTCUT_ID);
								}}
								className="text-muted-foreground transition-colors hover:text-foreground"
							>
								<RotateCcw className="h-3.5 w-3.5" strokeWidth={1.8} />
							</button>
						) : null}
						<button
							type="button"
							disabled={!quickAccess.enabled}
							onClick={() => {
								setRecordError(null);
								setIsRecording((prev) => !prev);
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
										bindings[GOTO_SHORTCUT_ID] ??
											getShortcutDef(GOTO_SHORTCUT_ID).keys,
									)}
						</button>
					</div>
				</Row>
				<Row
					title="Duration"
					description='How long go-to mode stays active without input. Accepts "2s", "1500ms", "0.5s".'
					disabled={!quickAccess.enabled}
				>
					<div className="flex flex-col items-end gap-1">
						<input
							type="text"
							disabled={!quickAccess.enabled}
							value={durationDraft}
							onChange={(event) => commitDuration(event.target.value)}
							onBlur={() => {
								if (!durationValid) setDurationDraft(quickAccess.gotoModeDuration);
							}}
							aria-invalid={!durationValid}
							aria-label="Go-to mode duration"
							className={cn(
								"w-24 border bg-card px-2.5 py-1.5 text-center font-mono text-[12px] text-foreground outline-none transition-colors focus:border-ring",
								durationValid ? "border-border" : "border-destructive/60",
							)}
						/>
						{!durationValid ? (
							<span className="text-[11px] text-destructive">
								Use a value between 100ms and 60s.
							</span>
						) : null}
					</div>
				</Row>
			</SettingsCard>

			<GroupLabel>INDICATORS</GroupLabel>
			<SettingsCard>
				<Row
					title="Show indicators"
					description="Display key hints on targets while go-to mode is active."
					disabled={!quickAccess.enabled}
				>
					<Switch
						checked={quickAccess.showIndicators}
						onCheckedChange={(checked) => update("showIndicators", checked)}
						disabled={!quickAccess.enabled}
					/>
				</Row>
				<Row
					title="Position"
					description="Corner of the target the hint anchors to."
					disabled={!quickAccess.enabled}
				>
					<Select
						value={quickAccess.indicatorPosition}
						onValueChange={(value) =>
							update("indicatorPosition", value as GotoIndicatorPosition)
						}
						disabled={!quickAccess.enabled || !quickAccess.showIndicators}
					>
						<SelectTrigger className="h-8 w-36">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{Object.entries(POSITION_LABELS).map(([value, label]) => (
								<SelectItem key={value} value={value}>
									{label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Row>
				<Row title="Size" description="Hint badge size." disabled={!quickAccess.enabled}>
					<Select
						value={quickAccess.indicatorSize}
						onValueChange={(value) =>
							update("indicatorSize", value as GotoIndicatorSize)
						}
						disabled={!quickAccess.enabled || !quickAccess.showIndicators}
					>
						<SelectTrigger className="h-8 w-36">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{Object.entries(SIZE_LABELS).map(([value, label]) => (
								<SelectItem key={value} value={value}>
									{label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Row>
				<Row
					title="Opacity"
					description="Hint badge opacity."
					disabled={!quickAccess.enabled}
				>
					<div className="flex items-center gap-2">
						<input
							type="range"
							min={0.2}
							max={1}
							step={0.05}
							value={quickAccess.indicatorOpacity}
							onChange={(event) =>
								update("indicatorOpacity", Number.parseFloat(event.target.value))
							}
							disabled={!quickAccess.enabled || !quickAccess.showIndicators}
							aria-label="Indicator opacity"
							className="w-32 accent-foreground"
						/>
						<span className="w-10 text-right font-mono text-[12px] text-muted-foreground tabular-nums">
							{Math.round(quickAccess.indicatorOpacity * 100)}%
						</span>
					</div>
				</Row>
			</SettingsCard>
		</>
	);
}
