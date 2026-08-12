import { useEffect, useMemo, useRef, useState } from "react";
import {
	Alert,
	Animated,
	ActivityIndicator,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
	CalendarDays,
	CalendarSync,
	ChevronLeft,
	ChevronRight,
	List,
	MoreHorizontal,
	PenLine,
	Search,
	WifiOff,
} from "lucide-react-native";
import { dateFromKey, localDateKey, MOOD_OPTIONS } from "@skriuw/domain/journal";
import type { JournalEntry, MoodLevel } from "@/backend/types";
import {
	useCreateJournalEntry,
	useDeleteJournalEntry,
	useJournalEntries,
	useUpdateJournalEntry,
} from "@/query/journal";
import { useTheme } from "@/theme/theme-provider";
import { AppWordmark } from "@/components/AppWordmark";
import { ContentLoading, ErrorState } from "@/components/AsyncState";
import { useReducedMotion } from "@/shared/use-reduced-motion";
import { syncJournalWithAppleCalendar } from "@/calendar/apple-calendar";

type Screen = "today" | "calendar" | "entries";
const SCREEN_ORDER: Record<Screen, number> = { today: 0, calendar: 1, entries: 2 };
const MOOD_COLORS: Record<MoodLevel, string> = {
	rough: "#b65a61",
	low: "#c88357",
	neutral: "#a49a78",
	good: "#6e9b78",
	great: "#438a72",
};

function dateLabel(key: string, full = true) {
	return new Intl.DateTimeFormat(
		undefined,
		full
			? { weekday: "long", month: "long", day: "numeric" }
			: { month: "short", day: "numeric", year: "numeric" },
	).format(dateFromKey(key));
}

