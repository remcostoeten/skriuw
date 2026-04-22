import { Stack } from "expo-router";
import { palette } from "@/src/ui/styles";

export default function NotesLayout() {
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
          title: "Notes",
          headerLargeTitle: true,
        }}
      />
      <Stack.Screen
        name="[noteId]"
        options={{
          title: "Note",
        }}
      />
    </Stack>
  );
}
