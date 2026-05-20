import { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { commonStyles, palette, radius } from "@/src/ui/styles";

type LoadingVariant = "notes" | "journal" | "profile" | "editor" | "app";

type LoadingScreenProps = {
  variant?: LoadingVariant;
};

function SkeletonBlock({
  width = "100%",
  height,
  radiusValue = radius.sm,
  style,
}: {
  width?: number | `${number}%`;
  height: number;
  radiusValue?: number;
  style?: object;
}) {
  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: radiusValue,
          backgroundColor: palette.surfaceRaised,
          overflow: "hidden",
        },
        style,
      ]}
    />
  );
}

function LoadingChrome({ children }: { children: React.ReactNode }) {
  const opacity = useSharedValue(0.54);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 820, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.54, { duration: 820, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <SafeAreaView style={commonStyles.screen} edges={["top", "bottom"]}>
      <Animated.View style={[{ flex: 1 }, animatedStyle]}>{children}</Animated.View>
    </SafeAreaView>
  );
}

function NotesSkeleton() {
  return (
    <LoadingChrome>
      <View style={[commonStyles.screen, commonStyles.scrollContent, { paddingBottom: 132 }]}>
        <View style={commonStyles.homeHeader}>
          <View style={commonStyles.brandRow}>
            <SkeletonBlock width={44} height={44} radiusValue={radius.md} />
            <View style={[commonStyles.homeBrandCopy, { gap: 8 }]}>
              <SkeletonBlock width={96} height={18} />
              <SkeletonBlock width="82%" height={12} />
            </View>
          </View>

          <View style={commonStyles.homeSectionRow}>
            <SkeletonBlock width={156} height={30} />
            <SkeletonBlock width={64} height={14} />
          </View>
        </View>

        <View style={commonStyles.sidebarList}>
          {Array.from({ length: 6 }, (_, index) => (
            <View
              key={index}
              style={[
                commonStyles.noteRow,
                index > 0 && commonStyles.noteRowBorder,
              ]}
            >
              <SkeletonBlock width={index % 2 === 0 ? "56%" : "72%"} height={18} />
              <SkeletonBlock width="92%" height={12} />
              <SkeletonBlock width={112} height={12} />
            </View>
          ))}
        </View>
      </View>

      <BottomToolbarSkeleton actions={["Search", "Browse", "New note"]} />
    </LoadingChrome>
  );
}

function JournalSkeleton() {
  return (
    <LoadingChrome>
      <View style={[commonStyles.screen, commonStyles.scrollContent, { paddingBottom: 132 }]}>
        <View style={commonStyles.heroCard}>
          <View style={commonStyles.heroGlow} />
          <SkeletonBlock width={112} height={12} />
          <SkeletonBlock width="92%" height={72} />
          <SkeletonBlock width="100%" height={18} />
          <SkeletonBlock width="78%" height={18} />
          <View style={commonStyles.metricsGrid}>
            {Array.from({ length: 3 }, (_, index) => (
              <View key={index} style={commonStyles.metricTile}>
                <SkeletonBlock width={34} height={24} />
                <SkeletonBlock width={56} height={12} />
              </View>
            ))}
          </View>
          <SkeletonBlock height={48} radiusValue={radius.md} />
        </View>

        <View style={commonStyles.card}>
          <View style={commonStyles.sectionHeader}>
            <SkeletonBlock width={148} height={22} />
            <SkeletonBlock width={64} height={12} />
          </View>
          <SkeletonBlock width="100%" height={16} />
          <SkeletonBlock width="76%" height={16} />
        </View>

        {Array.from({ length: 3 }, (_, index) => (
          <View key={index} style={commonStyles.listCard}>
            <View style={commonStyles.rowBetween}>
              <SkeletonBlock width={76} height={28} radiusValue={radius.full} />
              <SkeletonBlock width={92} height={12} />
            </View>
            <SkeletonBlock width="62%" height={22} />
            <SkeletonBlock width="100%" height={14} />
            <SkeletonBlock width="84%" height={14} />
          </View>
        ))}
      </View>

      <BottomToolbarSkeleton actions={["Search", "New entry"]} />
    </LoadingChrome>
  );
}

