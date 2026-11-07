import { useEffect, useRef, useState, type ComponentRef } from "react";
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { lockActionLabel } from "../features/lock/lock-model";
import { BottomSheet } from "./bottom-sheet";
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
  onToggleLock: (row: TreeRow) => void;
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
  onToggleLock,
  onDelete,
  onCreateNote,
  onCreateFolder,
}: RowActionsProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [trackedRow, setTrackedRow] = useState(row);
  const [shownRow, setShownRow] = useState(row);
  const [mode, setMode] = useState<Mode>("actions");
  const [draftTitle, setDraftTitle] = useState(row?.title ?? "");
  const heading = useRef<ComponentRef<typeof Text>>(null);

  function focusHeading(): void {
    if (heading.current !== null) {
      AccessibilityInfo.sendAccessibilityEvent(heading.current, "focus");
    }
  }

  useEffect(() => {
    if (mode === "move") {
      focusHeading();
    }
  }, [mode]);

  if (row !== trackedRow) {
    setTrackedRow(row);
    if (row !== null) {
      setShownRow(row);
      setMode("actions");
      setDraftTitle(row.title);
    }
  }

  if (shownRow === null) {
    return null;
  }

  const surface = {
    backgroundColor: theme.color("popover"),
    borderColor: theme.color("border"),
  };

  return (
    <BottomSheet
      open={row !== null}
      dismissLabel="Close actions"
      onClose={onClose}
      onShow={focusHeading}
    >
      <View style={[styles.dock, { paddingBottom: insets.bottom + 8 }]} pointerEvents="box-none">
        <View style={[styles.panel, surface]}>
          <Text
            ref={heading}
            accessibilityRole="header"
            numberOfLines={1}
            style={[styles.heading, { color: theme.color("muted-foreground") }]}
          >
            {mode === "move" ? `Move ${shownRow.title} to` : shownRow.title}
          </Text>

          {mode === "actions" ? (
            <View>
              <ActionRow label="Rename" onPress={() => setMode("rename")} />
              <ActionRow label="Move…" onPress={() => setMode("move")} />
              <ActionRow
                label={shownRow.pinned ? "Unpin" : "Pin"}
                onPress={() => onPin(shownRow, !shownRow.pinned)}
              />
              <ActionRow
                label={lockActionLabel(shownRow.kind, shownRow.locked)}
                onPress={() => onToggleLock(shownRow)}
              />
              {shownRow.kind === "folder" ? (
                <View>
                  <ActionRow label="New note inside" onPress={() => onCreateNote(shownRow)} />
                  <ActionRow label="New folder inside" onPress={() => onCreateFolder(shownRow)} />
                </View>
              ) : null}
              <ActionRow label="Delete" destructive onPress={() => onDelete(shownRow)} />
            </View>
          ) : null}

          {mode === "rename" ? (
            <View style={styles.renameBody}>
              <TextInput
                accessibilityLabel="Name"
                autoFocus
                defaultValue={shownRow.title}
                onChangeText={setDraftTitle}
                onSubmitEditing={() => onRename(shownRow, draftTitle)}
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
              <ActionRow label="Save" onPress={() => onRename(shownRow, draftTitle)} />
            </View>
          ) : null}

          {mode === "move" ? (
            <ScrollView style={styles.moveList} keyboardShouldPersistTaps="handled">
              {moveTargets.map((target) => (
                <Pressable
                  key={target.id ?? "root"}
                  accessibilityRole="button"
                  accessibilityLabel={`Move to ${target.title}`}
                  onPress={() => onMove(shownRow, target.id)}
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
    </BottomSheet>
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
  dock: {
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
