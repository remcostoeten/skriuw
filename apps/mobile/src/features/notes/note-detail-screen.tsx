import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useWorkspace } from "@/src/features/workspace/workspace-context";
import { LoadingScreen } from "@/src/features/workspace/loading-screen";
import { formatDate } from "@/src/lib/workspace-format";
import { commonStyles } from "@/src/ui/styles";

export function NoteDetailScreen() {
  const { noteId } = useLocalSearchParams<{ noteId: string }>();
  const router = useRouter();
  const { isHydrated, workspace, updateNote, deleteNote, deleteFolder } = useWorkspace();

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

  const selectedFolder = workspace.folders.find((folder) => folder.id === note.parentId) ?? null;
  const wordCount = note.content.trim().length === 0 ? 0 : note.content.trim().split(/\s+/).length;

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.scrollContent}>
      <View style={commonStyles.heroCard}>
        <View style={commonStyles.heroGlow} />
        <Text style={commonStyles.eyebrow}>Note editor</Text>
        <Text style={commonStyles.title}>{note.name}</Text>
        <View style={commonStyles.metricsGrid}>
          <View style={commonStyles.metricTile}>
            <Text style={commonStyles.metricValue}>{wordCount}</Text>
            <Text style={commonStyles.metricLabel}>Words</Text>
          </View>
          <View style={commonStyles.metricTile}>
            <Text style={commonStyles.metricValue}>{selectedFolder ? "Filed" : "Inbox"}</Text>
            <Text style={commonStyles.metricLabel}>Location</Text>
          </View>
        </View>
        <Text style={commonStyles.caption}>Updated {formatDate(note.updatedAt)}</Text>
      </View>

      <View style={commonStyles.card}>
        <Text style={commonStyles.sectionTitle}>Content</Text>
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
      </View>

      <View style={commonStyles.card}>
        <Text style={commonStyles.sectionTitle}>Folder</Text>
        <Text style={commonStyles.subtitle}>
          Keep this note in the inbox or place it into one of your local folders.
        </Text>
        <View style={commonStyles.rowWrap}>
          <Pressable
            style={note.parentId === null ? commonStyles.button : commonStyles.buttonSecondary}
            onPress={() => updateNote(note.id, { parentId: null })}
          >
            <Text
              style={note.parentId === null ? commonStyles.buttonLabel : commonStyles.buttonLabelSecondary}
            >
              Inbox
            </Text>
          </Pressable>
          {workspace.folders.map((folder) => (
            <Pressable
              key={folder.id}
              style={folder.id === note.parentId ? commonStyles.button : commonStyles.buttonSecondary}
              onPress={() => updateNote(note.id, { parentId: folder.id })}
              onLongPress={
                folder.id === note.parentId
                  ? () =>
                      Alert.alert(
                        folder.name,
                        "Delete this folder and move its notes back to the inbox?",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Delete",
                            style: "destructive",
                            onPress: () => {
                              void deleteFolder(folder.id);
                              if (note.parentId === folder.id) {
                                void updateNote(note.id, { parentId: null });
                              }
                            },
                          },
                        ],
                      )
                  : undefined
              }
            >
              <Text
                style={folder.id === note.parentId ? commonStyles.buttonLabel : commonStyles.buttonLabelSecondary}
              >
                {folder.name}
              </Text>
            </Pressable>
          ))}
        </View>
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
