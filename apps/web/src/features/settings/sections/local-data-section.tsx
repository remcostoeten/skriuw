"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CloudDownload, Download, FolderOpen, RotateCcw, Trash2, Upload } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
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
import {
	GroupLabel,
	Row,
	SectionHeader,
	SettingsCard,
} from "@/features/settings/components/settings-primitives";
import { tauriInvoke, useWorkspaceBackend } from "@/core/workspace-backend";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import { journalKeys } from "@/features/journal/hooks/journal-keys";
import { pullWorkspaceFromServer } from "@/domain/sync/pull-workspace";
import {
	getSyncClientConfig,
	setSyncClientConfig,
} from "@/domain/sync/sync-client-config";

type Busy = "idle" | "export" | "import" | "clear" | "pull";

/**
 * Desktop ("tauri" mode) replacement for the cloud Data & sync section. Every
 * action is local: the markdown vault is the source of truth, so backup is a
 * portable .zip of it and restore/clear rebuild the SQLite index from disk.
 */
export function LocalDataSection() {
	const queryClient = useQueryClient();
	const backend = useWorkspaceBackend();
	const [vaultRoot, setVaultRoot] = useState<string>("");
	const [busy, setBusy] = useState<Busy>("idle");
	const [notice, setNotice] = useState<string | null>(null);
	const [serverUrl, setServerUrl] = useState<string>("");
	const [token, setToken] = useState<string>("");

	useEffect(() => {
		tauriInvoke<string>("get_vault_root")
			.then(setVaultRoot)
			.catch(() => setVaultRoot(""));
	}, []);

	useEffect(() => {
		const config = getSyncClientConfig();
		if (config) {
			setServerUrl(config.serverUrl);
			setToken(config.token);
		}
	}, []);

	const handlePull = async () => {
		const url = serverUrl.trim();
		const tok = token.trim();
		if (!url || !tok) {
			setNotice("Enter your server URL and a sync token first.");
			return;
		}
		setBusy("pull");
		setNotice(null);
		try {
			const result = await pullWorkspaceFromServer(backend, url, tok);
			setSyncClientConfig({ serverUrl: url, token: tok });
			await queryClient.invalidateQueries({ queryKey: notesKeys.all });
			await queryClient.invalidateQueries({ queryKey: journalKeys.all });
			setNotice(
				`Pulled ${result.notes} notes, ${result.folders} folders, ${result.journalEntries} journal entries.`,
			);
		} catch (error) {
			setNotice(error instanceof Error ? error.message : "Sync failed.");
		} finally {
			setBusy("idle");
		}
	};

	async function refreshWorkspace() {
		await queryClient.invalidateQueries({ queryKey: notesKeys.all });
	}

	const handleExport = async () => {
		setBusy("export");
		setNotice(null);
		try {
			const out = await tauriInvoke<string | null>("export_vault");
			setNotice(out ? `Backed up to ${out}` : null);
		} catch (error) {
			setNotice(error instanceof Error ? error.message : "Backup failed.");
		} finally {
			setBusy("idle");
		}
	};

	const handleImport = async () => {
		setBusy("import");
		setNotice(null);
		try {
			const restored = await tauriInvoke<boolean>("import_vault");
			if (restored) {
				await refreshWorkspace();
				setNotice("Vault restored from backup.");
			}
		} catch (error) {
			setNotice(error instanceof Error ? error.message : "Restore failed.");
		} finally {
			setBusy("idle");
		}
	};

	const handleClear = async () => {
		setBusy("clear");
		setNotice(null);
		try {
			await tauriInvoke<void>("clear_local_data");
			await refreshWorkspace();
			setNotice("All local notes were deleted.");
		} catch (error) {
			setNotice(error instanceof Error ? error.message : "Clear failed.");
		} finally {
			setBusy("idle");
		}
	};

	const handleChangeDirectory = async () => {
		const next = await tauriInvoke<string | null>("choose_vault_root");
		if (next) {
			setVaultRoot(next);
			setNotice("Vault directory updated. Restart Skriuw to load it.");
		}
	};

	const handleReveal = async () => {
		await tauriInvoke<void>("reveal_vault").catch(() => undefined);
	};

	return (
		<div>
			<SectionHeader
				title="Data"
				description="Your notes live as plain markdown on this device. Back them up, restore, or move the vault anytime."
			/>

			<GroupLabel>Vault</GroupLabel>
			<SettingsCard>
				<Row
					title="Vault directory"
					description={vaultRoot || "Loading…"}
				>
					<div className="flex gap-2">
						<Button variant="outline" size="sm" onClick={handleReveal}>
							<FolderOpen className="mr-1.5 h-3.5 w-3.5" />
							Open
						</Button>
						<Button variant="outline" size="sm" onClick={handleChangeDirectory}>
							Change…
						</Button>
					</div>
				</Row>
			</SettingsCard>

			<GroupLabel>Cloud sync</GroupLabel>
			<SettingsCard>
				<div className="py-4">
					<div className="flex items-center gap-2 text-sm font-medium">
						<CloudDownload className="size-4 text-muted-foreground" />
						Pull from server
					</div>
					<p className="mt-1 text-xs text-muted-foreground">
						Download your cloud workspace into this device. Create a token in the web app
						under <span className="font-mono text-foreground">Settings → Data &amp; sync</span>,
						then paste it here. This is one-way: it never uploads local changes.
					</p>
					<p className="mt-1 text-xs text-muted-foreground">
						Include the full address with scheme — e.g.{" "}
						<span className="font-mono text-foreground">http://localhost:3000</span> for local
						dev, or <span className="font-mono text-foreground">https://your-host.com</span>.
					</p>

					<div className="mt-4 flex flex-col gap-3">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="sync-server-url" className="text-xs text-muted-foreground">
								Server URL
							</Label>
							<Input
								id="sync-server-url"
								value={serverUrl}
								onChange={(event) => setServerUrl(event.target.value)}
								disabled={busy === "pull"}
								placeholder="https://your-skriuw-host.com"
								autoComplete="off"
								spellCheck={false}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="sync-token" className="text-xs text-muted-foreground">
								Sync token
							</Label>
							<Input
								id="sync-token"
								type="password"
								value={token}
								onChange={(event) => setToken(event.target.value)}
								disabled={busy === "pull"}
								placeholder="sk_sync_…"
								autoComplete="off"
								spellCheck={false}
							/>
						</div>
						<div className="flex justify-end">
							<Button
								size="sm"
								onClick={handlePull}
								disabled={busy !== "idle" || !serverUrl.trim() || !token.trim()}
							>
								<CloudDownload className="mr-1.5 h-3.5 w-3.5" />
								{busy === "pull" ? "Pulling…" : "Pull now"}
							</Button>
						</div>
					</div>
				</div>
			</SettingsCard>

			<GroupLabel>Backup</GroupLabel>
			<SettingsCard>
				<Row title="Back up vault" description="Save a .zip of every note and folder.">
					<Button variant="outline" size="sm" onClick={handleExport} disabled={busy !== "idle"}>
						<Download className="mr-1.5 h-3.5 w-3.5" />
						{busy === "export" ? "Backing up…" : "Back up"}
					</Button>
				</Row>
				<Row
					title="Restore from backup"
					description="Replace the current vault with a .zip backup."
				>
					<Button variant="outline" size="sm" onClick={handleImport} disabled={busy !== "idle"}>
						<Upload className="mr-1.5 h-3.5 w-3.5" />
						{busy === "import" ? "Restoring…" : "Restore"}
					</Button>
				</Row>
			</SettingsCard>

			<GroupLabel>Danger zone</GroupLabel>
			<SettingsCard>
				<Row
					title="Delete all local data"
					description="Permanently remove every note and folder from this device."
				>
					<Dialog>
						<DialogTrigger asChild>
							<Button variant="destructive" size="sm" disabled={busy !== "idle"}>
								<Trash2 className="mr-1.5 h-3.5 w-3.5" />
								Delete all
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Delete all local data?</DialogTitle>
								<DialogDescription>
									This permanently deletes every note and folder in your vault. This cannot be
									undone — back up first if you might want them later.
								</DialogDescription>
							</DialogHeader>
							<DialogFooter>
								<DialogClose asChild>
									<Button variant="outline" size="sm">
										Cancel
									</Button>
								</DialogClose>
								<DialogClose asChild>
									<Button variant="destructive" size="sm" onClick={handleClear}>
										<RotateCcw className="mr-1.5 h-3.5 w-3.5" />
										Delete everything
									</Button>
								</DialogClose>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</Row>
			</SettingsCard>

			{notice ? <p className="mt-4 text-xs text-muted-foreground">{notice}</p> : null}
		</div>
	);
}
