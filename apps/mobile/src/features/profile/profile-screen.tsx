import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useWorkspace } from "@/src/features/workspace/workspace-context";
import { LoadingScreen } from "@/src/features/workspace/loading-screen";
import { commonStyles } from "@/src/ui/styles";

export function ProfileScreen() {
  const router = useRouter();
  const { isHydrated, workspace, cloudConfigured, resetWorkspace } = useWorkspace();

  if (!isHydrated) {
    return <LoadingScreen />;
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.scrollContent}>
      <View style={commonStyles.card}>
        <Text style={commonStyles.sectionTitle}>More</Text>
        <Text style={commonStyles.subtitle}>
          Secondary spaces and workspace controls live here so Notes stays focused.
        </Text>
      </View>

      <View style={commonStyles.card}>
        <Text style={commonStyles.sectionTitle}>Spaces</Text>
        <Pressable
          style={commonStyles.sidebarNavItem}
          onPress={() => router.push("/journal")}
        >
          <Text style={commonStyles.sidebarNavLabel}>Journal</Text>
          <Text style={commonStyles.sidebarNavCount}>{workspace.journalEntries.length}</Text>
        </Pressable>
      </View>

      <View style={commonStyles.card}>
        <Text style={commonStyles.sectionTitle}>Workspace</Text>
        <Text style={commonStyles.subtitle}>
          {workspace.notes.length} notes, {workspace.folders.length} folders
        </Text>
        <Text style={commonStyles.subtitle}>
          {cloudConfigured
            ? "Cloud env vars are present."
            : "Cloud sync is not configured yet."}
        </Text>
      </View>

      <View style={commonStyles.card}>
        <Text style={commonStyles.sectionTitle}>Reset</Text>
        <Text style={commonStyles.subtitle}>
          Restore the starter notes, folders, and journal entries on this device.
        </Text>
        <Pressable
          style={commonStyles.buttonDanger}
          onPress={() =>
            Alert.alert("Reset workspace?", "This restores the starter local workspace on this device.", [
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
