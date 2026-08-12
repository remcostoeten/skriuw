import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FlatList, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronRight, Clock3, Hash, Search, UserRound, X } from "lucide-react-native";
import { useNotes, useSearch } from "@/query/notes";
import { useTheme } from "@/theme/theme-provider";
import { ContentLoading, ErrorState } from "@/components/AsyncState";

const RECENT_SEARCHES_KEY = "skriuw.recent-searches";
const MAX_RECENT_SEARCHES = 6;

const suggestions = [
	{ label: "Tasks", query: "#todo", icon: Hash },
	{ label: "Ideas", query: "#idea", icon: Hash },
	{ label: "Mentions", query: "$me", icon: UserRound },
] as const;

export default function SearchScreen() {
	const router = useRouter();
	const { theme } = useTheme();
	const [query, setQuery] = useState("");
	const [recentSearches, setRecentSearches] = useState<string[]>([]);
	const trimmedQuery = query.trim();
	const searchQuery = useSearch(query);
	const { data: results = [], isFetching } = searchQuery;
	const { data: notes = [] } = useNotes();
	const recentNotes = useMemo(
		() =>
			[...notes]
				.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
				.slice(0, 5),
		[notes],
	);

	useEffect(() => {
		AsyncStorage.getItem(RECENT_SEARCHES_KEY).then((stored) => {
			if (!stored) return;
			try {
				const value = JSON.parse(stored) as unknown;
				if (Array.isArray(value)) {
					setRecentSearches(
						value.filter((item): item is string => typeof item === "string"),
					);
				}
			} catch {
				// Ignore malformed local history.
			}
		});
	}, []);

	const rememberSearch = (value: string) => {
		const nextQuery = value.trim();
		if (!nextQuery) return;
		setRecentSearches((current) => {
			const next = [nextQuery, ...current.filter((item) => item !== nextQuery)].slice(
				0,
				MAX_RECENT_SEARCHES,
			);
			void AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
			return next;
		});
	};

	const runSuggestion = (value: string) => {
		setQuery(value);
		rememberSearch(value);
	};

	const openResult = (noteId: string) => {
		rememberSearch(trimmedQuery);
		router.push(`/(app)/note/${noteId}`);
	};

	const clearRecentSearches = () => {
		setRecentSearches([]);
		void AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
	};

	return (
		<SafeAreaView
			edges={["left", "right"]}
			style={{ flex: 1, backgroundColor: theme.background }}
		>
			<View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
				<View
					style={{
						flexDirection: "row",
						alignItems: "center",
						gap: 10,
						backgroundColor: theme.card,
						borderWidth: 1,
						borderColor: theme.border,
						borderRadius: theme.radius + 6,
						paddingHorizontal: 14,
					}}
				>
					<Search size={18} color={theme.textDim} />
					<TextInput
						autoFocus
						value={query}
						onChangeText={setQuery}
						onSubmitEditing={() => rememberSearch(query)}
						returnKeyType="search"
						placeholder="Search notes, #tags, $people…"
						placeholderTextColor={theme.textDim}
						style={{
							flex: 1,
							paddingVertical: 12,
							color: theme.foreground,
							fontSize: 16,
						}}
					/>
					{query ? (
						<Pressable
							onPress={() => setQuery("")}
							hitSlop={10}
							accessibilityLabel="Clear search"
						>
							<X size={17} color={theme.mutedForeground} />
						</Pressable>
					) : null}
				</View>
			</View>

			{trimmedQuery ? (
				<SearchResults
					results={results}
					isFetching={isFetching}
					isError={searchQuery.isError}
					onRetry={() => searchQuery.refetch()}
					onOpen={openResult}
				/>
			) : (
				<ScrollView
					contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28 }}
					keyboardShouldPersistTaps="handled"
					keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
				>
					{recentSearches.length > 0 ? (
						<SearchSection
							title="Recent searches"
							action="Clear"
							onAction={clearRecentSearches}
						>
							<View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
								{recentSearches.map((item) => (
									<SuggestionChip
										key={item}
										label={item}
										icon={Clock3}
										onPress={() => runSuggestion(item)}
									/>
								))}
							</View>
						</SearchSection>
					) : null}

					<SearchSection title="Try searching">
						<View style={{ flexDirection: "row", gap: 8 }}>
							{suggestions.map((item) => (
								<SuggestionChip
									key={item.query}
									label={item.label}
									icon={item.icon}
									onPress={() => runSuggestion(item.query)}
								/>
							))}
						</View>
					</SearchSection>

					{recentNotes.length > 0 ? (
						<SearchSection title="Recently edited">
							<View
								style={{
									backgroundColor: theme.card,
									borderRadius: theme.radius + 6,
									overflow: "hidden",
								}}
							>
								{recentNotes.map((note, index) => (
									<Pressable
										key={note.id}
										onPress={() => router.push(`/(app)/note/${note.id}`)}
										style={{
											paddingHorizontal: 14,
											paddingVertical: 12,
											flexDirection: "row",
											alignItems: "center",
											borderBottomWidth:
												index === recentNotes.length - 1 ? 0 : 1,
											borderBottomColor: theme.divider,
										}}
									>
										<View style={{ flex: 1 }}>
											<Text
												style={{
													color: theme.foreground,
													fontSize: 15,
													fontWeight: "600",
												}}
												numberOfLines={1}
											>
												{note.title || "Untitled"}
											</Text>
											{note.preview ? (
												<Text
													style={{
														color: theme.mutedForeground,
														fontSize: 12,
														marginTop: 3,
													}}
													numberOfLines={1}
												>
													{note.preview}
												</Text>
											) : null}
										</View>
										<ChevronRight size={16} color={theme.textDim} />
									</Pressable>
								))}
							</View>
						</SearchSection>
					) : null}
				</ScrollView>
			)}
		</SafeAreaView>
	);
}

