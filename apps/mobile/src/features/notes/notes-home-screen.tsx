import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useWorkspace } from "@/src/features/workspace/workspace-context";
import { LoadingScreen } from "@/src/features/workspace/loading-screen";
import { formatDate } from "@/src/lib/workspace-format";
import { commonStyles, palette } from "@/src/ui/styles";

export function NotesHomeScreen() {
  const router = useRouter();
  const { isHydrated, workspace, createNote } = useWorkspace();

  if (!isHydrated) {
    return <LoadingScreen />;
  }

  const notes = [...workspace.notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.scrollContent}>
      <View style={commonStyles.card}>
        <Text style={commonStyles.eyebrow}>Guest workspace</Text>
        <Text style={commonStyles.title}>Notes stay on this device.</Text>
        <Text style={commonStyles.subtitle}>
          Start in guest mode, capture ideas instantly, and keep the same product flow that the web app now uses.
        </Text>
        <Pressable
          style={commonStyles.button}
          onPress={async () => {
            const note = await createNote();
            router.push(`/(tabs)/notes/${note.id}`);
          }}
        >
          <Text style={commonStyles.buttonLabel}>Create note</Text>
        </Pressable>
      </View>

      {notes.map((note) => (
        <Pressable
          key={note.id}
          style={({ pressed }) => [
            commonStyles.card,
            pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
          ]}
          onPress={() => router.push(`/(tabs)/notes/${note.id}`)}
        >
          <View style={commonStyles.row}>
            <Text style={[commonStyles.chipLabel, { color: palette.accent }]}>{note.parentId ? "Folder note" : "Root note"}</Text>
            <Text style={{ color: palette.textMuted, fontSize: 13 }}>{formatDate(note.updatedAt)}</Text>
          </View>
          <Text style={{ fontSize: 20, lineHeight: 26, fontWeight: "700", color: palette.text }}>
            {note.name}
          </Text>
          <Text numberOfLines={3} style={commonStyles.subtitle}>
            {note.content.trim() || "Empty note"}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
