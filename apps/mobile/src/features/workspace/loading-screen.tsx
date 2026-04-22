import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { commonStyles, palette } from "@/src/ui/styles";

export function LoadingScreen() {
  const textOpacity = useSharedValue(0.5);

  useEffect(() => {
    textOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.5, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, []);

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  return (
    <View style={[commonStyles.screen, { alignItems: "center", justifyContent: "center", gap: 20 }]}>
      <ActivityIndicator color={palette.accent} size="large" />
      <Animated.Text style={[commonStyles.subtitle, { textAlign: "center" }, textStyle]}>
        Loading your workspace…
      </Animated.Text>
    </View>
  );
}
