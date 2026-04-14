import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useWorkspace } from "@/src/features/workspace/workspace-context";
import { LoadingScreen } from "@/src/features/workspace/loading-screen";
import { formatDateKey } from "@/src/lib/workspace-format";
import { commonStyles, palette } from "@/src/ui/styles";

export function JournalHomeScreen() {
  const router = useRouter();
  const { isHydrated, workspace, createJournalEntry } = useWorkspace();

  if (!isHydrated) {
    return <LoadingScreen />;
  }

  const entries = [...workspace.journalEntries].sort((a, b) => b.dateKey.localeCompare(a.dateKey));

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.scrollContent}>
      <View style={commonStyles.card}>
        <Text style={commonStyles.eyebrow}>Daily capture</Text>
        <Text style={commonStyles.title}>Journal in the same guest workspace.</Text>
        <Text style={commonStyles.subtitle}>
          Entries stay local right now. The product boundary is already aligned with the web app: guest local first, cloud later.
        </Text>
        <Pressable
          style={commonStyles.button}
          onPress={async () => {
            const entry = await createJournalEntry();
            router.push(`/(tabs)/journal/${entry.id}`);
          }}
        >
          <Text style={commonStyles.buttonLabel}>New entry</Text>
        </Pressable>
      </View>

      {entries.map((entry) => (
        <Pressable
          key={entry.id}
          style={commonStyles.card}
          onPress={() => router.push(`/(tabs)/journal/${entry.id}`)}
        >
          <View style={commonStyles.rowWrap}>
            <View style={commonStyles.chip}>
              <Text style={commonStyles.chipLabel}>{entry.mood ?? "neutral"}</Text>
            </View>
            <Text style={{ color: palette.textMuted, fontSize: 13 }}>{formatDateKey(entry.dateKey)}</Text>
          </View>
          <Text style={{ fontSize: 20, lineHeight: 26, fontWeight: "700", color: palette.text }}>
            {formatDateKey(entry.dateKey)}
          </Text>
          <Text numberOfLines={4} style={commonStyles.subtitle}>
            {entry.content.trim() || "Empty journal entry"}
          </Text>
          {entry.tags.length > 0 ? (
            <View style={commonStyles.rowWrap}>
              {entry.tags.map((tag) => (
                <View key={tag} style={commonStyles.chip}>
                  <Text style={commonStyles.chipLabel}>#{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Pressable>
      ))}
    </ScrollView>
  );
}
