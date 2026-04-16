import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, Text, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import type { MobileFolder, MobileNote } from "@/src/core/workspace-types";
import { getScreenNoteTitle } from "@/src/features/notes/note-editor-pane";
import { commonStyles, palette, radius } from "@/src/ui/styles";

export function NoteActionsSheet({
  visible,
  note,
  folders,
  initialMode = "main",
  onClose,
  onOpen,
  onMove,
  onCreateFolder,
  onDeleteCurrentFolder,
  onDelete,
}: {
  visible: boolean;
  note: MobileNote | null;
  folders: MobileFolder[];
  initialMode?: "main" | "move" | "folder";
  onClose: () => void;
  onOpen?: () => void;
  onMove: (parentId: string | null) => void;
  onCreateFolder: () => void;
  onDeleteCurrentFolder?: (folderId: string) => void;
  onDelete: () => void;
}) {
  const [mode, setMode] = useState<"main" | "move" | "folder">(initialMode);

  useEffect(() => {
    if (visible) {
      setMode(initialMode);
    }
  }, [initialMode, visible]);

  if (!note) {
    return null;
  }

  const currentFolder = folders.find((folder) => folder.id === note.parentId) ?? null;
  const currentFolderLabel = currentFolder?.name ?? "Inbox";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={commonStyles.sheetOverlay}>
        <Pressable style={commonStyles.sheetBackdrop} onPress={onClose} />
        <View style={commonStyles.sheetCard}>
          <View style={commonStyles.sheetHandle} />
          <Text style={commonStyles.sheetTitle}>{getScreenNoteTitle(note)}</Text>
          <Text style={commonStyles.sheetSubtitle}>
            {mode === "move"
              ? "Choose where this note should live."
              : mode === "folder"
                ? "Manage the folder this note is currently in."
                : "Actions for this note."}
          </Text>
          <View
            style={{
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: palette.border,
              backgroundColor: palette.canvasMuted,
              paddingHorizontal: 14,
              paddingVertical: 12,
              gap: 2,
              marginBottom: 16,
            }}
          >
            <Text style={commonStyles.caption}>Current location</Text>
            <Text style={[commonStyles.subtitle, { color: palette.text }]}>{currentFolderLabel}</Text>
          </View>

          {mode === "main" ? (
            <View style={commonStyles.sheetActions}>
              {onOpen ? (
                <SheetButton
                  label="Open"
                  onPress={() => {
                    onClose();
                    onOpen();
                  }}
                />
              ) : null}
              <SheetButton label="Move to folder" onPress={() => setMode("move")} />
              <SheetButton
                label="New folder for this note"
                onPress={() => {
                  onClose();
                  onCreateFolder();
                }}
              />
              {currentFolder && onDeleteCurrentFolder ? (
                <SheetButton label="Current folder actions" onPress={() => setMode("folder")} />
              ) : null}
              <SheetButton
                label="Delete note"
                destructive
                onPress={() => {
                  Alert.alert("Delete note?", "This removes the note from your workspace.", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: () => {
                        onClose();
                        onDelete();
                      },
                    },
                  ]);
                }}
              />
            </View>
          ) : mode === "move" ? (
            <View style={commonStyles.sheetActions}>
              <SheetButton
                label="Inbox"
                detail="No folder"
                selected={note.parentId === null}
                onPress={() => {
                  onClose();
                  onMove(null);
                }}
              />
              {folders.length > 0 ? (
                folders.map((folder) => (
                  <SheetButton
                    key={folder.id}
                    label={folder.name}
                    detail={folder.id === note.parentId ? "Current folder" : "Move note here"}
                    selected={folder.id === note.parentId}
                    onPress={() => {
                      onClose();
                      onMove(folder.id);
                    }}
                  />
                ))
              ) : (
                <View
                  style={{
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: palette.border,
                    backgroundColor: palette.canvasMuted,
                    paddingHorizontal: 14,
                    paddingVertical: 14,
                    gap: 6,
                  }}
                >
                  <Text style={[commonStyles.subtitle, { color: palette.text }]}>No folders yet</Text>
                  <Text style={commonStyles.caption}>Create one to organize notes beyond Inbox.</Text>
                </View>
              )}
              <SheetButton
                label="Create folder"
                onPress={() => {
                  onClose();
                  onCreateFolder();
                }}
              />
              <SheetButton label="Back" onPress={() => setMode("main")} />
            </View>
          ) : (
            <View style={commonStyles.sheetActions}>
              {currentFolder && onDeleteCurrentFolder ? (
                <SheetButton
                  label="Delete folder"
                  detail="All notes in it move to Inbox"
                  destructive
                  onPress={() => {
                    Alert.alert(
                      `Delete ${currentFolder.name}?`,
                      "This removes the folder and moves its notes back to Inbox.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: () => {
                            onClose();
                            onDeleteCurrentFolder(currentFolder.id);
                          },
                        },
                      ],
                    );
                  }}
                />
              ) : null}
              <SheetButton label="Back" onPress={() => setMode("main")} />
            </View>
          )}

          <SheetButton label="Cancel" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function SheetButton({
  label,
  detail,
  destructive = false,
  selected = false,
  onPress,
}: {
  label: string;
  detail?: string;
  destructive?: boolean;
  selected?: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        style={({ pressed }) => [
          commonStyles.sheetButton,
          selected && commonStyles.sheetButtonSelected,
          pressed && { opacity: 0.9 },
        ]}
        onPress={onPress}
        onPressIn={() => {
          scale.value = withSpring(0.97, { damping: 15, stiffness: 200 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 12, stiffness: 180 });
        }}
      >
        <View style={{ gap: detail ? 2 : 0 }}>
          <Text
            style={[
              commonStyles.sheetButtonLabel,
              selected && commonStyles.sheetButtonLabelSelected,
              destructive && commonStyles.sheetButtonLabelDestructive,
            ]}
          >
            {label}
          </Text>
          {detail ? (
            <Text
              style={[
                commonStyles.caption,
                { color: selected ? palette.textMuted : palette.textSoft },
                destructive && { color: palette.danger },
              ]}
            >
              {detail}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}
