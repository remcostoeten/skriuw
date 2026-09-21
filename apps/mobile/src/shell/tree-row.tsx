import { useCallback, useEffect, useMemo, useRef } from "react";
import { Animated, PanResponder, StyleSheet, Text, View } from "react-native";
import { ShellIcon } from "./icons";
import { MINIMUM_TOUCH_TARGET, TREE_ROW_HEIGHT } from "./metrics";
import {
  beginRowGesture,
  LONG_PRESS_MS,
  moveRowGesture,
  releaseIsTap,
  swipeDeletes,
  type RowGesture,
} from "./row-gesture";
import { useTheme } from "./theme";
import {
  treeIndent,
  treeRowAccessibilityHint,
  treeRowAccessibilityLabel,
  treeRowSelector,
  treeRowsEqual,
  type TreeRow as TreeRowModel,
} from "./tree-model";
import { useWorkspaceSelector } from "./workspace-provider";

type Props = {
  id: string;
  onPress: (row: TreeRowModel) => void;
  onLongPress: (row: TreeRowModel) => void;
  onDelete: (row: TreeRowModel) => void;
};

const SETTLE_MS = 180;

/**
 * One tree row, subscribed to its own node alone: renaming or pinning a
 * sibling re-renders that sibling and nothing else. Hold opens the row's
 * actions; a pull to the left deletes it.
 */
export function TreeRow({ id, onPress, onLongPress, onDelete }: Props) {
  const theme = useTheme();
  const selector = useMemo(() => treeRowSelector(id), [id]);
  const row = useWorkspaceSelector(selector, treeRowsEqual);
  const offset = useRef(new Animated.Value(0)).current;
  const gesture = useRef<RowGesture>({ kind: "idle" });
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(row);
  latest.current = row;
  const callbacks = useRef({ onPress, onLongPress, onDelete });
  callbacks.current = { onPress, onLongPress, onDelete };

  const clearHold = useCallback(() => {
    if (holdTimer.current !== null) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  useEffect(() => clearHold, [clearHold]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const { pageX, pageY } = event.nativeEvent;
          gesture.current = beginRowGesture(id, pageX, pageY);
          clearHold();
          holdTimer.current = setTimeout(() => {
            holdTimer.current = null;
            const current = latest.current;
            if (gesture.current.kind === "pending" && current) {
              gesture.current = { kind: "cancelled" };
              callbacks.current.onLongPress(current);
            }
          }, LONG_PRESS_MS);
        },
        onPanResponderMove: (event) => {
          const { pageX, pageY } = event.nativeEvent;
          const next = moveRowGesture(gesture.current, pageX, pageY);
          gesture.current = next;
          if (next.kind !== "pending") {
            clearHold();
          }
          offset.setValue(next.kind === "swipe" ? next.offset : 0);
        },
        onPanResponderRelease: () => {
          clearHold();
          const finished = gesture.current;
          gesture.current = { kind: "idle" };
          const current = latest.current;
          if (current && swipeDeletes(finished)) {
            callbacks.current.onDelete(current);
            offset.setValue(0);
            return;
          }
          if (current && releaseIsTap(finished)) {
            callbacks.current.onPress(current);
          }
          Animated.timing(offset, {
            toValue: 0,
            duration: SETTLE_MS,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminate: () => {
          clearHold();
          gesture.current = { kind: "cancelled" };
          Animated.timing(offset, {
            toValue: 0,
            duration: SETTLE_MS,
            useNativeDriver: true,
          }).start();
        },
      }),
    [clearHold, id, offset],
  );

  if (row === null) {
    return null;
  }

  const foreground = row.active
    ? theme.color("sidebar-accent-foreground")
    : theme.color("sidebar-foreground", 0.85);

  return (
    <View style={[styles.track, { backgroundColor: theme.color("destructive", 0.28) }]}>
      <View style={styles.trackLabel}>
        <ShellIcon name="trash" size={18} color={theme.color("destructive-foreground")} />
      </View>
      <Animated.View
        accessible
        accessibilityRole={row.kind === "folder" ? "button" : "link"}
        accessibilityLabel={treeRowAccessibilityLabel(row)}
        accessibilityHint={treeRowAccessibilityHint(row)}
        accessibilityState={
          row.kind === "folder"
            ? { expanded: row.expanded, selected: row.active }
            : { selected: row.active }
        }
        {...responder.panHandlers}
        style={[
          styles.row,
          {
            paddingLeft: treeIndent(row.depth),
            backgroundColor: row.active
              ? theme.color("sidebar-accent")
              : theme.color("sidebar-background"),
            transform: [{ translateX: offset }],
          },
        ]}
      >
        {row.kind === "folder" ? (
          <View style={[styles.chevron, row.expanded ? styles.chevronOpen : null]}>
            <ShellIcon name="chevron" size={14} color={theme.color("sidebar-foreground", 0.5)} />
          </View>
        ) : (
          <View style={styles.chevron} />
        )}
        <ShellIcon
          name={row.kind === "folder" ? "folder" : "notes"}
          size={16}
          color={theme.color("sidebar-foreground", 0.55)}
        />
        <Text numberOfLines={1} style={[styles.title, { color: foreground }]}>
          {row.title}
        </Text>
        {row.pinned ? <ShellIcon name="pin" size={14} color={theme.color("favorite")} /> : null}
        {row.kind === "folder" ? (
          <Text style={[styles.count, { color: theme.color("sidebar-foreground", 0.45) }]}>
            {row.childCount}
          </Text>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: TREE_ROW_HEIGHT,
    justifyContent: "center",
  },
  trackLabel: {
    position: "absolute",
    right: 16,
  },
  row: {
    height: TREE_ROW_HEIGHT,
    minHeight: MINIMUM_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 12,
  },
  chevron: {
    width: 16,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "0deg" }],
  },
  chevronOpen: {
    transform: [{ rotate: "90deg" }],
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
  },
  count: {
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
});
