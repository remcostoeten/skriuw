"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Trash2, Upload } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
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
import { useAuthSnapshot } from "@/platform/auth/use-auth";
import { clearAllData } from "@/features/settings/actions/clear-data";
import { useNotesStore } from "@/features/notes/store";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import { journalKeys } from "@/features/journal/hooks/journal-keys";

const CLEAR_PHRASE = "clear my data";

type AsyncState = "idle" | "pending" | "error";

function ClearDataDialog({ disabled }: { disabled: boolean }) {
	const [open, setOpen] = useState(false);
	const [value, setValue] = useState("");
	const [state, setState] = useState<AsyncState>("idle");
	const [error, setError] = useState<string | null>(null);

	const router = useRouter();
	const queryClient = useQueryClient();
	const resetNotesStore = useNotesStore((s) => s.resetWorkspace);

	const matches = value.trim().toLowerCase() === CLEAR_PHRASE;

	const handleClear = async () => {
		if (!matches) return;
		setState("pending");
		setError(null);
		const result = await clearAllData(value.trim());
		if (result.ok) {
			// Wipe all cached query data so the app renders empty state immediately
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
			onOpenChange={(o) => {
				setOpen(o);
				if (!o) {
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

export function DataSection() {
	const auth = useAuthSnapshot();
	const isConnected = auth.phase === "authenticated" && auth.isSupabaseConfigured;
	const [exportState, setExportState] = useState<ExportState>("idle");

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

	return (
		<>
			<SectionHeader
				title="Data & sync"
				description="Your notes are yours. Sync, export, or back them up anytime."
			/>
			<SettingsCard>
				<Row
					title="Cloud sync"
					description={isConnected ? "Active" : "Supabase not configured"}
				>
					<span
						className={
							isConnected
								? "inline-flex items-center rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success"
								: "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
						}
					>
						{isConnected ? "Connected" : "Not configured"}
					</span>
				</Row>
				<Row
					title="Sync over cellular"
					description="Use mobile data when Wi-Fi isn't available."
					disabled
				>
					<Switch disabled title="Cellular sync is not yet available" />
				</Row>
				<Row
					title="Export notes"
					description="Download all notes and journal entries as Markdown."
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
					title="Import"
					description="Bring notes from Notion, Bear, Obsidian, and more — coming soon."
					disabled
				>
					<Button
						variant="outline"
						size="sm"
						disabled
						title="Import is not yet available"
					>
						<Upload className="size-3.5" /> Import
					</Button>
				</Row>
			</SettingsCard>

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
