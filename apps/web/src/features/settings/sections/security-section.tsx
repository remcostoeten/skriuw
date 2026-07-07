"use client";
/* eslint-disable react-doctor/prefer-useReducer, react-doctor/no-prevent-default */

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { cn } from "@/shared/lib/utils";
import { updatePassword } from "@/core/auth";
import {
	SectionHeader,
	Row,
	SettingsCard,
} from "@/features/settings/components/settings-primitives";
import { ConnectedAccounts } from "@/features/settings/components/connected-accounts";

function ChangePasswordInlineSection() {
	const [open, setOpen] = useState(false);
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [isPending, setIsPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);
	const currentPasswordRef = useRef<HTMLInputElement | null>(null);
	const toggleButtonRef = useRef<HTMLButtonElement | null>(null);
	const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const canSubmit =
		currentPassword.length > 0 &&
		newPassword.length >= 8 &&
		newPassword === confirm &&
		!isPending;

	const resetForm = () => {
		setCurrentPassword("");
		setNewPassword("");
		setConfirm("");
		setError(null);
		setSuccess(false);
		setIsPending(false);
	};

	const closeForm = () => {
		if (closeTimerRef.current) {
			clearTimeout(closeTimerRef.current);
			closeTimerRef.current = null;
		}
		setOpen(false);
		resetForm();
		toggleButtonRef.current?.focus();
	};

	const handleSubmit = async () => {
		if (!canSubmit) return;
		setIsPending(true);
		setError(null);
		try {
			await updatePassword({ currentPassword, newPassword });
			setSuccess(true);
			if (closeTimerRef.current) {
				clearTimeout(closeTimerRef.current);
			}
			closeTimerRef.current = setTimeout(() => {
				closeForm();
			}, 1200);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not update password.");
		} finally {
			setIsPending(false);
		}
	};

	useEffect(
		() => () => {
			if (closeTimerRef.current) {
				clearTimeout(closeTimerRef.current);
			}
		},
		[],
	);

	return (
		<div className="space-y-0">
			<Button
				ref={toggleButtonRef}
				variant="outline"
				size="sm"
				aria-expanded={open}
				aria-controls="change-password-panel"
				onClick={() => {
					if (open) {
						closeForm();
						return;
					}
					setOpen(true);
					requestAnimationFrame(() => currentPasswordRef.current?.focus());
				}}
			>
				{open ? "Close" : "Update"}
				<ChevronDown
					className={cn("size-4 transition-transform duration-200", open && "rotate-180")}
				/>
			</Button>

			<div
				id="change-password-panel"
				className={cn(
					"grid overflow-hidden transition-[grid-template-rows,opacity,margin-top] duration-300 ease-out",
					open ? "mt-4 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0",
				)}
			>
				<div className="min-h-0 overflow-hidden">
					<div className="space-y-4 rounded-md border border-border/60 bg-background/40 p-4">
						<div className="space-y-1">
							<div className="text-sm font-medium">Change password</div>
							<p className="text-xs text-muted-foreground">
								Enter your current password, then choose a strong new password of at
								least 8 characters.
							</p>
						</div>
						<form
							className="space-y-3"
							onSubmit={(event) => {
								event.preventDefault();
								void handleSubmit();
							}}
						>
							<div className="space-y-1">
								<Label
									htmlFor="current-password"
									className="text-xs text-muted-foreground"
								>
									Current password
								</Label>
								<Input
									ref={currentPasswordRef}
									id="current-password"
									type="password"
									value={currentPassword}
									onChange={(e) => setCurrentPassword(e.target.value)}
									autoComplete="current-password"
									disabled={isPending}
								/>
							</div>
							<div className="space-y-1">
								<Label
									htmlFor="new-password"
									className="text-xs text-muted-foreground"
								>
									New password
								</Label>
								<Input
									id="new-password"
									type="password"
									value={newPassword}
									onChange={(e) => setNewPassword(e.target.value)}
									autoComplete="new-password"
									disabled={isPending}
								/>
							</div>
							<div className="space-y-1">
								<Label
									htmlFor="confirm-password"
									className="text-xs text-muted-foreground"
								>
									Confirm password
								</Label>
								<Input
									id="confirm-password"
									type="password"
									value={confirm}
									onChange={(e) => setConfirm(e.target.value)}
									autoComplete="new-password"
									disabled={isPending}
								/>
							</div>
							{error && (
								<p role="alert" className="text-xs text-destructive">
									{error}
								</p>
							)}
							{success && <p className="text-xs text-success">Password updated.</p>}
							<div className="flex flex-wrap gap-2 pt-1">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={closeForm}
									disabled={isPending}
								>
									Cancel
								</Button>
								<Button type="submit" size="sm" disabled={!canSubmit}>
									{isPending ? "Saving…" : "Save password"}
								</Button>
							</div>
						</form>
					</div>
				</div>
			</div>
		</div>
	);
}

export function SecuritySection() {
	return (
		<>
			<SectionHeader title="Security" description="Lock down access to your account." />
			<SettingsCard>
				<Row
					focusId="change-password"
					title="Change password"
					description="Update your sign-in password."
				>
					<ChangePasswordInlineSection />
				</Row>
			</SettingsCard>
			<ConnectedAccounts />
		</>
	);
}
