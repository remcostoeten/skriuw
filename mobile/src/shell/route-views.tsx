import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { RendererState } from "../../../shared/renderer-core/src/store/types";
import type { ShellRoute } from "./destinations";
import { useTheme } from "./theme";
import { useWorkspaceSelector } from "./workspace-provider";

type ActiveNote = {
  id: string;
  title: string;
  markdown: string;
};

function activeNote(state: RendererState): ActiveNote | null {
  const id = state.activeNoteId;
  if (id === null) {
    return null;
  }
  return {
    id,
    title: state.nodes.get(id)?.title ?? "Untitled",
    markdown: state.documents.get(id)?.markdown ?? "",
  };
}

/** The title is already the screen's heading, so the document's own does not repeat it. */
function documentBody(note: ActiveNote): string {
  const trimmed = note.markdown.trim();
  const heading = `# ${note.title}`;
  return trimmed.startsWith(heading) ? trimmed.slice(heading.length).trim() : trimmed;
}

function activeNotesEqual(left: ActiveNote | null, right: ActiveNote | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.id === right.id && left.title === right.title && left.markdown === right.markdown;
}

/**
 * The notes column. The document is rendered as its markdown until the editor
 * webview is mounted here by Mobile 09; the note it shows and the store it
 * reads are already the final ones.
 */
export function NotesColumn() {
  const theme = useTheme();
  const note = useWorkspaceSelector(activeNote, activeNotesEqual);

  if (note === null) {
    return (
      <RoutePlaceholder
        route="notes"
        detail="Open a note from the tree, or create one from the toolbar."
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.document}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.color("foreground") }]}>
        {note.title}
      </Text>
      <Text
        accessibilityLabel={`Document body of ${note.title}`}
        style={[styles.body, { color: theme.color("foreground", 0.85) }]}
      >
        {documentBody(note)}
      </Text>
    </ScrollView>
  );
}

type PlaceholderProps = {
  route: ShellRoute;
  detail: string;
};

/** A destination whose surface arrives with its own issue in wave 3. */
export function RoutePlaceholder({ route, detail }: PlaceholderProps) {
  const theme = useTheme();

  return (
    <View style={styles.placeholder}>
      <Text
        accessibilityRole="header"
        style={[styles.placeholderTitle, { color: theme.color("foreground") }]}
      >
        {route === "notes" ? "No note open" : label(route)}
      </Text>
      <Text style={[styles.placeholderDetail, { color: theme.color("muted-foreground") }]}>
        {detail}
      </Text>
    </View>
  );
}

function label(route: ShellRoute): string {
  return `${route.slice(0, 1).toUpperCase()}${route.slice(1)}`;
}

const styles = StyleSheet.create({
  document: {
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 32,
  },
  placeholderTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  placeholderDetail: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
