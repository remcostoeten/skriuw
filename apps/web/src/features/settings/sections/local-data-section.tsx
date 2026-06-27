"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FolderOpen, RotateCcw, Trash2, Upload } from "lucide-react";
import { Button } from "@/shared/ui/button";
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
import { tauriInvoke } from "@/core/workspace-backend";
import { notesKeys } from "@/features/notes/hooks/notes-keys";

type Busy = "idle" | "export" | "import" | "clear";

/**
 * Desktop ("tauri" mode) replacement for the cloud Data & sync section. Every
 * action is local: the markdown vault is the source of truth, so backup is a
 * portable .zip of it and restore/clear rebuild the SQLite index from disk.
 */
export function LocalDataSection() {
	const queryClient = useQueryClient();
	const [vaultRoot, setVaultRoot] = useState<string>("");
	const [busy, setBusy] = useState<Busy>("idle");
	const [notice, setNotice] = useState<string | null>(null);

	useEffect(() => {
		tauriInvoke<string>("get_vault_root")
			.then(setVaultRoot)
			.catch(() => setVaultRoot(""));
	}, []);

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
