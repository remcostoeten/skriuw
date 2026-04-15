import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useWorkspace } from "@/src/features/workspace/workspace-context";
import { LoadingScreen } from "@/src/features/workspace/loading-screen";
import { formatDateKey } from "@/src/lib/workspace-format";
import { commonStyles, palette } from "@/src/ui/styles";

export function JournalHomeScreen() {
  const router = useRouter();
  const { isHydrated, workspace, createJournalEntry } = useWorkspace();
  const [query, setQuery] = useState("");

  if (!isHydrated) {
    return <LoadingScreen />;
  }

  const entries = [...workspace.journalEntries].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  const normalizedQuery = query.trim().toLowerCase();
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
    <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.scrollContent}>
      <View style={commonStyles.heroCard}>
        <View style={commonStyles.heroGlow} />
        <Text style={commonStyles.eyebrow}>Daily capture</Text>
        <Text style={commonStyles.headline}>A simple reflection log with mood and tag context.</Text>
        <Text style={commonStyles.subtitle}>
          Entries stay local for now, but the data shape already matches the scalable web boundary: personal workspace first, cloud later.
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
          <Text style={commonStyles.sectionTitle}>Search journal</Text>
          <Text style={commonStyles.caption}>{filteredEntries.length} visible</Text>
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search date, mood, tag, or content"
          placeholderTextColor={palette.textSoft}
          style={commonStyles.inputCompact}
        />
      </View>

      {filteredEntries.map((entry) => (
        <Pressable
          key={entry.id}
          style={({ pressed }) => [
            commonStyles.listCard,
            pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },
          ]}
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
        </Pressable>
      ))}
    </ScrollView>
  );
}
