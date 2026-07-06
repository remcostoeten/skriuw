"use client";

import { useState } from "react";
import { cn } from "@/shared/lib/utils";
import { MorphingLabel } from "@/shared/ui/morphing-label";

type Status = "idle" | "pending" | "success" | "failed";

function Spinner() {
	return (
		<span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current/30 border-t-current" />
	);
}

function CheckIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
			<path
				d="M5 13l4 4L19 7"
				stroke="currentColor"
				strokeWidth="2.4"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function AlertIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
			<path
				d="M12 8v5M12 16.5v.5M12 3l9 16H3L12 3z"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

type AsyncActionButtonProps = {
	onRun: () => Promise<{ ok: boolean; label?: string }>;
	idleIcon?: React.ReactNode;
	label?: string;
	pendingLabel?: string;
	successLabel?: string;
	failedLabel?: string;
	disabled?: boolean;
	disabledTitle?: string;
	resetAfterMs?: number;
};

/**
 * Single-button async action with idle/pending/success/failed states baked
 * into the label and border color, matching DeleteButton's visual language.
 */
export function AsyncActionButton({
	onRun,
	idleIcon,
	label = "Run",
	pendingLabel = "Running",
	successLabel = "Done",
	failedLabel = "Retry",
	disabled = false,
	disabledTitle,
	resetAfterMs = 2500,
}: AsyncActionButtonProps) {
	const [status, setStatus] = useState<Status>("idle");
	const [resultLabel, setResultLabel] = useState<string | null>(null);

	async function run() {
		setStatus("pending");
		setResultLabel(null);
		const result = await onRun();
		if (result.ok) {
			setStatus("success");
			setResultLabel(result.label ?? null);
			setTimeout(function reset() {
				setStatus("idle");
				setResultLabel(null);
			}, resetAfterMs);
			return;
		}
		setStatus("failed");
		setResultLabel(result.label ?? null);
	}

	const busy = status === "pending";
	const solid = status === "success";
	const danger = status === "failed";

	const frames = [
		{ key: "idle", label: [idleIcon, label] },
		{ key: "pending", label: [<Spinner key="spinner" />, pendingLabel] },
		{ key: "success", label: [<CheckIcon key="check" />, resultLabel ?? successLabel] },
		{ key: "failed", label: [<AlertIcon key="alert" />, resultLabel ?? failedLabel] },
	];

	return (
		<button
			type="button"
			onClick={run}
			disabled={disabled || busy}
			title={disabled ? disabledTitle : undefined}
			className={cn(
				"relative inline-flex h-9 items-center justify-center overflow-hidden rounded-md border text-sm font-medium transition-all duration-[350ms] ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring/70",
				busy && "cursor-default",
				disabled && "cursor-not-allowed opacity-50",
				!disabled &&
					danger &&
					"border-destructive/60 bg-destructive/15 text-destructive-foreground",
				!disabled && solid && "border-emerald-500/50 bg-emerald-500/15 text-emerald-500",
				!disabled &&
					!danger &&
					!solid &&
					"border-input bg-secondary text-secondary-foreground hover:bg-accent",
			)}
		>
			<MorphingLabel
				activeKey={status}
				framePadding="px-4"
				frames={frames.map((frame) => ({
					key: frame.key,
					content: (
						<>
							{frame.label[0]}
							{frame.label[1]}
						</>
					),
				}))}
			/>
		</button>
	);
}
