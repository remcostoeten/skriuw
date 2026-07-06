"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
	ArrowLeft,
	Check,
	Clock,
	Copy,
	Eye,
	Globe,
	Link2,
	Loader2,
	Lock,
	RefreshCw,
	User,
} from "lucide-react";
import { Switch } from "@/shared/ui/switch";
import { cn } from "@/shared/lib/utils";
import { noop } from "@/shared/lib/noop";
import {
	SHARE_DURATION_PRESETS,
	type TNoteShareState,
	type TShareExpiry,
} from "@/domain/sharing/models";
import { useNoteSharing } from "../hooks/use-note-sharing";

type Props = {
	noteId: string;
	noteName: string;
	onBack: () => void;
};

type ExpiryMode = "never" | (typeof SHARE_DURATION_PRESETS)[number]["id"] | "date";

function toLocalInputValue(iso: string): string {
	const date = new Date(iso);
	const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
	return local.toISOString().slice(0, 16);
}

function buildExpiry(mode: ExpiryMode, customDate: string): TShareExpiry {
	if (mode === "never") return { kind: "never" };
	if (mode === "date") {
		if (!customDate) return { kind: "never" };
		return { kind: "date", iso: new Date(customDate).toISOString() };
	}
	const preset = SHARE_DURATION_PRESETS.find((option) => option.id === mode);
	return preset ? { kind: "duration", ms: preset.ms } : { kind: "never" };
}

const EXPIRY_OPTIONS: { id: ExpiryMode; label: string }[] = [
	{ id: "never", label: "Never" },
	...SHARE_DURATION_PRESETS.map((preset) => ({ id: preset.id, label: preset.label })),
	{ id: "date", label: "On date" },
];

type ShareFormState = {
	syncedToken: string | null;
	viewOnce: boolean;
	expiryMode: ExpiryMode;
	customDate: string;
	passwordEnabled: boolean;
	passwordInput: string;
	showAuthor: boolean;
	dirty: boolean;
};

type ShareFormAction =
	| { type: "sync"; share: TNoteShareState }
	| { type: "sharegone" }
	| { type: "viewOnce"; value: boolean }
	| { type: "expiryMode"; value: ExpiryMode }
	| { type: "customDate"; value: string }
	| { type: "passwordEnabled"; value: boolean }
	| { type: "passwordInput"; value: string }
	| { type: "showAuthor"; value: boolean }
	| { type: "saved" };

function seedShareForm(share: TNoteShareState | null): ShareFormState {
	if (!share) {
		return {
			syncedToken: null,
			viewOnce: false,
			expiryMode: "never",
			customDate: "",
			passwordEnabled: false,
			passwordInput: "",
			showAuthor: false,
			dirty: false,
		};
	}
	return {
		syncedToken: share.token,
		viewOnce: share.viewOnce,
		expiryMode: share.expiresAt ? "date" : "never",
		customDate: share.expiresAt ? toLocalInputValue(share.expiresAt) : "",
		passwordEnabled: share.hasPassword,
		passwordInput: "",
		showAuthor: share.authorName != null,
		dirty: false,
	};
}

function shareFormReducer(state: ShareFormState, action: ShareFormAction): ShareFormState {
	switch (action.type) {
		case "sync":
			return seedShareForm(action.share);
		case "sharegone":
			return { ...state, syncedToken: null };
		case "viewOnce":
			return { ...state, viewOnce: action.value, dirty: true };
		case "expiryMode":
			return { ...state, expiryMode: action.value, dirty: true };
		case "customDate":
			return { ...state, customDate: action.value, dirty: true };
		case "passwordEnabled":
			return {
				...state,
				passwordEnabled: action.value,
				passwordInput: action.value ? state.passwordInput : "",
				dirty: true,
			};
		case "passwordInput":
			return { ...state, passwordInput: action.value, dirty: true };
		case "showAuthor":
			return { ...state, showAuthor: action.value, dirty: true };
		case "saved":
			return { ...state, dirty: false };
	}
}