export default function JournalScreen() {
	const { theme } = useTheme();
	const styles = useMemo(() => makeStyles(theme), [theme]);
	const entriesQuery = useJournalEntries();
	const reducedMotion = useReducedMotion();
	const [screen, setScreen] = useState<Screen>("today");
	const previousScreen = useRef<Screen>("today");
	const contentX = useRef(new Animated.Value(0)).current;
	const contentOpacity = useRef(new Animated.Value(1)).current;
	const [selectedDate, setSelectedDate] = useState(localDateKey());
	const [month, setMonth] = useState(
		() => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
	);
	const entries = entriesQuery.data ?? [];
	const [calendarSyncing, setCalendarSyncing] = useState(false);

	const runCalendarSync = async () => {
		setCalendarSyncing(true);
		try {
			const result = await syncJournalWithAppleCalendar(entries);
			const changes = [
				result.created ? `${result.created} added` : null,
				result.updated ? `${result.updated} updated` : null,
				result.deleted ? `${result.deleted} removed` : null,
			].filter(Boolean);
			Alert.alert(
				"Apple Calendar is up to date",
				changes.length > 0
					? `${changes.join(", ")} in the Skriuw Journal calendar.${result.failed ? ` ${result.failed} entries could not be synced.` : ""}`
					: "No calendar changes were needed.",
			);
		} catch (error) {
			Alert.alert(
				"Calendar sync failed",
				error instanceof Error ? error.message : "Could not update Apple Calendar.",
			);
		} finally {
			setCalendarSyncing(false);
		}
	};

	const confirmCalendarSync = () => {
		if (entries.length === 0) {
			Alert.alert("Nothing to sync", "Write a journal entry first, then try again.");
			return;
		}
		Alert.alert(
			"Sync with Apple Calendar?",
			"Skriuw will create a dedicated calendar with one all-day event per journal entry. Future syncs update those events; Apple Calendar never overwrites your journal.",
			[
				{ text: "Cancel", style: "cancel" },
				{ text: "Sync", onPress: () => void runCalendarSync() },
			],
		);
	};
	useEffect(() => {
		if (previousScreen.current === screen) return;
		const direction = SCREEN_ORDER[screen] > SCREEN_ORDER[previousScreen.current] ? 1 : -1;
		previousScreen.current = screen;
		if (reducedMotion) {
			contentX.setValue(0);
			contentOpacity.setValue(1);
			return;
		}
		contentX.setValue(direction * 26);
		contentOpacity.setValue(0.72);
		Animated.parallel([
			Animated.timing(contentX, {
				toValue: 0,
				duration: 230,
				useNativeDriver: true,
			}),
			Animated.timing(contentOpacity, {
				toValue: 1,
				duration: 170,
				useNativeDriver: true,
			}),
		]).start();
	}, [contentOpacity, contentX, reducedMotion, screen]);
	const openDate = (key: string) => {
		setSelectedDate(key);
		const date = dateFromKey(key);
		setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
		setScreen("today");
	};

	return (
		<SafeAreaView edges={["top", "left", "right"]} style={styles.root}>
			<View style={styles.brandBar}>
				<AppWordmark section="Journal" />
				{Platform.OS === "ios" ? (
					<Pressable
						onPress={confirmCalendarSync}
						disabled={calendarSyncing || entriesQuery.isLoading}
						accessibilityRole="button"
						accessibilityLabel="Sync journal with Apple Calendar"
						style={({ pressed }) => [
							styles.calendarSyncButton,
							pressed && styles.calendarSyncButtonPressed,
						]}
					>
						{calendarSyncing ? (
							<ActivityIndicator size="small" color={styles.muted.color} />
						) : (
							<CalendarSync size={14} color={styles.muted.color} strokeWidth={1.8} />
						)}
						<Text style={styles.calendarSyncText}>
							{calendarSyncing ? "SYNCING…" : "APPLE CALENDAR"}
						</Text>
					</Pressable>
				) : (
					<Text style={styles.sectionMark}>{entries.length} WRITTEN DAYS</Text>
				)}
			</View>
			<View style={styles.localNav} accessibilityRole="tablist">
				<LocalTab
					active={screen === "today"}
					icon={PenLine}
					label="Today"
					detail={new Intl.DateTimeFormat(undefined, {
						month: "short",
						day: "numeric",
					}).format(new Date())}
					styles={styles}
					onPress={() => openDate(localDateKey())}
				/>
				<LocalTab
					active={screen === "calendar"}
					icon={CalendarDays}
					label="Calendar"
					detail={new Intl.DateTimeFormat(undefined, { month: "short" }).format(month)}
					styles={styles}
					onPress={() => setScreen("calendar")}
				/>
				<LocalTab
					active={screen === "entries"}
					icon={List}
					label="Entries"
					detail={`${entries.length} total`}
					styles={styles}
					onPress={() => setScreen("entries")}
				/>
			</View>
			{entriesQuery.isLoading ? (
				<ContentLoading variant="journal" label="Opening your journal" />
			) : null}
			{entriesQuery.isError ? (
				<ErrorState
					icon={WifiOff}
					title="Your journal is out of reach"
					description="We couldn't sync your written days. Check your connection and try once more."
					onRetry={() => entriesQuery.refetch()}
				/>
			) : null}
			{!entriesQuery.isLoading && !entriesQuery.isError ? (
				<Animated.View
					style={{
						flex: 1,
						opacity: contentOpacity,
						transform: [{ translateX: contentX }],
					}}
				>
					{screen === "today" ? (
						<TodayView entries={entries} selectedDate={selectedDate} styles={styles} />
					) : null}
					{screen === "calendar" ? (
						<CalendarView
							entries={entries}
							month={month}
							selectedDate={selectedDate}
							styles={styles}
							onMonth={setMonth}
							onOpen={openDate}
						/>
					) : null}
					{screen === "entries" ? (
						<EntriesView entries={entries} styles={styles} onOpen={openDate} />
					) : null}
				</Animated.View>
			) : null}
		</SafeAreaView>
	);
}

