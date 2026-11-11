import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import type { CSSStyle } from "react-native-reanimated";
import { MINIMUM_TOUCH_TARGET } from "../../shell/metrics";
import { PRESS_EASING, STATE_MS } from "../../shell/motion";
import { useTheme } from "../../shell/theme";
import { MOOD_LEVELS, MOOD_OPTIONS, type MoodLevel } from "./model";
import { PressableScale } from "../../shell/pressable-scale";

type Props = {
  mood: MoodLevel | null;
  onChange: (mood: MoodLevel | null) => void;
};

/**
 * The five moods on one row, as the compact desktop layout arranges them
 * below 900px (`docs/specs/journal-daily.md`). Pressing the current mood
 * clears it, so a day can go back to unrated without a second control.
 */
export function MoodRow({ mood, onChange }: Props) {
  const theme = useTheme();

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Mood for this day" style={styles.row}>
      {MOOD_LEVELS.map((level) => {
        const option = MOOD_OPTIONS[level];
        const selected = mood === level;
        return (
          <PressableScale
            key={level}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(selected ? null : level)}
            style={[
              styles.mood,
              SELECTION,
              {
                borderColor: selected ? theme.color(option.token) : theme.color("border"),
                backgroundColor: selected ? theme.color(option.token, 0.16) : "transparent",
              },
            ]}
          >
            <Text style={[styles.icon, { color: theme.color(option.token) }]}>{option.icon}</Text>
            <Text
              style={[
                styles.label,
                {
                  color: selected ? theme.color(option.token) : theme.color("muted-foreground"),
                },
              ]}
            >
              {option.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const SELECTION: CSSStyle<ViewStyle> = {
  transitionProperty: ["transform", "borderColor", "backgroundColor"],
  transitionDuration: STATE_MS,
  transitionTimingFunction: PRESS_EASING,
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 6,
  },
  mood: {
    flex: 1,
    minHeight: MINIMUM_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
  },
  icon: {
    fontSize: 13,
    fontWeight: "700",
  },
  label: {
    fontSize: 11,
  },
});
