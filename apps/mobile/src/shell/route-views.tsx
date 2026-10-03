import { StyleSheet, Text, View } from "react-native";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import type { ShellRoute } from "./destinations";
import { useTheme } from "./theme";
import { useWorkspaceSelector } from "./workspace-provider";

export function hasOpenNote(state: RendererState): boolean {
  return state.activeNoteId !== null;
}

/**
 * The notes column. The editor host is not mounted here: `ShellFrame` mounts
 * it once beside the route slot, so neither a note switch nor a route change
 * remounts the webview (R-P2). The column only covers the slot while no note
 * is open, and subscribes to nothing else.
 */
export function NotesColumn() {
  const noteOpen = useWorkspaceSelector(hasOpenNote);

  if (noteOpen) {
    return null;
  }
  return (
    <RoutePlaceholder
      route="notes"
      detail="Open a note from the tree, or create one from the toolbar."
    />
  );
}

type Props = {
  route: ShellRoute;
  detail: string;
};

/** A destination whose surface arrives with its own issue in wave 3. */
export function RoutePlaceholder({ route, detail }: Props) {
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
