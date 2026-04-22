import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useState } from "react";
import { NoteActionsSheet } from "@/src/features/notes/note-actions-sheet";
import { useWorkspace } from "@/src/features/workspace/workspace-context";
import { LoadingScreen } from "@/src/features/workspace/loading-screen";
import { NoteEditorPane } from "@/src/features/notes/note-editor-pane";
import { commonStyles } from "@/src/ui/styles";

export function NoteDetailScreen() {
  const { noteId } = useLocalSearchParams<{ noteId: string }>();
  const router = useRouter();
  const { isHydrated, workspace, createFolder, updateNote, deleteNote, deleteFolder } = useWorkspace();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetMode, setSheetMode] = useState<"main" | "move">("main");

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

  const currentNote = note;

  function openSheet(mode: "main" | "move") {
    setSheetMode(mode);
    setSheetVisible(true);
  }

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/notes");
  }

  return (
    <>
      <NoteEditorPane
        note={currentNote}
        onBack={handleBack}
        onOpenMove={() => openSheet("move")}
        onOpenActions={() => openSheet("main")}
      />
      <NoteActionsSheet
        visible={sheetVisible}
        note={currentNote}
        folders={workspace.folders}
        initialMode={sheetMode}
        onClose={() => setSheetVisible(false)}
        onMove={(parentId) => {
          void updateNote(currentNote.id, { parentId });
        }}
        onCreateFolder={() => {
          void (async () => {
            const folder = await createFolder();
            await updateNote(currentNote.id, { parentId: folder.id });
          })();
        }}
        onDelete={() => {
          void (async () => {
            await deleteNote(currentNote.id);
            router.replace("/notes");
          })();
        }}
        onDeleteCurrentFolder={(folderId) => {
          void deleteFolder(folderId);
        }}
      />
    </>
  );
}
