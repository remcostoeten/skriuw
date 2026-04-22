import { Stack } from "expo-router";
import { palette } from "@/src/ui/styles";

export default function JournalLayout() {
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerTintColor: palette.text,
        headerTitleStyle: {
          color: palette.text,
        },
        headerStyle: {
          backgroundColor: palette.canvas,
        },
        contentStyle: {
          backgroundColor: palette.canvas,
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Journal",
        }}
      />
      <Stack.Screen
        name="[entryId]"
        options={{
          title: "Entry",
        }}
      />
    </Stack>
  );
}
