import { Pressable, StyleSheet, Text, View } from "react-native";
import { MINIMUM_TOUCH_TARGET } from "../../shell/metrics";
import { useTheme } from "../../shell/theme";
import { MOOD_LEVELS, MOOD_OPTIONS, type MoodLevel } from "./model";

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
          <Pressable
            key={level}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(selected ? null : level)}
            style={[
              styles.mood,
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
                  color: selected
                    ? theme.color(option.token)
                    : theme.color("muted-foreground"),
                },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

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
