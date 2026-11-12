import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, type FlatList } from "react-native";
import Animated, {
  LinearTransition,
  measure,
  scrollTo,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useScrollOffset,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import {
  dropMoves,
  HOVER_EXPAND_DELAY_MS,
  indicatorIndentDepth,
  sameDropTarget,
  type DropTarget,
} from "@skriuw/renderer-core/store/tree-drop";
import { lockActionOutcome } from "../features/lock/lock-model";
import { toggleNodeLock } from "../features/lock/lock-session";
import { useChrome } from "./chrome";
import { holdHaptic, snapHaptic } from "./haptics";
import { ShellIcon } from "./icons";
import { MINIMUM_TOUCH_TARGET, SHEET_DURATION_MS, TREE_ROW_HEIGHT } from "./metrics";
import { PinnedStrip } from "./pinned-strip";
import { RowActions, type MoveTarget } from "./row-actions";
import { useTheme } from "./theme";
import {
  createFolder,
  createNote,
  currentPlacement,
  moveNode,
  moveTargets,
  placeNode,
  renameNode,
  restoreNode,
  restoreNodePlacement,
  setNodePinned,
  trashNode,
  activateNote,
} from "./tree-actions";
import {
  dropTargetAtOffset,
  edgeScrollStep,
  hoverBand,
  hoverExpands,
  NO_HOVER_BAND,
  type DragOutcome,
  type TreeDragValues,
} from "./tree-drag";
import {
  idListsEqual,
  treeIndent,
  visibleIdsSelector,
  type TreeRow as TreeRowModel,
} from "./tree-model";
import { TreeRow } from "./tree-row";
import { useWorkspace, useWorkspaceSelector } from "./workspace-provider";

const ROW_REFLOW = LinearTransition.duration(160);
const MENU_SETTLE_MS = SHEET_DURATION_MS + 80;

type Props = {
  /** Opening a note hands the screen back to the content column. */
  onOpenNote: () => void;
};

/**
 * The workspace tree as the sheet shows it: virtualized rows that each
 * subscribe to their own node, the create controls, and every row action
 * (rename, move, pin, lock, delete with undo) submitted through the store.
 * A held row is dragged to move or reorder it on the desktop sidebar's rules
 * and with its indicator: a line between rows, a frame around the folder that
 * takes the drop. The frame callback follows the finger, scrolls the list at
 * its edges and reports each new drop zone, and a folder the drag rests on
 * opens. Renaming edits the row's title in place.
 */
export function TreeView({ onOpenNote }: Props) {
  const theme = useTheme();
  const chrome = useChrome();
  const session = useWorkspace();
  const visibleIds = useWorkspaceSelector(visibleIdsSelector, idListsEqual);
  const [menuRow, setMenuRow] = useState<TreeRowModel | null>(null);
  const [targets, setTargets] = useState<readonly MoveTarget[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [dragRow, setDragRow] = useState<TreeRowModel | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dragRowRef = useRef<TreeRowModel | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useAnimatedRef<Animated.View>();
  const listRef = useAnimatedRef<FlatList<string>>();
  const scrollOffset = useScrollOffset(listRef);
  const draggedId = useSharedValue<string | null>(null);
  const fingerY = useSharedValue(0);
  const moved = useSharedValue(false);
  const hoverBandValue = useSharedValue(NO_HOVER_BAND);
  const drag = useMemo<TreeDragValues>(
    () => ({ draggedId, fingerY, moved }),
    [draggedId, fingerY, moved],
  );

  const clearExpandTimer = useCallback(() => {
    if (expandTimer.current !== null) {
      clearTimeout(expandTimer.current);
      expandTimer.current = null;
    }
  }, []);

  useEffect(() => clearExpandTimer, [clearExpandTimer]);

  const onDragHover = useCallback(
    (contentY: number) => {
      const dragged = dragRowRef.current;
      if (dragged === null) {
        return;
      }
      const state = session.store.getState();
      const target = dropTargetAtOffset(state, dragged.id, contentY);
      if (sameDropTarget(dropTargetRef.current, target)) {
        return;
      }
      clearExpandTimer();
      dropTargetRef.current = target;
      setDropTarget(target);
      if (target !== null) {
        snapHaptic();
      }
      const folderId = hoverExpands(state, target);
      if (folderId === null) {
        return;
      }
      expandTimer.current = setTimeout(() => {
        expandTimer.current = null;
        if (dragRowRef.current === null || session.store.getState().expandedIds.has(folderId)) {
          return;
        }
        session.store.toggleExpanded(folderId);
      }, HOVER_EXPAND_DELAY_MS);
    },
    [clearExpandTimer, session.store],
  );

  useFrameCallback(() => {
    if (draggedId.get() === null || !moved.get()) {
      if (hoverBandValue.get() !== NO_HOVER_BAND) {
        hoverBandValue.set(NO_HOVER_BAND);
      }
      return;
    }
    const layout = measure(containerRef);
    if (layout === null) {
      return;
    }
    const y = fingerY.get() - layout.pageY;
    const step = edgeScrollStep(y, layout.height);
    if (step !== 0) {
      scrollTo(listRef, 0, Math.max(0, scrollOffset.get() + step), false);
    }
    const contentY = y + scrollOffset.get();
    const band = hoverBand(contentY);
    if (band !== hoverBandValue.get()) {
      hoverBandValue.set(band);
      scheduleOnRN(onDragHover, contentY);
    }
  });

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -scrollOffset.get() }],
  }));

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

  const onDragStart = useCallback((row: TreeRowModel) => {
    holdHaptic();
    dragRowRef.current = row;
    dropTargetRef.current = null;
    setDropTarget(null);
    setDragRow(row);
  }, []);

  const onDragEnd = useCallback(
    (row: TreeRowModel, outcome: DragOutcome) => {
      const target = dropTargetRef.current;
      clearExpandTimer();
      dragRowRef.current = null;
      dropTargetRef.current = null;
      setDragRow(null);
      setDropTarget(null);
      if (outcome === "menu") {
        onLongPressRow(row);
        return;
      }
      if (outcome !== "drop" || target === null) {
        return;
      }
      const state = session.store.getState();
      const [move] = dropMoves(state.nodes, [row.id], target);
      if (move === undefined) {
        return;
      }
      const previous = currentPlacement(state, row.id);
      placeNode(session, row.id, move.placement)
        .then(() => {
          chrome.showToast({
            message: `Moved ${row.title}`,
            action: {
              label: "Undo",
              run: () => {
                restoreNodePlacement(session, row.id, previous).catch(report);
              },
            },
          });
        })
        .catch(report);
    },
    [chrome, clearExpandTimer, onLongPressRow, report, session],
  );

  const startRename = useCallback(
    (id: string) => {
      const node = session.store.getState().nodes.get(id);
      const parentId = node?.parentId ?? null;
      if (parentId !== null && !session.store.getState().expandedIds.has(parentId)) {
        session.store.toggleExpanded(parentId);
      }
      setRenamingId(id);
      const index = session.store.getState().visibleIds.indexOf(id);
      if (index >= 0) {
        requestAnimationFrame(() => {
          listRef.current?.scrollToIndex({ index, viewPosition: 0.3, animated: true });
        });
      }
    },
    [listRef, session.store],
  );

  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (renameTimer.current !== null) {
        clearTimeout(renameTimer.current);
      }
    },
    [],
  );

  const renameAfterMenu = useCallback(
    (id: string) => {
      // the closing sheet dismisses the keyboard and takes focus back, which would end the rename at once
      renameTimer.current = setTimeout(() => {
        renameTimer.current = null;
        startRename(id);
      }, MENU_SETTLE_MS);
    },
    [startRename],
  );

  const onRenameEnd = useCallback(
    (row: TreeRowModel, title: string) => {
      setRenamingId((current) => (current === row.id ? null : current));
      renameNode(session, row.id, title).catch(report);
    },
    [report, session],
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

  const onToggleLockRow = useCallback(
    (row: TreeRowModel) => {
      setMenuRow(null);
      toggleNodeLock(session, row.id)
        .then((action) => {
          const outcome = lockActionOutcome(action);
          if (outcome.openSettings) {
            chrome.openSheet("lock");
          }
          chrome.showToast({ message: outcome.message });
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
            createNote(session, null).then(onOpenNote).catch(report);
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
            createFolder(session, null).then(startRename).catch(report);
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

      <Animated.View ref={containerRef} style={styles.list}>
        <Animated.FlatList
          ref={listRef}
          scrollEnabled={dragRow === null}
          accessibilityRole="list"
          accessibilityLabel="Workspace tree"
          data={visibleIds}
          extraData={renamingId}
          keyExtractor={identity}
          getItemLayout={itemLayout}
          initialNumToRender={20}
          windowSize={5}
          itemLayoutAnimation={ROW_REFLOW}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TreeRow
              id={item}
              drag={drag}
              renaming={renamingId === item}
              onPress={onPressRow}
              onLongPress={onLongPressRow}
              onDelete={onDeleteRow}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onRenameEnd={onRenameEnd}
            />
          )}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.color("sidebar-foreground", 0.55) }]}>
              No notes yet.
            </Text>
          }
        />
        <Animated.View pointerEvents="none" style={[styles.indicatorLayer, indicatorStyle]}>
          <DropIndicator target={dropTarget} />
        </Animated.View>
      </Animated.View>

      <RowActions
        row={menuRow}
        moveTargets={targets}
        onClose={() => setMenuRow(null)}
        onRename={(row) => {
          setMenuRow(null);
          renameAfterMenu(row.id);
        }}
        onMove={(row, parentId) => {
          setMenuRow(null);
          moveNode(session, row.id, parentId).catch(report);
        }}
        onPin={(row, pinned) => {
          setMenuRow(null);
          setNodePinned(session, row.id, pinned).catch(report);
        }}
        onToggleLock={onToggleLockRow}
        onDelete={onDeleteRow}
        onCreateNote={(row) => {
          setMenuRow(null);
          createNote(session, row.id).then(onOpenNote).catch(report);
        }}
        onCreateFolder={(row) => {
          setMenuRow(null);
          createFolder(session, row.id).then(renameAfterMenu).catch(report);
        }}
      />
    </View>
  );
}

