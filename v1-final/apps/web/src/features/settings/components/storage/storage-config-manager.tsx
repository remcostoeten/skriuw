"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { CheckCircle, CircleAlert, Clock, HardDrive, LoaderCircle } from "lucide-react";
import { DeleteButton } from "@/shared/ui/delete-button";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { settingsFocusDomId } from "@/features/settings/lib/settings-focus-anchor";
import type { StorageProviderId, UserStorageConfigSummary } from "@/domain/storage/types";

type LoadState = "idle" | "loading" | "error";

type ConfigState = {
	config: UserStorageConfigSummary | null;
	loadState: LoadState;
	error: string | null;
	saving: boolean;
};

type ConfigAction =
	| { type: "LOAD_START" }
	| { type: "LOAD_SUCCESS"; config: UserStorageConfigSummary | null }
	| { type: "LOAD_ERROR"; error: string }
	| { type: "SAVE_START" }
	| { type: "SAVE_SUCCESS"; config: UserStorageConfigSummary }
	| { type: "SAVE_ERROR"; error: string }
	| { type: "REMOVE" }
	| { type: "CLEAR_ERROR" };

function configReducer(state: ConfigState, action: ConfigAction): ConfigState {
	switch (action.type) {
		case "LOAD_START":
			return { ...state, loadState: "loading", error: null };
		case "LOAD_SUCCESS":
			return { ...state, config: action.config, loadState: "idle" };
		case "LOAD_ERROR":
			return { ...state, loadState: "error", error: action.error };
		case "SAVE_START":
			return { ...state, saving: true, error: null };
		case "SAVE_SUCCESS":
			return { ...state, config: action.config, saving: false };
		case "SAVE_ERROR":
			return { ...state, error: action.error, saving: false };
		case "REMOVE":
			return { ...state, config: null };
		case "CLEAR_ERROR":
			return { ...state, error: null };
		default:
			return state;
	}
}

const CONFIG_INITIAL: ConfigState = {
	config: null,
	loadState: "idle",
	error: null,
	saving: false,
};

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
	dateStyle: "medium",
	timeStyle: "short",
});

function formatDate(value: string | null) {
	if (!value) return "Never";
	return DATE_FORMATTER.format(new Date(value));
}

function FormattedDate({ value }: { value: string | null }) {
	return <span suppressHydrationWarning>{formatDate(value)}</span>;
}

function StatusBadge({ status }: { status: string }) {
	const ok = status === "valid";
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
				ok
					? "border-success/25 bg-success/10 text-success"
					: "border-destructive/25 bg-destructive/10 text-destructive",
			)}
		>
			{ok ? <CheckCircle className="h-3 w-3" /> : <CircleAlert className="h-3 w-3" />}
			{status.replace("_", " ")}
		</span>
	);
}

