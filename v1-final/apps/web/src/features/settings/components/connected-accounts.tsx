"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
	SUPPORTED_OAUTH_PROVIDERS,
	listConnections,
	linkProvider,
	unlinkProvider,
	type ConnectionsSnapshot,
	type ProviderMeta,
} from "@/core/auth/connections";
import { signInWithOAuth, type OAuthProvider } from "@/core/auth";
import { isStepUpError, type StepUpCode } from "@/core/auth/step-up";
import { StepUpDialog } from "@/features/settings/components/step-up-dialog";
import { Row, SettingsCard, GroupLabel } from "@/features/settings/components/settings-primitives";

function GithubGlyph() {
	return (
		<svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="currentColor">
			<path d="M12 .5C5.73.5.5 5.73.5 12.02c0 5.1 3.29 9.42 7.86 10.95.58.1.79-.25.79-.56v-2c-3.2.69-3.88-1.37-3.88-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.26 5.69.41.36.78 1.05.78 2.12v3.14c0 .31.21.67.8.56A11.53 11.53 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
		</svg>
	);
}

function GoogleGlyph() {
	return (
		<svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
			<path
				fill="#4285F4"
				d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.86c2.26-2.09 3.56-5.17 3.56-8.87Z"
			/>
			<path
				fill="#34A853"
				d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.07.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
			/>
			<path
				fill="#FBBC05"
				d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09Z"
			/>
			<path
				fill="#EA4335"
				d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.18 15.24 0 12 0A11.99 11.99 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
			/>
		</svg>
	);
}

function ProviderGlyph({ id }: { id: OAuthProvider }) {
	if (id === "github") return <GithubGlyph />;
	if (id === "google") return <GoogleGlyph />;
	return null;
}

type StepUpState = {
	open: boolean;
	mode: "password" | "reauth";
	password: string;
	error: string | null;
	pending: boolean;
};

const initialStepUpState: StepUpState = {
	open: false,
	mode: "password",
	password: "",
	error: null,
	pending: false,
};

type StepUpAction =
	| { type: "open"; mode: StepUpState["mode"] }
	| { type: "close" }
	| { type: "setPassword"; password: string }
	| { type: "setError"; error: string | null }
	| { type: "setPending"; pending: boolean }
	| { type: "reset" };

function stepUpReducer(state: StepUpState, action: StepUpAction): StepUpState {
	switch (action.type) {
		case "open":
			return { ...initialStepUpState, open: true, mode: action.mode };
		case "close":
			return { ...state, open: false, password: "", error: null, pending: false };
		case "setPassword":
			return { ...state, password: action.password };
		case "setError":
			return { ...state, error: action.error };
		case "setPending":
			return { ...state, pending: action.pending };
		case "reset":
			return initialStepUpState;
	}
}

