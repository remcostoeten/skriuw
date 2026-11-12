import { router } from "expo-router";
import { memo, useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View, type ViewStyle } from "react-native";
import Animated, { type CSSStyle } from "react-native-reanimated";
import { todayKey, type DateKey } from "@skriuw/renderer-core/journal/dates";
import { formatRecurrenceLabel } from "@skriuw/renderer-core/tasks/recurrence";
import {
  COMPLETED_PREVIEW,
  dueState,
  dueText,
  groupTasks,
  oldestLateness,
  projectTaskRows,
  summarizeTasks,
  taskRowsEqual,
  upcomingWeek,
  type DueState,
  type TaskGroup,
  type TaskGrouping,
  type TaskRow,
} from "@skriuw/renderer-core/tasks/rows";
import { PRESS_EASING, STATE_MS } from "../../shell/motion";
import { PressableScale } from "../../shell/pressable-scale";
import { useChrome } from "../../shell/chrome";
import { snapHaptic } from "../../shell/haptics";
import { MINIMUM_TOUCH_TARGET } from "../../shell/metrics";
import { useTheme, type ShellTheme } from "../../shell/theme";
import { useAnnouncement } from "../../shell/announce";
import { activateNote } from "../../shell/tree-actions";
import { useWorkspace, useWorkspaceSelector } from "../../shell/workspace-provider";
import { promoteChecklistItem, toggleTask, undoPromotion, type TaskAction } from "./task-actions";
import {
  projectPromotionSource,
  promotionSourcesEqual,
  type PromotionCandidate,
  type PromotionSource,
} from "./tasks-model";
import { PressableDim } from "../../shell/pressable-dim";

const SAVE_FAILED = "That change could not be saved.";

type ListItem =
  | { kind: "group"; key: string; group: TaskGroup; detail: string | null; count: number }
  | { kind: "task"; key: string; row: TaskRow; showSource: boolean }
  | { kind: "more"; key: string; hidden: number; open: boolean };

const GROUPINGS: readonly { value: TaskGrouping; label: string }[] = [
  { value: "due", label: "Due date" },
  { value: "note", label: "Note" },
];

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function groupDetail(group: TaskGroup, today: DateKey, allRows: readonly TaskRow[]): string | null {
  switch (group.kind) {
    case "overdue": {
      const late = oldestLateness(group.rows, today);
      return late > 0 ? `Oldest is ${plural(late, "day")} late.` : null;
    }
    case "today": {
      const done = group.rows.filter((row) => row.done).length;
      return `${done} of ${group.rows.length} done`;
    }
    case "upcoming": {
      const next = upcomingWeek(allRows, today).reduce((sum, day) => sum + day.count, 0);
      return next > 0 ? `${next} in the next seven days.` : null;
    }
    case "note": {
      const late = group.rows.filter(
        (row) => !row.done && row.dueDate !== null && row.dueDate < today,
      ).length;
      const parts = [group.folderTitle, late > 0 ? `${late} overdue` : null];
      const text = parts.filter((part) => part !== null).join(" · ");
      return text.length > 0 ? text : null;
    }
    case "detached":
      return "Their lines are no longer in a note. They stay here until you complete them.";
    default:
      return null;
  }
}

function listItems(
  groups: readonly TaskGroup[],
  today: DateKey,
  allRows: readonly TaskRow[],
  grouping: TaskGrouping,
  completedOpen: boolean,
): ListItem[] {
  return groups.flatMap((group) => {
    const collapsible = group.kind === "completed" && group.rows.length > COMPLETED_PREVIEW;
    const shown =
      collapsible && !completedOpen ? group.rows.slice(0, COMPLETED_PREVIEW) : group.rows;
    const items: ListItem[] = [
      {
        kind: "group",
        key: `group:${group.id}`,
        group,
        detail: groupDetail(group, today, allRows),
        count: group.rows.length,
      },
      ...shown.map((row) => ({
        kind: "task" as const,
        key: row.id,
        row,
        showSource: grouping === "due" && row.noteTitle !== null,
      })),
    ];
    if (collapsible) {
      items.push({
        kind: "more",
        key: `more:${group.id}`,
        hidden: group.rows.length - COMPLETED_PREVIEW,
        open: completedOpen,
      });
    }
    return items;
  });
}

