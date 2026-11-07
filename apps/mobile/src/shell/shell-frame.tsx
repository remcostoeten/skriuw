import { router, usePathname, type Href } from "expo-router";
import { useCallback, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useGenericKeyboardHandler } from "react-native-keyboard-controller";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EditorHost } from "../editor/editor-host";
import { SealedNoteGate } from "../features/lock/lock-gate";
import { LockSettingsView } from "../features/lock/lock-settings-view";
import { SearchScreen } from "../features/search/search-screen";
import { AccountPanel } from "./account-panel";
import { useChrome } from "./chrome";
import { destinationForRoute, routeForPath } from "./destinations";
import { EdgeSwipeZones } from "./edge-swipe-zones";
import { TAB_BAR_HEIGHT } from "./metrics";
import { clamp } from "./motion";
import { hasOpenNote } from "./route-views";
import { SideSheet } from "./sheet";
import { TabBar } from "./tab-bar";
import { useTheme } from "./theme";
import { ToastHost } from "./toast-host";
import { Toolbar } from "./toolbar";
import { createNote } from "./tree-actions";
import { TreeView } from "./tree-view";
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
 * (`docs/specs/mobile-app.md`, R-P1). The editor host sits beside the route
 * slot rather than inside it, so leaving the notes route hides the webview
 * instead of unmounting it (R-P2).
 *
 * The tab bar floats over the bottom of the content column, which keeps clear
 * of it and of the software keyboard through one inset measured from the
 * screen edge. Native routes follow the keyboard frame by frame; the editor
 * takes its inset once, as the keyboard starts to move, so the webview lays
 * out its document once per keyboard move instead of on every frame. While a
 * side sheet is open the inset holds still, so a keyboard raised inside the
 * sheet does not re-lay out the column hidden behind it.
 */
export function ShellFrame({ children }: Props) {
  const theme = useTheme();
  const chrome = useChrome();
  const session = useWorkspace();
  const insets = useSafeAreaInsets();
  const route = routeForPath(usePathname());
  const noteTitle = useWorkspaceSelector(activeNoteTitle);
  const editorVisible = useWorkspaceSelector(hasOpenNote) && route === "notes";
  const destination = destinationForRoute(route);
  const openTree = useCallback(() => chrome.openSheet("tree"), [chrome]);
  const openSearch = useCallback(() => chrome.openSheet("search"), [chrome]);
  const keyboard = useSharedValue(0);
  const keyboardHeight = useSharedValue(0);
  const keyboardTarget = useSharedValue(0);
  const barHeight = useSharedValue(TAB_BAR_HEIGHT + insets.bottom + StyleSheet.hairlineWidth);

  useGenericKeyboardHandler(
    {
      onStart: (event) => {
        "worklet";
        keyboardTarget.set(event.height);
      },
      onMove: (event) => {
        "worklet";
        keyboard.set(event.progress);
        keyboardHeight.set(event.height);
      },
      onInteractive: (event) => {
        "worklet";
        keyboard.set(event.progress);
        keyboardHeight.set(event.height);
      },
      onEnd: (event) => {
        "worklet";
        keyboardTarget.set(event.height);
        keyboard.set(event.progress);
        keyboardHeight.set(event.height);
      },
    },
    [],
  );

  const liveInset = useDerivedValue(() =>
    Math.max(barHeight.get() * (1 - clamp(keyboard.get(), 0, 1)), keyboardHeight.get()),
  );
  const sheetInset = useDerivedValue(() => Math.max(insets.bottom, keyboardHeight.get()));
  const sheetToast = <ToastHost inset={sheetInset} />;
  const sheetOpen = chrome.sheet !== null;
  const bottomInset = useAnimatedStyle(() => {
    if (sheetOpen) {
      return { paddingBottom: barHeight.get() };
    }
    if (editorVisible) {
      const target = keyboardTarget.get();
      return { paddingBottom: target > 0 ? target : barHeight.get() };
    }
    return { paddingBottom: liveInset.get() };
  });

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
      <Animated.View
        style={[
          styles.content,
          {
            backgroundColor: theme.color(editorVisible ? "theme-bg-editor" : "background"),
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
          bottomInset,
        ]}
      >
        <View style={editorVisible ? styles.hidden : styles.slot}>{children}</View>
        <SealedNoteGate active={editorVisible}>
          <EditorHost visible={editorVisible} />
        </SealedNoteGate>
      </Animated.View>
      <TabBar
        route={route}
        keyboard={keyboard}
        height={barHeight}
        onOpenAccount={() => chrome.openSheet("account")}
      />
      <EdgeSwipeZones onOpen={(side) => chrome.openSheet(side === "left" ? "tree" : "account")} />
      <SideSheet
        side="left"
        open={chrome.sheet === "tree"}
        title="Notes"
        onClose={chrome.closeSheet}
        overlay={sheetToast}
      >
        <TreeView onOpenNote={openNote} />
      </SideSheet>
      <SideSheet
        side="right"
        open={chrome.sheet === "search"}
        title="Search"
        onClose={chrome.closeSheet}
        overlay={sheetToast}
      >
        <SearchScreen onOpenNote={openNote} />
      </SideSheet>
      <SideSheet
        side="right"
        open={chrome.sheet === "account"}
        title="Account"
        onClose={chrome.closeSheet}
        overlay={sheetToast}
      >
        <AccountPanel />
      </SideSheet>
      <SideSheet
        side="right"
        open={chrome.sheet === "lock"}
        title="Locked notes"
        onClose={chrome.closeSheet}
        overlay={sheetToast}
      >
        <LockSettingsView />
      </SideSheet>
      {chrome.sheet === null ? <ToastHost inset={liveInset} /> : null}
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
  slot: {
    flex: 1,
    minHeight: 0,
  },
  hidden: {
    display: "none",
  },
});
