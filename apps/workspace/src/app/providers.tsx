import type { ReactNode } from "react";
import { CloudSessionProvider } from "@/features/auth/cloud-session";
import { selectAnimatedIcons } from "@/features/settings/selectors";
import { AnimatedIconsProvider } from "@/shared/icons/animated-icons-context";
import { WindowControlsProvider } from "@/shared/ui/window-controls-slot";
import { WindowControls } from "@/shell/title-bar";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererStore } from "@skriuw/renderer-core/store/types";

type Props = {
  store: RendererStore;
  children: ReactNode;
};

function AnimatedIcons({ store, children }: Props) {
  const animatedIcons = useRendererSelector(store, selectAnimatedIcons);
  return <AnimatedIconsProvider enabled={animatedIcons}>{children}</AnimatedIconsProvider>;
}

/** Every context the workspace UI reads: the cloud session, icon animation, and window controls. */
export function AppProviders({ store, children }: Props) {
  return (
    <CloudSessionProvider>
      <WindowControlsProvider value={WindowControls}>
        <AnimatedIcons store={store}>{children}</AnimatedIcons>
      </WindowControlsProvider>
    </CloudSessionProvider>
  );
}
