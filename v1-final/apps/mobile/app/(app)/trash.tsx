// Trash screen. Batches mirror the web trash bin: a deleted folder and its
// contents restore/purge as one unit; loose notes are single-note batches.
import { useCallback, useLayoutEffect, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "expo-router";
import { FileText, Folder, RotateCcw, Trash2 } from "lucide-react-native";
import { ActionSheet } from "@/components/ActionSheet";
import type { TrashBatch } from "@/backend/types";
import { useEmptyTrash, usePurgeTrash, useRestoreTrash, useTrash } from "@/query/notes";
import { useTheme } from "@/theme/theme-provider";
import { ContentLoading, ErrorState } from "@/components/AsyncState";

function batchSubtitle(batch: TrashBatch): string {
	const deleted = new Date(batch.deletedAt).toLocaleDateString();
	if (batch.kind === "note") return `Deleted ${deleted}`;
	const notes = `${batch.noteCount} note${batch.noteCount === 1 ? "" : "s"}`;
	return `${notes} inside · Deleted ${deleted}`;
}

export default function TrashScreen() {
	const navigation = useNavigation();
	const { theme } = useTheme();
	const trashQuery = useTrash();
	const { data: batches, isPending } = trashQuery;
	const restore = useRestoreTrash();
	const purge = usePurgeTrash();
	const empty = useEmptyTrash();
	const [selected, setSelected] = useState<TrashBatch | null>(null);

	const confirmEmpty = useCallback(() => {
		Alert.alert(
			"Empty trash?",
			"Everything in the trash will be permanently deleted. This cannot be undone.",
			[
				{ text: "Cancel", style: "cancel" },
				{ text: "Empty trash", style: "destructive", onPress: () => empty.mutate() },
			],
		);
	}, [empty]);

	const confirmPurge = (batch: TrashBatch) => {
		Alert.alert(
			"Delete forever?",
			`"${batch.primary.name}" will be permanently deleted. This cannot be undone.`,
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete forever",
					style: "destructive",
					onPress: () => purge.mutate(batch.id),
				},
			],
		);
	};

	useLayoutEffect(() => {
		navigation.setOptions({
			headerRight: () =>
				batches && batches.length > 0 ? (
					<Pressable onPress={confirmEmpty} hitSlop={8} disabled={empty.isPending}>
						<Text
							style={{
								color: theme.destructive,
								fontSize: 15,
								fontWeight: "600",
								opacity: empty.isPending ? 0.5 : 1,
							}}
						>
							Empty
						</Text>
					</Pressable>
				) : null,
		});
	}, [navigation, batches, confirmEmpty, empty.isPending, theme]);

	if (isPending) {
		return <ContentLoading variant="list" label="Checking the trash" />;
	}

	if (trashQuery.isError) {
		return (
			<ErrorState
				title="Trash couldn't be checked"
				description="Nothing has been removed. Try again when your connection is back."
				onRetry={() => trashQuery.refetch()}
			/>
		);
	}

	return (
		<SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
			<FlatList
				data={batches ?? []}
				keyExtractor={(batch) => batch.id}
				contentContainerStyle={{ padding: 16, paddingBottom: 40, flexGrow: 1 }}
				ListEmptyComponent={
					<View
						style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}
					>
						<Trash2 size={32} color={theme.mutedForeground} strokeWidth={1.5} />
						<Text style={{ color: theme.mutedForeground, fontSize: 15 }}>
							Trash is empty
						</Text>
					</View>
				}
				renderItem={({ item }) => {
					const Icon = item.kind === "folder" ? Folder : FileText;
					return (
						<Pressable
							onPress={() => setSelected(item)}
							style={{
								flexDirection: "row",
								alignItems: "center",
								gap: 12,
								backgroundColor: theme.card,
								borderWidth: 1,
								borderColor: theme.border,
								borderRadius: theme.radius + 4,
								paddingHorizontal: 14,
								paddingVertical: 11,
								marginBottom: 8,
							}}
						>
							<Icon size={18} color={theme.mutedForeground} strokeWidth={2} />
							<View style={{ flex: 1 }}>
								<Text
									numberOfLines={1}
									style={{
										color: theme.foreground,
										fontSize: 15,
										fontWeight: "600",
									}}
								>
									{item.primary.name || "Untitled"}
								</Text>
								<Text
									style={{
										color: theme.mutedForeground,
										fontSize: 12,
										marginTop: 2,
									}}
								>
									{batchSubtitle(item)}
								</Text>
							</View>
						</Pressable>
					);
				}}
			/>

			<ActionSheet
				visible={selected !== null}
				title={selected?.primary.name || "Untitled"}
				onClose={() => setSelected(null)}
				actions={
					selected
						? [
								{
									key: "restore",
									label: "Restore",
									icon: RotateCcw,
									onPress: () => restore.mutate(selected.id),
								},
								{
									key: "purge",
									label: "Delete forever",
									icon: Trash2,
									destructive: true,
									onPress: () => confirmPurge(selected),
								},
							]
						: []
				}
			/>
		</SafeAreaView>
	);
}