export function ConnectedAccounts() {
	const [snapshot, setSnapshot] = useState<ConnectionsSnapshot | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [pendingProvider, setPendingProvider] = useState<string | null>(null);
	const [stepUp, dispatchStepUp] = useReducer(stepUpReducer, initialStepUpState);
	const pendingUnlinkRef = useRef<{ providerId: string; accountId: string } | null>(null);

	const refresh = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			setSnapshot(await listConnections());
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not load connected accounts.");
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const handleConnect = async (provider: ProviderMeta) => {
		setPendingProvider(provider.id);
		setError(null);
		try {
			await linkProvider(provider.id);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not connect account.");
			setPendingProvider(null);
		}
	};

	function openStepUp(code: StepUpCode) {
		dispatchStepUp({
			type: "open",
			mode: code === "reauth_required" ? "reauth" : "password",
		});
		if (code === "invalid_password") {
			dispatchStepUp({ type: "setError", error: "Incorrect password." });
		}
	}

	const handleDisconnect = async (account: { providerId: string; accountId: string }) => {
		setPendingProvider(account.providerId);
		setError(null);
		try {
			await unlinkProvider({
				providerId: account.providerId,
				accountId: account.accountId,
			});
			await refresh();
		} catch (err) {
			if (isStepUpError(err)) {
				pendingUnlinkRef.current = account;
				openStepUp(err.code);
			} else {
				setError(err instanceof Error ? err.message : "Could not disconnect account.");
			}
		} finally {
			setPendingProvider(null);
		}
	};

	const handleStepUpConfirm = async () => {
		const target = pendingUnlinkRef.current;
		if (!target || stepUp.mode !== "password" || stepUp.pending) return;
		dispatchStepUp({ type: "setPending", pending: true });
		dispatchStepUp({ type: "setError", error: null });
		try {
			await unlinkProvider({
				providerId: target.providerId,
				accountId: target.accountId,
				password: stepUp.password,
			});
			pendingUnlinkRef.current = null;
			dispatchStepUp({ type: "close" });
			await refresh();
		} catch (err) {
			if (isStepUpError(err)) {
				openStepUp(err.code);
			} else {
				dispatchStepUp({
					type: "setError",
					error: err instanceof Error ? err.message : "Could not disconnect account.",
				});
				dispatchStepUp({ type: "setPending", pending: false });
			}
		}
	};

	const handleStepUpReauth = async (provider: OAuthProvider) => {
		dispatchStepUp({ type: "setPending", pending: true });
		dispatchStepUp({ type: "setError", error: null });
		try {
			await signInWithOAuth(provider, { rememberMe: true });
		} catch {
			dispatchStepUp({
				type: "setError",
				error: "Could not start re-authentication. Please try again.",
			});
			dispatchStepUp({ type: "setPending", pending: false });
		}
	};

	const handleStepUpOpenChange = (open: boolean) => {
		if (open) return;
		dispatchStepUp({ type: "close" });
		pendingUnlinkRef.current = null;
	};

	const loginMethodCount = snapshot?.loginMethodCount ?? 0;
	const isLastMethod = loginMethodCount <= 1;
	const reauthProviders = (snapshot?.accounts ?? [])
		.map((account) => account.providerId)
		.filter((id): id is OAuthProvider => id === "github" || id === "google");
	const isInitialLoading = isLoading && snapshot === null;
	const hasLoadError = Boolean(error) && snapshot === null;

	if (isInitialLoading) {
		return (
			<>
				<GroupLabel>CONNECTED ACCOUNTS</GroupLabel>
				<SettingsCard>
					{SUPPORTED_OAUTH_PROVIDERS.map((provider) => (
						<Row
							key={provider.id}
							title={provider.label}
							description="Loading…"
							visualization={
								<span className="flex items-center gap-2 text-xs text-muted-foreground">
									<LoaderCircle className="size-3.5 animate-spin" />
									Checking connection…
								</span>
							}
						>
							<div className="h-8 w-20 animate-pulse rounded-md border border-border bg-accent/40" />
						</Row>
					))}
				</SettingsCard>
			</>
		);
	}

	if (hasLoadError) {
		return (
			<>
				<GroupLabel>CONNECTED ACCOUNTS</GroupLabel>
				<SettingsCard>
					<div className="flex items-center justify-between gap-4 py-4">
						<span className="flex items-center gap-2 text-xs text-destructive">
							<CircleAlert className="size-3.5" />
							{error}
						</span>
						<Button variant="outline" size="sm" onClick={() => void refresh()}>
							Retry
						</Button>
					</div>
				</SettingsCard>
			</>
		);
	}

	return (
		<>
			<GroupLabel>CONNECTED ACCOUNTS</GroupLabel>
			<SettingsCard>
				{SUPPORTED_OAUTH_PROVIDERS.map((provider) => {
					const linked = snapshot?.accounts.find(
						(account) => account.providerId === provider.id,
					);
					const isConnected = Boolean(linked);
					const isPending = pendingProvider === provider.id;
					const blockDisconnect = isConnected && isLastMethod;

					return (
						<Row
							key={provider.id}
							title={provider.label}
							description={
								isConnected
									? blockDisconnect
										? "Your only sign-in method — add a password or another provider first."
										: "Connected. Used to sign in."
									: `Connect ${provider.label} to sign in with one click.`
							}
							visualization={
								<span className="flex items-center gap-2 text-xs text-muted-foreground">
									<ProviderGlyph id={provider.id} />
									{isConnected ? "Connected" : "Not connected"}
								</span>
							}
						>
							{isConnected ? (
								<Button
									variant="outline"
									size="sm"
									disabled={isLoading || isPending || blockDisconnect}
									onClick={() =>
										linked &&
										handleDisconnect({
											providerId: linked.providerId,
											accountId: linked.accountId,
										})
									}
								>
									{isPending ? "Disconnecting…" : "Disconnect"}
								</Button>
							) : (
								<Button
									size="sm"
									disabled={isLoading || isPending}
									onClick={() => handleConnect(provider)}
								>
									{isPending ? "Connecting…" : "Connect"}
								</Button>
							)}
						</Row>
					);
				})}
			</SettingsCard>
			{error && (
				<p role="alert" className="mt-2 px-1 text-xs text-destructive">
					{error}
				</p>
			)}

			<StepUpDialog
				open={stepUp.open}
				mode={stepUp.mode}
				title="Confirm it's you"
				description={
					stepUp.mode === "password"
						? "Enter your password to disconnect this sign-in method."
						: "For your security, re-authenticate before disconnecting this sign-in method."
				}
				confirmLabel="Disconnect"
				password={stepUp.password}
				error={stepUp.error}
				pending={stepUp.pending}
				reauthProviders={reauthProviders}
				onPasswordChange={(value) =>
					dispatchStepUp({ type: "setPassword", password: value })
				}
				onConfirm={handleStepUpConfirm}
				onReauth={handleStepUpReauth}
				onOpenChange={handleStepUpOpenChange}
			/>
		</>
	);
}
