'use client';

import { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const LOGO_SIZE = SCREEN_WIDTH * 0.28;
const RING_SIZE = LOGO_SIZE * 1.6;
const RING2_SIZE = LOGO_SIZE * 2.2;

export default function SplashScreen() {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);
  const ringScale = useSharedValue(0.8);
  const ringOpacity = useSharedValue(0);
  const ring2Scale = useSharedValue(0.7);
  const ring2Opacity = useSharedValue(0);
  const textOpacity = useSharedValue(0);
  const textTranslateY = useSharedValue(12);

  useEffect(() => {
    // Logo entrance
    opacity.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) });
    scale.value = withSequence(
      withSpring(1.08, { damping: 10, stiffness: 120 }),
      withSpring(1, { damping: 14, stiffness: 160 }),
    );

    // Inner ring pulse
    ringOpacity.value = withDelay(
      250,
      withSequence(
        withTiming(0.5, { duration: 600, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) }),
      ),
    );
    ringScale.value = withDelay(
      250,
      withTiming(1.4, { duration: 1100, easing: Easing.out(Easing.cubic) }),
    );

    // Outer ring pulse
    ring2Opacity.value = withDelay(
      400,
      withSequence(
        withTiming(0.3, { duration: 600, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) }),
      ),
    );
    ring2Scale.value = withDelay(
      400,
      withTiming(1.3, { duration: 1200, easing: Easing.out(Easing.cubic) }),
    );

    // Brand text
    textOpacity.value = withDelay(500, withTiming(1, { duration: 600 }));
    textTranslateY.value = withDelay(
      500,
      withSpring(0, { damping: 14, stiffness: 100 }),
    );
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring2Scale.value }],
    opacity: ring2Opacity.value,
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textTranslateY.value }],
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.ring2, ring2Style]} />
      <Animated.View style={[styles.ring, ringStyle]} />
      <Animated.View style={[styles.logoContainer, logoStyle]}>
        <View style={styles.logo}>
          <View style={styles.logoInner} />
        </View>
      </Animated.View>
      <Animated.View style={[styles.textWrap, textStyle]}>
        <Text style={styles.brandName}>Skriuw</Text>
        <Text style={styles.brandTagline}>Capture. Reflect. Organize.</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  logoInner: {
    width: '40%',
    height: '40%',
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  ring2: {
    position: 'absolute',
    width: RING2_SIZE,
    height: RING2_SIZE,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  textWrap: {
    marginTop: 32,
    alignItems: 'center',
    gap: 6,
  },
  brandName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#E8E8E8',
    letterSpacing: 1.2,
  },
  brandTagline: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(140, 140, 140, 0.8)',
    letterSpacing: 0.5,
  },
});
