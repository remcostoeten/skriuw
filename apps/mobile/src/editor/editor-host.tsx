import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MINIMUM_TOUCH_TARGET } from "../shell/metrics";
import { useTheme } from "../shell/theme";
import { useWorkspace } from "../shell/workspace-provider";
import { resolveEditorBundle } from "./bundle-source";
import EditorSurface, { type EditorSurfaceHandle } from "./editor-surface";
import { describeEditorFailure, isReloadable, type EditorFailureView } from "./failure-view";
import { createEditorHostSession, type EditorHostSession } from "./host-session";
import type { EditorTheme } from "./protocol";
import { ReadOnlyDocument } from "./read-only-document";

type Props = {
  /**
   * Whether the editor is the destination on screen. It is never unmounted:
   * a hidden host keeps its webview warm, so returning to a note costs a
   * layout pass and no page load (`docs/specs/mobile-app.md`, R-P2).
   */
  visible?: boolean;
};

/**
 * Props handed to the underlying webview. They are unverified on device: the
 * mobile package does not depend on `react-native-webview` yet, so nothing
 * here has been exercised by a build (see the handoff on issue #390).
 */
const WEBVIEW_PROPS = {
  matchContents: false,
  /** The editor owns its scroller; a scrolling webview would fight it. */
  scrollEnabled: false,
  bounces: false,
  overScrollMode: "never",
  /** Focus moves programmatically when a note loads, so the keyboard must follow. */
  keyboardDisplayRequiresUserAction: false,
  /** Frees the strip above the keyboard for the editor's own bubble menu. */
  hideKeyboardAccessoryView: true,
  allowsLinkPreview: false,
};

/**
 * Mounts the one editor webview and wires it to the workspace. The component
 * subscribes to nothing that changes while typing: documents, acknowledgements
 * and references travel through `createEditorHostSession` as plain store
 * subscriptions and protocol messages, so a keystroke renders nothing outside
 * the webview (R-P3).
 */
export function EditorHost({ visible = true }: Props) {
  const workspace = useWorkspace();
  const theme = useTheme();
  const surface = useRef<EditorSurfaceHandle | null>(null);
  const host = useRef<EditorHostSession | null>(null);
  const editorTheme = useRef<EditorTheme>(theme.definition);
  const [failure, setFailure] = useState<EditorFailureView | null>(null);
  const [generation, setGeneration] = useState(0);
  // Metro only inlines `EXPO_PUBLIC_*` reads written out in full.
  const bundle = useMemo(
    () => resolveEditorBundle(process.env.EXPO_PUBLIC_SKRIUW_EDITOR_ENTRY),
    [],
  );

  useEffect(() => {
    editorTheme.current = theme.definition;
  }, [theme.definition]);

  useEffect(() => {
    const session = createEditorHostSession({
      session: workspace,
      send: (message) => surface.current?.deliver(JSON.stringify(message)),
      openLink: (url) => {
        Linking.openURL(url).catch(workspace.reportFailure);
      },
      theme: () => editorTheme.current,
      showFailure: setFailure,
    });
    host.current = session;
    return () => {
      host.current = null;
      session.dispose();
    };
  }, [workspace]);

  useEffect(() => {
    host.current?.setTheme(theme.definition);
  }, [theme.definition]);

  const receive = useCallback(async (text: string) => {
    host.current?.receive(text);
  }, []);

  const reload = useCallback(() => {
    host.current?.restart();
    setGeneration((current) => current + 1);
  }, []);

  if (!bundle.ok) {
    return (
      <View
        style={[styles.root, visible ? null : styles.hidden]}
        pointerEvents={visible ? "auto" : "none"}
      >
        <ReadOnlyDocument notice={describeEditorFailure("bundle-missing", bundle.detail)} />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.root,
        visible ? null : styles.hidden,
        { backgroundColor: theme.color("theme-bg-editor") },
      ]}
      pointerEvents={visible ? "auto" : "none"}
    >
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <EditorSurface
          key={generation}
          ref={surface}
          source={bundle.uri}
          background={theme.color("theme-bg-editor")}
          onEditorMessage={receive}
          dom={{
            ...WEBVIEW_PROPS,
            style: styles.fill,
            onRenderProcessGone: () =>
              host.current?.reportWebviewGone("the Android webview process was reclaimed"),
            onContentProcessDidTerminate: () =>
              host.current?.reportWebviewGone("the iOS web content process was reclaimed"),
          }}
        />
        {failure === null ? null : <EditorFailureSurface view={failure} onReload={reload} />}
      </KeyboardAvoidingView>
    </View>
  );
}

type FailureProps = {
  view: EditorFailureView;
  onReload: () => void;
};

/**
 * Covers the webview when it cannot be trusted to show the document. Every
 * edit the host acknowledged is already durable in SQLite, and the surface
 * says so: recovery must never read as data loss (R-Q1).
 */
function EditorFailureSurface({ view, onReload }: FailureProps) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="alert"
      style={[styles.failure, { backgroundColor: theme.color("theme-bg-editor") }]}
    >
      <Text
        accessibilityRole="header"
        style={[styles.failureSummary, { color: theme.color("foreground") }]}
      >
        {view.summary}
      </Text>
      <Text style={[styles.failureDetail, { color: theme.color("muted-foreground") }]}>
        {view.detail}
      </Text>
      <Text style={[styles.failureDetail, { color: theme.color("muted-foreground") }]}>
        Saved edits are safe. They were written to this device before the editor was told they had
        landed.
      </Text>
      {isReloadable(view) ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reload the editor"
          onPress={onReload}
          style={[styles.reload, { borderColor: theme.color("border") }]}
        >
          <Text style={[styles.reloadLabel, { color: theme.color("foreground") }]}>
            Reload editor
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  hidden: {
    display: "none",
  },
  fill: {
    flex: 1,
  },
  failure: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 32,
  },
  failureSummary: {
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
  },
  failureDetail: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  reload: {
    minHeight: MINIMUM_TOUCH_TARGET,
    minWidth: 160,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 6,
  },
  reloadLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
});