/**
 * The tasks destination: every task in the workspace as a ledger, grouped by
 * due date or by the note it came from, the open note's unpromoted checklist
 * items above it, and an undo for both writes. Ticking a box is a paired write,
 * record and source document in one operation (ADR-0031), so what this surface
 * shows and what the note body says can never drift apart.
 */
export function TasksView() {
  const theme = useTheme();
  const chrome = useChrome();
  const session = useWorkspace();
  const rows = useWorkspaceSelector(projectTaskRows, taskRowsEqual);
  const promotion = useWorkspaceSelector(projectPromotionSource, promotionSourcesEqual);
  const [grouping, setGrouping] = useState<TaskGrouping>("due");
  const [completedOpen, setCompletedOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useAnnouncement(notice);
  const today = todayKey();
  const summary = useMemo(() => summarizeTasks(rows, today), [rows, today]);
  const items = useMemo(
    () => listItems(groupTasks(rows, grouping, today), today, rows, grouping, completedOpen),
    [rows, grouping, today, completedOpen],
  );

  const settle = useCallback(
    (
      action: TaskAction,
      announce: (action: Extract<TaskAction, { status: "committed" }>) => void,
    ) => {
      if (action.status === "refused") {
        setNotice(action.message);
        return;
      }
      setNotice(null);
      announce(action);
    },
    [],
  );

  const fail = useCallback(
    (error: unknown) => {
      session.reportFailure(error);
      setNotice(SAVE_FAILED);
    },
    [session],
  );

  const onToggle = useCallback(
    (row: TaskRow) => {
      const toggled = toggleTask(session, row.id);
      if (!row.done && session.store.getState().tasks.get(row.id)?.status === "done") {
        snapHaptic();
      }
      toggled
        .then((action) => {
          settle(action, (committed) => {
            if (!committed.done) {
              return;
            }
            chrome.showToast({
              message: `Completed ${committed.title}`,
              action: {
                label: "Undo",
                run: () => {
                  toggleTask(session, row.id).catch(fail);
                },
              },
            });
          });
        })
        .catch(fail);
    },
    [chrome, fail, session, settle],
  );

  const onPromote = useCallback(
    (source: PromotionSource, candidate: PromotionCandidate) => {
      promoteChecklistItem(session, source.noteId, candidate.itemIndex)
        .then((action) => {
          settle(action, (committed) => {
            chrome.showToast({
              message: `Promoted ${committed.title}`,
              action: {
                label: "Undo",
                run: () => {
                  undoPromotion(session, committed.taskId)
                    .then((undone) => {
                      settle(undone, () => undefined);
                    })
                    .catch(fail);
                },
              },
            });
          });
        })
        .catch(fail);
    },
    [chrome, fail, session, settle],
  );

  const onOpenSource = useCallback(
    (row: TaskRow) => {
      if (row.noteId === null) {
        return;
      }
      activateNote(session.store, row.noteId);
      router.replace("/");
    },
    [session.store],
  );

  const summaryText =
    rows.length === 0
      ? "A little space for what’s next."
      : [
          `${summary.open} open`,
          summary.overdue > 0 ? `${summary.overdue} overdue` : null,
          summary.doneToday > 0 ? `${summary.doneToday} done today` : null,
        ]
          .filter((part) => part !== null)
          .join(" · ");

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: theme.color("foreground") }]}
          >
            Tasks
          </Text>
          {rows.length === 0 ? null : (
            <GroupingToggle theme={theme} value={grouping} onChange={setGrouping} />
          )}
        </View>
        <Text style={[styles.summary, { color: theme.color("muted-foreground") }]}>
          {summaryText}
        </Text>
        {notice === null ? null : (
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[styles.notice, { color: theme.color("destructive") }]}
          >
            {notice}
          </Text>
        )}
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          promotion === null ? undefined : (
            <PromotionSection
              source={promotion}
              theme={theme}
              onPromote={(candidate) => onPromote(promotion, candidate)}
            />
          )
        }
        ListEmptyComponent={<EmptyTasks theme={theme} promoting={promotion !== null} />}
        renderItem={({ item }) => {
          if (item.kind === "group") {
            return <GroupHeader item={item} theme={theme} />;
          }
          if (item.kind === "more") {
            return (
              <ShowMore
                hidden={item.hidden}
                open={item.open}
                theme={theme}
                onPress={() => setCompletedOpen((open) => !open)}
              />
            );
          }
          return (
            <TaskListRow
              row={item.row}
              today={today}
              showSource={item.showSource}
              theme={theme}
              onToggle={onToggle}
              onOpenSource={onOpenSource}
            />
          );
        }}
      />
    </View>
  );
}

