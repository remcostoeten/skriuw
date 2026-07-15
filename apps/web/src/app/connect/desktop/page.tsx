"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Github, Laptop, Loader2, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/shared/ui/button";

type Stage = "checking" | "ready" | "approving" | "approved" | "error";

export default function DesktopConnectionPage() {
	const { data: session, isPending } = authClient.useSession();
	const [userCode, setUserCode] = useState("");
	const [stage, setStage] = useState<Stage>("checking");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setUserCode(new URLSearchParams(window.location.search).get("user_code") ?? "");
	}, []);

	useEffect(() => {
		if (isPending || !userCode) return;
		if (!session?.user) {
			setStage("ready");
			return;
		}
		setStage("checking");
		fetch(`/api/auth/device?user_code=${encodeURIComponent(userCode)}`, {
			credentials: "include",
		})
			.then(async (response) => {
				if (!response.ok)
					throw new Error("This desktop sign-in request is invalid or expired.");
				const result = (await response.json()) as { status?: string };
				setStage(result.status === "approved" ? "approved" : "ready");
			})
			.catch((cause) => {
				setError(cause instanceof Error ? cause.message : "Could not verify this request.");
				setStage("error");
			});
	}, [isPending, session?.user, userCode]);

	const signInWithGithub = async () => {
		setError(null);
		const { error: signInError } = await authClient.signIn.social({
			provider: "github",
			callbackURL: window.location.href,
		});
		if (signInError) setError(signInError.message ?? "GitHub sign-in could not be started.");
	};

	const approve = async () => {
		setStage("approving");
		setError(null);
		const response = await fetch("/api/auth/device/approve", {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ userCode }),
		});
		if (!response.ok) {
			const body = (await response.json().catch(() => ({}))) as { message?: string };
			setError(body.message ?? "The desktop connection could not be approved.");
			setStage("ready");
			return;
		}
		setStage("approved");
	};

	return (
		<main className="flex min-h-dvh items-center justify-center bg-background px-5 py-10 text-foreground">
			<section className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
				<div className="mb-6 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
					{stage === "approved" ? (
						<CheckCircle2 className="size-5" />
					) : (
						<Laptop className="size-5" />
					)}
				</div>
				<h1 className="text-xl font-semibold tracking-tight">
					{stage === "approved" ? "Desktop connected" : "Connect Skriuw Desktop"}
				</h1>
				<p className="mt-2 text-sm leading-6 text-muted-foreground">
					{stage === "approved"
						? "You can close this tab and return to Skriuw. Sync remains off until you enable it there."
						: "Sign in with the same account you use on the web, then approve this desktop app."}
				</p>

				{userCode && stage !== "approved" ? (
					<div className="mt-5 rounded-lg border bg-muted/40 px-4 py-3 text-center">
						<p className="text-xs text-muted-foreground">Desktop code</p>
						<p className="mt-1 font-mono text-lg font-semibold tracking-[0.18em]">
							{userCode}
						</p>
					</div>
				) : null}

				{!userCode && !isPending ? (
					<p className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
						Open this page from Skriuw Desktop to start a secure connection.
					</p>
				) : null}

				{error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

				<div className="mt-6">
					{isPending || stage === "checking" ? (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="size-4 animate-spin" /> Checking your account…
						</div>
					) : !session?.user ? (
						<Button
							className="w-full"
							disabled={!userCode}
							onClick={() => void signInWithGithub()}
						>
							<Github className="mr-2 size-4" /> Continue with GitHub
						</Button>
					) : stage === "ready" || stage === "approving" ? (
						<div className="space-y-3">
							<div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
								<ShieldCheck className="size-4 text-emerald-600" />
								<div className="min-w-0 text-sm">
									<p className="truncate font-medium">{session.user.name}</p>
									<p className="truncate text-xs text-muted-foreground">
										{session.user.email}
									</p>
								</div>
							</div>
							<Button
								className="w-full"
								disabled={stage === "approving"}
								onClick={() => void approve()}
							>
								{stage === "approving" ? (
									<Loader2 className="mr-2 size-4 animate-spin" />
								) : null}
								Approve desktop
							</Button>
						</div>
					) : null}
				</div>
			</section>
		</main>
	);
}
