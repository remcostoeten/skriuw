"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { LogOut, Upload } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { AvatarFace } from "@/shared/icons/avatar-face";
import { getAvatarSeed } from "@/shared/lib/avatar";
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
import { useAuthSnapshot } from "@/platform/auth/use-auth";
import { signOut, updateUserDisplayName } from "@/platform/auth";
import { usePreferencesStore } from "@/features/settings/store";
import {
	SectionHeader,
	Row,
	SettingsCard,
	GroupLabel,
} from "@/features/settings/components/settings-primitives";

const DELETE_PHRASE = "delete my account";

export function AccountSection() {
	const auth = useAuthSnapshot();
	const user = auth.user;
	const avatarColor = usePreferencesStore((state) => state.profile.avatarColor);
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
	const [isSigningOut, setIsSigningOut] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [deleteValue, setDeleteValue] = useState("");
	const [isDeletingAccount, setIsDeletingAccount] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	const deleteMatches = deleteValue.trim().toLowerCase() === DELETE_PHRASE;

	const handleSaveName = async () => {
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
			window.location.replace("/sign-in");
		} catch {
			setIsSigningOut(false);
		}
	};

	const handleDeleteAccount = async () => {
		if (!deleteMatches) return;
		setIsDeletingAccount(true);
		setDeleteError(null);
		try {
			const res = await fetch("/api/account/delete", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ confirmation: deleteValue.trim() }),
			});
			const payload = (await res.json().catch(() => null)) as { error?: string } | null;
			if (!res.ok) throw new Error(payload?.error ?? "Could not delete account.");
			await signOut().catch(() => undefined);
			window.location.replace("/sign-in");
		} catch (err) {
			setDeleteError(err instanceof Error ? err.message : "Could not delete account.");
			setIsDeletingAccount(false);
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
				<Button
					variant="outline"
					size="sm"
					disabled
					title="Photo upload is not yet available"
				>
					<Upload className="size-3.5" /> Change photo
				</Button>
			</div>

			<GroupLabel>PROFILE</GroupLabel>
			<SettingsCard>
				<Row title="Display name" description="Shown on shared notes and comments.">
					<div className="flex flex-col gap-1">
						<div className="flex gap-2">
							<Input
								value={displayName}
								onChange={(e) => setDisplayName(e.target.value)}
								className="w-52 h-8"
								onBlur={handleSaveName}
								onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
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
				<Row title="Email" description="Used for sign-in and account recovery.">
					<Input
						value={user?.email ?? ""}
						readOnly
						className="w-52 h-8 opacity-60 cursor-not-allowed"
						title="Email changes require re-authentication — contact support"
					/>
				</Row>
				<Row title="Account handle" description="skriuw.app/@handle" disabled>
					<Input
						defaultValue={user?.email?.split("@")[0] ?? ""}
						disabled
						className="w-52 h-8"
						title="Custom handles are not yet available"
					/>
				</Row>
			</SettingsCard>

			<GroupLabel>DANGER ZONE</GroupLabel>
			<SettingsCard>
				<Row
					title="Sign out everywhere"
					description="End all active sessions on other devices."
				>
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
					title="Delete account"
					description="Permanently remove your account and notes."
				>
					<Dialog
						open={deleteOpen}
						onOpenChange={(o) => {
							setDeleteOpen(o);
							if (!o) setDeleteValue("");
						}}
					>
						<DialogTrigger asChild>
							<Button
								size="sm"
								className="bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25 shadow-none"
							>
								Delete
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Delete account</DialogTitle>
								<DialogDescription>
									This will permanently remove your account, notes, and history.
									This cannot be undone.
								</DialogDescription>
							</DialogHeader>
							<div className="space-y-2">
								<Label
									htmlFor="delete-confirm"
									className="text-xs text-muted-foreground"
								>
									To confirm, type{" "}
									<span className="font-mono text-foreground">
										{DELETE_PHRASE}
									</span>{" "}
									below.
								</Label>
								<Input
									id="delete-confirm"
									value={deleteValue}
									onChange={(e) => setDeleteValue(e.target.value)}
									placeholder={DELETE_PHRASE}
									autoComplete="off"
									maxLength={100}
								/>
								{deleteError && (
									<p role="alert" className="text-xs text-destructive">
										{deleteError}
									</p>
								)}
							</div>
							<DialogFooter>
								<DialogClose asChild>
									<Button variant="outline" size="sm">
										Cancel
									</Button>
								</DialogClose>
								<Button
									size="sm"
									disabled={!deleteMatches || isDeletingAccount}
									onClick={handleDeleteAccount}
									className="bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25 shadow-none disabled:opacity-50"
								>
									{isDeletingAccount ? "Deleting…" : "Delete account"}
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</Row>
			</SettingsCard>
		</>
	);
}