type ToggleProps = {
  theme: ShellTheme;
  value: TaskGrouping;
  onChange: (value: TaskGrouping) => void;
};

function GroupingToggle({ theme, value, onChange }: ToggleProps) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Group tasks by"
      style={[styles.toggle, { borderColor: theme.color("border") }]}
    >
      {GROUPINGS.map((option) => {
        const selected = option.value === value;
        return (
          <PressableDim
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.value)}
            style={[
              styles.toggleOption,
              selected ? { backgroundColor: theme.color("secondary") } : null,
            ]}
          >
            <Text
              style={[
                styles.toggleLabel,
                {
                  color: selected ? theme.color("foreground") : theme.color("muted-foreground"),
                },
              ]}
            >
              {option.label}
            </Text>
          </PressableDim>
        );
      })}
    </View>
  );
}

type GroupHeaderProps = {
  item: Extract<ListItem, { kind: "group" }>;
  theme: ShellTheme;
};

function GroupHeader({ item, theme }: GroupHeaderProps) {
  const overdue = item.group.kind === "overdue";
  return (
    <View style={[styles.groupHeader, { borderTopColor: theme.color("border") }]}>
      <View style={styles.groupTitleRow}>
        {overdue ? (
          <View style={[styles.groupDot, { backgroundColor: theme.color("destructive") }]} />
        ) : null}
        <Text
          accessibilityRole="header"
          accessibilityLabel={`${item.group.title}, ${plural(item.count, "task")}`}
          numberOfLines={1}
          style={[styles.groupTitle, { color: theme.color("foreground") }]}
        >
          {item.group.title}
        </Text>
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.groupCount, { color: theme.color("muted-foreground", 0.8) }]}
        >
          {item.count}
        </Text>
      </View>
      {item.detail === null ? null : (
        <Text style={[styles.groupDetail, { color: theme.color("muted-foreground") }]}>
          {item.detail}
        </Text>
      )}
    </View>
  );
}

type MoreProps = {
  hidden: number;
  open: boolean;
  theme: ShellTheme;
  onPress: () => void;
};

function ShowMore({ hidden, open, theme, onPress }: MoreProps) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      style={styles.more}
    >
      <Text style={[styles.moreLabel, { color: theme.color("muted-foreground") }]}>
        {open ? "Show fewer" : `Show ${hidden} more`}
      </Text>
    </PressableScale>
  );
}

type RowProps = {
  row: TaskRow;
  today: DateKey;
  showSource: boolean;
  theme: ShellTheme;
  onToggle: (row: TaskRow) => void;
  onOpenSource: (row: TaskRow) => void;
};

function dueColor(state: DueState, theme: ShellTheme): string {
  if (state === "late") {
    return theme.color("destructive");
  }
  return state === "today" ? theme.color("foreground") : theme.color("muted-foreground");
}

function linkNote(row: TaskRow): string | null {
  if (row.link === "detached") {
    return "Detached from its note";
  }
  if (row.link === "orphaned") {
    return "Its note was deleted";
  }
  return row.link === "none" ? "Not in a note" : null;
}

type MetaPart = { key: string; text: string; color: string; italic?: boolean; dot?: string };

