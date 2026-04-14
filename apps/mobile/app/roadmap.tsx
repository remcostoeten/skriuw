import { StyleSheet, Text, View } from "react-native";

const items = [
  "Extract shared note, folder, journal, and profile types into a platform-neutral core package.",
  "Split guest-local persistence from authenticated-cloud persistence behind shared repository contracts.",
  "Mirror the web auth product flow on mobile with Supabase Auth and user-scoped cloud data.",
  "Add native-safe local guest storage without reintroducing web-only assumptions.",
];

export default function RoadmapScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Expo roadmap</Text>
      <View style={styles.list}>
        {items.map((item, index) => (
          <View key={item} style={styles.row}>
            <Text style={styles.index}>{index + 1}</Text>
            <Text style={styles.item}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f6f2ea",
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 24,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
    color: "#1f1915",
  },
  list: {
    gap: 18,
  },
  row: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
  },
  index: {
    width: 24,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "700",
    color: "#c4662f",
  },
  item: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    color: "#4e4339",
  },
});