function TodayView({
	entries,
	selectedDate,
	styles,
}: {
	entries: JournalEntry[];
	selectedDate: string;
	styles: ReturnType<typeof makeStyles>;
}) {
	const entry = entries.find((item) => item.dateKey === selectedDate);
	const [title, setTitle] = useState("");
	const [content, setContent] = useState("");
	const [mood, setMood] = useState<MoodLevel | undefined>();
	const [tags, setTags] = useState("");
	const [dirty, setDirty] = useState(false);
	const createEntry = useCreateJournalEntry();
	const updateEntry = useUpdateJournalEntry();
	const deleteEntry = useDeleteJournalEntry();
	const createEntryAsync = createEntry.mutateAsync;
	const updateEntryAsync = updateEntry.mutateAsync;
	const saving = createEntry.isPending || updateEntry.isPending;
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		setTitle(entry?.title ?? "");
		setContent(entry?.content ?? "");
		setMood(entry?.mood);
		setTags(entry?.tags.join(", ") ?? "");
		setDirty(false);
	}, [entry, selectedDate]);

	useEffect(() => {
		if (!dirty) return;
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(async () => {
			const normalizedTags = tags
				.split(",")
				.map((tag) => tag.trim().replace(/^#/, ""))
				.filter(Boolean);
			const payload = {
				title: title.trim() || null,
				content,
				tags: [...new Set(normalizedTags)],
				mood,
			};
			try {
				if (entry) await updateEntryAsync({ id: entry.id, ...payload });
				else if (title.trim() || content.trim() || mood || normalizedTags.length)
					await createEntryAsync({ dateKey: selectedDate, ...payload });
				setDirty(false);
			} catch {
				/* mutation exposes error state */
			}
		}, 700);
		return () => {
			if (timer.current) clearTimeout(timer.current);
		};
	}, [
		content,
		createEntryAsync,
		dirty,
		entry,
		mood,
		selectedDate,
		tags,
		title,
		updateEntryAsync,
	]);

	const change = (setter: (value: never) => void, value: unknown) => {
		setter(value as never);
		setDirty(true);
	};
	const remove = () =>
		entry &&
		Alert.alert("Delete this entry?", "This removes this day from your journal.", [
			{ text: "Keep entry", style: "cancel" },
			{ text: "Delete", style: "destructive", onPress: () => deleteEntry.mutate(entry.id) },
		]);
	const words = content.trim() ? content.trim().split(/\s+/).length : 0;
	const saveFailed = createEntry.isError || updateEntry.isError;

	return (
		<ScrollView
			style={styles.flex}
			contentContainerStyle={styles.editor}
			keyboardShouldPersistTaps="handled"
			keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
			automaticallyAdjustKeyboardInsets
		>
			<View style={styles.headingRow}>
				<View>
					<Text style={styles.eyebrow}>DAILY JOURNAL</Text>
					<Text style={styles.heroTitle}>{dateLabel(selectedDate)}</Text>
				</View>
				<Pressable
					accessibilityLabel="Entry options"
					onPress={remove}
					disabled={!entry}
					hitSlop={5}
					style={styles.iconButton}
				>
					<MoreHorizontal size={21} color={styles.icon.color} />
				</Pressable>
			</View>
			<View style={styles.meta}>
				<Text style={styles.metaText}>
					{saving
						? "Saving…"
						: createEntry.isError || updateEntry.isError
							? "Save failed"
							: dirty
								? "Unsaved"
								: "Saved"}
				</Text>
				<Text style={styles.metaText}>{words} words</Text>
			</View>
			{saveFailed ? (
				<Pressable
					accessibilityRole="alert"
					onPress={() => setDirty(true)}
					style={styles.saveError}
				>
					<WifiOff size={16} color={styles.error.color} />
					<View style={styles.flex}>
						<Text style={styles.saveErrorTitle}>Changes not synced</Text>
						<Text style={styles.saveErrorCopy}>
							Your words are still here. Tap to try saving again.
						</Text>
					</View>
				</Pressable>
			) : null}
			{!entry && !title && !content ? (
				<View style={styles.blank}>
					<PenLine size={22} color={styles.muted.color} />
					<Text style={styles.blankTitle}>Blank page</Text>
					<Text style={styles.blankCopy}>
						Begin with one detail, one feeling, or one true sentence.
					</Text>
				</View>
			) : null}
			<TextInput
				value={title}
				onChangeText={(value) => change(setTitle, value)}
				placeholder="Give this day a title"
				placeholderTextColor={styles.muted.color}
				style={styles.titleInput}
			/>
			<TextInput
				value={content}
				onChangeText={(value) => change(setContent, value)}
				placeholder="What is asking to be remembered?"
				placeholderTextColor={styles.muted.color}
				style={styles.bodyInput}
				multiline
				textAlignVertical="top"
			/>
			<View style={styles.rule} />
			<View style={styles.detailHeader}>
				<Text style={styles.detailLabel}>MOOD</Text>
				<Text style={styles.metaText}>
					{MOOD_OPTIONS.find((item) => item.value === mood)?.label ?? "No mood"}
				</Text>
			</View>
			<View style={styles.moodRow}>
				{MOOD_OPTIONS.map((item) => (
					<Pressable
						key={item.value}
						accessibilityLabel={item.label}
						onPress={() =>
							change(setMood, mood === item.value ? undefined : item.value)
						}
						style={[styles.moodButton, mood === item.value && styles.moodActive]}
					>
						<Text style={{ color: MOOD_COLORS[item.value], fontSize: 20 }}>●</Text>
						<Text style={styles.moodLabel}>{item.label}</Text>
					</Pressable>
				))}
			</View>
			<Text style={styles.detailLabel}>TAGS</Text>
			<TextInput
				value={tags}
				onChangeText={(value) => change(setTags, value)}
				placeholder="travel, family, ideas"
				placeholderTextColor={styles.muted.color}
				style={styles.tagsInput}
				autoCapitalize="none"
			/>
		</ScrollView>
	);
}

function CalendarView({
	entries,
	month,
	selectedDate,
	styles,
	onMonth,
	onOpen,
}: {
	entries: JournalEntry[];
	month: Date;
	selectedDate: string;
	styles: ReturnType<typeof makeStyles>;
	onMonth: (date: Date) => void;
	onOpen: (key: string) => void;
}) {
	const year = month.getFullYear();
	const monthIndex = month.getMonth();
	const offset = new Date(year, monthIndex, 1).getDay();
	const days = new Date(year, monthIndex + 1, 0).getDate();
	const cells = Array.from({ length: 42 }, (_, index) => {
		const day = index - offset + 1;
		return day > 0 && day <= days ? day : null;
	});
	const byDate = new Map(entries.map((entry) => [entry.dateKey, entry]));
	const count = entries.filter((entry) => {
		const date = dateFromKey(entry.dateKey);
		return date.getFullYear() === year && date.getMonth() === monthIndex;
	}).length;
	return (
		<ScrollView style={styles.flex} contentContainerStyle={styles.screenPad}>
			<Text style={styles.eyebrow}>YOUR DAYS</Text>
			<Text style={styles.screenTitle}>
				{new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(
					month,
				)}
			</Text>
			<View style={styles.monthControls}>
				<Pressable
					style={styles.iconButton}
					hitSlop={5}
					accessibilityLabel="Previous month"
					onPress={() => onMonth(new Date(year, monthIndex - 1, 1))}
				>
					<ChevronLeft size={21} color={styles.icon.color} />
				</Pressable>
				<Text style={styles.metaText}>
					{count} {count === 1 ? "entry" : "entries"}
				</Text>
				<Pressable
					style={styles.iconButton}
					hitSlop={5}
					accessibilityLabel="Next month"
					onPress={() => onMonth(new Date(year, monthIndex + 1, 1))}
				>
					<ChevronRight size={21} color={styles.icon.color} />
				</Pressable>
			</View>
			<View style={styles.calendarGrid}>
				{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
					<Text key={`${day}-${index}`} style={styles.weekday}>
						{day}
					</Text>
				))}
				{cells.map((day, index) => {
					if (!day) return <View key={`blank-${index}`} style={styles.dayCell} />;
					const key = localDateKey(new Date(year, monthIndex, day));
					const entry = byDate.get(key);
					return (
						<Pressable
							key={key}
							onPress={() => onOpen(key)}
							style={[styles.dayCell, key === selectedDate && styles.selectedDay]}
						>
							<Text style={styles.dayText}>{day}</Text>
							{entry ? (
								<View
									style={[
										styles.moodDot,
										{
											backgroundColor: entry.mood
												? MOOD_COLORS[entry.mood]
												: styles.muted.color,
										},
									]}
								/>
							) : null}
						</Pressable>
					);
				})}
			</View>
			{count < 4 ? (
				<Text style={styles.quiet}>
					Sparse month still lived month. Nothing to catch up on.
				</Text>
			) : null}
		</ScrollView>
	);
}

