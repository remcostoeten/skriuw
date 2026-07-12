import { useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
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
	ChevronLeft,
	ChevronRight,
	List,
	MoreHorizontal,
	PenLine,
	Search,
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

type Screen = "today" | "calendar" | "entries";
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
	const [screen, setScreen] = useState<Screen>("today");
	const [selectedDate, setSelectedDate] = useState(localDateKey());
	const [month, setMonth] = useState(
		() => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
	);
	const entries = entriesQuery.data ?? [];
	const openDate = (key: string) => {
		setSelectedDate(key);
		const date = dateFromKey(key);
		setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
		setScreen("today");
	};

	return (
		<SafeAreaView edges={["top", "left", "right"]} style={styles.root}>
			<View style={styles.brandBar}>
				<Text style={styles.wordmark}>Skriuw</Text>
				<Text style={styles.sectionMark}>JOURNAL</Text>
			</View>
			{entriesQuery.isLoading ? (
				<View style={styles.center}>
					<ActivityIndicator color={theme.foreground} />
				</View>
			) : null}
			{entriesQuery.isError ? (
				<View style={styles.center}>
					<Text style={styles.error}>Journal could not load.</Text>
					<Pressable onPress={() => entriesQuery.refetch()}>
						<Text style={styles.retry}>Try again</Text>
					</Pressable>
				</View>
			) : null}
			{!entriesQuery.isLoading && !entriesQuery.isError && screen === "today" ? (
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
			<View style={styles.localNav}>
				<LocalTab
					active={screen === "today"}
					icon={PenLine}
					label="Today"
					styles={styles}
					onPress={() => openDate(localDateKey())}
				/>
				<LocalTab
					active={screen === "calendar"}
					icon={CalendarDays}
					label="Calendar"
					styles={styles}
					onPress={() => setScreen("calendar")}
				/>
				<LocalTab
					active={screen === "entries"}
					icon={List}
					label="Entries"
					styles={styles}
					onPress={() => setScreen("entries")}
				/>
			</View>
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

	return (
		<ScrollView
			style={styles.flex}
			contentContainerStyle={styles.editor}
			keyboardShouldPersistTaps="handled"
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
					onPress={() => onMonth(new Date(year, monthIndex - 1, 1))}
				>
					<ChevronLeft size={21} color={styles.icon.color} />
				</Pressable>
				<Text style={styles.metaText}>
					{count} {count === 1 ? "entry" : "entries"}
				</Text>
				<Pressable
					style={styles.iconButton}
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
			<ScrollView contentContainerStyle={styles.entryList}>
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
	styles,
	onPress,
}: {
	active: boolean;
	icon: typeof PenLine;
	label: string;
	styles: ReturnType<typeof makeStyles>;
	onPress: () => void;
}) {
	return (
		<Pressable onPress={onPress} style={styles.localTab}>
			<Icon
				size={18}
				color={active ? styles.icon.color : styles.muted.color}
				strokeWidth={active ? 2.2 : 1.7}
			/>
			<Text style={[styles.localTabText, active && styles.localTabActive]}>{label}</Text>
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
		wordmark: { color: theme.foreground, fontFamily: "serif", fontSize: 20, fontWeight: "600" },
		sectionMark: { color: theme.textDim, fontSize: 9, letterSpacing: 2.2, fontWeight: "700" },
		editor: { padding: 22, paddingBottom: 50 },
		screenPad: { padding: 22, paddingBottom: 38 },
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
			width: 38,
			height: 38,
			borderRadius: 19,
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
			paddingVertical: 14,
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
			paddingVertical: 16,
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
			height: 55,
			borderTopWidth: StyleSheet.hairlineWidth,
			borderTopColor: theme.divider,
			backgroundColor: theme.toolbar,
		},
		localTab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2 },
		localTabText: { color: theme.textSecondary, fontSize: 9 },
		localTabActive: { color: theme.foreground, fontWeight: "700" },
		monthControls: {
			flexDirection: "row",
			justifyContent: "space-between",
			alignItems: "center",
			marginTop: 25,
			marginBottom: 18,
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
			paddingVertical: 17,
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
	});
}
