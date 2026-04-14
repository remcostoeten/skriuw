import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerTitle: "Skriuw",
          contentStyle: {
            backgroundColor: "#f6f2ea",
          },
          headerStyle: {
            backgroundColor: "#f6f2ea",
          },
        }}
      />
    </>
  );
}
