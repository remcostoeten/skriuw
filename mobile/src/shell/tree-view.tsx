import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useChrome } from "./chrome";
import { ShellIcon } from "./icons";
import { MINIMUM_TOUCH_TARGET, TREE_ROW_HEIGHT } from "./metrics";
import { PinnedStrip } from "./pinned-strip";
import { RowActions, type MoveTarget } from "./row-actions";
import { useTheme } from "./theme";
import {
  createFolder,
  createNote,
  moveNode,
  moveTargets,
  renameNode,
  restoreNode,
  setNodePinned,
  trashNode,
  activateNote,
} from "./tree-actions";
import { idListsEqual, visibleIdsSelector, type TreeRow as TreeRowModel } from "./tree-model";
import { TreeRow } from "./tree-row";
import { useWorkspace, useWorkspaceSelector } from "./workspace-provider";

type Props = {
  /** Opening a note hands the screen back to the content column. */
  onOpenNote: () => void;
};

/**
 * The workspace tree as the sheet shows it: virtualized rows that each
 * subscribe to their own node, the create controls, and every row action
 * (rename, move, pin, delete with undo) submitted through the store.
 */
export function TreeView({ onOpenNote }: Props) {
  const theme = useTheme();
  const chrome = useChrome();
  const session = useWorkspace();
  const visibleIds = useWorkspaceSelector(visibleIdsSelector, idListsEqual);
  const [menuRow, setMenuRow] = useState<TreeRowModel | null>(null);
  const [targets, setTargets] = useState<readonly MoveTarget[]>([]);

  const report = useCallback(
    (error: unknown) => {
      session.reportFailure(error);
    },
    [session],
  );

  const onPressRow = useCallback(
    (row: TreeRowModel) => {
      if (row.kind === "folder") {
        session.store.toggleExpanded(row.id);
        return;
      }
      activateNote(session.store, row.id);
      onOpenNote();
    },
    [onOpenNote, session.store],
  );

  const onLongPressRow = useCallback(
    (row: TreeRowModel) => {
      const state = session.store.getState();
      setTargets([
        { id: null, title: "Top level", depth: 1 },
        ...moveTargets(state, row.id).map((id) => ({
          id,
          title: state.nodes.get(id)?.title ?? "Untitled",
          depth: (state.nodes.get(id)?.depth ?? 0) + 1,
        })),
      ]);
      setMenuRow(row);
    },
    [session.store],
  );

  const onDeleteRow = useCallback(
    (row: TreeRowModel) => {
      setMenuRow(null);
      trashNode(session, row.id)
        .then((trashed) => {
          chrome.showToast({
            message: `Deleted ${trashed.title}`,
            action: {
              label: "Undo",
              run: () => {
                restoreNode(session, trashed).catch(report);
              },
            },
          });
        })
        .catch(report);
    },
    [chrome, report, session],
  );

  return (
    <View style={styles.root}>
      <View style={[styles.actions, { borderBottomColor: theme.color("sidebar-border") }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New note"
          onPress={() => {
            createNote(session, null)
              .then(onOpenNote)
              .catch(report);
          }}
          style={styles.action}
        >
          <ShellIcon name="plus" size={16} color={theme.color("sidebar-foreground", 0.75)} />
          <Text style={[styles.actionLabel, { color: theme.color("sidebar-foreground", 0.85) }]}>
            Note
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New folder"
          onPress={() => {
            createFolder(session, null).catch(report);
          }}
          style={styles.action}
        >
          <ShellIcon name="folder" size={16} color={theme.color("sidebar-foreground", 0.75)} />
          <Text style={[styles.actionLabel, { color: theme.color("sidebar-foreground", 0.85) }]}>
            Folder
          </Text>
        </Pressable>
      </View>

      <PinnedStrip
        onOpen={(noteId) => {
          activateNote(session.store, noteId);
          onOpenNote();
        }}
      />

      <FlatList
        accessibilityRole="list"
        accessibilityLabel="Workspace tree"
        data={visibleIds}
        extraData={visibleIds}
        keyExtractor={identity}
        getItemLayout={itemLayout}
        initialNumToRender={20}
        windowSize={5}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <TreeRow
            id={item}
            onPress={onPressRow}
            onLongPress={onLongPressRow}
            onDelete={onDeleteRow}
          />
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: theme.color("sidebar-foreground", 0.55) }]}>
            No notes yet.
          </Text>
        }
      />

      <RowActions
        row={menuRow}
        moveTargets={targets}
        onClose={() => setMenuRow(null)}
        onRename={(row, title) => {
          setMenuRow(null);
          renameNode(session, row.id, title).catch(report);
        }}
        onMove={(row, parentId) => {
          setMenuRow(null);
          moveNode(session, row.id, parentId).catch(report);
        }}
        onPin={(row, pinned) => {
          setMenuRow(null);
          setNodePinned(session, row.id, pinned).catch(report);
        }}
        onDelete={onDeleteRow}
        onCreateNote={(row) => {
          setMenuRow(null);
          createNote(session, row.id)
            .then(onOpenNote)
            .catch(report);
        }}
        onCreateFolder={(row) => {
          setMenuRow(null);
          createFolder(session, row.id).catch(report);
        }}
      />
    </View>
  );
}

function identity(id: string): string {
  return id;
}

function itemLayout(_data: unknown, index: number) {
  return { length: TREE_ROW_HEIGHT, offset: TREE_ROW_HEIGHT * index, index };
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  actions: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  action: {
    flex: 1,
    minHeight: MINIMUM_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  empty: {
    padding: 16,
    fontSize: 13,
  },
});
