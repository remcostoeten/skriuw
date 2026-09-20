import { useCallback } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { SearchHit } from "../../../../shared/renderer-core/src/contracts/workspace";
import { MINIMUM_TOUCH_TARGET } from "../../shell/metrics";
import { useTheme } from "../../shell/theme";
import { activateNote } from "../../shell/tree-actions";
import { useWorkspace } from "../../shell/workspace-provider";
import { describeSearchIndex } from "./index-status";
import { SavedSearchBar } from "./saved-search-bar";
import { SearchResultRow } from "./search-result-row";
import type { SearchPlanStatus } from "./search-plan";
import { setSearchSaved } from "./saved-searches";
import { useWorkspaceSearch } from "./use-search";

type Props = {
  /** Called after a hit is opened, so the surface that hosts search can step aside. */
  onOpenNote?: () => void;
};

function hitKey(hit: SearchHit): string {
  return hit.noteId;
}

/**
 * The search destination: one field, the workspace's saved queries, the state
 * of the full-text index, and the backend's ranked hits. Opening a hit is a
 * store update in the press handler, so the note is active in the same frame
 * (`docs/performance-contract.md`, R-P1).
 */
export function SearchScreen({ onOpenNote }: Props) {
  const theme = useTheme();
  const session = useWorkspace();
  const search = useWorkspaceSearch();
  const { setQuery } = search;

  const openHit = useCallback(
    (noteId: string) => {
      activateNote(session.store, noteId);
      onOpenNote?.();
    },
    [onOpenNote, session.store],
  );

  const removeSaved = useCallback(
    (query: string) => {
      setSearchSaved(session, query, false).catch(session.reportFailure);
    },
    [session],
  );

  const indexLine = search.index === null ? null : describeSearchIndex(search.index);
  const outcome = search.outcome;
  const canSave = search.query.trim().length > 0;

  return (
    <View style={styles.root}>
      <View style={styles.field}>
        <TextInput
          accessibilityLabel="Search notes"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setQuery}
          placeholder="Search notes, #tag, $person"
          placeholderTextColor={theme.color("muted-foreground")}
          returnKeyType="search"
          style={[
            styles.input,
            {
              backgroundColor: theme.color("input"),
              borderColor: theme.color("border"),
              color: theme.color("foreground"),
            },
          ]}
          value={search.query}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={search.isQuerySaved ? "Remove saved search" : "Save this search"}
          accessibilityState={{ disabled: !canSave, selected: search.isQuerySaved }}
          disabled={!canSave}
          onPress={search.toggleSaved}
          style={styles.saveControl}
        >
          <Text
            style={[
              styles.saveLabel,
              { color: theme.color("foreground", canSave ? 0.9 : 0.35) },
            ]}
          >
            {search.isQuerySaved ? "Saved" : "Save"}
          </Text>
        </Pressable>
      </View>

      <SavedSearchBar
        queries={search.saved.queries}
        activeQuery={search.query}
        onApply={setQuery}
        onRemove={removeSaved}
      />

      {search.saved.error === null ? null : (
        <Notice tone="destructive" text={search.saved.error} />
      )}
      {indexLine === null ? null : <Notice tone="muted" text={indexLine} />}
      {outcome?.problems.map((problem) => (
        <Notice key={problem} tone="destructive" text={problem} />
      ))}

      <FlatList
        data={outcome?.hits ?? []}
        keyExtractor={hitKey}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <EmptyState
            query={search.query}
            running={search.running}
            status={outcome?.status ?? "idle"}
          />
        }
        renderItem={({ item }) => <SearchResultRow hit={item} onOpen={openHit} />}
      />
    </View>
  );
}

type NoticeProps = {
  tone: "muted" | "destructive";
  text: string;
};

function Notice({ tone, text }: NoticeProps) {
  const theme = useTheme();

  return (
    <Text
      accessibilityLiveRegion="polite"
      accessibilityRole={tone === "destructive" ? "alert" : "text"}
      style={[
        styles.notice,
        { color: theme.color(tone === "muted" ? "muted-foreground" : "destructive") },
      ]}
    >
      {text}
    </Text>
  );
}

type EmptyStateProps = {
  query: string;
  running: boolean;
  status: SearchPlanStatus;
};

function EmptyState({ query, running, status }: EmptyStateProps) {
  const theme = useTheme();

  if (status === "blocked") {
    return null;
  }
  const message =
    status === "idle"
      ? query.trim().length === 0
        ? "Search the workspace by text, by #tag, or by $person."
        : "Keep typing — full-text search starts at two characters."
      : running
        ? "Searching…"
        : `No notes match “${query.trim()}”.`;

  return <Text style={[styles.empty, { color: theme.color("muted-foreground") }]}>{message}</Text>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: MINIMUM_TOUCH_TARGET,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 15,
  },
  saveControl: {
    minWidth: MINIMUM_TOUCH_TARGET,
    height: MINIMUM_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  saveLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  notice: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  empty: {
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 16,
    paddingTop: 24,
    textAlign: "center",
  },
});
