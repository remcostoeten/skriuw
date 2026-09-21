import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { commitOperations } from "../bridge/commit";
import { MINIMUM_TOUCH_TARGET } from "./metrics";
import { useTheme } from "./theme";
import { THEME_OPTIONS, type ThemePreference } from "./theme-model";
import { useWorkspace } from "./workspace-provider";

type Option = {
  preference: ThemePreference;
  label: string;
  detail: string;
};

const OPTIONS: readonly Option[] = [
  { preference: "system", label: "System", detail: "Follows the device setting" },
  ...THEME_OPTIONS.map((option) => ({
    preference: option.name as ThemePreference,
    label: option.label,
    detail: option.dark ? "Dark" : "Light",
  })),
];

/**
 * The account sheet's appearance section: the platform's own light and dark
 * setting, or any of the generated themes. A named theme is also written to
 * the workspace settings, so every interface signed into this workspace
 * agrees on it.
 */
export function AccountPanel() {
  const theme = useTheme();
  const session = useWorkspace();

  function select(preference: ThemePreference): void {
    theme.setPreference(preference);
    if (preference === "system") {
      return;
    }
    const settings = session.store.getState().settings;
    commitOperations(session, [
      { type: "update_settings", settings: { ...settings, theme: preference } },
    ]).catch(session.reportFailure);
  }

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={[styles.heading, { color: theme.color("sidebar-foreground", 0.5) }]}>
        Appearance
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Theme">
        {OPTIONS.map((option) => {
          const selected = theme.preference === option.preference;
          return (
            <Pressable
              key={option.preference}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityHint={option.detail}
              accessibilityState={{ selected, checked: selected }}
              onPress={() => select(option.preference)}
              style={styles.option}
            >
              <View style={styles.optionText}>
                <Text style={[styles.label, { color: theme.color("sidebar-foreground") }]}>
                  {option.label}
                </Text>
                <Text style={[styles.detail, { color: theme.color("sidebar-foreground", 0.5) }]}>
                  {option.detail}
                </Text>
              </View>
              <View
                style={[
                  styles.marker,
                  {
                    borderColor: selected
                      ? theme.color("theme-accent-blue")
                      : theme.color("sidebar-border"),
                    backgroundColor: selected ? theme.color("theme-accent-blue") : "transparent",
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingVertical: 8,
  },
  heading: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 11,
    fontWeight: "600",
  },
  option: {
    minHeight: MINIMUM_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  optionText: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 15,
  },
  detail: {
    fontSize: 12,
  },
  marker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
});
