"use client";
/* eslint-disable react-doctor/prefer-useReducer, react-doctor/no-prevent-default */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, KeyRound } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { cn } from "@/shared/lib/utils";
import {
	addPassword,
	getRememberMePreference,
	signInWithOAuth,
	updatePassword,
	type OAuthProvider,
} from "@/core/auth";
import { listConnections } from "@/core/auth/connections";
import { authClient } from "@/lib/auth-client";
import {
	SectionHeader,
	Row,
	SettingsCard,
} from "@/features/settings/components/settings-primitives";
import { ConnectedAccounts } from "@/features/settings/components/connected-accounts";

function ChangePasswordInlineSection() {
	const [hasPassword, setHasPassword] = useState<boolean | null>(null);
	const [open, setOpen] = useState(false);
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [isPending, setIsPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [reauthProviders, setReauthProviders] = useState<OAuthProvider[]>([]);
	const [reauthRequired, setReauthRequired] = useState(false);
	const [success, setSuccess] = useState(false);
	const currentPasswordRef = useRef<HTMLInputElement | null>(null);
	const toggleButtonRef = useRef<HTMLButtonElement | null>(null);
	const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const canSubmit =
		(hasPassword === false || currentPassword.length > 0) &&
		newPassword.length >= 8 &&
		newPassword === confirm &&
		!isPending;

	const resetForm = () => {
		setCurrentPassword("");
		setNewPassword("");
		setConfirm("");
		setError(null);
		setReauthRequired(false);
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
			if (hasPassword) {
				await updatePassword({ currentPassword, newPassword });
			} else {
				await addPassword(newPassword);
				setHasPassword(true);
			}
			setSuccess(true);
			if (closeTimerRef.current) {
				clearTimeout(closeTimerRef.current);
			}
			closeTimerRef.current = setTimeout(() => {
				closeForm();
			}, 1200);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not update password.");
			setReauthRequired(
				err instanceof Error && "code" in err && err.code === "reauth_required",
			);
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

	useEffect(() => {
		let active = true;
		void listConnections()
			.then((snapshot) => {
				if (!active) return;
				setHasPassword(snapshot.credential);
				setReauthProviders(
					snapshot.accounts
						.map((account) => account.providerId)
						.filter(
							(provider): provider is OAuthProvider =>
								provider === "github" || provider === "google",
						),
				);
			})
			.catch(() => {
				if (active) setHasPassword(true);
			});
		return () => {
			active = false;
		};
	}, []);

	const addingPassword = hasPassword === false;
	const reauthenticate = async (provider: OAuthProvider) => {
		setIsPending(true);
		try {
			await signInWithOAuth(provider, { rememberMe: getRememberMePreference() });
		} catch (reauthError) {
			setError(
				reauthError instanceof Error
					? reauthError.message
					: "Could not start re-authentication.",
			);
			setIsPending(false);
		}
	};

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
				{open ? "Close" : addingPassword ? "Add password" : "Update"}
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
							<div className="text-sm font-medium">
								{addingPassword ? "Add a password" : "Change password"}
							</div>
							<p className="text-xs text-muted-foreground">
								{addingPassword
									? "Create an email/password sign-in method for this account. For your security, you may be asked to re-authenticate first."
									: "Enter your current password, then choose a strong new password of at least 8 characters."}
							</p>
						</div>
						<form
							className="space-y-3"
							onSubmit={(event) => {
								event.preventDefault();
								void handleSubmit();
							}}
						>
							{!addingPassword && (
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
							)}
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
							{reauthRequired && reauthProviders.length > 0 && (
								<div className="flex flex-wrap gap-2">
									{reauthProviders.map((provider) => (
										<Button
											key={provider}
											type="button"
											variant="outline"
											size="sm"
											onClick={() => void reauthenticate(provider)}
											disabled={isPending}
										>
											Re-authenticate with{" "}
											{provider === "github" ? "GitHub" : "Google"}
										</Button>
									))}
								</div>
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
									{isPending
										? "Saving…"
										: addingPassword
											? "Add password"
											: "Save password"}
								</Button>
							</div>
						</form>
					</div>
				</div>
			</div>
		</div>
	);
}

function PairPasskeySection() {
	const [isPending, setIsPending] = useState(false);
	const [message, setMessage] = useState<string | null>(null);

	const pairPasskey = async () => {
		setIsPending(true);
		setMessage(null);
		try {
			const { error } = await authClient.passkey.addPasskey({
				name: "This device",
				authenticatorAttachment: "platform",
			});
			if (error) throw new Error(error.message ?? "Could not add passkey.");
			setMessage("Passkey added to your account.");
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Could not add passkey.");
		} finally {
			setIsPending(false);
		}
	};

	return (
		<div className="space-y-2">
			<Button
				variant="outline"
				size="sm"
				disabled={isPending}
				onClick={() => void pairPasskey()}
			>
				<KeyRound className="size-4" aria-hidden />
				{isPending ? "Waiting for passkey…" : "Pair this device"}
			</Button>
			{message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
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
					title="Password"
					description="Add or update your email/password sign-in method."
				>
					<ChangePasswordInlineSection />
				</Row>
				<Row
					focusId="pair-passkey"
					title="Passkey"
					description="Add this device as a passwordless sign-in method."
				>
					<PairPasskeySection />
				</Row>
			</SettingsCard>
			<ConnectedAccounts />
		</>
	);
}