function EntriesView({
	entries,
	styles,
	onOpen,
}: {
	entries: JournalEntry[];
	styles: ReturnType<typeof makeStyles>;
	onOpen: (key: string) => void;
}) {
	const [query, setQuery] = useState("");
	const list = [...entries]
		.sort((a, b) => b.dateKey.localeCompare(a.dateKey))
		.filter((entry) =>
			`${entry.title ?? ""} ${entry.content} ${entry.tags.join(" ")}`
				.toLowerCase()
				.includes(query.toLowerCase()),
		);
	return (
		<View style={[styles.flex, styles.screenPad]}>
			<Text style={styles.eyebrow}>ARCHIVE</Text>
			<View style={styles.headingRow}>
				<Text style={styles.screenTitle}>Entries</Text>
				<Text style={styles.count}>{entries.length}</Text>
			</View>
			<View style={styles.searchBox}>
				<Search size={17} color={styles.muted.color} />
				<TextInput
					value={query}
					onChangeText={setQuery}
					placeholder="Search journal"
					placeholderTextColor={styles.muted.color}
					style={styles.searchInput}
				/>
			</View>
			<ScrollView
				contentContainerStyle={styles.entryList}
				keyboardShouldPersistTaps="handled"
				keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
			>
				{list.map((entry) => (
					<Pressable
						key={entry.id}
						onPress={() => onOpen(entry.dateKey)}
						style={styles.entryRow}
					>
						<View style={styles.entryMeta}>
							<Text style={styles.metaText}>{dateLabel(entry.dateKey, false)}</Text>
							{entry.mood ? (
								<View
									style={[
										styles.moodDot,
										{ backgroundColor: MOOD_COLORS[entry.mood] },
									]}
								/>
							) : null}
						</View>
						<Text style={styles.entryTitle}>{entry.title || "Untitled entry"}</Text>
						<Text style={styles.preview} numberOfLines={2}>
							{entry.content || "Empty page."}
						</Text>
						{entry.tags.length ? (
							<Text style={styles.tags}>
								{entry.tags
									.slice(0, 3)
									.map((tag) => `#${tag}`)
									.join("   ")}
							</Text>
						) : null}
					</Pressable>
				))}
			</ScrollView>
			{!list.length ? (
				<View style={styles.center}>
					<Text style={styles.blankTitle}>
						{query ? "No matching entries" : "No entries yet"}
					</Text>
					<Text style={styles.blankCopy}>
						{query ? "Try another word." : "Written days gather here."}
					</Text>
				</View>
			) : null}
		</View>
	);
}

