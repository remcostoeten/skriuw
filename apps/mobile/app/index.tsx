import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function HomeScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Expo foundation</Text>
        <Text style={styles.title}>Mobile now lives next to the web app.</Text>
        <Text style={styles.body}>
          This workspace is the first foundation slice for the Expo app. The
          next step is to move shared domain and data logic into cross-platform
          modules, then wire guest-local and authenticated-cloud flows here.
        </Text>
        <Link href="/roadmap" asChild>
          <Pressable style={styles.button}>
            <Text style={styles.buttonLabel}>View mobile roadmap</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#efe8db",
    paddingHorizontal: 24,
    paddingVertical: 32,
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#fbf8f2",
    borderRadius: 28,
    padding: 24,
    gap: 16,
    shadowColor: "#22160f",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 28,
    elevation: 8,
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontSize: 12,
    color: "#8a5a32",
    fontWeight: "700",
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    color: "#1e1814",
    fontWeight: "700",
  },
  body: {
    fontSize: 17,
    lineHeight: 26,
    color: "#5b4b40",
  },
  button: {
    alignSelf: "flex-start",
    backgroundColor: "#c4662f",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  buttonLabel: {
    color: "#fff7ef",
    fontSize: 15,
    fontWeight: "700",
  },
});
