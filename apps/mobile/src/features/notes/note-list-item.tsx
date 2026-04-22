import { useRef } from "react";
import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import Swipeable from "react-native-gesture-handler/Swipeable";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
  Easing,
} from "react-native-reanimated";
import type { MobileNote } from "@/src/core/workspace-types";
import { formatDate, getNotePreview, getNoteTitle } from "@/src/lib/workspace-format";
import { commonStyles } from "@/src/ui/styles";
import { Animated as RNAnimated } from "react-native";

export function NoteListItem({
  note,
  folderName,
  bordered,
  index,
  onOpen,
  onMove,
  onDelete,
  onShowActions,
}: {
  note: MobileNote;
  folderName: string;
  bordered: boolean;
  index?: number;
  onOpen: () => void;
  onMove?: () => void;
  onDelete: () => void;
  onShowActions: () => void;
}) {
  const noteTitle = getNoteTitle(note.name, note.content);
  const swipeableRef = useRef<Swipeable | null>(null);
  const pressScale = useSharedValue(1);

  const closeSwipe = () => {
    swipeableRef.current?.close();
  };

  const animatedPressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const handlePressIn = () => {
    pressScale.value = withSpring(0.975, { damping: 15, stiffness: 200 });
  };

  const handlePressOut = () => {
    pressScale.value = withSpring(1, { damping: 12, stiffness: 180 });
  };

  const renderMoveAction = onMove
    ? (progress: RNAnimated.AnimatedInterpolation<number>) => (
        <View style={[commonStyles.swipeActionTrack, commonStyles.swipeActionTrackLeft]}>
          <RNAnimated.View
            style={[
              commonStyles.swipeActionSurface,
              commonStyles.swipeActionMoveSurface,
              {
                opacity: progress.interpolate({
                  inputRange: [0, 0.35, 1],
                  outputRange: [0, 0.7, 1],
                  extrapolate: "clamp",
                }),
                transform: [
                  {
                    translateX: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-18, 0],
                      extrapolate: "clamp",
                    }),
                  },
                  {
                    scale: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.94, 1],
                      extrapolate: "clamp",
                    }),
                  },
                ],
              },
            ]}
          >
            <Pressable
              style={({ pressed }) => [
                commonStyles.swipeActionButton,
                pressed && commonStyles.swipeActionButtonPressed,
              ]}
              onPress={() => {
                closeSwipe();
                void Haptics.selectionAsync();
                onMove();
              }}
            >
              <Text style={commonStyles.swipeActionLabel}>Move</Text>
              <Text style={commonStyles.swipeActionHint}>Change folder</Text>
            </Pressable>
          </RNAnimated.View>
        </View>
      )
    : undefined;

  const renderDeleteAction = (progress: RNAnimated.AnimatedInterpolation<number>) => (
    <View style={[commonStyles.swipeActionTrack, commonStyles.swipeActionTrackRight]}>
      <RNAnimated.View
        style={[
          commonStyles.swipeActionSurface,
          commonStyles.swipeActionDeleteSurface,
          {
            opacity: progress.interpolate({
              inputRange: [0, 0.35, 1],
              outputRange: [0, 0.7, 1],
              extrapolate: "clamp",
            }),
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [18, 0],
                  extrapolate: "clamp",
                }),
              },
              {
                scale: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.94, 1],
                  extrapolate: "clamp",
                }),
              },
            ],
          },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            commonStyles.swipeActionButton,
            pressed && commonStyles.swipeActionButtonPressed,
          ]}
          onPress={() => {
            closeSwipe();
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            onDelete();
          }}
        >
          <Text style={commonStyles.swipeActionLabel}>Delete</Text>
          <Text style={commonStyles.swipeActionHint}>Remove note</Text>
        </Pressable>
      </RNAnimated.View>
    </View>
  );

  const staggerDelay = Math.min((index ?? 0) * 60, 400);

  return (
    <Animated.View
      entering={FadeIn.delay(staggerDelay).duration(350).easing(Easing.out(Easing.cubic))}
      style={[commonStyles.noteSwipeShell, bordered && commonStyles.noteRowBorder]}
    >
      <Swipeable
        ref={swipeableRef}
        overshootLeft={false}
        overshootRight={false}
        friction={1.9}
        leftThreshold={56}
        rightThreshold={64}
        dragOffsetFromLeftEdge={14}
        dragOffsetFromRightEdge={14}
        enableTrackpadTwoFingerGesture
        onSwipeableWillOpen={() => {
          void Haptics.selectionAsync();
        }}
        renderLeftActions={renderMoveAction}
        renderRightActions={renderDeleteAction}
      >
        <Animated.View style={animatedPressStyle}>
          <Pressable
            style={({ pressed }) => [
              commonStyles.noteRow,
              pressed && commonStyles.noteRowPressed,
            ]}
            onPress={() => {
              closeSwipe();
              onOpen();
            }}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onLongPress={() => {
              closeSwipe();
              void Haptics.selectionAsync();
              onShowActions();
            }}
          >
            <Text style={commonStyles.noteMeta}>{folderName}</Text>
            <View style={commonStyles.noteTitleRow}>
              <Text numberOfLines={1} style={commonStyles.noteTitleCompact}>
                {noteTitle}
              </Text>
              <Text style={commonStyles.noteDateCompact}>{formatDate(note.updatedAt)}</Text>
            </View>
            <Text numberOfLines={2} style={commonStyles.notePreviewCompact}>
              {getNotePreview(note.content)}
            </Text>
          </Pressable>
        </Animated.View>
      </Swipeable>
    </Animated.View>
  );
}
