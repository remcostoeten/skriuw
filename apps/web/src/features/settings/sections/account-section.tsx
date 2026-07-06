"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogOut, Share2 } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { AvatarFace } from "@/shared/icons/avatar-face";
import { deriveAvatarColor, getAvatarSeed } from "@/shared/lib/avatar";
import { DeleteButton } from "@/shared/ui/delete-button";
import { useAuth } from "@/core/auth/use-auth";
import {
	isUsernameTakenError,
	signOut,
	updateUserDisplayName,
	updateUsername,
} from "@/core/auth";
import { isUsernameAvailable } from "@/lib/auth-client";
import { validateUsernameFormat } from "@/lib/username";
import { usePreferencesStore } from "@/features/settings/store";
import {
	SectionHeader,
	Row,
	SettingsCard,
	GroupLabel,
} from "@/features/settings/components/settings-primitives";



export function AccountSection() {
	const auth = useAuth();
	const user = auth.user;
	const avatarColorPreference = usePreferencesStore((state) => state.profile.avatarColor);
	const avatarColor =
		user?.avatarColor ??
		avatarColorPreference ??
		(user ? deriveAvatarColor(user.id) : undefined);
	const avatarSeed = getAvatarSeed(user?.email || user?.name || user?.id, "account-user");

	const initials = user?.name
		? user.name
				.split(" ")
				.map((p) => p[0])
				.join("")
				.toUpperCase()
				.slice(0, 2)
		: "?";

	const [displayName, setDisplayName] = useState(user?.name ?? "");
	const [isSavingName, setIsSavingName] = useState(false);
	const [saveNameError, setSaveNameError] = useState<string | null>(null);

	useEffect(() => {
		setDisplayName(user?.name ?? "");
	}, [user?.name]);

	const [usernameValue, setUsernameValue] = useState(user?.username ?? "");
	const [isSavingUsername, setIsSavingUsername] = useState(false);
	const [usernameError, setUsernameError] = useState<string | null>(null);
	const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
	const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingCheckRef = useRef<string | null>(null);
	const suppressNameBlurSaveRef = useRef(false);
	const suppressUsernameBlurSaveRef = useRef(false);

	useEffect(() => {
		setUsernameValue(user?.username ?? "");
	}, [user?.username]);

	useEffect(() => {
		return () => {
			if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
		};
	}, []);

	const checkAvailability = useCallback(
		(value: string) => {
			if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
			if (!value || value === user?.username) {
				setUsernameAvailable(null);
				return;
			}
			if (validateUsernameFormat(value)) {
				setUsernameAvailable(null);
				return;
			}
			usernameDebounceRef.current = setTimeout(async () => {
				pendingCheckRef.current = value;
				const { data } = await isUsernameAvailable({ username: value });
				if (pendingCheckRef.current === value) {
					setUsernameAvailable(data?.available ?? null);
				}
			}, 400);
		},
		[user?.username],
	);

	const handleSaveUsername = async () => {
		if (isSavingUsername) return;
		const trimmed = usernameValue.trim();
		if (!trimmed || trimmed === user?.username) return;
		const formatError = validateUsernameFormat(trimmed);
		if (formatError) {
			setUsernameError(formatError);
			return;
		}
		if (usernameAvailable === false) {
			setUsernameError("That username is already taken.");
			return;
		}
		setIsSavingUsername(true);
		setUsernameError(null);
		try {
			await updateUsername(trimmed);
		} catch (err) {
			setUsernameValue(user?.username ?? "");
			setUsernameError(
				isUsernameTakenError(err)
					? "That username is already taken."
					: "Couldn't update username. Please try again.",
			);
		} finally {
			setIsSavingUsername(false);
			setUsernameAvailable(null);
		}
	};
	const [isSigningOut, setIsSigningOut] = useState(false);

	const handleSaveName = async () => {
		if (isSavingName) return;
		if (!displayName.trim() || displayName === user?.name) return;
		setIsSavingName(true);
		setSaveNameError(null);
		try {
			await updateUserDisplayName(displayName.trim());
		} catch {
			setDisplayName(user?.name ?? "");
			setSaveNameError("Could not update display name. Please try again.");
		} finally {
			setIsSavingName(false);
		}
	};

	const handleSignOut = async () => {
		setIsSigningOut(true);
		try {
			await signOut();
			window.location.replace("/app?auth=sign-in");
		} catch {
			setIsSigningOut(false);
		}
	};

	const handleDeleteAccount = async (): Promise<boolean> => {
		try {
			const res = await fetch("/api/account/delete", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ confirmation: "delete my account" }),
			});
			const payload = (await res.json().catch(() => null)) as { error?: string } | null;
			if (!res.ok) throw new Error(payload?.error ?? "Could not delete account.");
			await signOut().catch(() => undefined);
			window.location.replace("/app?auth=sign-in");
			return true;
		} catch {
			return false;
		}
	};

	return (
		<>
			<SectionHeader
				title="Account"
				description="How you appear in Skriuw and where notes are tied."
			/>

			<div className="flex items-center gap-4 rounded-lg border border-border/60 bg-card/40 p-5">
				<div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-sidebar-border bg-sidebar">
					{user ? (
						<AvatarFace
							name={avatarSeed}
							size={56}
							color={avatarColor ?? undefined}
							className="h-full w-full"
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center bg-sidebar text-sm font-medium text-sidebar-foreground/80 select-none">
							{initials}
						</div>
					)}
				</div>
				<div className="flex-1 min-w-0">
					<div className="text-sm font-medium">{user?.name ?? "—"}</div>
					<div className="text-xs text-muted-foreground">
						{user?.email ?? "Not signed in"}
					</div>
				</div>
			</div>

			<GroupLabel>PROFILE</GroupLabel>
			<SettingsCard>
				<Row focusId="display-name" title="Display name" description="Shown on shared notes and comments.">
					<div className="flex flex-col gap-1">
						<div className="flex gap-2">
							<Input
								value={displayName}
								onChange={(e) => setDisplayName(e.target.value)}
								className="w-52 h-8"
								onBlur={() => {
									if (suppressNameBlurSaveRef.current) {
										suppressNameBlurSaveRef.current = false;
										return;
									}
									handleSaveName();
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										suppressNameBlurSaveRef.current = true;
										handleSaveName();
									}
								}}
							/>
							{displayName !== (user?.name ?? "") && (
								<Button
									size="sm"
									className="h-8"
									onClick={handleSaveName}
									disabled={isSavingName}
								>
									{isSavingName ? "Saving…" : "Save"}
								</Button>
							)}
						</div>
						{saveNameError && (
							<p role="alert" className="mt-1 text-xs text-destructive">
								{saveNameError}
							</p>
						)}
					</div>
				</Row>
				<Row
					focusId="username"
					title="Username"
					description="Used for collaboration invites. Letters, numbers, underscores, and dots only."
				>
					<div className="flex flex-col gap-1">
						<div className="flex gap-2">
							<div className="relative">
								<Input
									value={usernameValue}
									onChange={(e) => {
										setUsernameValue(e.target.value);
										setUsernameError(null);
										checkAvailability(e.target.value);
									}}
									className="w-52 h-8 pr-6"
									placeholder="your-handle"
									maxLength={30}
									onBlur={() => {
										if (suppressUsernameBlurSaveRef.current) {
											suppressUsernameBlurSaveRef.current = false;
											return;
										}
										handleSaveUsername();
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											suppressUsernameBlurSaveRef.current = true;
											handleSaveUsername();
										}
									}}
								/>
								{usernameAvailable !== null && (
									<span
										className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs ${usernameAvailable ? "text-green-500" : "text-destructive"}`}
									>
										{usernameAvailable ? "✓" : "✗"}
									</span>
								)}
							</div>
							{usernameValue.trim() !== (user?.username ?? "") && usernameValue.trim() && (
								<Button
									size="sm"
									className="h-8"
									onClick={handleSaveUsername}
									disabled={isSavingUsername || usernameAvailable === false}
								>
									{isSavingUsername ? "Saving…" : "Save"}
								</Button>
							)}
						</div>
						{usernameError && (
							<p role="alert" className="mt-1 text-xs text-destructive">
								{usernameError}
							</p>
						)}
					</div>
				</Row>
				<Row focusId="email" title="Email" description="Used for sign-in and account recovery.">
					<Input
						value={user?.email ?? ""}
						readOnly
						className="w-52 h-8 opacity-60 cursor-not-allowed"
						title="Email changes require re-authentication — contact support"
					/>
				</Row>
			</SettingsCard>

			<GroupLabel>SHARING</GroupLabel>
			<SettingsCard>
				<Row
					focusId="shared-notes"
					title="Shared notes"
					description="Manage every public link and see view activity."
				>
					<Button variant="outline" size="sm" asChild>
						<Link href="/app/shared">
							<Share2 className="size-3.5" /> Open overview
						</Link>
					</Button>
				</Row>
			</SettingsCard>

			<GroupLabel>DANGER ZONE</GroupLabel>
			<SettingsCard>
				<Row focusId="sign-out" title="Sign out" description="End your session on this device.">
					<Button
						variant="outline"
						size="sm"
						onClick={handleSignOut}
						disabled={isSigningOut}
					>
						<LogOut className="size-3.5" />
						{isSigningOut ? "Signing out…" : "Sign out"}
					</Button>
				</Row>
				<Row
					focusId="delete-account"
					title="Delete account"
					description="Permanently remove your account and notes."
				>
					<DeleteButton
						onDelete={handleDeleteAccount}
						confirmLabel="Confirm delete account"
						pendingLabel="Deleting account"
						successLabel="Deleted"
						failedLabel="Retry"
					/>
				</Row>
			</SettingsCard>
		</>
	);
}
