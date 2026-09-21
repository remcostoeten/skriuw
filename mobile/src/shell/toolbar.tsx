import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ShellIcon } from "./icons";
import { MINIMUM_TOUCH_TARGET, TOOLBAR_HEIGHT } from "./metrics";
import { useTheme } from "./theme";

type Props = {
  title: string;
  onOpenTree: () => void;
  onOpenSearch: () => void;
  onCreateNote: () => void;
};

/**
 * The 44 pt chrome above the content column: the tree on the left, search and
 * create on the right. Search is chrome rather than a destination because it
 * is not an `AppRoute` — the desktop reaches it the same way, from wherever
 * the reader already is.
 */
export function Toolbar({ title, onOpenTree, onOpenSearch, onCreateNote }: Props) {
  const theme = useTheme();
  const [presses, setPresses] = useState({ menu: 0, search: 0, plus: 0 });

  function pressed(control: keyof typeof presses) {
    setPresses((current) => ({ ...current, [control]: current[control] + 1 }));
  }

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.color("sidebar-background"),
          borderBottomColor: theme.color("sidebar-border"),
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open notes tree"
        onPressIn={() => pressed("menu")}
        onPress={onOpenTree}
        style={styles.control}
      >
        <ShellIcon name="menu" color={theme.color("sidebar-foreground", 0.75)} playKey={presses.menu} />
      </Pressable>
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        style={[styles.title, { color: theme.color("sidebar-foreground") }]}
      >
        {title}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search notes"
        onPressIn={() => pressed("search")}
        onPress={onOpenSearch}
        style={styles.control}
      >
        <ShellIcon name="search" color={theme.color("sidebar-foreground", 0.75)} playKey={presses.search} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New note"
        onPressIn={() => pressed("plus")}
        onPress={onCreateNote}
        style={styles.control}
      >
        <ShellIcon name="plus" color={theme.color("sidebar-foreground", 0.75)} playKey={presses.plus} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: TOOLBAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  control: {
    width: MINIMUM_TOUCH_TARGET,
    height: TOOLBAR_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    minWidth: 0,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "600",
  },
});