function ProfileSkeleton() {
  return (
    <LoadingChrome>
      <View style={[commonStyles.screen, commonStyles.scrollContent]}>
        <View style={commonStyles.card}>
          <SkeletonBlock width={64} height={22} />
          <SkeletonBlock width="92%" height={16} />
          <SkeletonBlock width="68%" height={16} />
        </View>

        <View style={commonStyles.card}>
          <SkeletonBlock width={92} height={22} />
          <SkeletonBlock width={140} height={16} />
          <SkeletonBlock width={196} height={12} />
          <SkeletonBlock height={48} radiusValue={radius.md} />
        </View>

        <View style={commonStyles.card}>
          <SkeletonBlock width={76} height={22} />
          <View style={commonStyles.sidebarNavItem}>
            <SkeletonBlock width={84} height={16} />
            <SkeletonBlock width={28} height={16} />
          </View>
        </View>

        <View style={commonStyles.card}>
          <SkeletonBlock width={108} height={22} />
          <SkeletonBlock width="72%" height={16} />
          <SkeletonBlock width="100%" height={16} />
          <SkeletonBlock width="86%" height={16} />
        </View>
      </View>
    </LoadingChrome>
  );
}

function EditorSkeleton() {
  return (
    <LoadingChrome>
      <View style={commonStyles.screen}>
        <View style={commonStyles.editorTopBar}>
          <SkeletonBlock width={62} height={20} />
          <View style={{ alignItems: "flex-end", gap: 6 }}>
            <SkeletonBlock width={84} height={12} />
            <SkeletonBlock width={128} height={12} />
          </View>
        </View>

        <View style={commonStyles.editorScrollContent}>
          <View style={commonStyles.editorHeaderBlock}>
            <SkeletonBlock width={96} height={12} />
            <SkeletonBlock width="82%" height={40} />
            <SkeletonBlock width={164} height={16} />
          </View>
          <View style={{ gap: 16, paddingTop: 12 }}>
            <SkeletonBlock width="100%" height={16} />
            <SkeletonBlock width="94%" height={16} />
            <SkeletonBlock width="88%" height={16} />
            <SkeletonBlock width="72%" height={16} />
          </View>
        </View>

        <View style={commonStyles.editorBottomBar}>
          <View style={commonStyles.editorBottomBarSummary}>
            <SkeletonBlock width={74} height={12} />
            <SkeletonBlock width={112} height={16} />
          </View>
          <View style={commonStyles.editorBottomBarActions}>
            <SkeletonBlock width={78} height={44} radiusValue={radius.md} />
            <SkeletonBlock width={78} height={44} radiusValue={radius.md} />
          </View>
        </View>
      </View>
    </LoadingChrome>
  );
}

function BottomToolbarSkeleton({ actions }: { actions: string[] }) {
  return (
    <View
      pointerEvents="none"
      style={[
        commonStyles.bottomToolbarWrap,
        {
          paddingBottom: 12,
        },
      ]}
    >
      <View style={commonStyles.bottomToolbar}>
        <View style={commonStyles.bottomToolbarActions}>
          {actions.map((action, index) => (
            <SkeletonBlock
              key={action}
              height={52}
              radiusValue={index === 0 ? radius.md : radius.lg}
              style={{
                flex: index === 0 ? 0 : 1,
                minWidth: index === 0 ? 88 : undefined,
                backgroundColor: index === actions.length - 1 ? palette.accentDeep : palette.surfaceRaised,
              }}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

export function LoadingScreen({ variant = "notes" }: LoadingScreenProps) {
  if (variant === "journal") {
    return <JournalSkeleton />;
  }

  if (variant === "profile") {
    return <ProfileSkeleton />;
  }

  if (variant === "editor") {
    return <EditorSkeleton />;
  }

  if (variant === "app") {
    return <NotesSkeleton />;
  }

  return <NotesSkeleton />;
}
