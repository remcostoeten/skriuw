import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MINIMUM_TOUCH_TARGET } from "./metrics";
import { useTheme } from "./theme";
import { treeIndent, type TreeRow } from "./tree-model";

export type MoveTarget = {
  id: string | null;
  title: string;
  depth: number;
};

type RowActionsProps = {
  row: TreeRow | null;
  moveTargets: readonly MoveTarget[];
  onClose: () => void;
  onRename: (row: TreeRow, title: string) => void;
  onMove: (row: TreeRow, parentId: string | null) => void;
  onPin: (row: TreeRow, pinned: boolean) => void;
  onDelete: (row: TreeRow) => void;
  onCreateNote: (row: TreeRow) => void;
  onCreateFolder: (row: TreeRow) => void;
};

type Mode = "actions" | "rename" | "move";

/**
 * What a hold on a tree row opens: the row's actions, and the two that need a
 * second step. Android's back closes the sheet through `onRequestClose`,
 * which is the platform's own overlay-first back (ADR-0047).
 */
export function RowActions({
  row,
  moveTargets,
  onClose,
  onRename,
  onMove,
  onPin,
  onDelete,
  onCreateNote,
  onCreateFolder,
}: RowActionsProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("actions");
  const [draftTitle, setDraftTitle] = useState("");

  useEffect(() => {
    setMode("actions");
    setDraftTitle(row?.title ?? "");
  }, [row]);

  if (row === null) {
    return null;
  }

  const surface = {
    backgroundColor: theme.color("popover"),
    borderColor: theme.color("border"),
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close actions"
        onPress={onClose}
        style={[styles.scrim, { backgroundColor: theme.color("scrim", 0.5) }]}
      />
      <View style={[styles.dock, { paddingBottom: insets.bottom + 8 }]} pointerEvents="box-none">
        <View style={[styles.panel, surface]}>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={[styles.heading, { color: theme.color("muted-foreground") }]}
          >
            {mode === "move" ? `Move ${row.title} to` : row.title}
          </Text>

          {mode === "actions" ? (
            <View>
              <ActionRow label="Rename" onPress={() => setMode("rename")} />
              <ActionRow label="Move…" onPress={() => setMode("move")} />
              <ActionRow
                label={row.pinned ? "Unpin" : "Pin"}
                onPress={() => onPin(row, !row.pinned)}
              />
              {row.kind === "folder" ? (
                <View>
                  <ActionRow label="New note inside" onPress={() => onCreateNote(row)} />
                  <ActionRow label="New folder inside" onPress={() => onCreateFolder(row)} />
                </View>
              ) : null}
              <ActionRow label="Delete" destructive onPress={() => onDelete(row)} />
            </View>
          ) : null}

          {mode === "rename" ? (
            <View style={styles.renameBody}>
              <TextInput
                accessibilityLabel="Name"
                autoFocus
                defaultValue={row.title}
                onChangeText={setDraftTitle}
                onSubmitEditing={() => onRename(row, draftTitle)}
                returnKeyType="done"
                selectTextOnFocus
                style={[
                  styles.input,
                  {
                    color: theme.color("foreground"),
                    borderColor: theme.color("input"),
                    backgroundColor: theme.color("background"),
                  },
                ]}
              />
              <ActionRow label="Save" onPress={() => onRename(row, draftTitle)} />
            </View>
          ) : null}

          {mode === "move" ? (
            <ScrollView style={styles.moveList} keyboardShouldPersistTaps="handled">
              {moveTargets.map((target) => (
                <Pressable
                  key={target.id ?? "root"}
                  accessibilityRole="button"
                  accessibilityLabel={`Move to ${target.title}`}
                  onPress={() => onMove(row, target.id)}
                  style={[styles.action, { paddingLeft: treeIndent(target.depth) }]}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.actionLabel, { color: theme.color("foreground") }]}
                  >
                    {target.title}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={onClose}
          style={[styles.panel, styles.cancel, surface]}
        >
          <Text style={[styles.actionLabel, { color: theme.color("foreground") }]}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

type ActionRowProps = {
  label: string;
  destructive?: boolean;
  onPress: () => void;
};

function ActionRow({ label, destructive = false, onPress }: ActionRowProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.action}
    >
      <Text
        style={[
          styles.actionLabel,
          { color: destructive ? theme.color("destructive") : theme.color("foreground") },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  dock: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 8,
    gap: 8,
  },
  panel: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  cancel: {
    minHeight: MINIMUM_TOUCH_TARGET + 6,
    alignItems: "center",
    justifyContent: "center",
  },
  heading: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    fontSize: 12,
    fontWeight: "600",
  },
  action: {
    minHeight: MINIMUM_TOUCH_TARGET + 6,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  actionLabel: {
    fontSize: 16,
  },
  renameBody: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  input: {
    minHeight: MINIMUM_TOUCH_TARGET,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  moveList: {
    maxHeight: 280,
  },
});
