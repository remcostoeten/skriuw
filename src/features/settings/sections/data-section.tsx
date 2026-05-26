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
import type { ImportPreview } from "@/domain/data-transfer/types";

const CLEAR_PHRASE = "clear my data";

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

function ImportPreviewSummary({ preview }: { preview: ImportPreview }) {
	const totalCreate =
		preview.folders.create +
		preview.notes.create +
		preview.journalEntries.create +
		preview.journalTags.create;

	if (totalCreate === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				Everything in this archive already exists in your workspace. Nothing new will be
				imported.
			</p>
		);
	}

	return (
		<div className="space-y-3 text-sm">
			<ul className="space-y-1.5 text-muted-foreground">
				<li>{preview.folders.create} folders to create</li>
				<li>{preview.notes.create} notes to create</li>
				<li>{preview.journalEntries.create} journal entries to create</li>
				<li>{preview.journalTags.create} journal tags to create</li>
			</ul>
			{(preview.samples.notesToCreate.length > 0 ||
				preview.samples.journalToCreate.length > 0) && (
				<div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
					{preview.samples.notesToCreate.length > 0 && (
						<p>Notes: {preview.samples.notesToCreate.join(", ")}</p>
					)}
					{preview.samples.journalToCreate.length > 0 && (
						<p className="mt-1">Journal: {preview.samples.journalToCreate.join(", ")}</p>
					)}
				</div>
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
	const [importState, setImportState] = useState<ImportFlowState>("idle");
	const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [importError, setImportError] = useState<string | null>(null);
	const [importDialogOpen, setImportDialogOpen] = useState(false);

	const handleExport = async () => {
		setExportState("pending");
		try {
			const res = await fetch("/api/data/export");
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
		setSelectedFile(null);
		setImportError(null);
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	const uploadArchive = async (file: File, endpoint: "/api/data/import/preview" | "/api/data/import") => {
		const formData = new FormData();
		formData.set("file", file);
		const response = await fetch(endpoint, { method: "POST", body: formData });
		const body = (await response.json().catch(() => null)) as
			| ({ error?: string } & Partial<ImportPreview>)
			| null;
		if (!response.ok) {
			throw new Error(body?.error ?? "Import request failed.");
		}
		return body as ImportPreview;
	};

	const handleImportFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;

		setSelectedFile(file);
		setImportDialogOpen(true);
		setImportState("previewing");
		setImportError(null);
		setImportPreview(null);

		try {
			const preview = await uploadArchive(file, "/api/data/import/preview");
			setImportPreview(preview);
			setImportState("ready");
		} catch (error) {
			setImportState("error");
			setImportError(error instanceof Error ? error.message : "Import preview failed.");
		}
	};

	const handleConfirmImport = async () => {
		if (!selectedFile) return;
		setImportState("importing");
		setImportError(null);

		try {
			await uploadArchive(selectedFile, "/api/data/import");
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
					description="Download notes, folders, journal entries, and tags as a Skriuw ZIP archive."
				>
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
				</Row>
				<Row
					title="Import backup"
					description="Merge a Skriuw export ZIP into your workspace. Existing notes and journal dates are skipped."
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
						<DialogTitle>Import Skriuw backup</DialogTitle>
						<DialogDescription>
							{selectedFile
								? `Review what will be merged from ${selectedFile.name}.`
								: "Select a Skriuw export ZIP to preview the merge."}
						</DialogDescription>
					</DialogHeader>

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
									importPreview.notes.create +
										importPreview.folders.create +
										importPreview.journalEntries.create +
										importPreview.journalTags.create ===
									0
								}
								onClick={handleConfirmImport}
							>
								Import new items
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
