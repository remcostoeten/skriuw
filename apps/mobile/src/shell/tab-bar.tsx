import { router, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SHELL_DESTINATIONS, type ShellRoute } from "./destinations";
import { ShellIcon } from "./icons";
import { TAB_BAR_HEIGHT, TAB_ICON_SIZE, TAB_LABEL_SIZE, TAB_RESTING_ALPHA } from "./metrics";
import { useTheme } from "./theme";

type Props = {
  route: ShellRoute;
  onOpenAccount: () => void;
};

/**
 * The compact replacement for the navigation rail: the same destinations in
 * the same order, sized for thumbs and padded for the home indicator. A tab
 * replaces the current entry rather than pushing one, so back leaves the
 * application instead of walking through every tab visited (ADR-0047).
 */
export function TabBar({ route, onOpenAccount }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const resting = theme.color("sidebar-foreground", TAB_RESTING_ALPHA);
  const selected = theme.color("sidebar-foreground");
  const [presses, setPresses] = useState<Record<string, number>>({});

  function pressed(key: string) {
    setPresses((current) => ({ ...current, [key]: (current[key] ?? 0) + 1 }));
  }

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Primary"
      style={[
        styles.bar,
        {
          paddingBottom: insets.bottom,
          backgroundColor: theme.color("sidebar-background"),
          borderTopColor: theme.color("sidebar-border"),
        },
      ]}
    >
      {SHELL_DESTINATIONS.map((destination) => {
        const active = destination.route === route;
        const color = active ? selected : resting;
        return (
          <Pressable
            key={destination.route}
            accessibilityRole="tab"
            accessibilityLabel={destination.label}
            accessibilityState={{ selected: active }}
            onPressIn={() => pressed(destination.route)}
            onPress={() => router.replace(destination.path as Href)}
            style={styles.tab}
          >
            <ShellIcon
              name={destination.icon}
              size={TAB_ICON_SIZE}
              color={color}
              playKey={presses[destination.route] ?? 0}
            />
            <Text numberOfLines={1} style={[styles.label, { color }]}>
              {destination.label}
            </Text>
          </Pressable>
        );
      })}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Account and settings"
        onPressIn={() => pressed("account")}
        onPress={onOpenAccount}
        style={styles.tab}
      >
        <ShellIcon
          name="account"
          size={TAB_ICON_SIZE}
          color={resting}
          playKey={presses.account ?? 0}
        />
        <Text numberOfLines={1} style={[styles.label, { color: resting }]}>
          Account
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "stretch",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: TAB_BAR_HEIGHT,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  label: {
    fontSize: TAB_LABEL_SIZE,
    lineHeight: TAB_LABEL_SIZE + 2,
    fontWeight: "500",
    maxWidth: "100%",
  },
});
