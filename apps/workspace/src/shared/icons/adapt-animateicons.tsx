import { useEffect, useRef } from "react";
import { CalendarDaysIcon } from "@/shared/icons/animated/calendar-days";
import { FolderOpenIcon } from "@/shared/icons/animated/folder-open";
import { TagsIcon } from "@/shared/icons/animated/tags";

type Handle = {
  startAnimation: () => void;
  stopAnimation: () => void;
};

type Source = React.ComponentType<{
  size?: number;
  duration?: number;
  className?: string;
  ref?: React.Ref<Handle>;
}>;

type Props = {
  size?: number;
  animate?: boolean;
  className?: string;
};

/**
 * animate-ui's set has no folder, calendar, or tag icon, so those three stay on
 * animateicons. That library only exposes an imperative `startAnimation` /
 * `stopAnimation` ref handle, while everything else in the registry takes a
 * declarative `animate` boolean — this bridges the former onto the latter so
 * `AppIcon` has exactly one contract to drive.
 */
function adapt(Source: Source, duration: number) {
  return function AdaptedIcon({ size, animate = false, className }: Props) {
    const handleRef = useRef<Handle | null>(null);
    useEffect(() => {
      if (animate) {
        handleRef.current?.startAnimation();
      } else {
        handleRef.current?.stopAnimation();
      }
    }, [animate]);
    return (
      <Source ref={handleRef} size={size} duration={duration} className={className} />
    );
  };
}

/**
 * animateicons tunes its icons as standalone showpieces; scaling their
 * durations and delays keeps them close to animate-ui's snappier feel.
 */
const SPEED = 0.55;

export const FolderOpen = adapt(FolderOpenIcon, SPEED);
export const CalendarDays = adapt(CalendarDaysIcon, SPEED);
export const Tags = adapt(TagsIcon, SPEED);
