import { ActivityIndicator, Text, View } from "react-native";
import { commonStyles, palette } from "@/src/ui/styles";

export function LoadingScreen() {
  return (
    <View style={[commonStyles.screen, { alignItems: "center", justifyContent: "center", gap: 16 }]}>
      <ActivityIndicator color={palette.accent} size="large" />
      <Text style={commonStyles.subtitle}>Loading your local workspace…</Text>
    </View>
  );
}
