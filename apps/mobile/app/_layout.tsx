import "react-native-gesture-handler";

import { type Href, Stack, usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { WorkspaceProvider } from "@/src/features/workspace/workspace-context";
import { LoadingScreen } from "@/src/features/workspace/loading-screen";
import { initializeAuth } from "@/src/platform/auth";
import { useAuthSnapshot } from "@/src/platform/auth/use-auth";
import { palette } from "@/src/ui/styles";

SplashScreen.preventAutoHideAsync();

const PUBLIC_PATHS = new Set(["/sign-in", "/splash", "/auth/callback"]);
const SIGN_IN_ROUTE = "/sign-in" as Href;
const AUTHENTICATED_HOME = "/notes" as Href;

type MobileAuthSnapshot = {
  phase: "initializing" | "signed_out" | "authenticated";
  isReady: boolean;
};

export default function RootLayout() {
  const auth = useAuthSnapshot() as MobileAuthSnapshot;
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    void initializeAuth();
  }, []);

  useEffect(() => {
    const hideSplash = async () => {
      await SplashScreen.hideAsync();
    };

    const timer = setTimeout(hideSplash, 1500);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!auth.isReady) {
      return;
    }

    const isPublicPath = PUBLIC_PATHS.has(pathname);

    if (auth.phase === "authenticated") {
      if (pathname === "/" || isPublicPath) {
        router.replace(AUTHENTICATED_HOME);
      }
      return;
    }

    if (!isPublicPath) {
      router.replace(SIGN_IN_ROUTE);
    }
  }, [auth.isReady, auth.phase, pathname, router]);

  const isPublicPath = PUBLIC_PATHS.has(pathname);
  const shouldBlockRender =
    !auth.isReady ||
    (auth.phase === "authenticated" && (pathname === "/" || isPublicPath)) ||
    (auth.phase !== "authenticated" && !isPublicPath);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <WorkspaceProvider>
          <StatusBar style="light" backgroundColor={palette.canvas} />
          {shouldBlockRender ? (
            <LoadingScreen />
          ) : (
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: {
                  backgroundColor: palette.canvas,
                },
              }}
            />
          )}
        </WorkspaceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
