// The workspace browser: folders and notes for one level, drag-to-reorder,
// long-press context menu (rename / move / delete), plus create affordances.
// Used by both the root list (index.tsx) and each folder screen
// (folder/[folderId].tsx) — the only difference is the `folderId` it browses.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Alert, Pressable, RefreshControl, Text, View } from "react-native";
import DraggableFlatList, {
	ScaleDecorator,
	type RenderItemParams,
} from "react-native-draggable-flatlist";
import {
	ChevronRight,
	FileText,
	FolderIcon,
	FolderPlus,
	MoreVertical,
	Pencil,
	Plus,
	Trash2,
} from "lucide-react-native";
import {
	useCreateFolder,
	useDeleteFolder,
	useDeleteNote,
	useFolders,
	useMoveNote,
	useNotes,
	useReorderWorkspace,
	useUpdateFolder,
	useUpdateNote,
	type ReorderItem,
} from "@/query/notes";
import type { Folder, NoteSummary } from "@/backend/types";
import { ActionSheet, type SheetAction } from "@/components/ActionSheet";
import { FolderPickerModal } from "@/components/FolderPickerModal";
import { TextPromptModal } from "@/components/TextPromptModal";
import { useTheme } from "@/theme/theme-provider";

type Row =
	| { kind: "folder"; id: string; sortOrder: number; folder: Folder }
	| { kind: "note"; id: string; sortOrder: number; note: NoteSummary };

function rowLabel(row: Row): string {
	return row.kind === "folder" ? row.folder.name : row.note.title || "Untitled";
}

