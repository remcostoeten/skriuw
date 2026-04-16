import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown, Easing } from "react-native-reanimated";
import { useWorkspace, getMoodOptions } from "@/src/features/workspace/workspace-context";
import { LoadingScreen } from "@/src/features/workspace/loading-screen";
import { formatDateKey } from "@/src/lib/workspace-format";
import { commonStyles, palette } from "@/src/ui/styles";

export function JournalDetailScreen() {
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const router = useRouter();
  const { isHydrated, workspace, updateJournalEntry, deleteJournalEntry } = useWorkspace();

  if (!isHydrated) {
    return <LoadingScreen />;
  }

  const entry = workspace.journalEntries.find((item) => item.id === entryId);
  if (!entry) {
    return (
      <View style={[commonStyles.screen, { padding: 20, justifyContent: "center", gap: 16 }]}>
        <Text style={commonStyles.title}>Entry not found</Text>
        <Pressable style={commonStyles.buttonSecondary} onPress={() => router.replace("/journal")}>
          <Text style={commonStyles.buttonLabelSecondary}>Back to journal</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.scrollContent}>
      <Animated.View entering={FadeInDown.duration(400).easing(Easing.out(Easing.cubic))}>
        <View style={commonStyles.heroCard}>
          <View style={commonStyles.heroGlow} />
          <Text style={commonStyles.eyebrow}>Journal entry</Text>
          <Text style={commonStyles.title}>{formatDateKey(entry.dateKey)}</Text>
          <Text style={commonStyles.subtitle}>
            Keep date, tags, and mood lightweight so daily writing stays fast on mobile.
          </Text>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(120).duration(400).easing(Easing.out(Easing.cubic))}>
        <View style={commonStyles.card}>
          <Text style={commonStyles.sectionTitle}>Entry details</Text>
          <TextInput
            value={entry.dateKey}
            onChangeText={(value) => updateJournalEntry(entry.id, { dateKey: value })}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={palette.textSoft}
            autoCapitalize="none"
            style={commonStyles.input}
          />
          <TextInput
            value={entry.content}
            onChangeText={(value) => updateJournalEntry(entry.id, { content: value })}
            placeholder="What happened today?"
            placeholderTextColor={palette.textSoft}
            multiline
            style={[commonStyles.input, commonStyles.textArea]}
          />
          <TextInput
            value={entry.tags.join(", ")}
            onChangeText={(value) =>
              updateJournalEntry(entry.id, {
                tags: value
                  .split(",")
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              })
            }
            placeholder="tag1, tag2"
            placeholderTextColor={palette.textSoft}
            style={commonStyles.input}
          />
          <View style={commonStyles.rowWrap}>
            {getMoodOptions().map((mood) => (
              <Pressable
                key={mood}
                style={[
                  commonStyles.moodPill,
                  mood === entry.mood ? commonStyles.moodPillActive : null,
                ]}
                onPress={() => updateJournalEntry(entry.id, { mood })}
              >
                <Text
                  style={[
                    commonStyles.moodPillLabel,
                    mood === entry.mood ? commonStyles.moodPillLabelActive : null,
                  ]}
                >
                  {mood}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={commonStyles.rowWrap}>
            <Pressable style={commonStyles.buttonSecondary} onPress={() => router.replace("/journal")}>
              <Text style={commonStyles.buttonLabelSecondary}>Done</Text>
            </Pressable>
            <Pressable
              style={commonStyles.buttonDanger}
              onPress={() =>
                Alert.alert("Delete entry?", "This removes the entry from your workspace.", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                      await deleteJournalEntry(entry.id);
                      router.replace("/journal");
                    },
                  },
                ])
              }
            >
              <Text style={commonStyles.buttonLabelDanger}>Delete</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </ScrollView>
  );
}
