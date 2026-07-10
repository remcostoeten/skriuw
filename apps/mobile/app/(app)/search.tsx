import { useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Search } from "lucide-react-native";
import { useSearch } from "@/query/notes";
import { useTheme } from "@/theme/theme-provider";

// Query grammar (tag:/# person:/$ free text) is parsed locally on web via the
// shared search-query.ts module; execution happens server-side. Here we send
// the raw query straight to GET /api/workspace/search.
export default function SearchScreen() {
	const router = useRouter();
	const { theme } = useTheme();
	const [query, setQuery] = useState("");
	const { data: results, isFetching } = useSearch(query);

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
			<View style={{ padding: 16 }}>
				<View
					style={{
						flexDirection: "row",
						alignItems: "center",
						gap: 10,
						backgroundColor: theme.card,
						borderWidth: 1,
						borderColor: theme.border,
						borderRadius: theme.radius + 4,
						paddingHorizontal: 14,
					}}
				>
					<Search size={18} color={theme.textDim} strokeWidth={2} />
					<TextInput
						autoFocus
						value={query}
						onChangeText={setQuery}
						placeholder={"Search notes, #tags, $people\u2026"}
						placeholderTextColor={theme.textDim}
						style={{
							flex: 1,
							paddingVertical: 12,
							color: theme.foreground,
							fontSize: 16,
						}}
					/>
				</View>
			</View>

			{isFetching ? (
				<View style={{ padding: 24, alignItems: "center" }}>
					<ActivityIndicator color={theme.mutedForeground} />
				</View>
			) : (
				<FlatList
					data={results}
					keyExtractor={(r) => r.noteId}
					renderItem={({ item }) => (
						<Pressable
							onPress={() => router.push(`/(app)/note/${item.noteId}`)}
							style={{
								paddingHorizontal: 16,
								paddingVertical: 12,
								borderBottomWidth: 1,
								borderBottomColor: theme.divider,
							}}
						>
							<Text
								style={{ color: theme.foreground, fontSize: 15, fontWeight: "600" }}
							>
								{item.title}
							</Text>
							<Text
								style={{ color: theme.mutedForeground, fontSize: 13, marginTop: 2 }}
								numberOfLines={2}
							>
								{item.snippet}
							</Text>
						</Pressable>
					)}
				/>
			)}
		</SafeAreaView>
	);
}