export function WorkspaceList({ folderId }: { folderId: string | null }) {
	const router = useRouter();
	const { theme } = useTheme();

	const {
		data: notes,
		isLoading: notesLoading,
		isError,
		refetch,
		isRefetching,
	} = useNotes(folderId);
	const { data: folders, isLoading: foldersLoading } = useFolders();

	const deleteNote = useDeleteNote();
	const deleteFolder = useDeleteFolder();
	const createFolder = useCreateFolder();
	const updateFolder = useUpdateFolder();
	const updateNote = useUpdateNote();
	const moveNote = useMoveNote();
	const reorder = useReorderWorkspace(folderId);

	const rows = useMemo<Row[]>(() => {
		const folderRows: Row[] = (folders ?? [])
			.filter((f) => f.parentId === folderId)
			.map((folder) => ({
				kind: "folder",
				id: folder.id,
				sortOrder: folder.sortOrder,
				folder,
			}));
		const noteRows: Row[] = (notes ?? []).map((note) => ({
			kind: "note",
			id: note.id,
			sortOrder: note.sortOrder,
			note,
		}));
		return [...folderRows, ...noteRows].sort(
			(a, b) => a.sortOrder - b.sortOrder || rowLabel(a).localeCompare(rowLabel(b)),
		);
	}, [folders, notes, folderId]);

	// DraggableFlatList mutates a local copy; server data reseeds it on refetch.
	const [ordered, setOrdered] = useState<Row[]>(rows);
	useEffect(() => setOrdered(rows), [rows]);

	const [menuTarget, setMenuTarget] = useState<Row | null>(null);
	const [renameTarget, setRenameTarget] = useState<Row | null>(null);
	const [moveTarget, setMoveTarget] = useState<Row | null>(null);
	const [creatingFolder, setCreatingFolder] = useState(false);

	const openRow = useCallback(
		(row: Row) => {
			if (row.kind === "folder") router.push(`/(app)/folder/${row.id}`);
			else router.push(`/(app)/note/${row.id}`);
		},
		[router],
	);

	const handleDragEnd = useCallback(
		(data: Row[]) => {
			setOrdered(data);
			const payload: ReorderItem[] = data.map((r) => ({
				id: r.id,
				kind: r.kind,
				sortOrder: r.sortOrder,
			}));
			reorder.mutate(payload);
		},
		[reorder],
	);

	const openNewNote = useCallback(() => {
		router.push({
			pathname: "/(app)/note/new",
			params: folderId ? { folderId } : {},
		});
	}, [router, folderId]);

	const confirmDelete = useCallback(
		(row: Row) => {
			const isFolder = row.kind === "folder";
			Alert.alert(
				isFolder ? "Delete folder?" : "Delete note?",
				isFolder
					? `"${rowLabel(row)}" and everything inside it will be moved to trash.`
					: `"${rowLabel(row)}" will be moved to trash.`,
				[
					{ text: "Cancel", style: "cancel" },
					{
						text: "Delete",
						style: "destructive",
						onPress: () =>
							isFolder ? deleteFolder.mutate(row.id) : deleteNote.mutate(row.id),
					},
				],
			);
		},
		[deleteFolder, deleteNote],
	);

	const handleRename = useCallback(
		(value: string) => {
			const target = renameTarget;
			setRenameTarget(null);
			if (!target) return;
			if (target.kind === "folder") updateFolder.mutate({ id: target.id, name: value });
			else updateNote.mutate({ id: target.id, title: value });
		},
		[renameTarget, updateFolder, updateNote],
	);

	const handleMove = useCallback(
		(parentId: string | null) => {
			const target = moveTarget;
			setMoveTarget(null);
			if (!target) return;
			if (target.kind === "folder") {
				if (parentId === target.id) return;
				updateFolder.mutate({ id: target.id, parentId });
			} else {
				moveNote.mutate({ id: target.id, folderId: parentId });
			}
		},
		[moveTarget, updateFolder, moveNote],
	);

	const menuActions = useMemo<SheetAction[]>(() => {
		if (!menuTarget) return [];
		return [
			{
				key: "rename",
				label: "Rename",
				icon: Pencil,
				onPress: () => setRenameTarget(menuTarget),
			},
			{
				key: "move",
				label: "Move to…",
				icon: FolderIcon,
				onPress: () => setMoveTarget(menuTarget),
			},
			{
				key: "delete",
				label: "Delete",
				icon: Trash2,
				destructive: true,
				onPress: () => confirmDelete(menuTarget),
			},
		];
	}, [menuTarget, confirmDelete]);

	if ((notesLoading || foldersLoading) && rows.length === 0) {
		return (
			<Centered>
				<ActivityIndicator color={theme.mutedForeground} />
			</Centered>
		);
	}

	if (isError) {
		return (
			<Centered>
				<Text style={{ color: theme.mutedForeground }}>Could not load notes.</Text>
				<Pressable onPress={() => refetch()} style={{ marginTop: 12 }}>
					<Text style={{ color: theme.foreground }}>Retry</Text>
				</Pressable>
			</Centered>
		);
	}

	return (
		<View style={{ flex: 1, backgroundColor: theme.background }}>
			<DraggableFlatList
				data={ordered}
				keyExtractor={(item) => item.id}
				onDragEnd={({ data }) => handleDragEnd(data)}
				activationDistance={12}
				refreshControl={
					<RefreshControl
						refreshing={isRefetching}
						onRefresh={refetch}
						tintColor={theme.mutedForeground}
					/>
				}
				ListHeaderComponent={
					<View
						style={{
							flexDirection: "row",
							gap: 6,
							paddingHorizontal: 16,
							paddingVertical: 8,
							borderBottomWidth: 1,
							borderBottomColor: theme.divider,
						}}
					>
						<ActionButton label="New note" icon={Plus} onPress={openNewNote} />
						<ActionButton
							label="New folder"
							icon={FolderPlus}
							onPress={() => setCreatingFolder(true)}
						/>
					</View>
				}
				ListEmptyComponent={
					<Centered>
						<Text style={{ color: theme.mutedForeground }}>This folder is empty.</Text>
					</Centered>
				}
				renderItem={({ item, drag, isActive }: RenderItemParams<Row>) => (
					<ScaleDecorator>
						<WorkspaceRow
							row={item}
							isActive={isActive}
							onOpen={() => openRow(item)}
							onLongPress={drag}
							onMore={() => setMenuTarget(item)}
						/>
					</ScaleDecorator>
				)}
			/>

			<ActionSheet
				visible={menuTarget !== null}
				title={menuTarget ? rowLabel(menuTarget) : undefined}
				actions={menuActions}
				onClose={() => setMenuTarget(null)}
			/>

			<TextPromptModal
				visible={renameTarget !== null}
				title={renameTarget?.kind === "folder" ? "Rename folder" : "Rename note"}
				initialValue={renameTarget ? rowLabel(renameTarget) : ""}
				confirmLabel="Rename"
				onCancel={() => setRenameTarget(null)}
				onConfirm={handleRename}
			/>

			<TextPromptModal
				visible={creatingFolder}
				title="New folder"
				placeholder="Folder name"
				confirmLabel="Create"
				onCancel={() => setCreatingFolder(false)}
				onConfirm={(name) => {
					setCreatingFolder(false);
					createFolder.mutate({ name, parentId: folderId });
				}}
			/>

			<FolderPickerModal
				visible={moveTarget !== null}
				folders={folders ?? []}
				currentParentId={folderId}
				excludeSubtreeId={moveTarget?.kind === "folder" ? moveTarget.id : undefined}
				onSelect={handleMove}
				onClose={() => setMoveTarget(null)}
			/>
		</View>
	);
}

