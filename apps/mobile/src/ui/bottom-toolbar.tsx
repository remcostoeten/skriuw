import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { commonStyles, palette } from "@/src/ui/styles";

type ToolbarAction = {
  label: string;
  onPress: () => void;
  variant?: "default" | "primary";
};

type BottomToolbarProps = {
  actions: ToolbarAction[];
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchActive: boolean;
  onSearchOpen: () => void;
  onSearchCancel: () => void;
};

export function BottomToolbar({
  actions,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  searchActive,
  onSearchOpen,
  onSearchCancel,
}: BottomToolbarProps) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(searchActive ? 1 : 0)).current;
  const inputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: searchActive ? 1 : 0,
      duration: searchActive ? 320 : 220,
      easing: searchActive ? Easing.out(Easing.cubic) : Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [progress, searchActive]);

  useEffect(() => {
    if (!searchActive) {
      inputRef.current?.blur();
      return;
    }

    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [searchActive]);

  return (
    <View
      pointerEvents="box-none"
      style={[
        commonStyles.bottomToolbarWrap,
        {
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}
    >
      <Animated.View
        style={[
          commonStyles.bottomToolbar,
          {
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -4],
                }),
              },
            ],
          },
        ]}
      >
        <Animated.View
          style={[
            commonStyles.bottomToolbarActions,
            {
              opacity: progress.interpolate({
                inputRange: [0, 0.45],
                outputRange: [1, 0],
                extrapolate: "clamp",
              }),
              maxHeight: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [72, 0],
              }),
            },
          ]}
          pointerEvents={searchActive ? "none" : "auto"}
        >
          <Pressable style={commonStyles.bottomToolbarSearchButton} onPress={onSearchOpen}>
            <Text style={commonStyles.bottomToolbarSearchLabel}>Search</Text>
          </Pressable>
          {actions.map((action) => (
            <Pressable
              key={action.label}
              style={[
                commonStyles.bottomToolbarButton,
                action.variant === "primary" && commonStyles.bottomToolbarButtonPrimary,
              ]}
              onPress={action.onPress}
            >
              <Text
                style={[
                  commonStyles.bottomToolbarButtonLabel,
                  action.variant === "primary" && commonStyles.bottomToolbarButtonLabelPrimary,
                ]}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </Animated.View>

        <Animated.View
          style={[
            commonStyles.bottomToolbarSearchPanel,
            {
              opacity: progress,
              maxHeight: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 88],
              }),
            },
          ]}
          pointerEvents={searchActive ? "auto" : "none"}
        >
          <View style={commonStyles.bottomToolbarSearchHeader}>
            <Text style={commonStyles.bottomToolbarSearchTitle}>Search</Text>
            <Pressable style={commonStyles.searchCancelButton} onPress={onSearchCancel}>
              <Text style={commonStyles.searchCancelButtonLabel}>Cancel</Text>
            </Pressable>
          </View>
          <View style={[commonStyles.searchShell, commonStyles.searchShellActive]}>
            <Text style={commonStyles.searchLabel}>Find</Text>
            <TextInput
              ref={inputRef}
              value={searchValue}
              onChangeText={onSearchChange}
              placeholder={searchPlaceholder}
              placeholderTextColor={palette.textSoft}
              style={commonStyles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}
