"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, Download, Loader2, Play, Radio, X } from "lucide-react";
import { DeleteButton } from "@/shared/ui/delete-button";
import { MorphingLabel } from "@/shared/ui/morphing-label";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/ui/select";
import {
	GroupLabel,
	Row,
	SectionHeader,
	SettingsCard,
} from "@/features/settings/components/settings-primitives";
import { tauriChannel, tauriInvoke } from "@/core/workspace-backend";

type AiProvider = "ollama" | "groq" | "gemini";

type AiConfig = {
	provider: AiProvider;
	ollamaEndpoint: string;
	ollamaModel: string;
	groqModel: string;
	geminiModel: string;
	hasGroqKey: boolean;
	hasGeminiKey: boolean;
};

type OllamaStatus = {
	managed: boolean;
	installPath: string | null;
	binaryReady: boolean;
	running: boolean;
	version: string | null;
};

type CatalogEntry = {
	name: string;
	label: string;
	description: string;
	installed: boolean;
	sizeBytes: number | null;
};

type InstallEvent =
	| { type: "status"; message: string }
	| { type: "progress"; completed: number; total: number | null; percent: number }
	| { type: "done"; version: string | null; installPath: string }
	| { type: "error"; message: string };

type PullEvent =
	| { type: "status"; message: string }
	| { type: "progress"; completed: number; total: number; percent: number; etaSeconds: number | null }
	| { type: "done"; model: string }
	| { type: "error"; message: string };

type PullState = { percent: number; etaSeconds: number | null; status: string };

type PingResult = {
	provider: AiProvider;
	model: string;
	ok: boolean;
	latencyMs: number;
	message: string;
};

const PROVIDER_LABELS: Record<AiProvider, string> = {
	ollama: "Ollama (local)",
	groq: "Groq (cloud)",
	gemini: "Gemini (cloud)",
};

