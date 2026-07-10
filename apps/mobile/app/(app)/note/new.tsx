import { useCallback, useLayoutEffect, useState } from "react";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Alert, Pressable, Text } from "react-native";
import { useCreateNote } from "@/query/notes";
import { NoteEditor } from "@/components/NoteEditor";
import { useTheme } from "@/theme/theme-provider";

export default function NewNoteScreen() {
	const router = useRouter();
	const navigation = useNavigation();
	const { theme } = useTheme();
	const { folderId } = useLocalSearchParams<{ folderId?: string }>();
	const createNote = useCreateNote();

	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");

	const handleSave = useCallback(() => {
		const trimmedTitle = title.trim();
		const trimmedBody = body.trim();
		if (!trimmedTitle && !trimmedBody) {
			router.back();
			return;
		}

		createNote.mutate(
			{ title: trimmedTitle || "Untitled", content: body, folderId: folderId ?? null },
			{
				// Replace so the back button returns to the list, not this blank form.
				onSuccess: (note) => router.replace(`/(app)/note/${note.id}`),
				onError: () => Alert.alert("Couldn't create note", "Please try again."),
			},
		);
	}, [title, body, folderId, createNote, router]);

	useLayoutEffect(() => {
		navigation.setOptions({
			title: "New note",
			headerRight: () => (
				<Pressable
					onPress={handleSave}
					disabled={createNote.isPending}
					hitSlop={8}
					style={{ paddingHorizontal: 4 }}
				>
					<Text
						style={{
							color: createNote.isPending ? theme.textDim : theme.foreground,
							fontSize: 16,
							fontWeight: "700",
						}}
					>
						{createNote.isPending ? "Saving…" : "Save"}
					</Text>
				</Pressable>
			),
		});
	}, [navigation, handleSave, createNote.isPending, theme]);

	return (
		<NoteEditor
			title={title}
			body={body}
			onChangeTitle={setTitle}
			onChangeBody={setBody}
			autoFocus
		/>
	);
}
