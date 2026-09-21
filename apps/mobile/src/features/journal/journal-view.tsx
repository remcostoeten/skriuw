import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { AXIS_LOCK_PX } from "../../shell/edge-swipe";
import { MINIMUM_TOUCH_TARGET } from "../../shell/metrics";
import { useTheme } from "../../shell/theme";
import { useWorkspace, useWorkspaceSelector } from "../../shell/workspace-provider";
import { QuickCapture } from "../capture/quick-capture";
import { useCapture } from "../capture/use-capture";
import { ensureJournalEntry, setJournalMood } from "./actions";
import {
  formatDayHeading,
  formatLongDate,
  monthOfKey,
  todayKey,
  type DateKey,
  type MonthKey,
} from "./dates";
import { daySwipeStep } from "./day-swipe";
import { GoToDateSheet } from "./go-to-date-sheet";
import { JournalCalendar } from "./journal-calendar";
import {
  journalNoteIdForDate,
  sameDateKeySet,
  sameJournalEntries,
  selectEntryDateKeys,
  selectJournalEntries,
  type JournalEntry,
  type MoodLevel,
} from "./model";
import { MoodRow } from "./mood-row";
import { moodTrend } from "./mood-trend";
import { MoodTrendStrip } from "./mood-trend-strip";
import { JOURNAL_DAY_PARAM, journalDayFromParam, stepJournalDay } from "./navigation";
import { entryExcerpt, onThisDay } from "./on-this-day";
import { OnThisDaySection } from "./on-this-day-section";

type DayEntry = {
  noteId: string | null;
  mood: MoodLevel | null;
  markdown: string;
};

function selectDayEntry(state: RendererState, dateKey: DateKey): DayEntry {
  const noteId = journalNoteIdForDate(state, dateKey);
  if (noteId === null) {
    return { noteId: null, mood: null, markdown: "" };
  }
  const entry = selectJournalEntries(state).find((candidate) => candidate.noteId === noteId);
  return {
    noteId,
    mood: entry?.mood ?? null,
    markdown: state.documents.get(noteId)?.markdown ?? "",
  };
}

function sameDayEntry(left: DayEntry, right: DayEntry): boolean {
  return (
    left.noteId === right.noteId && left.mood === right.mood && left.markdown === right.markdown
  );
}