function WorkspaceRow({
	row,
	isActive,
	onOpen,
	onLongPress,
	onMore,
}: {
	row: Row;
	isActive: boolean;
	onOpen: () => void;
	onLongPress: () => void;
	onMore: () => void;
}) {
	const { theme } = useTheme();
	const isFolder = row.kind === "folder";
	const preview = row.kind === "note" ? row.note.preview : undefined;

	return (
		<Pressable
			onPress={onOpen}
			onLongPress={onLongPress}
			delayLongPress={200}
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: 10,
				paddingHorizontal: 16,
				paddingVertical: 11,
				borderBottomWidth: 1,
				borderBottomColor: theme.divider,
				backgroundColor: isActive ? theme.bgActive : theme.background,
			}}
		>
			{isFolder ? (
				<FolderIcon size={20} color={theme.mutedForeground} strokeWidth={2} />
			) : (
				<FileText size={20} color={theme.textDim} strokeWidth={2} />
			)}

			<View style={{ flex: 1 }}>
				<Text
					numberOfLines={1}
					style={{
						color: theme.foreground,
						fontSize: 15,
						fontWeight: "500",
					}}
				>
					{rowLabel(row)}
				</Text>
				{preview ? (
					<Text
						numberOfLines={1}
						style={{ color: theme.mutedForeground, fontSize: 12, marginTop: 2 }}
					>
						{preview}
					</Text>
				) : null}
			</View>

			{isFolder ? <ChevronRight size={18} color={theme.textDim} strokeWidth={2} /> : null}

			<Pressable
				onPress={onMore}
				hitSlop={10}
				accessibilityLabel="More actions"
				style={{ paddingHorizontal: 4, paddingVertical: 4 }}
			>
				<MoreVertical size={20} color={theme.mutedForeground} strokeWidth={2} />
			</Pressable>
		</Pressable>
	);
}

function ActionButton({
	label,
	icon: Icon,
	onPress,
}: {
	label: string;
	icon: typeof Plus;
	onPress: () => void;
}) {
	const { theme } = useTheme();
	return (
		<Pressable
			onPress={onPress}
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: 6,
				backgroundColor: "transparent",
				borderRadius: 4,
				paddingHorizontal: 9,
				paddingVertical: 7,
			}}
		>
			<Icon size={17} color={theme.foreground} strokeWidth={2} />
			<Text style={{ color: theme.foreground, fontSize: 12, fontWeight: "500" }}>
				{label}
			</Text>
		</Pressable>
	);
}

function Centered({ children }: { children: React.ReactNode }) {
	return (
		<View
			style={{ paddingTop: 80, alignItems: "center", justifyContent: "center", padding: 24 }}
		>
			{children}
		</View>
	);
}