export function StorageConfigManager({ isSignedIn }: { isSignedIn: boolean }) {
	const [{ config, loadState, error, saving }, dispatch] = useReducer(
		configReducer,
		CONFIG_INITIAL,
	);
	const [provider, setProvider] = useState<StorageProviderId>("vercel-blob");

	const [token, setToken] = useState("");
	const [region, setRegion] = useState("");
	const [bucket, setBucket] = useState("");
	const [accessKeyId, setAccessKeyId] = useState("");
	const [secretAccessKey, setSecretAccessKey] = useState("");
	const [endpoint, setEndpoint] = useState("");
	const [publicBaseUrl, setPublicBaseUrl] = useState("");

	const loadConfig = useCallback(async () => {
		if (!isSignedIn) return;
		dispatch({ type: "LOAD_START" });
		try {
			const res = await fetch("/api/storage/config");
			if (!res.ok) throw new Error("Could not load storage config.");
			const data = (await res.json()) as { config: UserStorageConfigSummary | null };
			dispatch({ type: "LOAD_SUCCESS", config: data.config });
		} catch (err) {
			dispatch({
				type: "LOAD_ERROR",
				error: err instanceof Error ? err.message : "Could not load storage config.",
			});
		}
	}, [isSignedIn]);

	useEffect(() => {
		void loadConfig();
	}, [loadConfig]);

	async function saveConfig() {
		dispatch({ type: "SAVE_START" });
		try {
			const body =
				provider === "vercel-blob"
					? { provider, token }
					: {
							provider,
							region,
							bucket,
							accessKeyId,
							secretAccessKey,
							endpoint,
							publicBaseUrl,
						};
			const res = await fetch("/api/storage/config", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			const data = (await res.json().catch(() => ({}))) as {
				config?: UserStorageConfigSummary;
				error?: string;
			};
			if (!res.ok || !data.config)
				throw new Error(data.error ?? "Could not save storage config.");
			dispatch({ type: "SAVE_SUCCESS", config: data.config });
			setToken("");
			setRegion("");
			setBucket("");
			setAccessKeyId("");
			setSecretAccessKey("");
			setEndpoint("");
			setPublicBaseUrl("");
		} catch (err) {
			dispatch({
				type: "SAVE_ERROR",
				error: err instanceof Error ? err.message : "Could not save storage config.",
			});
		}
	}

	async function removeConfig(): Promise<boolean> {
		dispatch({ type: "CLEAR_ERROR" });
		try {
			const res = await fetch("/api/storage/config", { method: "DELETE" });
			if (!res.ok) {
				dispatch({ type: "SAVE_ERROR", error: "Could not remove storage config." });
				return false;
			}
			dispatch({ type: "REMOVE" });
			return true;
		} catch (err) {
			dispatch({
				type: "SAVE_ERROR",
				error: err instanceof Error ? err.message : "Could not remove storage config.",
			});
			return false;
		}
	}

	if (!isSignedIn) {
		return (
			<div className="rounded-lg border border-border/60 bg-card/40 px-5 py-4">
				<p className="text-sm text-muted-foreground">
					Sign in to connect your own storage for cover images.
				</p>
			</div>
		);
	}

	return (
		<div
			id={settingsFocusDomId("storage-config")}
			data-settings-focus="storage-config"
			className="scroll-mt-24 rounded-lg border border-border/60 bg-card/40 px-5 py-4"
		>
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<h3 className="text-sm font-medium text-foreground">Your own vault</h3>
					<p className="text-xs text-muted-foreground">
						Connect your own Vercel Blob store or S3-compatible bucket for note cover
						images — uploads skip the shared 100MB quota entirely. Credentials stay
						encrypted server-side.
					</p>
				</div>
				<HardDrive className="h-4 w-4 text-muted-foreground" />
			</div>

			<div className="my-4 border-t border-border/50" />

			{loadState === "loading" && !config ? (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<LoaderCircle className="h-4 w-4 animate-spin" />
					Loading
				</div>
			) : null}

			{config ? (
				<div className="border border-border bg-background p-3">
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0 space-y-1">
							<div className="flex flex-wrap items-center gap-2">
								<p className="truncate text-sm font-medium text-foreground">
									{config.provider === "vercel-blob"
										? "Vercel Blob"
										: "S3-compatible"}
								</p>
								<StatusBadge status={config.status} />
							</div>
							<p className="font-mono text-xs text-muted-foreground">
								{config.configPreview}
							</p>
							<p className="flex items-center gap-1 text-xs text-muted-foreground/70">
								<Clock className="h-3 w-3" />
								Verified <FormattedDate value={config.lastTestedAt} />
							</p>
						</div>
						<DeleteButton
							onDelete={removeConfig}
							confirmLabel="Confirm remove"
							pendingLabel="Removing"
							successLabel="Removed"
							failedLabel="Retry"
						/>
					</div>
				</div>
			) : (
				<div className="space-y-3">
					<div className="flex gap-1">
						{(["vercel-blob", "s3"] as const).map((p) => (
							<button
								key={p}
								type="button"
								onClick={() => setProvider(p)}
								className={cn(
									"border px-3 py-1 text-xs transition-colors",
									provider === p
										? "border-ring bg-accent text-accent-foreground"
										: "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
								)}
							>
								{p === "vercel-blob" ? "Vercel Blob" : "S3-compatible"}
							</button>
						))}
					</div>

					{provider === "vercel-blob" ? (
						<input
							value={token}
							onChange={(event) => setToken(event.target.value)}
							placeholder="BLOB_READ_WRITE_TOKEN"
							type="password"
							autoComplete="off"
							spellCheck={false}
							className="h-10 w-full border border-border bg-background px-3 font-mono text-base outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-ring md:text-sm"
						/>
					) : (
						<div className="grid gap-2 sm:grid-cols-2">
							<input
								value={region}
								onChange={(event) => setRegion(event.target.value)}
								placeholder="Region (e.g. auto, us-east-1)"
								className="h-10 border border-border bg-background px-3 text-base outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-ring md:text-sm"
							/>
							<input
								value={bucket}
								onChange={(event) => setBucket(event.target.value)}
								placeholder="Bucket name"
								className="h-10 border border-border bg-background px-3 text-base outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-ring md:text-sm"
							/>
							<input
								value={accessKeyId}
								onChange={(event) => setAccessKeyId(event.target.value)}
								placeholder="Access key ID"
								className="h-10 border border-border bg-background px-3 font-mono text-base outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-ring md:text-sm"
							/>
							<input
								value={secretAccessKey}
								onChange={(event) => setSecretAccessKey(event.target.value)}
								placeholder="Secret access key"
								type="password"
								autoComplete="off"
								spellCheck={false}
								className="h-10 border border-border bg-background px-3 font-mono text-base outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-ring md:text-sm"
							/>
							<input
								value={endpoint}
								onChange={(event) => setEndpoint(event.target.value)}
								placeholder="Endpoint (optional — R2, MinIO, etc)"
								className="h-10 border border-border bg-background px-3 text-base outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-ring md:text-sm"
							/>
							<input
								value={publicBaseUrl}
								onChange={(event) => setPublicBaseUrl(event.target.value)}
								placeholder="Public base URL (optional)"
								className="h-10 border border-border bg-background px-3 text-base outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-ring md:text-sm"
							/>
						</div>
					)}

					<Button
						type="button"
						onClick={() => void saveConfig()}
						disabled={
							saving ||
							(provider === "vercel-blob"
								? !token.trim()
								: !region.trim() ||
									!bucket.trim() ||
									!accessKeyId.trim() ||
									!secretAccessKey.trim())
						}
						className="h-10"
					>
						{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
						Connect storage
					</Button>
				</div>
			)}

			{error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
		</div>
	);
}