function metaParts(row: TaskRow, showSource: boolean, theme: ShellTheme): MetaPart[] {
  const parts: MetaPart[] = [];
  if (!row.done && row.status === "in_progress") {
    parts.push({
      key: "status",
      text: "In progress",
      color: theme.color("theme-text-secondary"),
      dot: theme.color("status-progress"),
    });
  }
  if (!row.done && (row.priority === "high" || row.priority === "urgent")) {
    const urgent = row.priority === "urgent";
    parts.push({
      key: "priority",
      text: urgent ? "Urgent" : "High",
      color: theme.color(urgent ? "destructive" : "warning"),
    });
  }
  const missing = linkNote(row);
  if (missing !== null) {
    parts.push({
      key: "source",
      text: missing,
      color: theme.color("muted-foreground"),
      italic: true,
    });
  } else if (showSource && row.noteTitle !== null) {
    parts.push({ key: "source", text: row.noteTitle, color: theme.color("muted-foreground") });
  }
  if (row.recurrence !== null) {
    parts.push({
      key: "repeat",
      text: formatRecurrenceLabel(row.recurrence),
      color: theme.color("muted-foreground"),
    });
  }
  if (row.subtasksTotal > 0) {
    parts.push({
      key: "subtasks",
      text: `${row.subtasksDone}/${row.subtasksTotal}`,
      color: theme.color("muted-foreground"),
    });
  }
  const [firstTag] = row.tags;
  if (firstTag !== undefined) {
    parts.push({
      key: "tags",
      text: `#${firstTag}${row.tags.length > 1 ? ` +${row.tags.length - 1}` : ""}`,
      color: theme.color("reference-tag"),
    });
  }
  return parts;
}

const TaskListRow = memo(function TaskListRow({
  row,
  today,
  showSource,
  theme,
  onToggle,
  onOpenSource,
}: RowProps) {
  const linked = row.noteId !== null;
  const state = dueState(row, today);
  const parts = metaParts(row, showSource, theme);
  const label = row.title.length > 0 ? row.title : "Untitled task";
  return (
    <View style={[styles.row, { borderBottomColor: theme.color("border") }]}>
      <PressableScale
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked: row.done }}
        accessibilityHint={row.done ? "Reopens this task" : "Completes this task"}
        hitSlop={8}
        onPress={() => onToggle(row)}
        style={styles.checkHit}
      >
        <Checkbox checked={row.done} theme={theme} />
      </PressableScale>
      <PressableDim
        accessibilityRole={linked ? "link" : "text"}
        accessibilityLabel={linked ? `Open ${row.noteTitle}, the source note for ${label}` : label}
        disabled={!linked}
        onPress={() => onOpenSource(row)}
        style={styles.rowBody}
      >
        <View style={styles.rowMain}>
          <Text
            numberOfLines={2}
            style={[
              styles.rowTitle,
              {
                color: row.done ? theme.color("muted-foreground") : theme.color("foreground"),
                textDecorationLine: row.done ? "line-through" : "none",
              },
            ]}
          >
            {row.title}
          </Text>
          {parts.length === 0 ? null : (
            <View style={styles.meta}>
              {parts.map((part) => (
                <View key={part.key} style={styles.metaPart}>
                  {part.dot === undefined ? null : (
                    <View style={[styles.metaDot, { backgroundColor: part.dot }]} />
                  )}
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.metaText,
                      { color: part.color, fontStyle: part.italic ? "italic" : "normal" },
                    ]}
                  >
                    {part.text}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
        {row.dueDate === null ? null : (
          <Text style={[styles.due, { color: dueColor(state, theme) }]}>{dueText(row, today)}</Text>
        )}
      </PressableDim>
    </View>
  );
});

type PromotionProps = {
  source: PromotionSource;
  theme: ShellTheme;
  onPromote: (candidate: PromotionCandidate) => void;
};

/** Nothing here promotes by shape: each item is promoted by its own tap (ADR-0032). */
function PromotionSection({ source, theme, onPromote }: PromotionProps) {
  return (
    <View style={[styles.promotion, { borderBottomColor: theme.color("border") }]}>
      <View style={styles.groupHeaderPlain}>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={[styles.groupTitle, { color: theme.color("foreground") }]}
        >
          {`Checklist in ${source.noteTitle}`}
        </Text>
      </View>
      {source.candidates.map((candidate) => (
        <View
          key={candidate.itemIndex}
          style={[styles.row, { borderBottomColor: theme.color("border") }]}
        >
          <View style={styles.checkHit}>
            <Checkbox checked={candidate.checked} theme={theme} muted />
          </View>
          <View style={styles.rowBody}>
            <View style={styles.rowMain}>
              <Text
                numberOfLines={2}
                style={[styles.rowTitle, { color: theme.color("foreground", 0.85) }]}
              >
                {candidate.title}
              </Text>
            </View>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`Promote ${candidate.title} to a task`}
              onPress={() => onPromote(candidate)}
              style={[styles.rowAction, { backgroundColor: theme.color("secondary") }]}
            >
              <Text style={[styles.rowActionLabel, { color: theme.color("secondary-foreground") }]}>
                Promote
              </Text>
            </PressableScale>
          </View>
        </View>
      ))}
    </View>
  );
}

