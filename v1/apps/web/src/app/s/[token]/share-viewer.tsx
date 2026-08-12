"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, Loader2, Lock } from "lucide-react";
import { openPublicShare } from "@/domain/sharing/public-actions";
import type { TPublicShareSnapshot } from "@/domain/sharing/models";
import { PublicNoteReader } from "./public-note-reader";
import { ShareShell, ShareStateScreen } from "./share-state-screen";

type Props = {
	token: string;
	requiresPassword: boolean;
	viewOnce: boolean;
	initialCollabStatus?: "none" | "pending" | "collaborator";
};

type TerminalStatus = "expired" | "revoked" | "consumed" | "not-found";

type Phase =
	| { kind: "gate" }
	| { kind: "loading" }
	| { kind: "ready"; snapshot: TPublicShareSnapshot }
	| { kind: "terminal"; status: TerminalStatus };

export function ShareViewer({
	token,
	requiresPassword,
	viewOnce,
	initialCollabStatus = "none",
}: Props) {
	const needsGate = requiresPassword || viewOnce;
	const [phase, setPhase] = useState<Phase>(needsGate ? { kind: "gate" } : { kind: "loading" });
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const didAuto = useRef(false);

	const reveal = useCallback(
		async (pw?: string) => {
			setError(null);
			setSubmitting(true);
			try {
				const res = await openPublicShare({ token, password: pw });
				switch (res.status) {
					case "ok":
						setPhase({ kind: "ready", snapshot: res.snapshot });
						break;
					case "need-password":
						setPhase({ kind: "gate" });
						setError("This note is password protected.");
						break;
					case "wrong-password":
						setPhase({ kind: "gate" });
						setError("Incorrect password. Try again.");
						break;
					default:
						setPhase({ kind: "terminal", status: res.status });
				}
			} catch {
				setPhase({ kind: "gate" });
				setError("Something went wrong. Try again.");
			} finally {
				setSubmitting(false);
			}
		},
		[token],
	);

	useEffect(() => {
		if (needsGate || didAuto.current) return;
		didAuto.current = true;
		void reveal();
	}, [needsGate, reveal]);

	if (phase.kind === "ready") {
		return (
			<PublicNoteReader snapshot={phase.snapshot} initialCollabStatus={initialCollabStatus} />
		);
	}

	if (phase.kind === "terminal") {
		return <ShareStateScreen status={phase.status} />;
	}

	if (phase.kind === "loading") {
		return (
			<ShareShell>
				<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" strokeWidth={1.6} />
			</ShareShell>
		);
	}

	// gate
	// Derive whether password input is needed from current state, not just initial prop
	const needsPasswordInput =
		requiresPassword || (phase.kind === "gate" && error?.includes("password"));

	function handleSubmit(event: FormEvent) {
		event.preventDefault();
		if (submitting) return;
		void reveal(needsPasswordInput ? password : undefined);
	}

	return (
		<ShareShell>
			<form
				onSubmit={handleSubmit}
				className="flex w-full max-w-sm flex-col items-center text-center"
			>
				<div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
					{needsPasswordInput ? (
						<Lock className="h-5 w-5" strokeWidth={1.6} />
					) : (
						<Eye className="h-5 w-5" strokeWidth={1.6} />
					)}
				</div>

				<h1 className="mt-5 text-lg font-semibold tracking-[-0.01em]">
					{needsPasswordInput ? "Password required" : "View once"}
				</h1>
				<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
					{needsPasswordInput
						? "Enter the password to open this shared note."
						: "This note can only be opened once. After you reveal it, the link stops working."}
				</p>

				{needsPasswordInput && (
					<input
						type="password"
						name="share-password"
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						autoComplete="current-password"
						autoCapitalize="off"
						autoCorrect="off"
						spellCheck={false}
						aria-label="Share note password"
						placeholder="Password"
						className="mt-5 w-full rounded-md border border-border bg-card px-3 py-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground/30 sm:py-2 sm:text-sm"
					/>
				)}

				{error && <p className="mt-3 text-[13px] text-destructive">{error}</p>}

				<button
					type="submit"
					disabled={submitting || (needsPasswordInput && password.length === 0)}
					className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-foreground px-5 py-2.5 text-[15px] font-medium text-background transition-transform duration-150 ease-out active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:px-4 sm:py-2 sm:text-[13px]"
				>
					{submitting && (
						<Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.8} />
					)}
					{needsPasswordInput ? "Unlock note" : "Reveal note"}
				</button>
			</form>
		</ShareShell>
	);
}
