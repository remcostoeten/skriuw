import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function PlaceholderScreen() {
  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.frame}>
        <Text style={styles.title}>Skriuw</Text>
        <Text style={styles.body}>
          The native shell is not built yet. Screens arrive with Mobile 07.
        </Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0B0B0D",
  },
  frame: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  title: {
    color: "#FAFAFA",
    fontSize: 28,
    fontWeight: "600",
  },
  body: {
    color: "#A1A1AA",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
});
