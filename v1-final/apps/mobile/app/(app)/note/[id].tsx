import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useNote, useUpdateNote } from "@/query/notes";
import { notesKeys } from "@/query/notes-keys";
import { RichRenderer } from "@/renderer/RichRenderer";
import { NoteEditor } from "@/components/NoteEditor";
import { setBlockChecked } from "@/domain/rich-document";
import { richToMarkdown } from "@/domain/rich-to-markdown";
import { ConflictError, type Note } from "@/backend/types";
import { useTheme } from "@/theme/theme-provider";
import { fonts } from "@/theme/fonts";
import { ContentLoading, ErrorState } from "@/components/AsyncState";

export default function NoteScreen() {
	const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
	const router = useRouter();
	const navigation = useNavigation();
	const { theme } = useTheme();
	const qc = useQueryClient();
	const noteQuery = useNote(id);
	const { data: note, isLoading, isError } = noteQuery;
	const updateNote = useUpdateNote();

	const [mode, setMode] = useState<"view" | "edit">(edit === "1" ? "edit" : "view");
	const [draftTitle, setDraftTitle] = useState("");
	const [draftBody, setDraftBody] = useState("");

	// Seed the draft from the note whenever we enter edit mode.
	const beginEdit = useCallback(() => {
		if (!note) return;
		setDraftTitle(note.title);
		setDraftBody(note.content);
		setMode("edit");
	}, [note]);

	// Auto-seed when we arrived with ?edit=1 and the note has loaded.
	useEffect(() => {
		if (mode === "edit" && note && draftTitle === "" && draftBody === "") {
			setDraftTitle(note.title);
			setDraftBody(note.content);
		}
	}, [mode, note, draftTitle, draftBody]);

	const handleSave = useCallback(() => {
		if (!note) return;
		const titleChanged = draftTitle !== note.title;
		const bodyChanged = draftBody !== note.content;
		if (!titleChanged && !bodyChanged) {
			setMode("view");
			return;
		}

		updateNote.mutate(
			{
				id,
				title: titleChanged ? draftTitle : undefined,
				content: bodyChanged ? draftBody : undefined,
				expectedUpdatedAt: note.updatedAt,
			},
			{
				onSuccess: () => setMode("view"),
				onError: (err) => {
					if (err instanceof ConflictError) {
						Alert.alert(
							"Note changed elsewhere",
							"This note was edited on another device. Reload to see the latest version? Your changes here will be discarded.",
							[
								{ text: "Keep editing", style: "cancel" },
								{
									text: "Reload",
									style: "destructive",
									onPress: () => {
										qc.invalidateQueries({ queryKey: notesKeys.detail(id) });
										setMode("view");
									},
								},
							],
						);
					} else {
						Alert.alert("Couldn't save", "Please try again.");
					}
				},
			},
		);
	}, [note, draftTitle, draftBody, id, updateNote, qc]);

	const handleCancel = useCallback(() => setMode("view"), []);

	// Toggle a checklist item in the read view: optimistically patch the cached
	// note's richContent, emit markdown, and persist. Markdown is the source of
	// truth server-side, so we send `content`; the precondition guards conflicts.
	const handleToggleCheck = useCallback(
		(blockId: string, checked: boolean) => {
			const current = qc.getQueryData<Note>(notesKeys.detail(id));
			if (!current?.richContent) return;

			const nextRich = setBlockChecked(current.richContent, blockId, checked);
			if (nextRich === current.richContent) return;
			const nextContent = richToMarkdown(nextRich);

			qc.setQueryData<Note>(notesKeys.detail(id), {
				...current,
				richContent: nextRich,
				content: nextContent,
			});

			updateNote.mutate(
				{ id, content: nextContent, expectedUpdatedAt: current.updatedAt },
				{
					onError: () => qc.setQueryData<Note>(notesKeys.detail(id), current),
				},
			);
		},
		[id, qc, updateNote],
	);

	useLayoutEffect(() => {
		navigation.setOptions({
			title: mode === "edit" ? "" : (note?.title ?? ""),
			headerLeft:
				mode === "edit"
					? () => (
							<HeaderButton
								label="Cancel"
								onPress={handleCancel}
								disabled={updateNote.isPending}
							/>
						)
					: undefined,
			headerRight: () =>
				mode === "edit" ? (
					<HeaderButton
						label={updateNote.isPending ? "Saving…" : "Save"}
						onPress={handleSave}
						disabled={updateNote.isPending}
						bold
					/>
				) : note ? (
					<HeaderButton label="Edit" onPress={beginEdit} />
				) : null,
		});
	}, [navigation, mode, note, beginEdit, handleSave, handleCancel, updateNote.isPending]);

	if (isLoading) {
		return <ContentLoading variant="document" label="Opening your note" />;
	}

	if (isError || !note) {
		return (
			<ErrorState
				title="This note isn't available yet"
				description="It may not be stored on this device. Connect to the internet and try loading it again."
				onRetry={() => noteQuery.refetch()}
			/>
		);
	}

	if (mode === "edit") {
		return (
			<NoteEditor
				title={draftTitle}
				body={draftBody}
				onChangeTitle={setDraftTitle}
				onChangeBody={setDraftBody}
			/>
		);
	}

	// Prefer the native rich renderer; fall back to raw markdown text for notes
	// saved in raw mode (richContent === null) until the read renderer derives it.
	if (note.richContent && note.richContent.length > 0) {
		return (
			<View style={{ flex: 1, backgroundColor: theme.background }}>
				<RichRenderer
					document={note.richContent}
					onNavigateNote={(noteId) => router.push(`/(app)/note/${noteId}`)}
					onToggleCheck={handleToggleCheck}
				/>
			</View>
		);
	}

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: theme.background }}
			contentContainerStyle={{ padding: 16 }}
		>
			<Text
				style={{
					color: theme.foreground,
					fontSize: 16,
					lineHeight: 24,
					fontFamily: fonts.mono,
				}}
			>
				{note.content}
			</Text>
		</ScrollView>
	);
}

function HeaderButton({
	label,
	onPress,
	disabled,
	bold,
}: {
	label: string;
	onPress: () => void;
	disabled?: boolean;
	bold?: boolean;
}) {
	const { theme } = useTheme();
	return (
		<Pressable
			onPress={onPress}
			disabled={disabled}
			hitSlop={8}
			style={{ paddingHorizontal: 4 }}
		>
			<Text
				style={{
					color: disabled ? theme.textDim : theme.foreground,
					fontSize: 16,
					fontWeight: bold ? "700" : "500",
				}}
			>
				{label}
			</Text>
		</Pressable>
	);
}
