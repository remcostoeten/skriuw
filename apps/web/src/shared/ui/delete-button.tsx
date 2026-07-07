"use client";

import { useState } from "react";
import { cn } from "@/shared/lib/utils";
import { MorphingLabel } from "@/shared/ui/morphing-label";

type Status = "idle" | "confirm" | "pending" | "success" | "failed";

type Frame = {
	key: Status;
	label: string;
};

function Spinner() {
	return (
		<span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current/30 border-t-current" />
	);
}

function TrashIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
			<path
				d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
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

function frameIcon(key: Status) {
	if (key === "pending") return <Spinner />;
	if (key === "success") return <CheckIcon />;
	if (key === "failed") return <AlertIcon />;
	if (key === "idle") return <TrashIcon />;
	return null;
}

type DeleteButtonProps = {
	onDelete: () => Promise<boolean>;
	label?: string;
	confirmLabel?: string;
	pendingLabel?: string;
	successLabel?: string;
	failedLabel?: string;
	disabled?: boolean;
};

export function DeleteButton({
	onDelete,
	label = "Delete",
	confirmLabel = "Confirm delete",
	pendingLabel = "Deleting",
	successLabel = "Deleted",
	failedLabel = "Retry delete",
	disabled = false,
}: DeleteButtonProps) {
	const [status, setStatus] = useState<Status>("idle");

	const frames: Frame[] = [
		{ key: "idle", label },
		{ key: "confirm", label: confirmLabel },
		{ key: "pending", label: pendingLabel },
		{ key: "success", label: successLabel },
		{ key: "failed", label: failedLabel },
	];

	async function confirm() {
		setStatus("pending");
		const ok = await onDelete();
		if (ok) {
			setStatus("success");
			setTimeout(function reset() {
				setStatus("idle");
			}, 1500);
			return;
		}
		setStatus("failed");
	}

	function handleClick() {
		if (status === "idle") {
			setStatus("confirm");
			return;
		}
		if (status === "confirm" || status === "failed") {
			confirm();
			return;
		}
	}

	function cancel() {
		setStatus("idle");
	}

	const danger = status === "confirm" || status === "failed";
	const solid = status === "success";
	const busy = status === "pending";
	const showCancel = status === "confirm" || status === "failed";

	return (
		<div className="flex items-center gap-2">
			<button
				type="button"
				onClick={handleClick}
				disabled={disabled || busy || solid}
				className={cn(
					"relative inline-flex h-10 items-center justify-center overflow-hidden rounded-md border text-sm font-medium transition-all duration-[350ms] ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring/70",
					(solid || busy) && "cursor-default",
					disabled && "cursor-not-allowed opacity-50",
					!disabled &&
						danger &&
						"border-destructive/60 bg-destructive/15 text-destructive-foreground",
					!disabled &&
						!danger &&
						!solid &&
						"border-input bg-secondary text-secondary-foreground hover:bg-accent",
					!disabled && solid && "border-input bg-accent text-accent-foreground",
				)}
			>
				<MorphingLabel
					activeKey={status}
					framePadding="px-4"
					frames={frames.map((frame) => ({
						key: frame.key,
						content: (
							<>
								{frameIcon(frame.key)}
								{frame.label}
							</>
						),
					}))}
				/>
			</button>

			{!disabled ? (
				<button
					type="button"
					onClick={cancel}
					className={cn(
						"h-10 overflow-hidden whitespace-nowrap rounded-md border border-input bg-background text-sm font-medium text-muted-foreground transition-all duration-[350ms] ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-accent hover:text-accent-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring/70",
						showCancel
							? "max-w-[160px] cursor-pointer px-4 opacity-100"
							: "pointer-events-none max-w-0 border-transparent px-0 opacity-0",
					)}
				>
					Cancel
				</button>
			) : null}
		</div>
	);
}
