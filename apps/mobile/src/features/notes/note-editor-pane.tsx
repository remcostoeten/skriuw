import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { MobileNote } from "@/src/core/workspace-types";
import { useWorkspace } from "@/src/features/workspace/workspace-context";
import { formatDate, getNoteTitle } from "@/src/lib/workspace-format";
import { commonStyles, palette } from "@/src/ui/styles";

export function NoteEditorPane({
  note,
  onDeleted,
}: {
  note: MobileNote;
  onDeleted: () => void;
}) {
  const { workspace, createFolder, updateNote, deleteNote, deleteFolder } = useWorkspace();
  const selectedFolder = workspace.folders.find((folder) => folder.id === note.parentId) ?? null;
  const isEmptyNote = note.name.trim().length === 0 && note.content.trim().length === 0;

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.scrollContent}>
      <View style={commonStyles.card}>
        <TextInput
          value={note.name}
          onChangeText={(value) => void updateNote(note.id, { name: value })}
          placeholder="Title"
          placeholderTextColor={palette.textSoft}
          autoFocus={isEmptyNote}
          style={commonStyles.titleInput}
        />
        <Text style={commonStyles.caption}>
          {selectedFolder?.name ?? "Inbox"} · Updated {formatDate(note.updatedAt)}
        </Text>
        <TextInput
          value={note.content}
          onChangeText={(value) => void updateNote(note.id, { content: value })}
          placeholder="Start writing"
          placeholderTextColor={palette.textSoft}
          multiline
          style={commonStyles.noteBodyInput}
        />
      </View>

      <View style={commonStyles.card}>
        <View style={commonStyles.sectionHeader}>
          <Text style={commonStyles.sectionTitle}>Folder</Text>
          <Pressable
            style={commonStyles.buttonSecondarySmall}
            onPress={async () => {
              const folder = await createFolder();
              await updateNote(note.id, { parentId: folder.id });
            }}
          >
            <Text style={commonStyles.buttonLabelSecondarySmall}>New folder</Text>
          </Pressable>
        </View>
        <Text style={commonStyles.subtitle}>
          Keep the note in your inbox or file it into a folder.
        </Text>
        <View style={commonStyles.rowWrap}>
          <Pressable
            style={note.parentId === null ? commonStyles.button : commonStyles.buttonSecondary}
            onPress={() => void updateNote(note.id, { parentId: null })}
          >
            <Text style={note.parentId === null ? commonStyles.buttonLabel : commonStyles.buttonLabelSecondary}>
              Inbox
            </Text>
          </Pressable>
          {workspace.folders.map((folder) => (
            <Pressable
              key={folder.id}
              style={folder.id === note.parentId ? commonStyles.button : commonStyles.buttonSecondary}
              onPress={() => void updateNote(note.id, { parentId: folder.id })}
              onLongPress={
                folder.id === note.parentId
                  ? () =>
                      Alert.alert(
                        folder.name,
                        "Delete this folder and move its notes back to Inbox?",
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
              <Text style={folder.id === note.parentId ? commonStyles.buttonLabel : commonStyles.buttonLabelSecondary}>
                {folder.name}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          style={commonStyles.buttonDanger}
          onPress={() =>
            Alert.alert("Delete note?", "This removes the note from your mobile workspace.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                  await deleteNote(note.id);
                  onDeleted();
                },
              },
            ])
          }
        >
          <Text style={commonStyles.buttonLabelDanger}>Delete note</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

export function getScreenNoteTitle(note: MobileNote) {
  return getNoteTitle(note.name, note.content);
}
