import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { MobileNote } from "@/src/core/workspace-types";
import { useWorkspace } from "@/src/features/workspace/workspace-context";
import { formatDate, getNoteTitle } from "@/src/lib/workspace-format";
import { commonStyles, palette } from "@/src/ui/styles";

export function NoteEditorPane({
  note,
  onBack,
  onOpenMove,
  onOpenActions,
}: {
  note: MobileNote;
  onBack: () => void;
  onOpenMove: () => void;
  onOpenActions: () => void;
}) {
  const { workspace, updateNote } = useWorkspace();
  const selectedFolder = workspace.folders.find((folder) => folder.id === note.parentId) ?? null;
  const isEmptyNote = note.name.trim().length === 0 && note.content.trim().length === 0;
  const locationLabel = selectedFolder?.name ?? "Inbox";
  const updatedLabel = formatDate(note.updatedAt);

  return (
    <SafeAreaView style={commonStyles.screen} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={commonStyles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={commonStyles.editorTopBar}>
          <Pressable style={commonStyles.editorTopBarButton} onPress={onBack}>
            <Text style={commonStyles.editorTopBarButtonLabel}>Back</Text>
          </Pressable>
          <Text style={commonStyles.editorTopBarMeta}>Edited {updatedLabel}</Text>
        </View>

        <ScrollView
          style={commonStyles.screen}
          contentContainerStyle={commonStyles.editorScrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          <View style={commonStyles.editorHeaderBlock}>
            <Text style={commonStyles.editorEyebrow}>{locationLabel}</Text>
            <TextInput
              value={note.name}
              onChangeText={(value) => void updateNote(note.id, { name: value })}
              placeholder="Title"
              placeholderTextColor={palette.textSoft}
              autoFocus={isEmptyNote}
              style={[commonStyles.titleInput, commonStyles.editorTitleInput]}
            />
            <Text style={commonStyles.editorMetaText}>Updated {updatedLabel}</Text>
          </View>

          <View style={commonStyles.divider} />

          <TextInput
            value={note.content}
            onChangeText={(value) => void updateNote(note.id, { content: value })}
            placeholder="Start writing"
            placeholderTextColor={palette.textSoft}
            multiline
            style={[commonStyles.noteBodyInput, commonStyles.editorBodyInput]}
          />
        </ScrollView>

        <View style={commonStyles.editorBottomBar}>
          <View style={commonStyles.editorBottomBarSummary}>
            <Text style={commonStyles.editorBottomBarLabel}>Location</Text>
            <Text numberOfLines={1} style={commonStyles.editorBottomBarValue}>
              {locationLabel}
            </Text>
          </View>
          <View style={commonStyles.editorBottomBarActions}>
            <Pressable style={commonStyles.editorBottomBarButton} onPress={onOpenMove}>
              <Text style={commonStyles.editorBottomBarButtonLabel}>Move</Text>
            </Pressable>
            <Pressable style={commonStyles.editorBottomBarButton} onPress={onOpenActions}>
              <Text style={commonStyles.editorBottomBarButtonLabel}>More</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function getScreenNoteTitle(note: MobileNote) {
  return getNoteTitle(note.name, note.content);
}
