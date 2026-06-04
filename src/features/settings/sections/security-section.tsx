"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";
import { updatePassword } from "@/core/auth";
import {
	SectionHeader,
	Row,
	SettingsCard,
} from "@/features/settings/components/settings-primitives";

function ChangePasswordDialog() {
	const [open, setOpen] = useState(false);
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [isPending, setIsPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);

	const canSubmit =
		currentPassword.length > 0 &&
		newPassword.length >= 8 &&
		newPassword === confirm &&
		!isPending;

	const handleSubmit = async () => {
		if (!canSubmit) return;
		setIsPending(true);
		setError(null);
		try {
			await updatePassword({ currentPassword, newPassword });
			setSuccess(true);
			setTimeout(() => setOpen(false), 1200);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not update password.");
		} finally {
			setIsPending(false);
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (!o) {
					setCurrentPassword("");
					setNewPassword("");
					setConfirm("");
					setError(null);
					setSuccess(false);
				}
			}}
		>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					Update
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Change password</DialogTitle>
					<DialogDescription>
						Enter your current password, then choose a strong new password of at least 8 characters.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<div className="space-y-1">
						<Label htmlFor="current-password" className="text-xs text-muted-foreground">
							Current password
						</Label>
						<Input
							id="current-password"
							type="password"
							value={currentPassword}
							onChange={(e) => setCurrentPassword(e.target.value)}
							autoComplete="current-password"
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="new-password" className="text-xs text-muted-foreground">
							New password
						</Label>
						<Input
							id="new-password"
							type="password"
							value={newPassword}
							onChange={(e) => setNewPassword(e.target.value)}
							autoComplete="new-password"
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="confirm-password" className="text-xs text-muted-foreground">
							Confirm password
						</Label>
						<Input
							id="confirm-password"
							type="password"
							value={confirm}
							onChange={(e) => setConfirm(e.target.value)}
							autoComplete="new-password"
						/>
					</div>
					{error && (
						<p role="alert" className="text-xs text-destructive">
							{error}
						</p>
					)}
					{success && <p className="text-xs text-success">Password updated.</p>}
				</div>
				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline" size="sm">
							Cancel
						</Button>
					</DialogClose>
					<Button size="sm" disabled={!canSubmit} onClick={handleSubmit}>
						{isPending ? "Saving…" : "Save password"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function SecuritySection() {
	return (
		<>
			<SectionHeader title="Security" description="Lock down access to your account." />
			<SettingsCard>
				<Row title="Change password" description="Update your sign-in password.">
					<ChangePasswordDialog />
				</Row>
			</SettingsCard>
		</>
	);
}
