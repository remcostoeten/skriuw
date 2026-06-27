"use client";

import { useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";

type Props = {
	open: boolean;
	title: string;
	description?: string;
	label?: string;
	initialValue: string;
	submitLabel?: string;
	onSubmit: (value: string) => void;
	onOpenChange: (open: boolean) => void;
};

export function EditTextDialog({
	open,
	title,
	description,
	label = "Title",
	initialValue,
	submitLabel = "Save",
	onSubmit,
	onOpenChange,
}: Props) {
	const [value, setValue] = useState(initialValue);
	const canSubmit = value.trim().length > 0;

	useEffect(() => {
		if (open) setValue(initialValue);
	}, [open, initialValue]);

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const trimmed = value.trim();
		if (!trimmed) return;
		onSubmit(trimmed);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="bg-sidebar border-border sm:max-w-md">
				<form onSubmit={handleSubmit} className="space-y-4">
					<DialogHeader>
						<DialogTitle className="text-base">{title}</DialogTitle>
						<DialogDescription className={description ? "text-xs" : "sr-only"}>
							{description ?? `Enter a ${label.toLowerCase()} and press Save.`}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2">
						<Label htmlFor="edit-text" className="text-xs text-muted-foreground">
							{label}
						</Label>
						<Input
							id="edit-text"
							autoFocus
							required
							value={value}
							onChange={(e) => setValue(e.target.value)}
							className="bg-background border-border"
						/>
					</div>
					<DialogFooter className="gap-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" size="sm" disabled={!canSubmit}>
							{submitLabel}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