export function ShareScreen({ noteId, noteName, onBack }: Props) {
	const { shareQuery, publish, update, refresh, revoke } = useNoteSharing(noteId);
	const share = shareQuery.data ?? null;
	const isPublic = Boolean(share);

	const [form, dispatch] = useReducer(shareFormReducer, share, seedShareForm);
	const [prevShare, setPrevShare] = useState(share);
	const [copied, setCopied] = useState(false);

	if (share !== prevShare) {
		setPrevShare(share);
		if (!share) {
			if (form.syncedToken !== null) dispatch({ type: "sharegone" });
		} else if (!form.dirty || form.syncedToken !== share.token) {
			dispatch({ type: "sync", share });
		}
	}

	const { viewOnce, expiryMode, customDate, passwordEnabled, passwordInput, showAuthor, dirty } =
		form;

	useEffect(() => {
		if (!copied) return;
		const timer = window.setTimeout(() => setCopied(false), 1800);
		return () => window.clearTimeout(timer);
	}, [copied]);

	const shareUrl = useMemo(() => {
		if (!share) return "";
		if (typeof window !== "undefined") return `${window.location.origin}${share.path}`;
		return share.url;
	}, [share]);

	function handleTogglePublic(next: boolean) {
		if (next) {
			publish.mutate({
				noteId,
				viewOnce: false,
				expiry: { kind: "never" },
				showAuthor: false,
			});
		} else {
			revoke.mutate(noteId);
		}
	}

	// Enabling a password requires typing one; otherwise nothing changes.
	const passwordMissing = passwordEnabled && !share?.hasPassword && passwordInput.length === 0;

	function handleSave() {
		const password = !passwordEnabled
			? null
			: passwordInput.length > 0
				? passwordInput
				: undefined;
		update.mutate(
			{ noteId, viewOnce, expiry: buildExpiry(expiryMode, customDate), password, showAuthor },
			{ onSuccess: () => dispatch({ type: "saved" }) },
		);
	}

	async function handleCopy() {
		if (!shareUrl) return;
		try {
			await navigator.clipboard.writeText(shareUrl);
			setCopied(true);
		} catch {
			// Clipboard unavailable — ignore.
			noop();
		}
	}

	const busy = publish.isPending || revoke.isPending;

	return (
		<div className="flex flex-1 flex-col overflow-hidden bg-background">
			<header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-3 sm:px-4">
				<button
					type="button"
					onClick={onBack}
					className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.97]"
					aria-label="Back to editor"
				>
					<ArrowLeft className="h-4 w-4" strokeWidth={1.7} />
				</button>
				<div className="min-w-0 flex-1">
					<h1 className="truncate text-sm font-semibold tracking-[-0.01em]">
						Share note
					</h1>
				</div>
			</header>

			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto w-full max-w-xl space-y-5 px-4 py-6 sm:px-6">
					{/* Master toggle */}
					<section className="rounded-lg border border-border bg-card p-4">
						<div className="flex items-center justify-between gap-4">
							<div className="flex min-w-0 items-start gap-3">
								<div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
									<Globe className="h-4 w-4" strokeWidth={1.7} />
								</div>
								<div className="min-w-0">
									<p className="text-[13px] font-medium text-foreground">
										Make this note public
									</p>
									<p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
										Publishes a frozen snapshot of{" "}
										<span className="text-foreground/70">{noteName}</span> that
										anyone with the link can read.
									</p>
								</div>
							</div>
							{busy ? (
								<Loader2
									className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
									strokeWidth={1.7}
								/>
							) : (
								<Switch
									checked={isPublic}
									onCheckedChange={handleTogglePublic}
									aria-label="Make note public"
								/>
							)}
						</div>

						{isPublic && (
							<div className="mt-4 border-t border-border pt-4">
								<div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
									<Link2
										className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
										strokeWidth={1.7}
									/>
									<input
										readOnly
										value={shareUrl}
										onFocus={(event) => event.currentTarget.select()}
										className="min-w-0 flex-1 truncate bg-transparent text-[12px] text-foreground/85 outline-none"
									/>
									<button
										type="button"
										onClick={handleCopy}
										className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.97]"
									>
										{copied ? (
											<>
												<Check className="h-3 w-3" strokeWidth={2} /> Copied
											</>
										) : (
											<>
												<Copy className="h-3 w-3" strokeWidth={1.8} /> Copy
											</>
										)}
									</button>
								</div>
								<ShareStatusLine
									viewCount={share!.viewCount}
									viewOnce={share!.viewOnce}
									consumedAt={share!.consumedAt}
									expiresAt={share!.expiresAt}
								/>
							</div>
						)}
					</section>

					{isPublic && (
						<>
							{share!.isStale && (
								<button
									type="button"
									onClick={() => refresh.mutate(noteId)}
									disabled={refresh.isPending}
									className="flex w-full items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-left text-[12px] text-warning-foreground transition-colors hover:bg-warning/15 disabled:opacity-60"
								>
									{refresh.isPending ? (
										<Loader2
											className="h-3.5 w-3.5 animate-spin"
											strokeWidth={1.7}
										/>
									) : (
										<RefreshCw
											className="h-3.5 w-3.5 shrink-0"
											strokeWidth={1.7}
										/>
									)}
									<span>
										This note changed since you shared it.{" "}
										<span className="font-medium">Update the snapshot.</span>
									</span>
								</button>
							)}

							{/* Controls */}
							<section className="space-y-1 rounded-lg border border-border bg-card">
								<ControlRow
									icon={<Eye className="h-4 w-4" strokeWidth={1.7} />}
									title="View once, then destroy"
									description="The link self-destructs after the first view."
								>
									<Switch
										checked={viewOnce}
										onCheckedChange={(next) =>
											dispatch({ type: "viewOnce", value: next })
										}
									/>
								</ControlRow>

								<div className="mx-4 border-t border-border/70" />

								<ControlRow
									icon={<Lock className="h-4 w-4" strokeWidth={1.7} />}
									title="Password protect"
									description={
										share!.hasPassword
											? "A password is set. Type to replace it."
											: "Require a password to open the link."
									}
								>
									<Switch
										checked={passwordEnabled}
										onCheckedChange={(next) =>
											dispatch({ type: "passwordEnabled", value: next })
										}
									/>
								</ControlRow>
								{passwordEnabled && (
									<div className="px-4 pb-3">
										<input
											type="password"
											value={passwordInput}
											onChange={(event) =>
												dispatch({
													type: "passwordInput",
													value: event.target.value,
												})
											}
											placeholder={
												share!.hasPassword
													? "New password (unchanged)"
													: "Password"
											}
											className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/55 focus:border-foreground/30"
										/>
									</div>
								)}

								<div className="mx-4 border-t border-border/70" />

								<ControlRow
									icon={<User className="h-4 w-4" strokeWidth={1.7} />}
									title="Show author"
									description="Credit you by name on the public page. Off shares it anonymously."
								>
									<Switch
										checked={showAuthor}
										onCheckedChange={(next) =>
											dispatch({ type: "showAuthor", value: next })
										}
									/>
								</ControlRow>

								<div className="mx-4 border-t border-border/70" />

								<div className="px-4 py-3">
									<div className="flex items-start gap-3">
										<div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
											<Clock className="h-4 w-4" strokeWidth={1.7} />
										</div>
										<div className="min-w-0 flex-1">
											<p className="text-[13px] font-medium text-foreground">
												Expiry
											</p>
											<p className="mt-0.5 text-[12px] text-muted-foreground">
												When the link should stop working.
											</p>
											<div className="mt-2.5 flex flex-wrap gap-1.5">
												{EXPIRY_OPTIONS.map((option) => (
													<button
														key={option.id}
														type="button"
														onClick={() =>
															dispatch({
																type: "expiryMode",
																value: option.id,
															})
														}
														className={cn(
															"rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors active:scale-[0.97]",
															expiryMode === option.id
																? "border-foreground/30 bg-foreground/10 text-foreground"
																: "border-border bg-background text-muted-foreground hover:text-foreground",
														)}
													>
														{option.label}
													</button>
												))}
											</div>
											{expiryMode === "date" && (
												<input
													type="datetime-local"
													value={customDate}
													onChange={(event) =>
														dispatch({
															type: "customDate",
															value: event.target.value,
														})
													}
													className="mt-2.5 w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none transition-colors focus:border-foreground/30"
												/>
											)}
										</div>
									</div>
								</div>
							</section>

							<div className="flex items-center justify-between gap-3">
								<button
									type="button"
									onClick={() => revoke.mutate(noteId)}
									disabled={revoke.isPending}
									className="text-[12px] font-medium text-destructive/80 transition-colors hover:text-destructive disabled:opacity-50"
								>
									Unpublish
								</button>
								<button
									type="button"
									onClick={handleSave}
									disabled={!dirty || passwordMissing || update.isPending}
									className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-[13px] font-medium text-background transition-transform duration-150 ease-out active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
								>
									{update.isPending && (
										<Loader2
											className="h-3.5 w-3.5 animate-spin"
											strokeWidth={1.8}
										/>
									)}
									{passwordMissing ? "Enter a password" : "Save changes"}
								</button>
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
}

function ControlRow({
	icon,
	title,
	description,
	children,
}: {
	icon: React.ReactNode;
	title: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-4 px-4 py-3">
			<div className="flex min-w-0 items-start gap-3">
				<div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
					{icon}
				</div>
				<div className="min-w-0">
					<p className="text-[13px] font-medium text-foreground">{title}</p>
					<p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
						{description}
					</p>
				</div>
			</div>
			<div className="shrink-0">{children}</div>
		</div>
	);
}

function ShareStatusLine({
	viewCount,
	viewOnce,
	consumedAt,
	expiresAt,
}: {
	viewCount: number;
	viewOnce: boolean;
	consumedAt: string | null;
	expiresAt: string | null;
}) {
	const parts: string[] = [];
	if (viewOnce && consumedAt) {
		parts.push("Viewed once · link spent");
	} else {
		parts.push(`${viewCount} ${viewCount === 1 ? "view" : "views"}`);
	}
	if (expiresAt) {
		const expiry = new Date(expiresAt);
		parts.push(
			expiry.getTime() <= Date.now()
				? "Expired"
				: `Expires ${formatDistanceToNow(expiry, { addSuffix: true })}`,
		);
	}
	return <p className="mt-2 text-[11px] text-muted-foreground/70">{parts.join(" · ")}</p>;
}
