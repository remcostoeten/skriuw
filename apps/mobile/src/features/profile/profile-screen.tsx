import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useWorkspace } from "@/src/features/workspace/workspace-context";
import { LoadingScreen } from "@/src/features/workspace/loading-screen";
import { commonStyles } from "@/src/ui/styles";

export function ProfileScreen() {
  const { isHydrated, workspace, cloudConfigured, resetWorkspace } = useWorkspace();

  if (!isHydrated) {
    return <LoadingScreen />;
  }

  const latestNote = [...workspace.notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const latestEntry = [...workspace.journalEntries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.scrollContent}>
      <View style={commonStyles.heroCard}>
        <View style={commonStyles.heroGlow} />
        <Text style={commonStyles.eyebrow}>Profile</Text>
        <Text style={commonStyles.headline}>Mobile guest workspace, ready for real daily use.</Text>
        <Text style={commonStyles.subtitle}>
          This Expo build is already a private local workspace. The next platform step is authenticating into the same user-scoped cloud model as web.
        </Text>
      </View>

      <View style={commonStyles.card}>
        <Text style={commonStyles.eyebrow}>Workspace metrics</Text>
        <View style={commonStyles.metricsGrid}>
          <View style={commonStyles.metricTile}>
            <Text style={commonStyles.metricValue}>{workspace.notes.length}</Text>
            <Text style={commonStyles.metricLabel}>Notes</Text>
          </View>
          <View style={commonStyles.metricTile}>
            <Text style={commonStyles.metricValue}>{workspace.journalEntries.length}</Text>
            <Text style={commonStyles.metricLabel}>Journal entries</Text>
          </View>
          <View style={commonStyles.metricTile}>
            <Text style={commonStyles.metricValue}>{workspace.folders.length}</Text>
            <Text style={commonStyles.metricLabel}>Folders</Text>
          </View>
        </View>
      </View>

      <View style={commonStyles.card}>
        <Text style={commonStyles.eyebrow}>Recent activity</Text>
        <Text style={commonStyles.subtitle}>
          {latestNote ? `Latest note: ${latestNote.name}` : "No notes yet."}
        </Text>
        <Text style={commonStyles.subtitle}>
          {latestEntry ? `Latest journal entry: ${latestEntry.dateKey}` : "No journal entries yet."}
        </Text>
      </View>

      <View style={commonStyles.card}>
        <Text style={commonStyles.eyebrow}>Cloud readiness</Text>
        <Text style={commonStyles.subtitle}>
          {cloudConfigured
            ? "Expo public Supabase env vars are present. The remaining work is wiring the mobile auth and cloud repositories."
            : "Cloud auth is not configured in Expo yet. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY when you wire authenticated mobile."}
        </Text>
      </View>

      <View style={commonStyles.card}>
        <Text style={commonStyles.eyebrow}>Reset</Text>
        <Text style={commonStyles.subtitle}>
          Reset the local mobile guest workspace back to the starter notes and journal entries.
        </Text>
        <Pressable
          style={commonStyles.buttonDanger}
          onPress={() =>
            Alert.alert("Reset workspace?", "This will restore the starter notes, folders, and journal entries on this device.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Reset",
                style: "destructive",
                onPress: () => {
                  void resetWorkspace();
                },
              },
            ])
          }
        >
          <Text style={commonStyles.buttonLabelDanger}>Reset workspace</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
