import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, type TextInputInstance, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheet } from "../../shell/bottom-sheet";
import { MINIMUM_TOUCH_TARGET } from "../../shell/metrics";
import { useTheme } from "../../shell/theme";
import { PressableScale } from "../../shell/pressable-scale";

type Props = {
  open: boolean;
  dayLabel: string;
  onClose: () => void;
  onCapture: (text: string) => void;
};

/**
 * The composer behind the journal's capture control. It writes nothing
 * itself: the text goes to the durable queue, which is the one path shared
 * with the share sheet, so an in-app capture and one arriving from another
 * application are the same write.
 */
export function QuickCapture({ open, dayLabel, onClose, onCapture }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const field = useRef<TextInputInstance>(null);

  useEffect(() => {
    if (open) {
      setText("");
    }
  }, [open]);

  const ready = text.trim().length > 0;

  return (
    <BottomSheet
      open={open}
      dismissLabel="Discard this capture"
      onClose={onClose}
      onShow={() => field.current?.focus()}
    >
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
          Capture to {dayLabel}
        </Text>
        <TextInput
          ref={field}
          accessibilityLabel="What are you capturing?"
          multiline
          value={text}
          onChangeText={setText}
          placeholder="Anything worth keeping…"
          placeholderTextColor={theme.color("muted-foreground")}
          style={[
            styles.field,
            {
              color: theme.color("foreground"),
              backgroundColor: theme.color("input"),
              borderColor: theme.color("border"),
            },
          ]}
        />
        <View style={styles.actions}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Discard this capture"
            onPress={onClose}
            style={[styles.action, { borderColor: theme.color("border") }]}
          >
            <Text style={[styles.actionLabel, { color: theme.color("muted-foreground") }]}>
              Cancel
            </Text>
          </PressableScale>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Add this capture to the entry"
            accessibilityState={{ disabled: !ready }}
            disabled={!ready}
            onPress={() => {
              onCapture(text);
              onClose();
            }}
            style={[
              styles.action,
              {
                borderColor: theme.color("primary"),
                backgroundColor: theme.color("primary", ready ? 1 : 0.4),
              },
            ]}
          >
            <Text style={[styles.actionLabel, { color: theme.color("primary-foreground") }]}>
              Add
            </Text>
          </PressableScale>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
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
    minHeight: 96,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: "top",
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