/** The heading is already the day, so the entry's own title line does not repeat it. */
function entryBody(markdown: string): string {
  return markdown.replace(/^\s*#[^\n]*\n?/, "").trim();
}

/**
 * The journal on the compact shell: one day at a time, with the calendar, the
 * mood row, the thirty-day trend and what the day recalls under it. Every
 * number on the screen is a projection over the hydrated store, so stepping a
 * day is a same-frame update and waits on no I/O (`docs/specs/mobile-app.md`,
 * R-P1).
 *
 * The entry body is rendered as its Markdown until the editor webview is
 * mounted here by Mobile 09; the note it shows and the operations it writes
 * are already the final ones.
 */
export function JournalView() {
  const theme = useTheme();
  const session = useWorkspace();
  const params = useLocalSearchParams();
  const today = todayKey();
  const day = journalDayFromParam(params[JOURNAL_DAY_PARAM]);
  const [month, setMonth] = useState<MonthKey | null>(null);
  const [composing, setComposing] = useState(false);
  const [goingToDate, setGoingToDate] = useState(false);
  const { capture, lastDrain } = useCapture(session);

  const entries = useWorkspaceSelector(selectJournalEntries, sameJournalEntries);
  const entryDates = useWorkspaceSelector(selectEntryDateKeys, sameDateKeySet);
  const daySelector = useCallback((state: RendererState) => selectDayEntry(state, day), [day]);
  const dayEntry = useWorkspaceSelector(daySelector, sameDayEntry);
  const trend = useMemo(() => moodTrend(entries, today), [entries, today]);
  const anniversaries = useMemo(() => onThisDay(entries, day), [entries, day]);

  function openDay(key: DateKey): void {
    router.setParams({ [JOURNAL_DAY_PARAM]: key });
    setMonth(monthOfKey(key));
  }

  function step(amount: number): void {
    openDay(stepJournalDay(day, { unit: "day", amount }, today));
  }

  const stepRef = useRef(step);
  stepRef.current = step;
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > Math.abs(gesture.dy) && Math.abs(gesture.dx) > AXIS_LOCK_PX,
        onPanResponderRelease: (_event, gesture) => {
          const taken = daySwipeStep({ x: 0, y: 0, edge: null }, gesture.dx, gesture.dy);
          if (taken !== 0) {
            stepRef.current(taken);
          }
        },
      }),
    [],
  );

  function writeMood(mood: MoodLevel | null): void {
    setJournalMood(session, ensureJournalEntry(session, day), mood);
  }

  const body = entryBody(dayEntry.markdown);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View {...swipe.panHandlers} style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous day"
            onPress={() => step(-1)}
            style={styles.step}
          >
            <Text style={[styles.stepGlyph, { color: theme.color("muted-foreground") }]}>‹</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${formatLongDate(day)}. Go to another date`}
            onPress={() => setGoingToDate(true)}
            style={styles.heading}
          >
            <Text
              accessibilityRole="header"
              style={[styles.headingTitle, { color: theme.color("foreground") }]}
            >
              {formatDayHeading(day, today)}
            </Text>
            <Text style={[styles.headingDate, { color: theme.color("muted-foreground") }]}>
              {formatLongDate(day)}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next day"
            onPress={() => step(1)}
            style={styles.step}
          >
            <Text style={[styles.stepGlyph, { color: theme.color("muted-foreground") }]}>›</Text>
          </Pressable>
        </View>

        {day === today ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go to today"
            onPress={() => openDay(today)}
            style={[styles.today, { borderColor: theme.color("border") }]}
          >
            <Text style={[styles.todayLabel, { color: theme.color("muted-foreground") }]}>
              Today
            </Text>
          </Pressable>
        )}

        <MoodRow mood={dayEntry.mood} onChange={writeMood} />

        <Text
          accessibilityLabel={`Entry for ${formatLongDate(day)}`}
          style={[
            styles.body,
            { color: theme.color("foreground", body.length === 0 ? 0.5 : 0.85) },
          ]}
        >
          {body.length === 0 ? "Nothing written yet. Capture something below." : body}
        </Text>

        {lastDrain === null || lastDrain.written === 0 ? null : (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.drain, { color: theme.color("muted-foreground") }]}
          >
            {lastDrain.written === 1 ? "1 capture added" : `${lastDrain.written} captures added`}
            {lastDrain.deferred > 0 ? ", some still queued" : ""}
          </Text>
        )}

        <OnThisDaySection
          anniversaries={anniversaries}
          excerptOf={(noteId) =>
            entryExcerpt(session.store.getState().documents.get(noteId)?.markdown ?? "")
          }
          onOpenDay={openDay}
        />

        <JournalCalendar
          month={month ?? monthOfKey(day)}
          selected={day}
          entryDates={entryDates}
          onSelectDay={openDay}
          onMonthChange={setMonth}
        />

        <MoodTrendStrip trend={trend} today={today} onSelectDay={openDay} />

        <EntryCount entries={entries} />
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Capture to ${formatDayHeading(day, today).toLowerCase()}`}
        onPress={() => setComposing(true)}
        style={[
          styles.capture,
          { backgroundColor: theme.color("primary"), borderColor: theme.color("primary") },
        ]}
      >
        <Text style={[styles.captureGlyph, { color: theme.color("primary-foreground") }]}>+</Text>
      </Pressable>

      <QuickCapture
        open={composing}
        dayLabel={formatDayHeading(day, today).toLowerCase()}
        onClose={() => setComposing(false)}
        onCapture={(text) => {
          capture(day, text).catch(session.reportFailure);
        }}
      />
      <GoToDateSheet
        open={goingToDate}
        context={day}
        today={today}
        onClose={() => setGoingToDate(false)}
        onGo={openDay}
      />
    </View>
  );
}

function EntryCount({ entries }: { entries: readonly JournalEntry[] }) {
  const theme = useTheme();
  return (
    <Text style={[styles.count, { color: theme.color("muted-foreground") }]}>
      {entries.length === 1 ? "1 entry" : `${entries.length} entries`}
    </Text>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  page: {
    gap: 16,
    padding: 16,
    paddingBottom: 96,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
  },
  step: {
    width: MINIMUM_TOUCH_TARGET,
    height: MINIMUM_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  stepGlyph: {
    fontSize: 26,
    lineHeight: 28,
  },
  heading: {
    flex: 1,
    minHeight: MINIMUM_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  headingTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  headingDate: {
    fontSize: 12,
  },
  today: {
    alignSelf: "center",
    minHeight: MINIMUM_TOUCH_TARGET,
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
  },
  todayLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    minHeight: 120,
  },
  drain: {
    fontSize: 12,
  },
  count: {
    fontSize: 12,
    textAlign: "center",
  },
  capture: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
  },
  captureGlyph: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "600",
  },
});
