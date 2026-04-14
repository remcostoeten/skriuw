import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useWorkspace } from "@/src/features/workspace/workspace-context";
import { LoadingScreen } from "@/src/features/workspace/loading-screen";
import { commonStyles } from "@/src/ui/styles";

export function NoteDetailScreen() {
  const { noteId } = useLocalSearchParams<{ noteId: string }>();
  const router = useRouter();
  const { isHydrated, workspace, updateNote, deleteNote } = useWorkspace();

  if (!isHydrated) {
    return <LoadingScreen />;
  }

  const note = workspace.notes.find((item) => item.id === noteId);
  if (!note) {
    return (
      <View style={[commonStyles.screen, { padding: 20, justifyContent: "center", gap: 16 }]}>
        <Text style={commonStyles.title}>Note not found</Text>
        <Pressable style={commonStyles.buttonSecondary} onPress={() => router.replace("/(tabs)/notes")}>
          <Text style={commonStyles.buttonLabelSecondary}>Back to notes</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.scrollContent}>
      <View style={commonStyles.card}>
        <Text style={commonStyles.eyebrow}>Edit note</Text>
        <TextInput
          value={note.name}
          onChangeText={(value) => updateNote(note.id, { name: value || "Untitled note" })}
          placeholder="Note title"
          style={commonStyles.input}
        />
        <TextInput
          value={note.content}
          onChangeText={(value) => updateNote(note.id, { content: value })}
          placeholder="Write your note..."
          multiline
          style={[commonStyles.input, commonStyles.textArea]}
        />
        <View style={commonStyles.rowWrap}>
          <Pressable style={commonStyles.buttonSecondary} onPress={() => router.replace("/(tabs)/notes")}>
            <Text style={commonStyles.buttonLabelSecondary}>Done</Text>
          </Pressable>
          <Pressable
            style={commonStyles.buttonDanger}
            onPress={() =>
              Alert.alert("Delete note?", "This removes the note from your mobile guest workspace.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: async () => {
                    await deleteNote(note.id);
                    router.replace("/(tabs)/notes");
                  },
                },
              ])
            }
          >
            <Text style={commonStyles.buttonLabelDanger}>Delete</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
