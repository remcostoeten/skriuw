import { StyleSheet, Text, View } from "react-native";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { EditorHost } from "../editor/editor-host";
import type { ShellRoute } from "./destinations";
import { useTheme } from "./theme";
import { useWorkspaceSelector } from "./workspace-provider";

function hasOpenNote(state: RendererState): boolean {
  return state.activeNoteId !== null;
}

/**
 * The notes column. The editor host is mounted once and stays mounted while
 * notes switch, so a switch is a `load` into the warm webview. The column
 * subscribes only to whether a note is open: a keystroke changes the
 * document, never that.
 */
export function NotesColumn() {
  const noteOpen = useWorkspaceSelector(hasOpenNote);

  return (
    <View style={styles.column}>
      <EditorHost visible={noteOpen} />
      {noteOpen ? null : (
        <RoutePlaceholder
          route="notes"
          detail="Open a note from the tree, or create one from the toolbar."
        />
      )}
    </View>
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
  column: {
    flex: 1,
    minHeight: 0,
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
