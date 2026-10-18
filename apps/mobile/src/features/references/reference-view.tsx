import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { ReferenceKind } from "@skriuw/renderer-core/references/types";
import { MINIMUM_TOUCH_TARGET } from "../../shell/metrics";
import { useTheme, type ShellTheme } from "../../shell/theme";
import { activateNote } from "../../shell/tree-actions";
import { useWorkspace, useWorkspaceSelector } from "../../shell/workspace-provider";
import {
  referenceEntriesEqual,
  selectReferenceEntries,
  type ReferenceEntry,
  type ReferenceNote,
} from "./reference-model";

type Props = {
  kind: Extract<ReferenceKind, "tag" | "person">;
};

export function ReferenceView({ kind }: Props) {
  const theme = useTheme();
  const session = useWorkspace();
  const selectEntries = useMemo(() => selectReferenceEntries(kind), [kind]);
  const entries = useWorkspaceSelector(selectEntries, referenceEntriesEqual);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleEntry = useCallback((id: string) => {
    setExpandedId((current) => (current === id ? null : id));
  }, []);

  const openNote = useCallback(
    (id: string) => {
      activateNote(session.store, id);
      router.replace("/");
    },
    [session.store],
  );

  const renderItem = useCallback(
    ({ item }: { item: ReferenceEntry }) => (
      <ReferenceRow
        entry={item}
        expanded={item.id === expandedId}
        theme={theme}
        onOpenNote={openNote}
        onToggle={toggleEntry}
      />
    ),
    [expandedId, openNote, theme, toggleEntry],
  );

  const collectionLabel = kind === "tag" ? "tags" : "people";
  const itemLabel = kind === "tag" ? "tag" : "person";
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: theme.color("foreground") }]}
        >
          {kind === "tag" ? "Tags" : "People"}
        </Text>
        <Text style={[styles.subtitle, { color: theme.color("muted-foreground") }]}>
          {entries.length === 0
            ? `Referenced ${collectionLabel} will appear here.`
            : `${entries.length} ${entries.length === 1 ? itemLabel : collectionLabel}`}
        </Text>
      </View>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={entries.length === 0 ? styles.emptyList : styles.list}
        ListEmptyComponent={<EmptyReferenceState kind={kind} theme={theme} />}
        renderItem={renderItem}
      />
    </View>
  );
}

type ReferenceRowProps = {
  entry: ReferenceEntry;
  expanded: boolean;
  theme: ShellTheme;
  onToggle: (id: string) => void;
  onOpenNote: (id: string) => void;
};

function ReferenceRow({ entry, expanded, theme, onOpenNote, onToggle }: ReferenceRowProps) {
  const toggle = useCallback(() => onToggle(entry.id), [entry.id, onToggle]);
  return (
    <View style={[styles.card, { borderColor: theme.color("border") }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${entry.name}, ${entry.count} ${entry.count === 1 ? "note" : "notes"}`}
        accessibilityState={{ expanded }}
        onPress={toggle}
        style={styles.row}
      >
        <View style={styles.rowCopy}>
          <Text numberOfLines={1} style={[styles.name, { color: theme.color("foreground") }]}>
            {entry.name}
          </Text>
          <Text style={[styles.count, { color: theme.color("muted-foreground") }]}>
            {entry.count} {entry.count === 1 ? "note" : "notes"}
          </Text>
        </View>
        <Text style={[styles.chevron, { color: theme.color("muted-foreground") }]}>
          {expanded ? "−" : "+"}
        </Text>
      </Pressable>
      {expanded ? (
        <View style={[styles.notes, { borderTopColor: theme.color("border") }]}>
          {entry.notes.length === 0 ? (
            <Text style={[styles.noNotes, { color: theme.color("muted-foreground") }]}>
              No available notes use this {entry.name.length > 0 ? "reference" : "item"}.
            </Text>
          ) : (
            entry.notes.map((note) => (
              <ReferenceNoteRow key={note.id} note={note} theme={theme} onOpen={onOpenNote} />
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

type ReferenceNoteRowProps = {
  note: ReferenceNote;
  theme: ShellTheme;
  onOpen: (id: string) => void;
};

function ReferenceNoteRow({ note, theme, onOpen }: ReferenceNoteRowProps) {
  const open = useCallback(() => onOpen(note.id), [note.id, onOpen]);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open ${note.title}`}
      onPress={open}
      style={styles.note}
    >
      <Text numberOfLines={1} style={[styles.noteTitle, { color: theme.color("foreground") }]}>
        {note.title}
      </Text>
      <Text style={[styles.noteArrow, { color: theme.color("muted-foreground") }]}>›</Text>
    </Pressable>
  );
}

type EmptyReferenceStateProps = {
  kind: Props["kind"];
  theme: ShellTheme;
};

function EmptyReferenceState({ kind, theme }: EmptyReferenceStateProps) {
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: theme.color("foreground") }]}>
        Nothing here yet
      </Text>
      <Text style={[styles.emptyDetail, { color: theme.color("muted-foreground") }]}>
        Add a {kind === "tag" ? "#tag" : "$person"} in a note and it will show up in this list.
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
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  row: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
  },
  count: {
    fontSize: 13,
  },
  chevron: {
    width: MINIMUM_TOUCH_TARGET,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "400",
  },
  notes: {
    gap: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 8,
  },
  noNotes: {
    padding: 8,
    fontSize: 13,
  },
  note: {
    minHeight: MINIMUM_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
  },
  noteTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
  },
  noteArrow: {
    fontSize: 22,
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
