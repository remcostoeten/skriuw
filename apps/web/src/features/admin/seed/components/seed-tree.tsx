"use client";

import { useState } from "react";
import { ChevronRight, File, Folder, FolderOpen, Plus, Trash2 } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useSeedEditorStore } from "../store";
import type { SeedFolder, SeedNote } from "@/domain/seed/types";

type TreeNodeProps = {
	folder?: SeedFolder;
	children: SeedNote[];
	subfolders: SeedFolder[];
	allFolders: SeedFolder[];
	allNotes: SeedNote[];
	depth: number;
}

function TreeNode({ folder, children, subfolders, allFolders, allNotes, depth }: TreeNodeProps) {
	const { selectedRef, openFolderRefs, selectNote, toggleFolder, addNote, addFolder, renameNote, renameFolder, deleteNote, deleteFolder } = useSeedEditorStore();
	const isOpen = !folder || openFolderRefs.has(folder.ref);

	return (
		<div>
			{folder && (
				<div className="group flex items-center gap-1 px-2 py-0.5 rounded-sm hover:bg-muted/50 cursor-pointer select-none" style={{ paddingLeft: `${depth * 12 + 8}px` }}
					onClick={() => toggleFolder(folder.ref)}
				>
					<ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
					{isOpen ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
					<EditableLabel
						value={folder.name}
						onCommit={(name) => renameFolder(folder.ref, name)}
					/>
					<div className="ml-auto hidden group-hover:flex items-center gap-0.5">
						<IconButton title="Add note" onClick={(e) => { e.stopPropagation(); addNote("Untitled", folder.ref); }}>
							<Plus className="h-3 w-3" />
						</IconButton>
						<IconButton title="Delete folder" onClick={(e) => { e.stopPropagation(); deleteFolder(folder.ref); }}>
							<Trash2 className="h-3 w-3 text-destructive" />
						</IconButton>
					</div>
				</div>
			)}

			{isOpen && (
				<>
					{subfolders.map((sub) => (
						<TreeNode
							key={sub.ref}
							folder={sub}
							children={allNotes.filter((n) => n.parentRef === sub.ref)}
							subfolders={allFolders.filter((f) => f.parentRef === sub.ref)}
							allFolders={allFolders}
							allNotes={allNotes}
							depth={depth + 1}
						/>
					))}
					{children.map((note) => (
						<NoteItem
							key={note.ref}
							note={note}
							active={selectedRef === note.ref}
							depth={folder ? depth + 1 : depth}
							onSelect={() => selectNote(note.ref)}
							onRename={(name) => renameNote(note.ref, name)}
							onDelete={() => deleteNote(note.ref)}
						/>
					))}
				</>
			)}
		</div>
	);
}

type NoteItemProps = {
	note: SeedNote;
	active: boolean;
	depth: number;
	onSelect: () => void;
	onRename: (name: string) => void;
	onDelete: () => void;
}

function NoteItem({ note, active, depth, onSelect, onRename, onDelete }: NoteItemProps) {
	return (
		<div
			className={cn("group flex items-center gap-1.5 px-2 py-0.5 rounded-sm cursor-pointer select-none hover:bg-muted/50", active && "bg-muted text-foreground")}
			style={{ paddingLeft: `${depth * 12 + 8}px` }}
			onClick={onSelect}
		>
			<File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
			<EditableLabel value={note.name} onCommit={onRename} />
			<div className="ml-auto hidden group-hover:flex">
				<IconButton title="Delete note" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
					<Trash2 className="h-3 w-3 text-destructive" />
				</IconButton>
			</div>
		</div>
	);
}

function EditableLabel({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(value);

	if (editing) {
		return (
			<input
				autoFocus
				className="flex-1 min-w-0 bg-transparent text-sm outline-none border-b border-border"
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={() => { onCommit(draft); setEditing(false); }}
				onKeyDown={(e) => {
					if (e.key === "Enter") { onCommit(draft); setEditing(false); }
					if (e.key === "Escape") { setDraft(value); setEditing(false); }
					e.stopPropagation();
				}}
				onClick={(e) => e.stopPropagation()}
			/>
		);
	}

	return (
		<span className="flex-1 min-w-0 truncate text-sm" onDoubleClick={(e) => { e.stopPropagation(); setDraft(value); setEditing(true); }}>
			{value}
		</span>
	);
}

function IconButton({ title, onClick, children }: { title: string; onClick: React.MouseEventHandler; children: React.ReactNode }) {
	return (
		<button
			type="button"
			title={title}
			className="rounded p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground"
			onClick={onClick}
		>
			{children}
		</button>
	);
}

export function SeedTree() {
	const { folders, notes, addNote, addFolder } = useSeedEditorStore();

	const rootFolders = folders.filter((f) => f.parentRef === null).sort((a, b) => a.order - b.order);
	const rootNotes = notes.filter((n) => n.parentRef === null).sort((a, b) => a.order - b.order);

	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center gap-1 px-2 py-1.5 border-b border-border/40">
				<span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex-1">Structure</span>
				<IconButton title="Add folder" onClick={() => addFolder("New folder", null)}>
					<Folder className="h-3.5 w-3.5" />
				</IconButton>
				<IconButton title="Add note" onClick={() => addNote("Untitled", null)}>
					<Plus className="h-3.5 w-3.5" />
				</IconButton>
			</div>

			<div className="flex-1 overflow-y-auto py-1">
				{folders.length === 0 && notes.length === 0 ? (
					<p className="px-3 py-4 text-xs text-muted-foreground/60">
						No items yet. Add a folder or note above.
					</p>
				) : (
					<TreeNode
						children={rootNotes}
						subfolders={rootFolders}
						allFolders={folders}
						allNotes={notes}
						depth={0}
					/>
				)}
			</div>
		</div>
	);
}
