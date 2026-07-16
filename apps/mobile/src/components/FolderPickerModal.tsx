// "Move to…" picker: renders the folder tree (plus a Root option) so a note or
// folder can be reparented. When moving a folder we hide its own subtree — you
// can't move a folder into itself or a descendant.
import { useMemo } from "react";
import { Modal, Pressable, ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, ChevronRight, FolderIcon, Home } from "lucide-react-native";
import type { Folder } from "@/backend/types";
import { useTheme } from "@/theme/theme-provider";

type Props = {
	visible: boolean;
	folders: Folder[];
	/** Current parent — shown with a check; selecting it is a no-op the caller
	 *  can ignore. */
	currentParentId: string | null;
	/** When moving a folder, its id — that folder and its descendants are hidden. */
	excludeSubtreeId?: string;
	onSelect: (parentId: string | null) => void;
	onClose: () => void;
};

type FlatRow = { folder: Folder; depth: number };

function buildTree(folders: Folder[], excludeSubtreeId?: string): FlatRow[] {
	const excluded = new Set<string>();
	if (excludeSubtreeId) {
		excluded.add(excludeSubtreeId);
		let grew = true;
		while (grew) {
			grew = false;
			for (const f of folders) {
				if (f.parentId && excluded.has(f.parentId) && !excluded.has(f.id)) {
					excluded.add(f.id);
					grew = true;
				}
			}
		}
	}

	const byParent = new Map<string | null, Folder[]>();
	for (const f of folders) {
		if (excluded.has(f.id)) continue;
		const list = byParent.get(f.parentId) ?? [];
		list.push(f);
		byParent.set(f.parentId, list);
	}
	for (const list of byParent.values()) {
		list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
	}

	const rows: FlatRow[] = [];
	const walk = (parentId: string | null, depth: number) => {
		for (const folder of byParent.get(parentId) ?? []) {
			rows.push({ folder, depth });
			walk(folder.id, depth + 1);
		}
	};
	walk(null, 0);
	return rows;
}

export function FolderPickerModal({
	visible,
	folders,
	currentParentId,
	excludeSubtreeId,
	onSelect,
	onClose,
}: Props) {
	const { theme } = useTheme();
	const rows = useMemo(() => buildTree(folders, excludeSubtreeId), [folders, excludeSubtreeId]);

	return (
		<Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
			<Pressable
				onPress={onClose}
				style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}
			>
				<Pressable
					onPress={() => {}}
					style={{
						maxHeight: "70%",
						backgroundColor: theme.popover,
						borderTopLeftRadius: theme.radius + 12,
						borderTopRightRadius: theme.radius + 12,
						borderTopWidth: 1,
						borderColor: theme.border,
					}}
				>
					<SafeAreaView edges={["bottom"]}>
						<Text
							style={{
								color: theme.foreground,
								fontSize: 17,
								fontWeight: "700",
								paddingHorizontal: 16,
								paddingTop: 14,
								paddingBottom: 8,
							}}
						>
							Move to…
						</Text>
						<ScrollView>
							<FolderOption
								label="Notes (root)"
								icon={Home}
								depth={0}
								selected={currentParentId === null}
								onPress={() => onSelect(null)}
							/>
							{rows.map(({ folder, depth }) => (
								<FolderOption
									key={folder.id}
									label={folder.name}
									icon={FolderIcon}
									depth={depth + 1}
									selected={currentParentId === folder.id}
									onPress={() => onSelect(folder.id)}
								/>
							))}
							{rows.length === 0 ? (
								<Text
									style={{
										color: theme.mutedForeground,
										fontSize: 14,
										paddingHorizontal: 20,
										paddingVertical: 12,
									}}
								>
									No other folders yet.
								</Text>
							) : null}
						</ScrollView>
					</SafeAreaView>
				</Pressable>
			</Pressable>
		</Modal>
	);
}

function FolderOption({
	label,
	icon: Icon,
	depth,
	selected,
	onPress,
}: {
	label: string;
	icon: typeof FolderIcon;
	depth: number;
	selected: boolean;
	onPress: () => void;
}) {
	const { theme } = useTheme();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityState={{ selected }}
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: 10,
				paddingVertical: 11,
				paddingRight: 16,
				paddingLeft: 16 + depth * 16,
				minHeight: 44,
			}}
		>
			{depth > 0 ? <ChevronRight size={14} color={theme.textDim} strokeWidth={2} /> : null}
			<Icon size={18} color={theme.mutedForeground} strokeWidth={2} />
			<Text style={{ flex: 1, color: theme.foreground, fontSize: 14 }} numberOfLines={1}>
				{label}
			</Text>
			{selected ? <Check size={18} color={theme.foreground} strokeWidth={2.5} /> : null}
		</Pressable>
	);
}
