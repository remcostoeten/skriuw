import { router, usePathname, type Href } from "expo-router";
import { useCallback, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SearchScreen } from "../features/search/search-screen";
import { AccountPanel } from "./account-panel";
import { useChrome } from "./chrome";
import { destinationForRoute, routeForPath } from "./destinations";
import { EdgeSwipeZones } from "./edge-swipe-zones";
import { SideSheet } from "./sheet";
import { TabBar } from "./tab-bar";
import { useTheme } from "./theme";
import { ToastHost } from "./toast-host";
import { Toolbar } from "./toolbar";
import { createNote } from "./tree-actions";
import { TreeView } from "./tree-view";
import { useKeyboardVisible } from "./use-keyboard";
import { useWorkspace, useWorkspaceSelector } from "./workspace-provider";
import type { RendererState } from "@skriuw/renderer-core/store/types";

type Props = {
  children: ReactNode;
};

function activeNoteTitle(state: RendererState): string | null {
  if (state.activeNoteId === null) {
    return null;
  }
  return state.nodes.get(state.activeNoteId)?.title ?? null;
}

/**
 * The chrome the routes live inside: a 44 pt toolbar, the content column, the
 * tab bar, the two sheets and the toast. It is mounted once by the root
 * layout, so switching destinations swaps the content column alone
 * (`docs/specs/mobile-app.md`, R-P1).
 */
export function ShellFrame({ children }: Props) {
  const theme = useTheme();
  const chrome = useChrome();
  const session = useWorkspace();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const route = routeForPath(usePathname());
  const noteTitle = useWorkspaceSelector(activeNoteTitle);
  const destination = destinationForRoute(route);
  const openTree = useCallback(() => chrome.openSheet("tree"), [chrome]);
  const openSearch = useCallback(() => chrome.openSheet("search"), [chrome]);

  /**
   * Activating a note from a sheet only changes which note is active, so a
   * reader who opens one from Tasks or Journal would stay on a destination
   * that does not render it. The notes column is where the note is.
   */
  const openNote = useCallback(() => {
    chrome.closeSheet();
    router.replace(destinationForRoute("notes").path as Href);
  }, [chrome]);

  return (
    <View style={[styles.root, { backgroundColor: theme.color("sidebar-background") }]}>
      <View style={{ height: insets.top }} />
      <Toolbar
        title={route === "notes" ? (noteTitle ?? destination.label) : destination.label}
        onOpenTree={openTree}
        onOpenSearch={openSearch}
        onCreateNote={() => {
          createNote(session, null).catch(session.reportFailure);
        }}
      />
      <View
        style={[
          styles.content,
          {
            backgroundColor: theme.color("background"),
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}
      >
        {children}
      </View>
      {keyboardVisible ? null : (
        <TabBar route={route} onOpenAccount={() => chrome.openSheet("account")} />
      )}
      <EdgeSwipeZones
        onOpen={(side) => chrome.openSheet(side === "left" ? "tree" : "account")}
      />
      <SideSheet
        side="left"
        open={chrome.sheet === "tree"}
        title="Notes"
        onClose={chrome.closeSheet}
      >
        <TreeView onOpenNote={openNote} />
      </SideSheet>
      <SideSheet
        side="right"
        open={chrome.sheet === "search"}
        title="Search"
        onClose={chrome.closeSheet}
      >
        <SearchScreen onOpenNote={openNote} />
      </SideSheet>
      <SideSheet
        side="right"
        open={chrome.sheet === "account"}
        title="Account"
        onClose={chrome.closeSheet}
      >
        <AccountPanel />
      </SideSheet>
      <ToastHost />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
});