function SearchResults({
	results,
	isFetching,
	isError,
	onRetry,
	onOpen,
}: {
	results: { noteId: string; title: string; snippet: string }[];
	isFetching: boolean;
	isError: boolean;
	onRetry: () => void;
	onOpen: (noteId: string) => void;
}) {
	const { theme } = useTheme();
	if (isFetching) {
		return <ContentLoading variant="list" label="Looking through your notes" />;
	}
	if (isError) {
		return (
			<ErrorState
				title="Search couldn't finish"
				description="We couldn't reach the rest of your notes. Check your connection and search again."
				onRetry={onRetry}
			/>
		);
	}
	return (
		<FlatList
			data={results}
			keyExtractor={(item) => item.noteId}
			keyboardShouldPersistTaps="handled"
			keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
			contentContainerStyle={results.length === 0 ? { flexGrow: 1 } : undefined}
			ListEmptyComponent={
				<View
					style={{ flex: 1, padding: 32, alignItems: "center", justifyContent: "center" }}
				>
					<Search size={24} color={theme.textDim} />
					<Text
						style={{
							color: theme.foreground,
							fontSize: 16,
							fontWeight: "600",
							marginTop: 12,
						}}
					>
						No notes found
					</Text>
					<Text style={{ color: theme.mutedForeground, fontSize: 13, marginTop: 4 }}>
						Try fewer words or a tag.
					</Text>
				</View>
			}
			renderItem={({ item }) => (
				<Pressable
					onPress={() => onOpen(item.noteId)}
					style={{
						paddingHorizontal: 16,
						paddingVertical: 13,
						borderBottomWidth: 1,
						borderBottomColor: theme.divider,
					}}
				>
					<Text style={{ color: theme.foreground, fontSize: 15, fontWeight: "600" }}>
						{item.title}
					</Text>
					<Text
						style={{ color: theme.mutedForeground, fontSize: 13, marginTop: 3 }}
						numberOfLines={2}
					>
						{item.snippet}
					</Text>
				</Pressable>
			)}
		/>
	);
}

function SearchSection({
	title,
	action,
	onAction,
	children,
}: {
	title: string;
	action?: string;
	onAction?: () => void;
	children: React.ReactNode;
}) {
	const { theme } = useTheme();
	return (
		<View style={{ marginTop: 24 }}>
			<View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
				<Text style={{ flex: 1, color: theme.foreground, fontSize: 15, fontWeight: "700" }}>
					{title}
				</Text>
				{action ? (
					<Pressable onPress={onAction} hitSlop={8}>
						<Text style={{ color: theme.mutedForeground, fontSize: 12 }}>{action}</Text>
					</Pressable>
				) : null}
			</View>
			{children}
		</View>
	);
}

function SuggestionChip({
	label,
	icon: Icon,
	onPress,
}: {
	label: string;
	icon: typeof Search;
	onPress: () => void;
}) {
	const { theme } = useTheme();
	return (
		<Pressable
			onPress={onPress}
			hitSlop={6}
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: 6,
				backgroundColor: theme.card,
				borderRadius: 999,
				paddingHorizontal: 11,
				paddingVertical: 8,
			}}
		>
			<Icon size={14} color={theme.mutedForeground} />
			<Text style={{ color: theme.foreground, fontSize: 12, fontWeight: "600" }}>
				{label}
			</Text>
		</Pressable>
	);
}
