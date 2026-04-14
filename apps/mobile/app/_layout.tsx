import "react-native-gesture-handler";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { WorkspaceProvider } from "@/src/features/workspace/workspace-context";

export default function RootLayout() {
  return (
    <WorkspaceProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
    </WorkspaceProvider>
  );
}
