import "react-native-gesture-handler";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import * as SplashScreen from "expo-splash-screen";
import { WorkspaceProvider } from "@/src/features/workspace/workspace-context";
import { palette } from "@/src/ui/styles";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    const hideSplash = async () => {
      await SplashScreen.hideAsync();
    };

    const timer = setTimeout(hideSplash, 1500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <WorkspaceProvider>
      <StatusBar style="light" backgroundColor={palette.canvas} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: palette.canvas,
          },
        }}
      />
    </WorkspaceProvider>
  );
}
