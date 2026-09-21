import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useChrome } from "../../shell/chrome";
import { MINIMUM_TOUCH_TARGET } from "../../shell/metrics";
import { useTheme, type ShellTheme } from "../../shell/theme";
import { activateNote } from "../../shell/tree-actions";
import { useWorkspace, useWorkspaceSelector } from "../../shell/workspace-provider";
import { promoteChecklistItem, toggleTask, undoPromotion, type TaskAction } from "./task-actions";
import {
  projectPromotionSource,
  projectTasks,
  promotionSourcesEqual,
  summarizeTasks,
  taskGroupsEqual,
  taskSummariesEqual,
  type PromotionCandidate,
  type PromotionSource,
  type TaskGroup,
  type TaskRow,
} from "./tasks-model";

const SAVE_FAILED = "That change could not be saved.";

type ListItem =
  | { kind: "group"; key: string; title: string; count: number }
  | { kind: "task"; key: string; row: TaskRow };

function listItems(groups: readonly TaskGroup[]): ListItem[] {
  return groups.flatMap((group) => [
    {
      kind: "group" as const,
      key: `group:${group.noteId ?? "unsourced"}`,
      title: group.noteTitle,
      count: group.rows.length,
    },
    ...group.rows.map((row) => ({ kind: "task" as const, key: row.id, row })),
  ]);
}

/**
 * The tasks destination: every task in the workspace under the note it came
 * from, the open note's unpromoted checklist items above them, and an undo for
 * both writes. Ticking a box is a paired write — record and source document in
 * one operation (ADR-0031) — so what this surface shows and what the note body
 * says can never drift apart.
 */
export function TasksView() {
  const theme = useTheme();
  const chrome = useChrome();
  const session = useWorkspace();
  const groups = useWorkspaceSelector(projectTasks, taskGroupsEqual);
  const summary = useWorkspaceSelector(summarizeTasks, taskSummariesEqual);
  const promotion = useWorkspaceSelector(projectPromotionSource, promotionSourcesEqual);
  const [notice, setNotice] = useState<string | null>(null);
  const items = useMemo(() => listItems(groups), [groups]);

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
      toggleTask(session, row.id)
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

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: theme.color("foreground") }]}
        >
          Tasks
        </Text>
        <Text style={[styles.summary, { color: theme.color("muted-foreground") }]}>
          {summary.total === 0
            ? "A little space for what’s next."
            : `${summary.open} remaining · ${summary.total - summary.open} completed`}
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
          promotion === null ? null : (
            <PromotionSection
              source={promotion}
              theme={theme}
              onPromote={(candidate) => onPromote(promotion, candidate)}
            />
          )
        }
        ListEmptyComponent={<EmptyTasks theme={theme} promoting={promotion !== null} />}
        renderItem={({ item }) =>
          item.kind === "group" ? (
            <View style={styles.groupHeader}>
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                style={[styles.groupTitle, { color: theme.color("muted-foreground") }]}
              >
                {item.title}
              </Text>
              <Text style={[styles.groupCount, { color: theme.color("muted-foreground", 0.7) }]}>
                {item.count}
              </Text>
            </View>
          ) : (
            <TaskListRow
              row={item.row}
              theme={theme}
              onToggle={() => onToggle(item.row)}
              onOpenSource={() => onOpenSource(item.row)}
            />
          )
        }
      />
    </View>
  );
}

type RowProps = {
  row: TaskRow;
  theme: ShellTheme;
  onToggle: () => void;
  onOpenSource: () => void;
};

function TaskListRow({ row, theme, onToggle, onOpenSource }: RowProps) {
  const linked = row.noteId !== null;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={row.title.length > 0 ? row.title : "Untitled task"}
        accessibilityState={{ checked: row.done }}
        accessibilityHint={row.done ? "Reopens this task" : "Completes this task"}
        onPress={onToggle}
        style={styles.rowBody}
      >
        <Checkbox checked={row.done} theme={theme} />
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
      </Pressable>
      {linked ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Open ${row.noteTitle}, the source note for ${row.title}`}
          onPress={onOpenSource}
          style={styles.rowAction}
        >
          <Text style={[styles.rowActionLabel, { color: theme.color("theme-accent-blue") }]}>
            Open note
          </Text>
        </Pressable>
      ) : (
        <Text style={[styles.rowNote, { color: theme.color("muted-foreground", 0.8) }]}>
          {row.detached ? "Detached" : "No source"}
        </Text>
      )}
    </View>
  );
}

type PromotionProps = {
  source: PromotionSource;
  theme: ShellTheme;
  onPromote: (candidate: PromotionCandidate) => void;
};

/** Nothing here promotes by shape: each item is promoted by its own tap (ADR-0032). */
function PromotionSection({ source, theme, onPromote }: PromotionProps) {
  return (
    <View style={[styles.promotion, { borderBottomColor: theme.color("border") }]}>
      <View style={styles.groupHeader}>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={[styles.groupTitle, { color: theme.color("muted-foreground") }]}
        >
          {`Checklist in ${source.noteTitle}`}
        </Text>
      </View>
      {source.candidates.map((candidate) => (
        <View key={candidate.itemIndex} style={styles.row}>
          <View style={styles.rowBody}>
            <Checkbox checked={candidate.checked} theme={theme} muted />
            <Text
              numberOfLines={2}
              style={[styles.rowTitle, { color: theme.color("foreground", 0.85) }]}
            >
              {candidate.title}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Promote ${candidate.title} to a task`}
            onPress={() => onPromote(candidate)}
            style={[styles.rowAction, { backgroundColor: theme.color("secondary") }]}
          >
            <Text style={[styles.rowActionLabel, { color: theme.color("secondary-foreground") }]}>
              Promote
            </Text>
          </Pressable>
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
 * tick is two bars, the way `shell/icons.tsx` draws the rest of the shell. It
 * is drawn in the accent rather than on it, so no pair of generated tokens has
 * to be assumed to contrast across all nine themes.
 */
function Checkbox({ checked, theme, muted = false }: CheckboxProps) {
  const accent = theme.color("theme-accent-blue");
  const border = muted ? theme.color("border") : checked ? accent : theme.color("foreground", 0.45);
  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      style={[styles.checkbox, { borderColor: border }]}
    >
      {checked && !muted ? (
        <>
          <View style={[styles.tickShort, { backgroundColor: accent }]} />
          <View style={[styles.tickLong, { backgroundColor: accent }]} />
        </>
      ) : null}
    </View>
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 2,
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
  list: {
    paddingBottom: 24,
  },
  promotion: {
    paddingBottom: 12,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 4,
  },
  groupTitle: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "600",
  },
  groupCount: {
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: MINIMUM_TOUCH_TARGET,
    paddingRight: 12,
  },
  rowBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: MINIMUM_TOUCH_TARGET,
    paddingLeft: 20,
    paddingRight: 8,
  },
  rowTitle: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  rowAction: {
    minHeight: MINIMUM_TOUCH_TARGET,
    minWidth: MINIMUM_TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  rowActionLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  rowNote: {
    fontSize: 11,
    paddingHorizontal: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
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
