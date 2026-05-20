"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Switch } from "@/shared/ui/switch";
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
import { updatePassword } from "@/platform/auth";
import {
	SectionHeader,
	Row,
	SettingsCard,
	GroupLabel,
} from "@/features/settings/components/settings-primitives";

function ChangePasswordDialog() {
	const [open, setOpen] = useState(false);
	const [newPassword, setNewPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [isPending, setIsPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);

	const canSubmit = newPassword.length >= 8 && newPassword === confirm && !isPending;

	const handleSubmit = async () => {
		if (!canSubmit) return;
		setIsPending(true);
		setError(null);
		try {
			await updatePassword(newPassword);
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
						Choose a strong password of at least 8 characters.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
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
				<Row
					title="Two-factor auth"
					description="Require a code in addition to your password."
					disabled
				>
					<Switch disabled title="Two-factor auth is not yet available" />
				</Row>
				<Row
					title="Encrypt local cache"
					description="Protect notes cached on this device."
					disabled
				>
					<Switch disabled title="Local encryption is not yet available" />
				</Row>
			</SettingsCard>

			<GroupLabel>ACTIVE SESSIONS</GroupLabel>
			<div className="rounded-lg border border-border/60 bg-card/40 px-5 py-4">
				<p className="text-xs text-muted-foreground/60">
					Session management is not yet available.
				</p>
			</div>
		</>
	);
}