function LocalTab({
	active,
	icon: Icon,
	label,
	detail,
	styles,
	onPress,
}: {
	active: boolean;
	icon: typeof PenLine;
	label: string;
	detail: string;
	styles: ReturnType<typeof makeStyles>;
	onPress: () => void;
}) {
	return (
		<Pressable
			onPress={onPress}
			hitSlop={2}
			accessibilityRole="tab"
			accessibilityState={{ selected: active }}
			style={({ pressed }) => [
				styles.localTab,
				active && styles.localTabActiveSurface,
				pressed && styles.localTabPressed,
			]}
		>
			<Icon
				size={17}
				color={active ? styles.icon.color : styles.muted.color}
				strokeWidth={active ? 2.2 : 1.7}
			/>
			<View>
				<Text style={[styles.localTabText, active && styles.localTabActive]}>{label}</Text>
				<Text style={styles.localTabDetail}>{detail}</Text>
			</View>
		</Pressable>
	);
}

function makeStyles(theme: ReturnType<typeof useTheme>["theme"]) {
	return StyleSheet.create({
		root: { flex: 1, backgroundColor: theme.background },
		flex: { flex: 1 },
		center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
		brandBar: {
			height: 48,
			paddingHorizontal: 20,
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "space-between",
			borderBottomWidth: StyleSheet.hairlineWidth,
			borderBottomColor: theme.divider,
		},
		sectionMark: { color: theme.textDim, fontSize: 9, letterSpacing: 2.2, fontWeight: "700" },
		calendarSyncButton: {
			minHeight: 34,
			flexDirection: "row",
			alignItems: "center",
			gap: 6,
			paddingHorizontal: 10,
			borderRadius: 17,
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: theme.border,
		},
		calendarSyncButtonPressed: { opacity: 0.7 },
		calendarSyncText: {
			color: theme.textSecondary,
			fontSize: 8,
			letterSpacing: 1.1,
			fontWeight: "700",
		},
		editor: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 28 },
		screenPad: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 30 },
		headingRow: {
			flexDirection: "row",
			justifyContent: "space-between",
			alignItems: "flex-start",
		},
		eyebrow: {
			color: theme.textSecondary,
			fontSize: 10,
			letterSpacing: 1.8,
			fontWeight: "700",
			marginBottom: 7,
		},
		heroTitle: {
			color: theme.foreground,
			fontFamily: "serif",
			fontSize: 26,
			lineHeight: 32,
			maxWidth: 280,
		},
		screenTitle: { color: theme.foreground, fontFamily: "serif", fontSize: 31, lineHeight: 38 },
		iconButton: {
			width: 34,
			height: 34,
			borderRadius: 17,
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: theme.border,
			alignItems: "center",
			justifyContent: "center",
		},
		icon: { color: theme.foreground },
		muted: { color: theme.textSecondary },
		meta: {
			flexDirection: "row",
			justifyContent: "space-between",
			paddingVertical: 11,
			borderBottomWidth: StyleSheet.hairlineWidth,
			borderBottomColor: theme.divider,
		},
		metaText: { color: theme.textSecondary, fontSize: 11 },
		blank: { alignItems: "center", paddingVertical: 26, gap: 6 },
		blankTitle: { color: theme.foreground, fontFamily: "serif", fontSize: 18 },
		blankCopy: {
			color: theme.textSecondary,
			fontFamily: "serif",
			fontSize: 13,
			textAlign: "center",
			lineHeight: 20,
		},
		titleInput: {
			color: theme.foreground,
			fontFamily: "serif",
			fontSize: 25,
			paddingVertical: 11,
		},
		bodyInput: {
			color: theme.foreground,
			fontFamily: "serif",
			fontSize: 17,
			lineHeight: 28,
			minHeight: 220,
			padding: 0,
		},
		rule: {
			height: StyleSheet.hairlineWidth,
			backgroundColor: theme.divider,
			marginVertical: 20,
		},
		detailHeader: {
			flexDirection: "row",
			justifyContent: "space-between",
			alignItems: "center",
		},
		detailLabel: {
			color: theme.textSecondary,
			fontSize: 10,
			letterSpacing: 1.6,
			fontWeight: "700",
			marginBottom: 10,
		},
		moodRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
		moodButton: { alignItems: "center", gap: 3, padding: 7, borderRadius: theme.radius },
		moodActive: { backgroundColor: theme.bgActive },
		moodLabel: { color: theme.textSecondary, fontSize: 9 },
		tagsInput: {
			color: theme.foreground,
			borderBottomWidth: StyleSheet.hairlineWidth,
			borderBottomColor: theme.border,
			paddingVertical: 9,
			fontSize: 14,
		},
		localNav: {
			flexDirection: "row",
			marginHorizontal: 14,
			marginTop: 10,
			marginBottom: 7,
			padding: 4,
			gap: 3,
			borderRadius: 14,
			backgroundColor: theme.card,
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: theme.border,
		},
		localTab: {
			flex: 1,
			minHeight: 40,
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "center",
			gap: 7,
			borderRadius: 10,
		},
		localTabActiveSurface: { backgroundColor: theme.bgActive },
		localTabPressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
		localTabText: { color: theme.textSecondary, fontSize: 11, fontWeight: "600" },
		localTabDetail: { color: theme.textDim, fontSize: 8, marginTop: 1 },
		localTabActive: { color: theme.foreground, fontWeight: "700" },
		monthControls: {
			flexDirection: "row",
			justifyContent: "space-between",
			alignItems: "center",
			marginTop: 18,
			marginBottom: 14,
		},
		calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
		weekday: {
			width: "14.285%",
			color: theme.textDim,
			textAlign: "center",
			fontSize: 9,
			paddingVertical: 9,
		},
		dayCell: {
			width: "14.285%",
			height: 49,
			alignItems: "center",
			justifyContent: "center",
			gap: 5,
			borderRadius: theme.radius,
		},
		selectedDay: { backgroundColor: theme.bgActive },
		dayText: { color: theme.foreground, fontSize: 13 },
		moodDot: { width: 5, height: 5, borderRadius: 3 },
		quiet: {
			color: theme.textSecondary,
			fontFamily: "serif",
			fontSize: 13,
			lineHeight: 20,
			textAlign: "center",
			marginTop: 25,
			paddingHorizontal: 30,
		},
		count: {
			color: theme.foreground,
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: theme.border,
			borderRadius: 14,
			minWidth: 28,
			height: 28,
			textAlign: "center",
			textAlignVertical: "center",
			fontSize: 11,
		},
		searchBox: {
			flexDirection: "row",
			alignItems: "center",
			gap: 8,
			borderBottomWidth: StyleSheet.hairlineWidth,
			borderBottomColor: theme.border,
			marginTop: 22,
		},
		searchInput: { color: theme.foreground, flex: 1, paddingVertical: 11 },
		entryList: { paddingTop: 12, paddingBottom: 30 },
		entryRow: {
			paddingVertical: 13,
			borderBottomWidth: StyleSheet.hairlineWidth,
			borderBottomColor: theme.divider,
		},
		entryMeta: {
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "space-between",
			marginBottom: 7,
		},
		entryTitle: { color: theme.foreground, fontFamily: "serif", fontSize: 19, marginBottom: 5 },
		preview: { color: theme.textSecondary, fontFamily: "serif", fontSize: 13, lineHeight: 19 },
		tags: { color: theme.tag, fontSize: 10, marginTop: 10 },
		error: { color: theme.destructive, fontSize: 13 },
		retry: { color: theme.link, fontSize: 13 },
		saveError: {
			flexDirection: "row",
			gap: 10,
			alignItems: "flex-start",
			marginTop: 12,
			padding: 12,
			borderRadius: 10,
			backgroundColor: theme.card,
			borderWidth: StyleSheet.hairlineWidth,
			borderColor: theme.destructive,
		},
		saveErrorTitle: { color: theme.foreground, fontSize: 12, fontWeight: "700" },
		saveErrorCopy: { color: theme.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 2 },
	});
}
