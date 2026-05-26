"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Trash2, Upload } from "lucide-react";
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
	SectionHeader,
	Row,
	SettingsCard,
	GroupLabel,
} from "@/features/settings/components/settings-primitives";
import { useAuth } from "@/core/auth/use-auth";
import { clearAllData } from "@/features/settings/actions/clear-data";
import { useNotesStore } from "@/features/notes/store";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import { journalKeys } from "@/features/journal/hooks/journal-keys";
import type { ImportMergeResult, ImportPolicy, ImportPreview, ImportProfile } from "@/domain/data-transfer/types";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/ui/select";

const CLEAR_PHRASE = "clear my data";
const REPLACE_PHRASE = "replace my workspace";

type AsyncState = "idle" | "pending" | "error";

function ClearDataDialog({ disabled }: { disabled: boolean }) {
	const [open, setOpen] = useState(false);
	const [value, setValue] = useState("");
	const [state, setState] = useState<AsyncState>("idle");
	const [error, setError] = useState<string | null>(null);

	const router = useRouter();
	const queryClient = useQueryClient();
	const resetNotesStore = useNotesStore((s) => s.resetUi);

	const matches = value.trim().toLowerCase() === CLEAR_PHRASE;

	const handleClear = async () => {
		if (!matches) return;
		setState("pending");
		setError(null);
		const result = await clearAllData(value.trim());
		if (result.ok) {
			await queryClient.resetQueries({ queryKey: notesKeys.all });
			await queryClient.resetQueries({ queryKey: journalKeys.all });
			resetNotesStore();
			router.replace("/app");
		} else {
			setError(result.error);
			setState("idle");
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen);
				if (!nextOpen) {
					setValue("");
					setError(null);
					setState("idle");
				}
			}}
		>
			<DialogTrigger asChild>
				<Button
					size="sm"
					disabled={disabled}
					title={disabled ? "Sign in to clear data" : undefined}
					className="bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25 shadow-none"
				>
					<Trash2 className="size-3.5" /> Clear data
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Clear all data</DialogTitle>
					<DialogDescription>
						Permanently removes all notes, folders, journal entries, and tags. Your
						account and AI keys are kept. This cannot be undone.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-2">
					<Label htmlFor="clear-confirm" className="text-xs text-muted-foreground">
						To confirm, type{" "}
						<span className="font-mono text-foreground">{CLEAR_PHRASE}</span> below.
					</Label>
					<Input
						id="clear-confirm"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						placeholder={CLEAR_PHRASE}
						autoComplete="off"
						maxLength={60}
					/>
					{error && (
						<p role="alert" className="text-xs text-destructive">
							{error}
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
						disabled={!matches || state === "pending"}
						onClick={handleClear}
						className="bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25 shadow-none disabled:opacity-50"
					>
						{state === "pending" ? "Clearing…" : "Clear all data"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

type ExportState = "idle" | "pending" | "error";
type ImportFlowState = "idle" | "previewing" | "ready" | "importing" | "success" | "error";

function importHasWork(preview: ImportPreview): boolean {
	if (preview.policy === "replace-workspace") {
		return true;
	}

	return (
		preview.folders.create +
			preview.folders.overwrite +
			preview.notes.create +
			preview.notes.overwrite +
			preview.journalEntries.create +
			preview.journalEntries.overwrite +
			preview.journalTags.create +
			preview.noteVersions.create >
		0
	);
}

function ImportPreviewSummary({ preview }: { preview: ImportPreview }) {
	const totalCreate =
		preview.folders.create +
		preview.notes.create +
		preview.journalEntries.create +
		preview.journalTags.create +
		preview.noteVersions.create;
	const totalOverwrite =
		preview.notes.overwrite +
		preview.journalEntries.overwrite +
		preview.journalTags.overwrite;

	if (preview.policy !== "replace-workspace" && totalCreate === 0 && totalOverwrite === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				Everything in this archive already exists in your workspace. Nothing will change.
			</p>
		);
	}

	return (
		<div className="space-y-3 text-sm">
			<ul className="space-y-1.5 text-muted-foreground">
				<li>
					{preview.folders.create} folders to create
					{preview.folders.skip > 0 ? ` · ${preview.folders.skip} skipped` : ""}
				</li>
				<li>
					{preview.notes.create} notes to create
					{preview.notes.overwrite > 0 ? ` · ${preview.notes.overwrite} to overwrite` : ""}
					{preview.notes.skip > 0 ? ` · ${preview.notes.skip} skipped` : ""}
				</li>
				<li>
					{preview.journalEntries.create} journal entries to create
					{preview.journalEntries.overwrite > 0
						? ` · ${preview.journalEntries.overwrite} to overwrite`
						: ""}
				</li>
				<li>
					{preview.journalTags.create} journal tags to create
					{preview.journalTags.overwrite > 0
						? ` · ${preview.journalTags.overwrite} to update`
						: ""}
				</li>
				{preview.noteVersions.create > 0 && (
					<li>{preview.noteVersions.create} note versions to restore</li>
				)}
			</ul>
			{(preview.samples.notesToCreate.length > 0 ||
				preview.samples.notesToOverwrite.length > 0 ||
				preview.samples.journalToCreate.length > 0 ||
				preview.samples.journalToOverwrite.length > 0) && (
				<div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
					{preview.samples.notesToCreate.length > 0 && (
						<p>Create notes: {preview.samples.notesToCreate.join(", ")}</p>
					)}
					{preview.samples.notesToOverwrite.length > 0 && (
						<p className="mt-1">
							Overwrite notes: {preview.samples.notesToOverwrite.join(", ")}
						</p>
					)}
					{preview.samples.journalToCreate.length > 0 && (
						<p className="mt-1">Create journal: {preview.samples.journalToCreate.join(", ")}</p>
					)}
					{preview.samples.journalToOverwrite.length > 0 && (
						<p className="mt-1">
							Overwrite journal: {preview.samples.journalToOverwrite.join(", ")}
						</p>
					)}
				</div>
			)}
			{preview.integrityWarnings.length > 0 && (
				<ul className="space-y-1 text-xs text-warning-foreground">
					{preview.integrityWarnings.map((warning) => (
						<li key={warning}>{warning}</li>
					))}
				</ul>
			)}
			{preview.warnings.length > 0 && (
				<ul className="space-y-1 text-xs text-warning-foreground">
					{preview.warnings.map((warning) => (
						<li key={warning}>{warning}</li>
					))}
				</ul>
			)}
		</div>
	);
}

export function DataSection() {
	const auth = useAuth();
	const isConnected = auth.phase === "authenticated";
	const queryClient = useQueryClient();
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [exportState, setExportState] = useState<ExportState>("idle");
	const [includeVersions, setIncludeVersions] = useState(true);
	const [importState, setImportState] = useState<ImportFlowState>("idle");
	const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
	const [importPolicy, setImportPolicy] = useState<ImportPolicy>("merge");
	const [importProfile, setImportProfile] = useState<"auto" | ImportProfile>("auto");
	const [replaceConfirm, setReplaceConfirm] = useState("");
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [importError, setImportError] = useState<string | null>(null);
	const [importDialogOpen, setImportDialogOpen] = useState(false);

	const handleExport = async () => {
		setExportState("pending");
		try {
			const query = includeVersions ? "" : "?includeVersions=false";
			const res = await fetch(`/api/data/export${query}`);
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Export failed.");
			}
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			const date = new Date().toISOString().slice(0, 10);
			a.href = url;
			a.download = `skriuw-export-${date}.zip`;
			a.click();
			URL.revokeObjectURL(url);
			setExportState("idle");
		} catch {
			setExportState("error");
			setTimeout(() => setExportState("idle"), 3000);
		}
	};

	const resetImportFlow = () => {
		setImportState("idle");
		setImportPreview(null);
		setImportPolicy("merge");
		setImportProfile("auto");
		setReplaceConfirm("");
		setSelectedFile(null);
		setImportError(null);
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	const uploadPreviewArchive = async (
		file: File,
		policy: ImportPolicy,
		profile: "auto" | ImportProfile,
	): Promise<ImportPreview> => {
		const formData = new FormData();
		formData.set("file", file);
		formData.set("policy", policy);
		if (profile !== "auto") {
			formData.set("profile", profile);
		}
		const response = await fetch("/api/data/import/preview", { method: "POST", body: formData });
		const body = (await response.json().catch(() => null)) as
			| ({ error?: string } & Partial<ImportPreview>)
			| null;
		if (!response.ok) {
			throw new Error(body?.error ?? "Import request failed.");
		}
		return body as ImportPreview;
	};

	const uploadImportArchive = async (
		file: File,
		policy: ImportPolicy,
		profile: "auto" | ImportProfile,
	): Promise<ImportMergeResult> => {
		const formData = new FormData();
		formData.set("file", file);
		formData.set("policy", policy);
		if (profile !== "auto") {
			formData.set("profile", profile);
		}
		const response = await fetch("/api/data/import", { method: "POST", body: formData });
		const body = (await response.json().catch(() => null)) as
			| ({ error?: string } & Partial<ImportMergeResult>)
			| null;
		if (!response.ok) {
			throw new Error(body?.error ?? "Import request failed.");
		}
		return body as ImportMergeResult;
	};

	const previewArchive = async (
		file: File,
		policy: ImportPolicy,
		profile: "auto" | ImportProfile,
	) => {
		setImportState("previewing");
		setImportError(null);
		setImportPreview(null);
		try {
			const preview = await uploadPreviewArchive(file, policy, profile);
			setImportPreview(preview);
			setImportState("ready");
		} catch (error) {
			setImportState("error");
			setImportError(error instanceof Error ? error.message : "Import preview failed.");
		}
	};

	const handleImportFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;

		setSelectedFile(file);
		setImportDialogOpen(true);
		await previewArchive(file, importPolicy, importProfile);
	};

	const handleImportPolicyChange = async (policy: ImportPolicy) => {
		setImportPolicy(policy);
		if (selectedFile && importState !== "previewing" && importState !== "importing") {
			await previewArchive(selectedFile, policy, importProfile);
		}
	};

	const handleImportProfileChange = async (profile: "auto" | ImportProfile) => {
		setImportProfile(profile);
		if (selectedFile && importState !== "previewing" && importState !== "importing") {
			await previewArchive(selectedFile, importPolicy, profile);
		}
	};

	const handleConfirmImport = async () => {
		if (!selectedFile) return;
		if (
			importPolicy === "replace-workspace" &&
			replaceConfirm.trim().toLowerCase() !== REPLACE_PHRASE
		) {
			return;
		}
		setImportState("importing");
		setImportError(null);

		try {
			await uploadImportArchive(selectedFile, importPolicy, importProfile);
			await queryClient.invalidateQueries({ queryKey: notesKeys.all });
			await queryClient.invalidateQueries({ queryKey: journalKeys.all });
			setImportState("success");
		} catch (error) {
			setImportState("error");
			setImportError(error instanceof Error ? error.message : "Import failed.");
		}
	};

	return (
		<>
			<SectionHeader
				title="Data & sync"
				description="Your notes are yours. Export, import, or back them up anytime."
			/>
			<SettingsCard>
				<Row
					title="Export notes"
					description="Download notes, folders, journal entries, tags, and optional version history as a Skriuw v3 ZIP."
				>
					<div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
						<label className="flex items-center gap-2 text-xs text-muted-foreground">
							<input
								type="checkbox"
								checked={includeVersions}
								onChange={(event) => setIncludeVersions(event.target.checked)}
								className="size-3.5 rounded border border-border"
							/>
							Include version history
						</label>
						<Button
							variant="outline"
							size="sm"
							onClick={handleExport}
							disabled={exportState === "pending" || !isConnected}
							title={!isConnected ? "Sign in to export" : undefined}
						>
							<Download className="size-3.5" />
							{exportState === "pending"
								? "Exporting…"
								: exportState === "error"
									? "Failed — retry"
									: "Export"}
						</Button>
					</div>
				</Row>
				<Row
					title="Import backup"
					description="Import a Skriuw backup or Markdown folder ZIP. Choose merge, overwrite, or full workspace replace."
				>
					<>
						<input
							ref={fileInputRef}
							type="file"
							accept=".zip,application/zip"
							className="hidden"
							onChange={handleImportFileSelected}
						/>
						<Button
							variant="outline"
							size="sm"
							disabled={!isConnected || importState === "previewing" || importState === "importing"}
							onClick={() => fileInputRef.current?.click()}
							title={!isConnected ? "Sign in to import" : undefined}
						>
							<Upload className="size-3.5" />
							{importState === "previewing" ? "Reading…" : "Import"}
						</Button>
					</>
				</Row>
			</SettingsCard>

			<Dialog
				open={importDialogOpen}
				onOpenChange={(open) => {
					setImportDialogOpen(open);
					if (!open) resetImportFlow();
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Import backup</DialogTitle>
						<DialogDescription>
							{selectedFile
								? `Review what will happen when importing ${selectedFile.name}.`
								: "Select a ZIP archive to preview the import."}
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1.5">
							<Label className="text-xs text-muted-foreground">Source format</Label>
							<Select
								value={importProfile}
								onValueChange={(value) =>
									void handleImportProfileChange(value as "auto" | ImportProfile)
								}
								disabled={importState === "previewing" || importState === "importing"}
							>
								<SelectTrigger className="h-8">
									<SelectValue placeholder="Auto-detect" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="auto">Auto-detect</SelectItem>
									<SelectItem value="skriuw">Skriuw backup</SelectItem>
									<SelectItem value="markdown-vault">Markdown folder</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5">
							<Label className="text-xs text-muted-foreground">Import policy</Label>
							<Select
								value={importPolicy}
								onValueChange={(value) =>
									void handleImportPolicyChange(value as ImportPolicy)
								}
								disabled={importState === "previewing" || importState === "importing"}
							>
								<SelectTrigger className="h-8">
									<SelectValue placeholder="Merge" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="merge">Merge (skip duplicates)</SelectItem>
									<SelectItem value="overwrite">Overwrite matches</SelectItem>
									<SelectItem value="replace-workspace">Replace workspace</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					{importPolicy === "replace-workspace" && importPreview && (
						<div className="space-y-2">
							<Label htmlFor="replace-confirm" className="text-xs text-muted-foreground">
								To confirm workspace replace, type{" "}
								<span className="font-mono text-foreground">{REPLACE_PHRASE}</span>
							</Label>
							<Input
								id="replace-confirm"
								value={replaceConfirm}
								onChange={(e) => setReplaceConfirm(e.target.value)}
								placeholder={REPLACE_PHRASE}
								autoComplete="off"
								maxLength={60}
							/>
						</div>
					)}

					{importState === "previewing" && (
						<p className="text-sm text-muted-foreground">Analyzing archive…</p>
					)}

					{importPreview && importState !== "previewing" && (
						<ImportPreviewSummary preview={importPreview} />
					)}

					{importState === "success" && (
						<p className="text-sm text-foreground">Import completed successfully.</p>
					)}

					{importError && (
						<p role="alert" className="text-sm text-destructive">
							{importError}
						</p>
					)}

					<DialogFooter>
						<DialogClose asChild>
							<Button variant="outline" size="sm">
								Close
							</Button>
						</DialogClose>
						{importState === "ready" && importPreview && (
							<Button
								size="sm"
								disabled={
									!importHasWork(importPreview) ||
									(importPolicy === "replace-workspace" &&
										replaceConfirm.trim().toLowerCase() !== REPLACE_PHRASE)
								}
								onClick={handleConfirmImport}
							>
								{importPolicy === "replace-workspace"
									? "Replace workspace"
									: importPolicy === "overwrite"
										? "Import with overwrite"
										: "Import new items"}
							</Button>
						)}
						{importState === "importing" && (
							<Button size="sm" disabled>
								Importing…
							</Button>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<GroupLabel>DANGER ZONE</GroupLabel>
			<SettingsCard>
				<Row
					title="Clear all data"
					description="Permanently delete all notes, folders, journal entries, and tags. Account and AI keys are kept."
				>
					<ClearDataDialog disabled={!isConnected} />
				</Row>
			</SettingsCard>
		</>
	);
}