function formatBytes(bytes: number): string {
	if (bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
	return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatEta(seconds: number | null): string {
	if (seconds == null || !Number.isFinite(seconds)) return "";
	if (seconds < 60) return `${Math.round(seconds)}s left`;
	const m = Math.floor(seconds / 60);
	const s = Math.round(seconds % 60);
	return `${m}m ${s}s left`;
}

export function DesktopAiSection() {
	const [config, setConfig] = useState<AiConfig | null>(null);
	const [status, setStatus] = useState<OllamaStatus | null>(null);
	const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
	const [installState, setInstallState] = useState<{ percent: number; message: string } | null>(
		null,
	);
	const [pullState, setPullState] = useState<Record<string, PullState>>({});
	const [keyDraft, setKeyDraft] = useState("");
	const [notice, setNotice] = useState<string | null>(null);
	const [pinging, setPinging] = useState(false);
	const [pingResult, setPingResult] = useState<PingResult | null>(null);

	const refreshOllama = useCallback(async () => {
		const [nextStatus, nextCatalog] = await Promise.all([
			tauriInvoke<OllamaStatus>("ai_ollama_status").catch(() => null),
			tauriInvoke<CatalogEntry[]>("ai_ollama_catalog").catch(() => [] as CatalogEntry[]),
		]);
		setStatus(nextStatus);
		setCatalog(nextCatalog);
	}, []);

	useEffect(() => {
		tauriInvoke<AiConfig>("ai_get_config")
			.then(setConfig)
			.catch(() => setConfig(null));
		void refreshOllama();
	}, [refreshOllama]);

	const patchConfig = useCallback(async (patch: Partial<AiConfig>) => {
		const next = await tauriInvoke<AiConfig>("ai_set_config", { patch });
		setConfig(next);
	}, []);

	const handleInstall = useCallback(async () => {
		setNotice(null);
		setInstallState({ percent: 0, message: "Starting…" });
		const channel = tauriChannel<InstallEvent>((event) => {
			if (event.type === "progress") {
				setInstallState({ percent: event.percent, message: "Downloading Ollama…" });
			} else if (event.type === "status") {
				setInstallState((prev) => ({ percent: prev?.percent ?? 0, message: event.message }));
			} else if (event.type === "done") {
				setInstallState(null);
				setNotice("Ollama installed and running.");
				void refreshOllama();
			} else if (event.type === "error") {
				setInstallState(null);
				setNotice(event.message);
			}
		});
		try {
			await tauriInvoke<void>("ai_install_ollama", { onEvent: channel });
		} catch (error) {
			setInstallState(null);
			setNotice(error instanceof Error ? error.message : String(error));
		}
		void refreshOllama();
	}, [refreshOllama]);

	const handleCancelInstall = useCallback(async () => {
		await tauriInvoke<void>("ai_cancel_ollama_install").catch(() => undefined);
		setInstallState(null);
	}, []);

	const handleStart = useCallback(async () => {
		setNotice(null);
		try {
			await tauriInvoke<void>("ai_start_ollama");
			await refreshOllama();
		} catch (error) {
			setNotice(error instanceof Error ? error.message : String(error));
		}
	}, [refreshOllama]);

	const handlePull = useCallback(
		async (model: string) => {
			setNotice(null);
			setPullState((prev) => ({
				...prev,
				[model]: { percent: 0, etaSeconds: null, status: "Starting…" },
			}));
			const channel = tauriChannel<PullEvent>((event) => {
				if (event.type === "progress") {
					setPullState((prev) => ({
						...prev,
						[model]: {
							percent: event.percent,
							etaSeconds: event.etaSeconds,
							status: "Downloading…",
						},
					}));
				} else if (event.type === "status") {
					setPullState((prev) => ({
						...prev,
						[model]: { ...(prev[model] ?? { percent: 0, etaSeconds: null }), status: event.message },
					}));
				} else if (event.type === "done") {
					setPullState((prev) => {
						const next = { ...prev };
						delete next[model];
						return next;
					});
					void refreshOllama();
				} else if (event.type === "error") {
					setPullState((prev) => {
						const next = { ...prev };
						delete next[model];
						return next;
					});
					setNotice(event.message);
				}
			});
			try {
				await tauriInvoke<void>("ai_pull_ollama_model", { model, onEvent: channel });
			} catch (error) {
				setPullState((prev) => {
					const next = { ...prev };
					delete next[model];
					return next;
				});
				setNotice(error instanceof Error ? error.message : String(error));
			}
		},
		[refreshOllama],
	);

	const handleCancelPull = useCallback(async (model: string) => {
		await tauriInvoke<void>("ai_cancel_ollama_pull").catch(() => undefined);
		setPullState((prev) => {
			const next = { ...prev };
			delete next[model];
			return next;
		});
	}, []);

	const handleDelete = useCallback(
		async (model: string): Promise<boolean> => {
			try {
				await tauriInvoke<void>("ai_delete_ollama_model", { model });
				await refreshOllama();
				return true;
			} catch (error) {
				setNotice(error instanceof Error ? error.message : String(error));
				return false;
			}
		},
		[refreshOllama],
	);

	const handlePing = useCallback(async () => {
		setPinging(true);
		setPingResult(null);
		try {
			const result = await tauriInvoke<PingResult>("ai_ping");
			setPingResult(result);
		} catch (error) {
			setPingResult({
				provider: config?.provider ?? "ollama",
				model: "",
				ok: false,
				latencyMs: 0,
				message: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setPinging(false);
		}
	}, [config]);

	const handleSaveKey = useCallback(async () => {
		if (!config) return;
		const provider = config.provider;
		const next = await tauriInvoke<AiConfig>("ai_set_key", { provider, key: keyDraft.trim() });
		setConfig(next);
		setKeyDraft("");
		setNotice(keyDraft.trim() ? "API key saved." : "API key cleared.");
	}, [config, keyDraft]);

	if (!config) {
		return (
			<div>
				<SectionHeader title="AI" description="Loading local AI settings…" />
			</div>
		);
	}

	const installedModels = catalog.filter((entry) => entry.installed);

	return (
		<div>
			<SectionHeader
				title="AI"
				description="Run AI on this device with a local model, or connect a cloud provider. Keys stay on your machine."
			/>

			<GroupLabel>Provider</GroupLabel>
			<SettingsCard>
				<Row focusId="desktop-provider" title="AI provider" description="Where title, spell-check, and continue-writing run.">
					<Select
						value={config.provider}
						onValueChange={(value) => patchConfig({ provider: value as AiProvider })}
					>
						<SelectTrigger className="w-44">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{(Object.keys(PROVIDER_LABELS) as AiProvider[]).map((provider) => (
								<SelectItem key={provider} value={provider}>
									{PROVIDER_LABELS[provider]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Row>
			</SettingsCard>

			<GroupLabel>Test model</GroupLabel>
			<SettingsCard>
				<Row
					focusId="desktop-test-model"
					title={PROVIDER_LABELS[config.provider]}
					description={
						config.provider === "ollama"
							? config.ollamaModel
							: config.provider === "groq"
								? config.groqModel
								: config.geminiModel
					}
				>
					<Button variant="outline" size="sm" onClick={handlePing} disabled={pinging}>
						{pinging ? (
							<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
						) : (
							<Radio className="mr-1.5 h-3.5 w-3.5" />
						)}
						{pinging ? "Pinging\u2026" : "Send ping"}
					</Button>
				</Row>
				{pingResult ? (
					<div
						className={`flex items-center gap-1.5 text-xs ${pingResult.ok ? "text-emerald-500" : "text-destructive"}`}
					>
						{pingResult.ok ? (
							<Check className="h-3.5 w-3.5 shrink-0" />
						) : (
							<X className="h-3.5 w-3.5 shrink-0" />
						)}
						<span>
							{pingResult.ok
								? `Replied in ${pingResult.latencyMs}ms: "${pingResult.message}"`
								: pingResult.message}
						</span>
					</div>
				) : null}
			</SettingsCard>

			{config.provider === "ollama" ? (
				<>
					<GroupLabel>Local engine</GroupLabel>
					<SettingsCard>
						<Row
							focusId="desktop-ollama-runtime"
							title="Ollama runtime"
							description={
								status?.running
									? `Running${status.version ? ` · v${status.version}` : ""}`
									: status?.binaryReady
										? "Installed but not running"
										: "Not installed — one click downloads and starts it."
							}
						>
							{status?.running ? (
								<span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
									<Check className="h-3.5 w-3.5 text-emerald-500" />
									Ready
								</span>
							) : status?.binaryReady && !installState ? (
								<Button variant="outline" size="sm" onClick={handleStart}>
									<Play className="mr-1.5 h-3.5 w-3.5" />
									Start
								</Button>
							) : (
								<div className="flex items-center gap-2">
									{installState ? (
										<span className="text-xs text-muted-foreground">
											{installState.message} {Math.round(installState.percent)}%
										</span>
									) : null}
									<Button
										variant="outline"
										size="sm"
										onClick={installState ? handleCancelInstall : handleInstall}
									>
										<MorphingLabel
											activeKey={installState ? "cancel" : "install"}
											frames={[
												{
													key: "install",
													content: (
														<>
															<Download className="mr-1.5 h-3.5 w-3.5" />
															Install Ollama
														</>
													),
												},
												{
													key: "cancel",
													content: (
														<>
															<X className="mr-1 h-3.5 w-3.5" />
															Cancel
														</>
													),
												},
											]}
										/>
									</Button>
								</div>
							)}
						</Row>
						{installState ? (
							<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
								<div
									className="h-full bg-foreground/70 transition-all"
									style={{ width: `${Math.min(100, installState.percent)}%` }}
								/>
							</div>
						) : null}

						{installedModels.length > 0 ? (
							<Row focusId="desktop-active-model" title="Active model" description="The local model used for AI actions.">
								<div className="relative w-48">
									<select
										className="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
										value={config.ollamaModel}
										onChange={(event) => patchConfig({ ollamaModel: event.target.value })}
									>
										{installedModels.map((entry) => (
											<option key={entry.name} value={entry.name}>
												{entry.name}
											</option>
										))}
									</select>
									<ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
								</div>
							</Row>
						) : null}
					</SettingsCard>

					<GroupLabel focusId="desktop-models">Models</GroupLabel>
					<SettingsCard>
						{catalog.map((entry) => {
							const pull = pullState[entry.name];
							return (
								<Row
									key={entry.name}
									title={`${entry.label} · ${entry.name}`}
									description={
										entry.installed && entry.sizeBytes
											? `Installed · ${formatBytes(entry.sizeBytes)}`
											: entry.description
									}
									visualization={
										pull ? (
											<div className="w-full">
												<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
													<div
														className="h-full bg-foreground/70 transition-all"
														style={{ width: `${Math.min(100, pull.percent)}%` }}
													/>
												</div>
												<div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
													<span>{pull.status}</span>
													<span>
														{Math.round(pull.percent)}% {formatEta(pull.etaSeconds)}
													</span>
												</div>
											</div>
										) : undefined
									}
								>
									{entry.installed ? (
										<DeleteButton
											onDelete={() => handleDelete(entry.name)}
											label="Remove"
											confirmLabel="Confirm remove"
											pendingLabel="Removing"
											successLabel="Removed"
											failedLabel="Retry"
										/>
									) : (
										<Button
											variant="outline"
											size="sm"
											onClick={
												pull ? () => handleCancelPull(entry.name) : () => handlePull(entry.name)
											}
											disabled={!pull && !status?.running}
										>
											<MorphingLabel
												activeKey={pull ? "cancel" : "download"}
												frames={[
													{
														key: "download",
														content: (
															<>
																<Download className="mr-1.5 h-3.5 w-3.5" />
																Download
															</>
														),
													},
													{
														key: "cancel",
														content: (
															<>
																<X className="mr-1 h-3.5 w-3.5" />
																Cancel
															</>
														),
													},
												]}
											/>
										</Button>
									)}
								</Row>
							);
						})}
						{!status?.running ? (
							<p className="pt-2 text-xs text-muted-foreground">
								Start Ollama to download models.
							</p>
						) : null}
					</SettingsCard>
				</>
			) : (
				<>
					<GroupLabel>{config.provider === "groq" ? "Groq" : "Gemini"}</GroupLabel>
					<SettingsCard>
						<Row
							focusId="desktop-cloud-model"
							title="Model"
							description={
								config.provider === "groq"
									? "Groq model id (e.g. llama-3.3-70b-versatile)."
									: "Gemini model id (e.g. gemini-2.5-flash)."
							}
						>
							<Input
								className="w-56"
								defaultValue={
									config.provider === "groq" ? config.groqModel : config.geminiModel
								}
								onBlur={(event) =>
									patchConfig(
										config.provider === "groq"
											? { groqModel: event.target.value.trim() }
											: { geminiModel: event.target.value.trim() },
									)
								}
							/>
						</Row>
						<Row
							focusId="desktop-cloud-key"
							title="API key"
							description={
								(config.provider === "groq" ? config.hasGroqKey : config.hasGeminiKey)
									? "A key is saved on this device. Enter a new one to replace it, or save empty to clear."
									: "Stored locally in settings.json on this device."
							}
						>
							<div className="flex gap-2">
								<Input
									type="password"
									className="w-56"
									placeholder={
										(config.provider === "groq" ? config.hasGroqKey : config.hasGeminiKey)
											? "••••••••"
											: "Paste API key"
									}
									value={keyDraft}
									onChange={(event) => setKeyDraft(event.target.value)}
								/>
								<Button variant="outline" size="sm" onClick={handleSaveKey}>
									Save
								</Button>
							</div>
						</Row>
					</SettingsCard>
				</>
			)}

			{notice ? <p className="mt-4 text-xs text-muted-foreground">{notice}</p> : null}
		</div>
	);
}
