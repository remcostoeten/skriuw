import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../shell/theme";
import { formatLongDate, type DateKey } from "./dates";
import { MOOD_OPTIONS } from "./model";
import { moodBarLevel, moodTrendSummary, type MoodTrend } from "./mood-trend";

type Props = {
  trend: MoodTrend;
  today: DateKey;
  onSelectDay: (key: DateKey) => void;
};

const STRIP_HEIGHT = 56;
const UNRATED_HEIGHT = 6;
const EMPTY_HEIGHT = StyleSheet.hairlineWidth;

function barLabel(dateKey: DateKey, moodLabel: string | null): string {
  return moodLabel === null
    ? `${formatLongDate(dateKey)}, no mood`
    : `${formatLongDate(dateKey)}, ${moodLabel.toLowerCase()}`;
}

/**
 * The last thirty days as one bar each, oldest on the left, on the rules in
 * `docs/specs/journal-daily.md`: a rated day rises with its mood and takes its
 * colour, a written but unrated day is a short grey bar, and a day without an
 * entry is a hairline so gaps stay visible. Today is outlined.
 */
export function MoodTrendStrip({ trend, today, onSelectDay }: Props) {
  const theme = useTheme();

  return (
    <View style={styles.root}>
      <View accessibilityRole="list" style={styles.strip}>
        {trend.days.map((day) => {
          const mood = day.mood === null ? null : MOOD_OPTIONS[day.mood];
          const height =
            mood !== null
              ? Math.max(UNRATED_HEIGHT, moodBarLevel(mood.level) * STRIP_HEIGHT)
              : day.hasEntry
                ? UNRATED_HEIGHT
                : EMPTY_HEIGHT;
          return (
            <Pressable
              key={day.dateKey}
              accessibilityRole="button"
              accessibilityLabel={barLabel(day.dateKey, mood?.label ?? null)}
              onPress={() => onSelectDay(day.dateKey)}
              style={styles.column}
            >
              <View
                style={[
                  styles.bar,
                  {
                    height,
                    backgroundColor:
                      mood !== null
                        ? theme.color(mood.token)
                        : theme.color("muted-foreground", day.hasEntry ? 0.7 : 0.4),
                  },
                  day.dateKey === today && {
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: theme.color("ring"),
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
      <Text accessibilityRole="summary" style={[styles.summary, { color: theme.color("foreground", 0.8) }]}>
        {moodTrendSummary(trend)}
      </Text>
      <Text style={[styles.counts, { color: theme.color("muted-foreground") }]}>
        {describeCounts(trend)}
      </Text>
    </View>
  );
}

function describeCounts(trend: MoodTrend): string {
  const parts = (Object.keys(trend.counts) as (keyof MoodTrend["counts"])[])
    .filter((level) => trend.counts[level] > 0)
    .map((level) => `${MOOD_OPTIONS[level].label} ${trend.counts[level]}`);
  return parts.length === 0 ? `${trend.days.length} days, none rated` : parts.join(" · ");
}

const styles = StyleSheet.create({
  root: {
    gap: 6,
  },
  strip: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: STRIP_HEIGHT,
    gap: 2,
  },
  column: {
    flex: 1,
    height: STRIP_HEIGHT,
    justifyContent: "flex-end",
  },
  bar: {
    borderRadius: 2,
  },
  summary: {
    fontSize: 13,
    fontWeight: "600",
  },
  counts: {
    fontSize: 12,
  },
});
