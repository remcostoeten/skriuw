import { useCallback } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { MINIMUM_TOUCH_TARGET } from "../../shell/metrics";
import { useTheme, type ShellTheme } from "../../shell/theme";
import { purgeNode, restoreTrashedNode } from "../../shell/tree-actions";
import { useWorkspace, useWorkspaceSelector } from "../../shell/workspace-provider";
import { selectTrashEntries, trashEntriesEqual, type TrashEntry } from "./trash-model";

export function TrashView() {
  const theme = useTheme();
  const session = useWorkspace();
  const entries = useWorkspaceSelector(selectTrashEntries, trashEntriesEqual);

  const restore = useCallback(
    (entry: TrashEntry) => {
      restoreTrashedNode(session, entry.id)
        .then(() => undefined)
        .catch((error: unknown) => {
          session.reportFailure(error);
        });
    },
    [session],
  );

  const purge = useCallback(
    (entry: TrashEntry) => {
      Alert.alert(
        "Delete forever?",
        `${entry.title} and its ${entry.descendantCount} descendant${entry.descendantCount === 1 ? "" : "s"} will be removed permanently.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete forever",
            style: "destructive",
            onPress: () => {
              purgeNode(session, entry.id).catch((error: unknown) => {
                session.reportFailure(error);
              });
            },
          },
        ],
      );
    },
    [session],
  );

  const renderItem = useCallback(
    ({ item }: { item: TrashEntry }) => (
      <TrashRow entry={item} theme={theme} onPurge={purge} onRestore={restore} />
    ),
    [purge, restore, theme],
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: theme.color("foreground") }]}
        >
          Trash
        </Text>
        <Text style={[styles.subtitle, { color: theme.color("muted-foreground") }]}>
          {entries.length === 0
            ? "Deleted notes stay recoverable here."
            : `${entries.length} deleted ${entries.length === 1 ? "item" : "items"}`}
        </Text>
      </View>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={entries.length === 0 ? styles.emptyList : styles.list}
        ListEmptyComponent={<EmptyTrash theme={theme} />}
        renderItem={renderItem}
      />
    </View>
  );
}

type TrashRowProps = {
  entry: TrashEntry;
  theme: ShellTheme;
  onRestore: (entry: TrashEntry) => void;
  onPurge: (entry: TrashEntry) => void;
};

function TrashRow({ entry, theme, onPurge, onRestore }: TrashRowProps) {
  const restore = useCallback(() => onRestore(entry), [entry, onRestore]);
  const purge = useCallback(() => onPurge(entry), [entry, onPurge]);
  return (
    <View style={[styles.card, { borderColor: theme.color("border") }]}>
      <View style={styles.copy}>
        <Text numberOfLines={2} style={[styles.name, { color: theme.color("foreground") }]}>
          {entry.title}
        </Text>
        <Text style={[styles.detail, { color: theme.color("muted-foreground") }]}>
          {entry.kind === "folder" ? "Folder" : "Note"} · {entry.descendantCount} descendant
          {entry.descendantCount === 1 ? "" : "s"}
        </Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Restore ${entry.title}`}
          onPress={restore}
          style={[styles.action, { backgroundColor: theme.color("secondary") }]}
        >
          <Text style={[styles.actionLabel, { color: theme.color("secondary-foreground") }]}>
            Restore
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${entry.title} forever`}
          onPress={purge}
          style={styles.action}
        >
          <Text style={[styles.deleteLabel, { color: theme.color("destructive") }]}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

type EmptyTrashProps = {
  theme: ShellTheme;
};

function EmptyTrash({ theme }: EmptyTrashProps) {
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: theme.color("foreground") }]}>Trash is empty</Text>
      <Text style={[styles.emptyDetail, { color: theme.color("muted-foreground") }]}>
        Deleted notes will wait here until you restore or remove them.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  header: {
    gap: 4,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 14,
  },
  list: {
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  emptyList: {
    flexGrow: 1,
  },
  card: {
    gap: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    borderCurve: "continuous",
  },
  copy: {
    gap: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
  },
  detail: {
    fontSize: 13,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  action: {
    minHeight: MINIMUM_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 10,
    borderCurve: "continuous",
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  deleteLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  emptyDetail: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
