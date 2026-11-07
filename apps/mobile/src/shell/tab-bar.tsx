import { router, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { SHELL_DESTINATIONS, type ShellRoute } from "./destinations";
import { ShellIcon } from "./icons";
import { TAB_BAR_HEIGHT, TAB_ICON_SIZE, TAB_LABEL_SIZE, TAB_RESTING_ALPHA } from "./metrics";
import { clamp } from "./motion";
import { useTheme } from "./theme";

type Props = {
  route: ShellRoute;
  keyboard: SharedValue<number>;
  height: SharedValue<number>;
  onOpenAccount: () => void;
};

/**
 * The compact replacement for the navigation rail: the same destinations in
 * the same order, sized for thumbs and padded for the home indicator. A tab
 * replaces the current entry rather than pushing one, so back leaves the
 * application instead of walking through every tab visited (ADR-0047).
 *
 * It floats over the bottom of the content column, which keeps clear of it,
 * and steps aside for the software keyboard as `:root[data-keyboard="open"]`
 * does in the compact shell: it slides down by its own height, frame by frame
 * with the keyboard's real position (`keyboard`, from 0 closed to 1 open), and
 * never leaves the layout, so nothing behind it jumps. Reduced motion fades it.
 */
export function TabBar({ route, keyboard, height, onOpenAccount }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const resting = theme.color("sidebar-foreground", TAB_RESTING_ALPHA);
  const selected = theme.color("sidebar-foreground");
  const [presses, setPresses] = useState<Record<string, number>>({});
  const [stowed, setStowed] = useState(false);

  function pressed(key: string) {
    setPresses((current) => ({ ...current, [key]: (current[key] ?? 0) + 1 }));
  }

  useAnimatedReaction(
    () => keyboard.get() > 0,
    (now, before) => {
      if (now !== before) {
        scheduleOnRN(setStowed, now);
      }
    },
  );

  const motionStyle = useAnimatedStyle(() => {
    const progress = clamp(keyboard.get(), 0, 1);
    return reducedMotion
      ? { opacity: 1 - progress }
      : { transform: [{ translateY: progress * height.get() }] };
  });

  return (
    <Animated.View
      accessibilityRole="tabbar"
      accessibilityLabel="Primary"
      accessibilityElementsHidden={stowed}
      importantForAccessibility={stowed ? "no-hide-descendants" : "auto"}
      pointerEvents={stowed ? "none" : "auto"}
      onLayout={(event) => height.set(event.nativeEvent.layout.height)}
      style={[
        styles.bar,
        {
          paddingBottom: insets.bottom,
          backgroundColor: theme.color("sidebar-background"),
          borderTopColor: theme.color("sidebar-border"),
        },
        motionStyle,
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "stretch",
    borderTopWidth: StyleSheet.hairlineWidth,
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
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
