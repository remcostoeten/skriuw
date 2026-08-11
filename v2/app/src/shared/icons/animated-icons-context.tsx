import { createContext, useContext } from "react";
import type { ReactNode } from "react";

const AnimatedIconsContext = createContext(false);

type Props = {
  /** The persisted `animatedIcons` workspace setting. */
  enabled: boolean;
  children: ReactNode;
};

/**
 * Publishes the animated-icons preference to every `AppIcon` in the tree so no
 * call site has to thread it through.
 */
export function AnimatedIconsProvider({ enabled, children }: Props) {
  return (
    <AnimatedIconsContext.Provider value={enabled}>
      {children}
    </AnimatedIconsContext.Provider>
  );
}

export function useAnimatedIcons(): boolean {
  return useContext(AnimatedIconsContext);
}
