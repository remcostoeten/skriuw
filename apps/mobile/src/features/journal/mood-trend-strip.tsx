import { useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import { useTheme } from "../../shell/theme";
import { formatLongDate, type DateKey } from "@skriuw/renderer-core/journal/dates";
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

const STRIP_ACTIONS = [
  { name: "increment", label: "Next day" },
  { name: "decrement", label: "Previous day" },
  { name: "activate", label: "Open day" },
];

function barLabel(dateKey: DateKey, moodLabel: string | null): string {
  return moodLabel === null
    ? `${formatLongDate(dateKey)}, no mood`
    : `${formatLongDate(dateKey)}, ${moodLabel.toLowerCase()}`;
}

function clampIndex(index: number, count: number): number {
  return Math.max(0, Math.min(count - 1, index));
}

/**
 * The last thirty days as one bar each, oldest on the left, on the rules in
 * `docs/specs/journal-daily.md`: a rated day rises with its mood and takes its
 * colour, a written but unrated day is a short grey bar, and a day without an
 * entry is a hairline so gaps stay visible. Today is outlined.
 *
 * Thirty bars cannot each be a 44 pt target on a phone, so the strip is one
 * target: a tap opens the day under the finger, and a screen reader adjusts
 * through the days and activates the one it announces.
 */
export function MoodTrendStrip({ trend, today, onSelectDay }: Props) {
  const theme = useTheme();
  const width = useRef(0);
  const count = trend.days.length;
  const [focused, setFocused] = useState(count - 1);
  const focusedDay = trend.days[clampIndex(focused, count)];
  const focusedMood =
    focusedDay === undefined || focusedDay.mood === null ? null : MOOD_OPTIONS[focusedDay.mood];

  function openDayAt(event: GestureResponderEvent) {
    if (width.current <= 0 || count === 0) {
      return;
    }
    const index = clampIndex(
      Math.floor((event.nativeEvent.locationX / width.current) * count),
      count,
    );
    const day = trend.days[index];
    if (day !== undefined) {
      onSelectDay(day.dateKey);
    }
  }

  function handleAction(event: AccessibilityActionEvent) {
    switch (event.nativeEvent.actionName) {
      case "increment":
        setFocused(clampIndex(focused + 1, count));
        return;
      case "decrement":
        setFocused(clampIndex(focused - 1, count));
        return;
      case "activate":
        if (focusedDay !== undefined) {
          onSelectDay(focusedDay.dateKey);
        }
        return;
    }
  }

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel={`Mood, last ${count} days`}
        accessibilityValue={
          focusedDay === undefined
            ? undefined
            : { text: barLabel(focusedDay.dateKey, focusedMood?.label ?? null) }
        }
        accessibilityActions={STRIP_ACTIONS}
        onAccessibilityAction={handleAction}
        onLayout={(event: LayoutChangeEvent) => {
          width.current = event.nativeEvent.layout.width;
        }}
        onPress={openDayAt}
        style={styles.strip}
      >
        {trend.days.map((day) => {
          const mood = day.mood === null ? null : MOOD_OPTIONS[day.mood];
          const height =
            mood !== null
              ? Math.max(UNRATED_HEIGHT, moodBarLevel(mood.level) * STRIP_HEIGHT)
              : day.hasEntry
                ? UNRATED_HEIGHT
                : EMPTY_HEIGHT;
          return (
            <View key={day.dateKey} pointerEvents="none" style={styles.column}>
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
            </View>
          );
        })}
      </Pressable>
      <Text
        accessibilityRole="summary"
        style={[styles.summary, { color: theme.color("foreground", 0.8) }]}
      >
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
