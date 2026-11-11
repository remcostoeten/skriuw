import { useEffect, useMemo, useRef } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import {
  GestureDetector,
  useCompetingGestures,
  usePanGesture,
  useTapGesture,
} from "react-native-gesture-handler";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type CSSStyle,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { snapHaptic } from "./haptics";
import { ShellIcon } from "./icons";
import { MINIMUM_TOUCH_TARGET, TREE_ROW_HEIGHT } from "./metrics";
import { PAN_REACH_PX, PRESS_EASING, SETTLE_SPRING, STATE_MS } from "./motion";
import {
  LONG_PRESS_MS,
  SCROLL_SLOP_PX,
  SWIPE_DELETE_PX,
  SWIPE_LOCK_PX,
  swipeDeletes,
  swipeOffset,
} from "./row-gesture";
import { useTheme } from "./theme";
import { DRAG_SLOP_PX, type DragOutcome, type TreeDragValues } from "./tree-drag";
import {
  treeIndent,
  treeRowAccessibilityHint,
  treeRowAccessibilityLabel,
  treeRowSelector,
  treeRowsEqual,
  type TreeRow as TreeRowModel,
} from "./tree-model";
import { useWorkspaceSelector } from "./workspace-provider";

const ROW_ACCESSIBILITY_ACTIONS = [
  { name: "longpress", label: "Actions" },
  { name: "delete", label: "Delete" },
] as const;

type Props = {
  id: string;
  drag: TreeDragValues;
  renaming: boolean;
  onPress: (row: TreeRowModel) => void;
  onLongPress: (row: TreeRowModel) => void;
  onDelete: (row: TreeRowModel) => void;
  onDragStart: (row: TreeRowModel) => void;
  onDragEnd: (row: TreeRowModel, outcome: DragOutcome) => void;
  onRenameEnd: (row: TreeRowModel, title: string) => void;
};

const SLIDE_OUT_MS = 200;
const SLIDE_OUT_EASING = Easing.bezier(0.23, 1, 0.32, 1);
const RECOVER_AFTER_MS = 1_200;
const THRESHOLD_HYSTERESIS_PX = 6;

const CHEVRON_TURN: CSSStyle<ViewStyle> = {
  transform: [{ rotate: "0deg" }],
  transitionProperty: "transform",
  transitionDuration: STATE_MS,
  transitionTimingFunction: PRESS_EASING,
};

/**
 * One tree row, subscribed to its own node alone: renaming or pinning a
 * sibling re-renders that sibling and nothing else. Hold lifts the row: moving
 * it from there drags it to a new place, and letting go without moving opens
 * the row's actions. A pull to the left deletes it. The pull follows the
 * finger on the UI thread, a flick past the delete point slides the row out,
 * and a short pull springs back carrying the finger's velocity. While it is
 * being renamed the title is a text field and the gestures stand down.
 */
