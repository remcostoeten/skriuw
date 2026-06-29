"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import {
	SUPPORTED_OAUTH_PROVIDERS,
	listConnections,
	linkProvider,
	unlinkProvider,
	type ConnectionsSnapshot,
	type ProviderMeta,
} from "@/core/auth/connections";
import type { OAuthProvider } from "@/core/auth";
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

export function ConnectedAccounts() {
	const [snapshot, setSnapshot] = useState<ConnectionsSnapshot | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [pendingProvider, setPendingProvider] = useState<string | null>(null);

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
			setError(err instanceof Error ? err.message : "Could not disconnect account.");
		} finally {
			setPendingProvider(null);
		}
	};

	const loginMethodCount = snapshot?.loginMethodCount ?? 0;
	const isLastMethod = loginMethodCount <= 1;

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
									title={
										blockDisconnect
											? "You can't remove your last sign-in method."
											: undefined
									}
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
		</>
	);
}