type IndicatorProps = {
  target: DropTarget | null;
};

/** The desktop sidebar's drop indicator (`apps/workspace/src/features/sidebar/drag/drop-indicator.tsx`). */
function DropIndicator({ target }: IndicatorProps) {
  const theme = useTheme();
  const session = useWorkspace();
  if (target === null) {
    return null;
  }
  const state = session.store.getState();
  const rowCount = state.visibleIds.length;
  const index = target.kind === "row" ? state.visibleIds.indexOf(target.id) : rowCount;
  if (index < 0) {
    return null;
  }
  if (target.kind === "row" && target.zone === "inside") {
    return (
      <View
        style={[
          styles.dropInside,
          {
            top: index * TREE_ROW_HEIGHT,
            borderColor: theme.color("foreground", 0.45),
            backgroundColor: theme.color("foreground", 0.08),
          },
        ]}
      />
    );
  }
  const lineRow = target.kind === "row" && target.zone === "before" ? index : index + 1;
  const row = target.kind === "root-gap" ? rowCount : lineRow;
  return (
    <View
      style={[
        styles.dropLine,
        {
          top: row * TREE_ROW_HEIGHT - 1,
          left: treeIndent(indicatorIndentDepth(state.nodes, target)),
          backgroundColor: theme.color("foreground", 0.65),
        },
      ]}
    />
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
  list: {
    flex: 1,
    minHeight: 0,
  },
  indicatorLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
  },
  dropLine: {
    position: "absolute",
    right: 6,
    height: 2,
    borderRadius: 1,
  },
  dropInside: {
    position: "absolute",
    right: 0,
    left: 0,
    height: TREE_ROW_HEIGHT - 1,
    borderWidth: 1,
    borderRadius: 8,
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