export function TreeRow({
  id,
  drag,
  renaming,
  onPress,
  onLongPress,
  onDelete,
  onDragStart,
  onDragEnd,
  onRenameEnd,
}: Props) {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const selector = useMemo(() => treeRowSelector(id), [id]);
  const row = useWorkspaceSelector(selector, treeRowsEqual);
  const offset = useSharedValue(0);
  const dragOrigin = useSharedValue(0);
  const pastDeletePoint = useSharedValue(false);
  const recoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTitle = useRef("");

  useEffect(
    () => () => {
      if (recoverTimer.current !== null) {
        clearTimeout(recoverTimer.current);
      }
    },
    [],
  );

  function commitDelete() {
    if (row === null) {
      return;
    }
    onDelete(row);
    recoverTimer.current = setTimeout(() => {
      recoverTimer.current = null;
      offset.set(withSpring(0, SETTLE_SPRING));
    }, RECOVER_AFTER_MS);
  }

  function startDrag() {
    if (row !== null) {
      onDragStart(row);
    }
  }

  function endDrag(outcome: DragOutcome) {
    if (row !== null) {
      onDragEnd(row, outcome);
    }
  }

  const pan = usePanGesture({
    enabled: !renaming,
    activeOffsetX: [-SWIPE_LOCK_PX, PAN_REACH_PX],
    failOffsetX: [-PAN_REACH_PX, SWIPE_LOCK_PX],
    failOffsetY: [-SCROLL_SLOP_PX, SCROLL_SLOP_PX],
    onActivate: (event) => {
      dragOrigin.set(event.translationX);
      pastDeletePoint.set(false);
    },
    onUpdate: (event) => {
      const next = swipeOffset(event.translationX - dragOrigin.get());
      offset.set(next);
      const was = pastDeletePoint.get();
      const past = -next >= SWIPE_DELETE_PX - (was ? THRESHOLD_HYSTERESIS_PX : 0);
      if (past !== was) {
        pastDeletePoint.set(past);
        scheduleOnRN(snapHaptic);
      }
    },
    onDeactivate: (event) => {
      if (!event.canceled && swipeDeletes(offset.get(), event.velocityX)) {
        offset.set(
          withTiming(
            -windowWidth,
            { duration: SLIDE_OUT_MS, easing: SLIDE_OUT_EASING },
            (finished) => {
              if (finished) {
                scheduleOnRN(commitDelete);
              }
            },
          ),
        );
        return;
      }
      offset.set(withSpring(0, { ...SETTLE_SPRING, velocity: event.velocityX }));
    },
  });

  const lift = usePanGesture({
    enabled: !renaming,
    activateAfterLongPress: LONG_PRESS_MS,
    onActivate: (event) => {
      drag.fingerY.set(event.absoluteY);
      drag.moved.set(false);
      drag.draggedId.set(id);
      scheduleOnRN(startDrag);
    },
    onUpdate: (event) => {
      drag.fingerY.set(event.absoluteY);
      if (!drag.moved.get() && Math.hypot(event.translationX, event.translationY) > DRAG_SLOP_PX) {
        drag.moved.set(true);
      }
    },
    onDeactivate: (event) => {
      const outcome: DragOutcome = event.canceled ? "cancel" : drag.moved.get() ? "drop" : "menu";
      drag.draggedId.set(null);
      scheduleOnRN(endDrag, outcome);
    },
  });

  const tap = useTapGesture({
    enabled: !renaming,
    maxDistance: SCROLL_SLOP_PX,
    runOnJS: true,
    onActivate: () => {
      if (row !== null) {
        onPress(row);
      }
    },
  });

  const gesture = useCompetingGestures(pan, lift, tap);

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.get() }],
  }));

  const trackStyle = useAnimatedStyle(() => ({
    opacity: offset.get() < 0 ? 1 : 0,
  }));

  if (row === null) {
    return null;
  }

  const foreground = row.active
    ? theme.color("sidebar-accent-foreground")
    : theme.color("sidebar-foreground", 0.85);

  return (
    <View style={styles.track}>
      <Animated.View
        style={[
          styles.trackFill,
          { backgroundColor: theme.color("destructive", 0.28) },
          trackStyle,
        ]}
      >
        <ShellIcon name="trash" size={18} color={theme.color("destructive-foreground")} />
      </Animated.View>
      <GestureDetector gesture={gesture}>
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
          accessibilityValue={
            row.kind === "folder" && !row.expanded ? { text: "collapsed" } : undefined
          }
          accessibilityActions={ROW_ACCESSIBILITY_ACTIONS}
          onAccessibilityTap={() => onPress(row)}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "longpress") {
              onLongPress(row);
            } else if (event.nativeEvent.actionName === "delete") {
              onDelete(row);
            }
          }}
          style={[
            styles.row,
            {
              paddingLeft: treeIndent(row.depth),
              backgroundColor: row.active
                ? theme.color("sidebar-accent")
                : theme.color("sidebar-background"),
            },
            slideStyle,
          ]}
        >
          {row.kind === "folder" ? (
            <Animated.View
              style={[styles.chevron, CHEVRON_TURN, row.expanded ? styles.chevronOpen : null]}
            >
              <ShellIcon name="chevron" size={14} color={theme.color("sidebar-foreground", 0.5)} />
            </Animated.View>
          ) : (
            <View style={styles.chevron} />
          )}
          <ShellIcon
            name={row.kind === "folder" ? "folder" : "notes"}
            size={16}
            color={theme.color("sidebar-foreground", 0.55)}
          />
          {renaming ? (
            <TextInput
              accessibilityLabel={`Name of ${row.title}`}
              autoFocus
              selectTextOnFocus
              defaultValue={row.title}
              returnKeyType="done"
              onFocus={() => {
                draftTitle.current = row.title;
              }}
              onChangeText={(text) => {
                draftTitle.current = text;
              }}
              onBlur={() => onRenameEnd(row, draftTitle.current)}
              selectionColor={theme.color("theme-accent-blue")}
              style={[
                styles.title,
                styles.titleInput,
                {
                  color: theme.color("foreground"),
                  backgroundColor: theme.color("background"),
                  borderColor: theme.color("theme-accent-blue"),
                },
              ]}
            />
          ) : (
            <Text numberOfLines={1} style={[styles.title, { color: foreground }]}>
              {row.title}
            </Text>
          )}
          {row.locked ? (
            <ShellIcon name="lock" size={14} color={theme.color("sidebar-foreground", 0.55)} />
          ) : null}
          {row.pinned ? <ShellIcon name="pin" size={14} color={theme.color("favorite")} /> : null}
          {row.kind === "folder" ? (
            <Text style={[styles.count, { color: theme.color("sidebar-foreground", 0.45) }]}>
              {row.childCount}
            </Text>
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: TREE_ROW_HEIGHT,
    justifyContent: "center",
  },
  trackFill: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: 16,
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
  },
  chevronOpen: {
    transform: [{ rotate: "90deg" }],
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
  },
  titleInput: {
    height: 32,
    paddingVertical: 0,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: 7,
  },
  count: {
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
});