type CheckboxProps = {
  checked: boolean;
  theme: ShellTheme;
  muted?: boolean;
};

/**
 * The box a task row ticks. React Native carries no SVG in this build, so the
 * tick is two bars, the way `shell/icons.tsx` draws the rest of the shell. A
 * done box fills with the foreground colour and the tick takes the background,
 * the way the desktop ledger draws it.
 */
function Checkbox({ checked, theme, muted = false }: CheckboxProps) {
  const fill = theme.color("foreground");
  const tick = theme.color("background");
  const border = muted ? theme.color("border") : checked ? fill : theme.color("foreground", 0.4);
  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no"
      style={[
        styles.checkbox,
        BOX_FADE,
        { borderColor: border, backgroundColor: checked && !muted ? fill : "transparent" },
      ]}
    >
      {muted ? null : (
        <Animated.View
          style={[styles.tick, TICK_FADE, checked ? styles.tickOn : styles.tickOff]}
          pointerEvents="none"
        >
          <View style={[styles.tickShort, { backgroundColor: tick }]} />
          <View style={[styles.tickLong, { backgroundColor: tick }]} />
        </Animated.View>
      )}
    </Animated.View>
  );
}

type EmptyProps = {
  theme: ShellTheme;
  promoting: boolean;
};

function EmptyTasks({ theme, promoting }: EmptyProps) {
  return (
    <View style={styles.empty}>
      <Text
        accessibilityRole="header"
        style={[styles.emptyTitle, { color: theme.color("foreground") }]}
      >
        No tasks yet
      </Text>
      <Text style={[styles.emptyDetail, { color: theme.color("muted-foreground") }]}>
        {promoting
          ? "Promote a checklist item above to start tracking it."
          : "Open a note with a checklist, then promote the item you want to track."}
      </Text>
    </View>
  );
}

const BOX_FADE: CSSStyle<ViewStyle> = {
  transitionProperty: ["borderColor", "backgroundColor"],
  transitionDuration: STATE_MS,
  transitionTimingFunction: PRESS_EASING,
};

const TICK_FADE: CSSStyle<ViewStyle> = {
  transitionProperty: ["opacity", "transform"],
  transitionDuration: STATE_MS,
  transitionTimingFunction: PRESS_EASING,
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 4,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  summary: {
    fontSize: 13,
  },
  notice: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
  },
  toggle: {
    flexDirection: "row",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 9,
    padding: 2,
  },
  toggleOption: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 7,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  list: {
    paddingBottom: 32,
  },
  promotion: {
    paddingBottom: 12,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  groupHeader: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 6,
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  groupHeaderPlain: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  groupTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  groupDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  groupTitle: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: "600",
  },
  groupCount: {
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  groupDetail: {
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkHit: {
    width: MINIMUM_TOUCH_TARGET - 8,
    minHeight: MINIMUM_TOUCH_TARGET,
    paddingTop: 13,
  },
  rowBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    minHeight: MINIMUM_TOUCH_TARGET,
    paddingTop: 11,
    paddingBottom: 11,
  },
  rowMain: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    fontSize: 16,
    lineHeight: 21,
  },
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 12,
    rowGap: 2,
  },
  metaPart: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: 200,
  },
  metaDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  metaText: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  due: {
    fontSize: 13,
    lineHeight: 21,
    fontVariant: ["tabular-nums"],
  },
  rowAction: {
    minHeight: 36,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  rowActionLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  more: {
    minHeight: MINIMUM_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  moreLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  tick: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  tickOn: {
    opacity: 1,
    transform: [{ scale: 1 }],
  },
  tickOff: {
    opacity: 0,
    transform: [{ scale: 0.8 }],
  },
  tickShort: {
    position: "absolute",
    left: 4,
    top: 11,
    width: 6,
    height: 2,
    borderRadius: 1,
    transform: [{ rotate: "45deg" }],
  },
  tickLong: {
    position: "absolute",
    left: 7,
    top: 9.5,
    width: 11,
    height: 2,
    borderRadius: 1,
    transform: [{ rotate: "-45deg" }],
  },
  empty: {
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 32,
    paddingTop: 48,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  emptyDetail: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
});
