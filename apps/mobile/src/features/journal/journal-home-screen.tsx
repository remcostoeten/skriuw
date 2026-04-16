import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
  Easing,
} from "react-native-reanimated";
import { useWorkspace } from "@/src/features/workspace/workspace-context";
import { LoadingScreen } from "@/src/features/workspace/loading-screen";
import { formatDateKey } from "@/src/lib/workspace-format";
import { BottomToolbar } from "@/src/ui/bottom-toolbar";
import { commonStyles, palette } from "@/src/ui/styles";

function AnimatedCard({
  children,
  index,
  onPress,
}: {
  children: React.ReactNode;
  index: number;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const staggerDelay = Math.min(index * 80, 500);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeInDown.delay(staggerDelay).duration(400).easing(Easing.out(Easing.cubic))}
      style={animStyle}
    >
      <Pressable
        style={({ pressed }) => [
          commonStyles.listCard,
          pressed && { opacity: 0.92 },
        ]}
        onPress={onPress}
        onPressIn={() => {
          scale.value = withSpring(0.975, { damping: 15, stiffness: 200 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 12, stiffness: 180 });
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

export function JournalHomeScreen() {
  const router = useRouter();
  const { isHydrated, workspace, createJournalEntry } = useWorkspace();
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  if (!isHydrated) {
    return <LoadingScreen />;
  }

  const entries = [...workspace.journalEntries].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  const normalizedQuery = query.trim().toLowerCase();
  const isSearching = searchFocused || normalizedQuery.length > 0;
  const filteredEntries = useMemo(
    () =>
      normalizedQuery.length === 0
        ? entries
        : entries.filter((entry) =>
            `${entry.dateKey} ${entry.content} ${entry.tags.join(" ")} ${entry.mood ?? ""}`
              .toLowerCase()
              .includes(normalizedQuery),
          ),
    [entries, normalizedQuery],
  );
  const taggedEntries = entries.filter((entry) => entry.tags.length > 0).length;
  const brightDays = entries.filter((entry) => entry.mood === "great" || entry.mood === "good").length;

  return (
    <View style={commonStyles.screen}>
      <ScrollView style={commonStyles.screen} contentContainerStyle={[commonStyles.scrollContent, { paddingBottom: 132 }]}>
      <View style={commonStyles.heroCard}>
        <View style={commonStyles.heroGlow} />
        <Text style={commonStyles.eyebrow}>Daily capture</Text>
        <Text style={commonStyles.headline}>A simple reflection log with mood and tag context.</Text>
        <Text style={commonStyles.subtitle}>
          Entries are tied to your account workspace so mobile and web can stay in sync around the same journal structure.
        </Text>
        <View style={commonStyles.metricsGrid}>
          <View style={commonStyles.metricTile}>
            <Text style={commonStyles.metricValue}>{entries.length}</Text>
            <Text style={commonStyles.metricLabel}>Entries</Text>
          </View>
          <View style={commonStyles.metricTile}>
            <Text style={commonStyles.metricValue}>{taggedEntries}</Text>
            <Text style={commonStyles.metricLabel}>Tagged</Text>
          </View>
          <View style={commonStyles.metricTile}>
            <Text style={commonStyles.metricValue}>{brightDays}</Text>
            <Text style={commonStyles.metricLabel}>Good days</Text>
          </View>
        </View>
        <Pressable
          style={commonStyles.button}
          onPress={async () => {
            const entry = await createJournalEntry();
            router.push(`/journal/${entry.id}`);
          }}
        >
          <Text style={commonStyles.buttonLabel}>New entry</Text>
        </Pressable>
      </View>

      <View style={commonStyles.card}>
        <View style={commonStyles.sectionHeader}>
          <Text style={commonStyles.sectionTitle}>{isSearching ? "Results" : "Journal entries"}</Text>
          <Text style={commonStyles.caption}>{filteredEntries.length} visible</Text>
        </View>
        <Text style={commonStyles.subtitle}>
          {isSearching
            ? "Matching entries across date, mood, tags, and content."
            : "Browse recent reflections and drop into an entry when you need context."}
        </Text>
      </View>

      {filteredEntries.map((entry, index) => (
        <AnimatedCard
          key={entry.id}
          index={index}
          onPress={() => router.push(`/journal/${entry.id}`)}
        >
          <View style={commonStyles.rowWrap}>
            <View style={commonStyles.chip}>
              <Text style={commonStyles.chipLabel}>{entry.mood ?? "neutral"}</Text>
            </View>
            <Text style={{ color: palette.textMuted, fontSize: 13 }}>{formatDateKey(entry.dateKey)}</Text>
          </View>
          <Text style={commonStyles.listTitle}>{formatDateKey(entry.dateKey)}</Text>
          <Text numberOfLines={4} style={commonStyles.listSubtitle}>
            {entry.content.trim() || "Empty journal entry"}
          </Text>
          {entry.tags.length > 0 ? (
            <View style={commonStyles.rowWrap}>
              {entry.tags.map((tag) => (
                <View key={tag} style={commonStyles.chipMuted}>
                  <Text style={commonStyles.chipMutedLabel}>#{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </AnimatedCard>
      ))}
      </ScrollView>

      <BottomToolbar
        actions={[
          {
            label: "New entry",
            onPress: () => {
              void (async () => {
                const entry = await createJournalEntry();
                router.push(`/journal/${entry.id}`);
              })();
            },
            variant: "primary",
          },
        ]}
        searchPlaceholder="Search date, mood, tag, or content"
        searchValue={query}
        onSearchChange={setQuery}
        searchActive={isSearching}
        onSearchOpen={() => setSearchFocused(true)}
        onSearchCancel={() => {
          setQuery("");
          setSearchFocused(false);
        }}
      />
    </View>
  );
}
