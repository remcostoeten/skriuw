import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MINIMUM_TOUCH_TARGET, SCRIM_ALPHA } from "../../shell/metrics";
import { useTheme } from "../../shell/theme";
import {
  JOURNAL_DATE_SUGGESTIONS,
  resolveJournalDateExpression,
  type JournalDateResolution,
} from "./date-expressions";
import type { DateKey } from "./dates";

type Props = {
  open: boolean;
  context: DateKey;
  today: DateKey;
  onClose: () => void;
  onGo: (key: DateKey) => void;
};

/**
 * "Go to date…" on the compact shell: the same grammar and the same live
 * preview as the desktop dialog (`docs/specs/journal-navigation.md`), reached
 * by a press rather than by `d`. Enter only goes when the expression
 * resolves, and the preview line is a live region so a screen reader hears
 * the destination before committing to it.
 */
export function GoToDateSheet({ open, context, today, onClose, onGo }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState("");
  const field = useRef<TextInput>(null);
  const resolution: JournalDateResolution | null =
    input.trim().length === 0 ? null : resolveJournalDateExpression(input, context, today);

  function go(expression: string): void {
    const resolved = resolveJournalDateExpression(expression, context, today);
    if (!resolved.ok) {
      return;
    }
    onGo(resolved.key);
    setInput("");
    onClose();
  }

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onShow={() => field.current?.focus()}
    >
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close go to date"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.color("scrim", SCRIM_ALPHA) }]}
        />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View
            accessibilityViewIsModal
            style={[
              styles.panel,
              {
                paddingBottom: insets.bottom + 12,
                backgroundColor: theme.color("popover"),
                borderColor: theme.color("border"),
              },
            ]}
          >
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: theme.color("popover-foreground") }]}
            >
              Go to date
            </Text>
            <TextInput
              ref={field}
              accessibilityLabel="Date expression"
              aria-invalid={resolution !== null && !resolution.ok}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => go(input)}
              placeholder="tomorrow, next week thursday, 3/12"
              placeholderTextColor={theme.color("muted-foreground")}
              style={[
                styles.field,
                {
                  color: theme.color("foreground"),
                  backgroundColor: theme.color("input"),
                  borderColor:
                    resolution !== null && !resolution.ok
                      ? theme.color("destructive")
                      : theme.color("border"),
                },
              ]}
            />
            {resolution === null ? (
              <ScrollView
                accessibilityRole="list"
                keyboardShouldPersistTaps="handled"
                style={styles.suggestions}
              >
                {JOURNAL_DATE_SUGGESTIONS.map((suggestion) => {
                  const resolved = resolveJournalDateExpression(
                    suggestion.expression,
                    context,
                    today,
                  );
                  return (
                    <Pressable
                      key={suggestion.expression}
                      accessibilityRole="button"
                      accessibilityLabel={`${suggestion.expression}, ${
                        resolved.ok ? resolved.label : suggestion.description
                      }`}
                      onPress={() => go(suggestion.expression)}
                      style={styles.suggestion}
                    >
                      <Text style={[styles.expression, { color: theme.color("foreground") }]}>
                        {suggestion.expression}
                      </Text>
                      <Text style={[styles.resolved, { color: theme.color("muted-foreground") }]}>
                        {resolved.ok ? resolved.label : suggestion.description}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <Text
                accessibilityLiveRegion="polite"
                style={[
                  styles.preview,
                  {
                    color: resolution.ok
                      ? theme.color("foreground")
                      : theme.color("destructive"),
                  },
                ]}
              >
                {resolution.ok ? resolution.label : resolution.message}
              </Text>
            )}
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close go to date"
                onPress={onClose}
                style={[styles.action, { borderColor: theme.color("border") }]}
              >
                <Text style={[styles.actionLabel, { color: theme.color("muted-foreground") }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open this date"
                accessibilityState={{ disabled: resolution?.ok !== true }}
                disabled={resolution?.ok !== true}
                onPress={() => go(input)}
                style={[
                  styles.action,
                  {
                    borderColor: theme.color("primary"),
                    backgroundColor: theme.color("primary", resolution?.ok === true ? 1 : 0.4),
                  },
                ]}
              >
                <Text style={[styles.actionLabel, { color: theme.color("primary-foreground") }]}>
                  Go
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  panel: {
    gap: 12,
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
  },
  field: {
    minHeight: MINIMUM_TOUCH_TARGET,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  suggestions: {
    maxHeight: 220,
  },
  suggestion: {
    minHeight: MINIMUM_TOUCH_TARGET,
    justifyContent: "center",
    gap: 2,
    paddingVertical: 6,
  },
  expression: {
    fontSize: 14,
    fontWeight: "600",
  },
  resolved: {
    fontSize: 12,
  },
  preview: {
    fontSize: 13,
    minHeight: 18,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  action: {
    minHeight: MINIMUM_TOUCH_TARGET,
    minWidth: 96,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
});
