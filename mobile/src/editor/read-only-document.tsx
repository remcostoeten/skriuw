import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { RendererState } from "../../../shared/renderer-core/src/store/types";
import { useTheme } from "../shell/theme";
import { useWorkspaceSelector } from "../shell/workspace-provider";
import type { EditorFailureView } from "./failure-view";

type OpenDocument = {
  title: string;
  markdown: string;
};

type Props = {
  notice: EditorFailureView;
};

function openDocument(state: RendererState): OpenDocument | null {
  const id = state.activeNoteId;
  if (id === null) {
    return null;
  }
  return {
    title: state.nodes.get(id)?.title ?? "Untitled",
    markdown: state.documents.get(id)?.markdown ?? "",
  };
}

function openDocumentsEqual(left: OpenDocument | null, right: OpenDocument | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.title === right.title && left.markdown === right.markdown;
}

/** The title is already the screen's heading, so the document's own does not repeat it. */
function documentBody(document: OpenDocument): string {
  const trimmed = document.markdown.trim();
  const heading = `# ${document.title}`;
  return trimmed.startsWith(heading) ? trimmed.slice(heading.length).trim() : trimmed;
}

/**
 * Shown in place of the webview when the build carries no editor page. The
 * note stays readable and the notice says why it cannot be edited. This is the
 * only surface that subscribes to a document's markdown, and it exists only
 * when nothing can type into that document.
 */
export function ReadOnlyDocument({ notice }: Props) {
  const theme = useTheme();
  const document = useWorkspaceSelector(openDocument, openDocumentsEqual);

  return (
    <ScrollView contentContainerStyle={styles.document}>
      <View
        accessibilityRole="alert"
        style={[styles.notice, { borderColor: theme.color("border") }]}
      >
        <Text style={[styles.noticeSummary, { color: theme.color("foreground") }]}>
          {notice.summary}
        </Text>
        <Text style={[styles.noticeDetail, { color: theme.color("muted-foreground") }]}>
          This note is read-only. {notice.detail}
        </Text>
      </View>
      {document === null ? null : (
        <>
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: theme.color("foreground") }]}
          >
            {document.title}
          </Text>
          <Text
            accessibilityLabel={`Document body of ${document.title}`}
            style={[styles.body, { color: theme.color("foreground", 0.85) }]}
          >
            {documentBody(document)}
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  document: {
    padding: 20,
    gap: 12,
  },
  notice: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 4,
  },
  noticeSummary: {
    fontSize: 15,
    fontWeight: "600",
  },
  noticeDetail: {
    fontSize: 13,
    lineHeight: 18,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
  },
});
