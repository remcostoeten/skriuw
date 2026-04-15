import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useWorkspace } from "@/src/features/workspace/workspace-context";
import { LoadingScreen } from "@/src/features/workspace/loading-screen";
import { NoteEditorPane, getScreenNoteTitle } from "@/src/features/notes/note-editor-pane";
import { commonStyles } from "@/src/ui/styles";

export function NoteDetailScreen() {
  const { noteId } = useLocalSearchParams<{ noteId: string }>();
  const router = useRouter();
  const { isHydrated, workspace } = useWorkspace();

  if (!isHydrated) {
    return <LoadingScreen />;
  }

  const note = workspace.notes.find((item) => item.id === noteId);
  if (!note) {
    return (
      <View style={[commonStyles.screen, { padding: 20, justifyContent: "center", gap: 16 }]}>
        <Text style={commonStyles.title}>Note not found</Text>
        <Pressable style={commonStyles.buttonSecondary} onPress={() => router.replace("/notes")}>
          <Text style={commonStyles.buttonLabelSecondary}>Back to notes</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: getScreenNoteTitle(note),
        }}
      />
      <NoteEditorPane note={note} onDeleted={() => router.replace("/notes")} />
    </>
  );
}
