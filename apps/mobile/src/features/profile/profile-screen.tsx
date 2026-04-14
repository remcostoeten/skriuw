import { Pressable, ScrollView, Text, View } from "react-native";
import { useWorkspace } from "@/src/features/workspace/workspace-context";
import { LoadingScreen } from "@/src/features/workspace/loading-screen";
import { commonStyles } from "@/src/ui/styles";

export function ProfileScreen() {
  const { isHydrated, workspace, cloudConfigured, resetWorkspace } = useWorkspace();

  if (!isHydrated) {
    return <LoadingScreen />;
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.scrollContent}>
      <View style={commonStyles.card}>
        <Text style={commonStyles.eyebrow}>Profile</Text>
        <Text style={commonStyles.title}>Mobile guest workspace</Text>
        <Text style={commonStyles.subtitle}>
          This Expo app is fully usable in guest mode now. The next backend step is authenticating against the same private cloud workspace model as web.
        </Text>
      </View>

      <View style={commonStyles.card}>
        <Text style={commonStyles.eyebrow}>Workspace metrics</Text>
        <View style={commonStyles.rowWrap}>
          <View style={commonStyles.chip}>
            <Text style={commonStyles.chipLabel}>{workspace.notes.length} notes</Text>
          </View>
          <View style={commonStyles.chip}>
            <Text style={commonStyles.chipLabel}>{workspace.journalEntries.length} journal entries</Text>
          </View>
          <View style={commonStyles.chip}>
            <Text style={commonStyles.chipLabel}>{workspace.folders.length} folders</Text>
          </View>
        </View>
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
        <Pressable style={commonStyles.buttonDanger} onPress={resetWorkspace}>
          <Text style={commonStyles.buttonLabelDanger}>Reset workspace</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
