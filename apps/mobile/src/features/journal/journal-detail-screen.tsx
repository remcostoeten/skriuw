import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useWorkspace, getMoodOptions } from "@/src/features/workspace/workspace-context";
import { LoadingScreen } from "@/src/features/workspace/loading-screen";
import { commonStyles } from "@/src/ui/styles";

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
        <Pressable style={commonStyles.buttonSecondary} onPress={() => router.replace("/(tabs)/journal")}>
          <Text style={commonStyles.buttonLabelSecondary}>Back to journal</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.scrollContent}>
      <View style={commonStyles.card}>
        <Text style={commonStyles.eyebrow}>Edit entry</Text>
        <TextInput
          value={entry.dateKey}
          onChangeText={(value) => updateJournalEntry(entry.id, { dateKey: value })}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          style={commonStyles.input}
        />
        <TextInput
          value={entry.content}
          onChangeText={(value) => updateJournalEntry(entry.id, { content: value })}
          placeholder="What happened today?"
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
          style={commonStyles.input}
        />
        <View style={commonStyles.rowWrap}>
          {getMoodOptions().map((mood) => (
            <Pressable
              key={mood}
              style={mood === entry.mood ? commonStyles.button : commonStyles.buttonSecondary}
              onPress={() => updateJournalEntry(entry.id, { mood })}
            >
              <Text
                style={mood === entry.mood ? commonStyles.buttonLabel : commonStyles.buttonLabelSecondary}
              >
                {mood}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={commonStyles.rowWrap}>
          <Pressable style={commonStyles.buttonSecondary} onPress={() => router.replace("/(tabs)/journal")}>
            <Text style={commonStyles.buttonLabelSecondary}>Done</Text>
          </Pressable>
          <Pressable
            style={commonStyles.buttonDanger}
            onPress={() =>
              Alert.alert("Delete entry?", "This removes the entry from your mobile guest workspace.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: async () => {
                    await deleteJournalEntry(entry.id);
                    router.replace("/(tabs)/journal");
                  },
                },
              ])
            }
          >
            <Text style={commonStyles.buttonLabelDanger}>Delete</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
