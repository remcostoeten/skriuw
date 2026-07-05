"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, FileUp, Loader2, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { showUserToast } from "@/shared/lib/user-toast";
import { isTauriRuntime, useWorkspaceBackend } from "@/core/workspace-backend";
import {
	importRustArchive,
	validateRustArchive,
	type RustArchiveValidation,
} from "@/features/settings/lib/import-rust-archive";
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

type ImportState = "idle" | "validating" | "ready" | "importing" | "success" | "error";

export function RustImportDialog() {
	const backend = useWorkspaceBackend();
	const [open, setOpen] = useState(false);
	const [state, setState] = useState<ImportState>("idle");
	const [validation, setValidation] = useState<RustArchiveValidation | null>(null);
	const [importedCount, setImportedCount] = useState(0);

	if (!isTauriRuntime()) {
		return null;
	}

	const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		setState("validating");
		try {
			// File.path is Tauri-specific; fallback to name for web
			const zipPath = (file as unknown as { path: string }).path || file.name;

			const existingNotes = backend.listNotes ? await backend.listNotes() : [];
			const result = await validateRustArchive(
				zipPath,
				existingNotes.map((note) => note.name),
			);

			setValidation(result);
			setState("ready");
		} catch (err) {
			showUserToast(
				err instanceof Error ? err.message : "Failed to validate archive.",
				"error",
			);
			setState("error");
		}
	};

	const handleImport = async () => {
		if (!validation) return;

		setState("importing");
		try {
			const count = await importRustArchive(validation, backend);
			setImportedCount(count);
			setState("success");
			showUserToast(`Imported ${count} notes.`, "success");
			setTimeout(() => {
				setOpen(false);
				setState("idle");
				setValidation(null);
			}, 2000);
		} catch (err) {
			showUserToast(err instanceof Error ? err.message : "Import failed.", "error");
			setState("error");
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					<FileUp className="h-4 w-4 mr-2" />
					Import from ZIP
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Import Workspace Archive</DialogTitle>
					<DialogDescription>
						Select a .zip file exported from Skriuw to import notes and folders.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					{state === "idle" && (
						<div className="space-y-4">
							<label className="block">
								<input
									type="file"
									accept=".zip"
									onChange={handleFileSelect}
									className="block w-full text-sm"
								/>
							</label>
						</div>
					)}

					{state === "validating" && (
						<div className="flex items-center justify-center py-8">
							<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
						</div>
					)}

					{validation && (
						<div className="space-y-4 rounded-lg bg-muted p-4 text-sm">
							<div className="flex justify-between">
								<span>Notes in archive:</span>
								<span className="font-medium">
									{validation.archive.notes_count}
								</span>
							</div>
							<div className="flex justify-between">
								<span>Folders:</span>
								<span className="font-medium">
									{validation.archive.folders_count}
								</span>
							</div>
							<div className="flex justify-between">
								<span>Tags:</span>
								<span className="font-medium">{validation.archive.tags_count}</span>
							</div>

							<div className="border-t border-border/50 pt-3">
								<div className="flex items-center justify-between">
									<span>Importable:</span>
									<span className="font-medium text-green-600">
										{validation.import_summary.importable}
									</span>
								</div>
								{validation.import_summary.duplicates > 0 && (
									<div className="flex items-center justify-between text-orange-600">
										<span>Will skip (duplicates):</span>
										<span className="font-medium">
											{validation.import_summary.duplicates}
										</span>
									</div>
								)}
							</div>

							{validation.import_summary.errors.length > 0 && (
								<div className="flex items-start gap-2 rounded bg-destructive/10 p-2 text-destructive">
									<AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
									<div className="text-xs">
										<p className="font-medium">Validation errors:</p>
										<ul className="mt-1 space-y-1">
											{validation.import_summary.errors
												.slice(0, 3)
												.map((err, i) => (
													<li key={i}>• {err}</li>
												))}
											{validation.import_summary.errors.length > 3 && (
												<li>
													• +{validation.import_summary.errors.length - 3}{" "}
													more
												</li>
											)}
										</ul>
									</div>
								</div>
							)}
						</div>
					)}

					{state === "success" && (
						<div className="flex items-center justify-center gap-2 rounded-lg bg-green-50 p-4 text-green-700">
							<CheckCircle2 className="h-5 w-5" />
							<span>Imported {importedCount} notes</span>
						</div>
					)}

					{state === "error" && (
						<div className="flex items-center justify-center gap-2 rounded-lg bg-destructive/10 p-4 text-destructive">
							<AlertCircle className="h-5 w-5" />
							<span>Import failed</span>
						</div>
					)}
				</div>

				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline">Cancel</Button>
					</DialogClose>
					{validation && state === "ready" && (
						<Button onClick={handleImport}>
							Import {validation.import_summary.importable} notes
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
