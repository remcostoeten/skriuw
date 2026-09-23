import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ShellIcon } from "../../shell/icons";
import { MINIMUM_TOUCH_TARGET } from "../../shell/metrics";
import { useTheme } from "../../shell/theme";
import {
  WEEKDAY_LABELS,
  formatLongDate,
  formatMonthTitle,
  monthGrid,
  shiftMonth,
  todayKey,
  type DateKey,
  type MonthKey,
} from "@skriuw/renderer-core/journal/dates";

type Props = {
  month: MonthKey;
  selected: DateKey;
  entryDates: ReadonlySet<DateKey>;
  onSelectDay: (key: DateKey) => void;
  onMonthChange: (month: MonthKey) => void;
};

function dayLabel(key: DateKey, hasEntry: boolean): string {
  return hasEntry ? `${formatLongDate(key)}, has an entry` : formatLongDate(key);
}

/**
 * The Monday-first month grid, with a dot under every day that has an entry —
 * the same grid and the same dot rule as the desktop sidebar calendar
 * (`apps/workspace/src/features/journal/journal-calendar.tsx`). The desktop's roving tab
 * stop has no counterpart here: every day is its own touch target, so a
 * screen reader walks the month directly.
 */
export function JournalCalendar({
  month,
  selected,
  entryDates,
  onSelectDay,
  onMonthChange,
}: Props) {
  const theme = useTheme();
  const days = useMemo(() => monthGrid(month), [month]);
  const today = todayKey();

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={() => onMonthChange(shiftMonth(month, -1))}
          style={styles.step}
        >
          <ShellIcon name="back" size={22} color={theme.color("muted-foreground")} />
        </Pressable>
        <Text
          accessibilityRole="header"
          style={[styles.monthTitle, { color: theme.color("foreground") }]}
        >
          {formatMonthTitle(month)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={() => onMonthChange(shiftMonth(month, 1))}
          style={styles.step}
        >
          <ShellIcon name="forward" size={22} color={theme.color("muted-foreground")} />
        </Pressable>
      </View>
      <View style={styles.week}>
        {WEEKDAY_LABELS.map((label) => (
          <Text
            key={label}
            accessible={false}
            style={[styles.weekday, { color: theme.color("muted-foreground") }]}
          >
            {label}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {days.map((day) => {
          const isSelected = day.key === selected;
          const hasEntry = entryDates.has(day.key);
          return (
            <Pressable
              key={day.key}
              accessibilityRole="button"
              accessibilityLabel={dayLabel(day.key, hasEntry)}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelectDay(day.key)}
              style={[
                styles.day,
                isSelected && {
                  backgroundColor: theme.color("primary"),
                  borderColor: theme.color("primary"),
                },
                !isSelected && day.key === today && { borderColor: theme.color("ring") },
              ]}
            >
              <Text
                style={[
                  styles.dayNumber,
                  {
                    color: isSelected
                      ? theme.color("primary-foreground")
                      : theme.color("foreground", day.inMonth ? 1 : 0.35),
                  },
                ]}
              >
                {day.dayOfMonth}
              </Text>
              <View
                style={[
                  styles.dot,
                  hasEntry && {
                    backgroundColor: isSelected
                      ? theme.color("primary-foreground")
                      : theme.color("primary"),
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  step: {
    width: MINIMUM_TOUCH_TARGET,
    height: MINIMUM_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  monthTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  week: {
    flexDirection: "row",
  },
  weekday: {
    flexBasis: "14.2857%",
    textAlign: "center",
    fontSize: 11,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  day: {
    flexBasis: "14.2857%",
    height: MINIMUM_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
    gap: 2,
  },
  dayNumber: {
    fontSize: 14,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "transparent",
  },
});
