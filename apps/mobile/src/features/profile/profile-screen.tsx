import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
  Easing,
} from "react-native-reanimated";
import { useWorkspace } from "@/src/features/workspace/workspace-context";
import { LoadingScreen } from "@/src/features/workspace/loading-screen";
import { signOut, type MobileAuthSnapshot } from "@/src/platform/auth";
import { useAuthSnapshot } from "@/src/platform/auth/use-auth";
import { commonStyles } from "@/src/ui/styles";

function AnimatedPressable({
  children,
  style,
  onPress,
  delay = 0,
}: {
  children: React.ReactNode;
  style?: object | object[];
  onPress: () => void;
  delay?: number;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(400).easing(Easing.out(Easing.cubic))}
      style={animStyle}
    >
      <Pressable
        style={({ pressed }) => [
          style,
          pressed && { opacity: 0.92 },
        ]}
        onPress={onPress}
        onPressIn={() => {
          scale.value = withSpring(0.975, { damping: 15, stiffness: 200 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 12, stiffness: 180 });
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

export function ProfileScreen() {
  const router = useRouter();
  const auth = useAuthSnapshot() as MobileAuthSnapshot;
  const { isHydrated, workspace, cloudConfigured } = useWorkspace();

  if (!isHydrated || !auth.isReady) {
    return <LoadingScreen />;
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={commonStyles.scrollContent}>
      <Animated.View entering={FadeInDown.duration(400).easing(Easing.out(Easing.cubic))}>
        <View style={commonStyles.card}>
          <Text style={commonStyles.sectionTitle}>More</Text>
          <Text style={commonStyles.subtitle}>
            Account details and secondary spaces live here so Notes stays focused.
          </Text>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(80).duration(400).easing(Easing.out(Easing.cubic))}>
        <View style={commonStyles.card}>
          <Text style={commonStyles.sectionTitle}>Account</Text>
          <Text style={commonStyles.subtitle}>{auth.user?.name ?? "Signed in"}</Text>
          {auth.user?.email ? <Text style={commonStyles.caption}>{auth.user.email}</Text> : null}
          <Pressable
            style={commonStyles.buttonSecondary}
            onPress={() =>
              Alert.alert("Sign out?", "You’ll need to sign back in to access this workspace on mobile.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Sign out",
                  style: "destructive",
                  onPress: () => {
                    void signOut();
                  },
                },
              ])
            }
          >
            <Text style={commonStyles.buttonLabelSecondary}>Sign out</Text>
          </Pressable>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(160).duration(400).easing(Easing.out(Easing.cubic))}>
        <View style={commonStyles.card}>
          <Text style={commonStyles.sectionTitle}>Spaces</Text>
          <AnimatedPressable
            style={commonStyles.sidebarNavItem}
            onPress={() => router.push("/journal")}
            delay={240}
          >
            <Text style={commonStyles.sidebarNavLabel}>Journal</Text>
            <Text style={commonStyles.sidebarNavCount}>{workspace.journalEntries.length}</Text>
          </AnimatedPressable>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(240).duration(400).easing(Easing.out(Easing.cubic))}>
        <View style={commonStyles.card}>
          <Text style={commonStyles.sectionTitle}>Workspace</Text>
          <Text style={commonStyles.subtitle}>
            {workspace.notes.length} notes, {workspace.folders.length} folders
          </Text>
          <Text style={commonStyles.subtitle}>
            {cloudConfigured
              ? "This mobile build is connected to your account-backed workspace."
              : "This mobile build is missing its Supabase configuration."}
          </Text>
          <Text style={commonStyles.caption}>Mobile is signed-in only and expects an account-backed workspace.</Text>
        </View>
      </Animated.View>
    </ScrollView>
  );
}
