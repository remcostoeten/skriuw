import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useWorkspace } from "@/src/features/workspace/workspace-context";
import { LoadingScreen } from "@/src/features/workspace/loading-screen";
import { formatDate } from "@/src/lib/workspace-format";
import { commonStyles, palette } from "@/src/ui/styles";

export function NotesHomeScreen() {
  const router = useRouter();
  const { isHydrated, workspace, createFolder, createNote } = useWorkspace();
  const [query, setQuery] = useState("");

  if (!isHydrated) {
    return <LoadingScreen />;
  }

  const notes = [...workspace.notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const normalizedQuery = query.trim().toLowerCase();
  const filteredNotes = useMemo(
    () =>
      normalizedQuery.length === 0
        ? notes
        : notes.filter((note) => {
            const folderName = workspace.folders.find((folder) => folder.id === note.parentId)?.name ?? "";
            return `${note.name} ${note.content} ${folderName}`.toLowerCase().includes(normalizedQuery);
          }),
    [normalizedQuery, notes, workspace.folders],
  );
  const rootNotes = filteredNotes.filter((note) => note.parentId === null);
  const nestedNotes = filteredNotes.filter((note) => note.parentId !== null);
  const recentNote = notes[0];

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.scrollContent}>
      <View style={commonStyles.heroCard}>
        <View style={commonStyles.heroGlow} />
        <Text style={commonStyles.eyebrow}>Mobile workspace</Text>
        <Text style={commonStyles.headline}>A calm guest notebook with folders and fast capture.</Text>
        <Text style={commonStyles.subtitle}>
          Start local, keep the architecture simple, and still get a workspace that feels organized from the first launch.
        </Text>
        <View style={commonStyles.metricsGrid}>
          <View style={commonStyles.metricTile}>
            <Text style={commonStyles.metricValue}>{workspace.notes.length}</Text>
            <Text style={commonStyles.metricLabel}>Notes</Text>
          </View>
          <View style={commonStyles.metricTile}>
            <Text style={commonStyles.metricValue}>{workspace.folders.length}</Text>
            <Text style={commonStyles.metricLabel}>Folders</Text>
          </View>
          <View style={commonStyles.metricTile}>
            <Text style={commonStyles.metricValue}>{rootNotes.length}</Text>
            <Text style={commonStyles.metricLabel}>Inbox</Text>
          </View>
        </View>
        <View style={commonStyles.rowWrap}>
          <Pressable
            style={commonStyles.button}
            onPress={async () => {
              const note = await createNote();
              router.push(`/(tabs)/notes/${note.id}`);
            }}
          >
            <Text style={commonStyles.buttonLabel}>New note</Text>
          </Pressable>
          <Pressable
            style={commonStyles.buttonSecondary}
            onPress={async () => {
              await createFolder();
            }}
          >
            <Text style={commonStyles.buttonLabelSecondary}>New folder</Text>
          </Pressable>
        </View>
      </View>

      <View style={commonStyles.card}>
        <View style={commonStyles.sectionHeader}>
          <Text style={commonStyles.sectionTitle}>Find and jump</Text>
          {recentNote ? (
            <Text style={commonStyles.caption}>Last edited {formatDate(recentNote.updatedAt)}</Text>
          ) : null}
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search notes, contents, or folders"
          style={commonStyles.inputCompact}
        />
      </View>

      <View style={commonStyles.card}>
        <View style={commonStyles.sectionHeader}>
          <Text style={commonStyles.sectionTitle}>Folders</Text>
          <Text style={commonStyles.caption}>{nestedNotes.length} notes filed</Text>
        </View>

        {workspace.folders.map((folder) => {
          const folderNotes = filteredNotes.filter((note) => note.parentId === folder.id);

          return (
            <View key={folder.id} style={commonStyles.listCard}>
              <View style={commonStyles.rowBetween}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={commonStyles.listTitle}>{folder.name}</Text>
                  <Text style={commonStyles.listSubtitle}>
                    {folderNotes.length === 0
                      ? "No notes here yet."
                      : `${folderNotes.length} note${folderNotes.length === 1 ? "" : "s"} in this folder`}
                  </Text>
                </View>
                <Pressable
                  style={commonStyles.buttonSecondarySmall}
                  onPress={async () => {
                    const note = await createNote(folder.id);
                    router.push(`/(tabs)/notes/${note.id}`);
                  }}
                >
                  <Text style={commonStyles.buttonLabelSecondarySmall}>Add note</Text>
                </Pressable>
              </View>

              {folderNotes.length > 0 ? (
                <View style={{ gap: 8 }}>
                  {folderNotes.map((note) => (
                    <Pressable
                      key={note.id}
                      style={({ pressed }) => [
                        commonStyles.chipMuted,
                        pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
                      ]}
                      onPress={() => router.push(`/(tabs)/notes/${note.id}`)}
                    >
                      <Text style={commonStyles.chipMutedLabel}>{note.name}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={commonStyles.card}>
        <View style={commonStyles.sectionHeader}>
          <Text style={commonStyles.sectionTitle}>Inbox</Text>
          <Text style={commonStyles.caption}>
            {query ? `${filteredNotes.length} match${filteredNotes.length === 1 ? "" : "es"}` : "Root notes"}
          </Text>
        </View>

        {rootNotes.length === 0 ? (
          <Text style={commonStyles.subtitle}>No root notes match this filter.</Text>
        ) : (
          rootNotes.map((note) => (
            <Pressable
              key={note.id}
              style={({ pressed }) => [
                commonStyles.listCard,
                pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },
              ]}
              onPress={() => router.push(`/(tabs)/notes/${note.id}`)}
            >
              <View style={commonStyles.rowBetween}>
                <View style={commonStyles.chip}>
                  <Text style={commonStyles.chipLabel}>
                    {note.parentId ? "Folder note" : "Inbox note"}
                  </Text>
                </View>
                <Text style={{ color: palette.textMuted, fontSize: 13 }}>{formatDate(note.updatedAt)}</Text>
              </View>
              <Text style={commonStyles.listTitle}>{note.name}</Text>
              <Text numberOfLines={3} style={commonStyles.listSubtitle}>
                {note.content.trim() || "Empty note"}
              </Text>
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}
