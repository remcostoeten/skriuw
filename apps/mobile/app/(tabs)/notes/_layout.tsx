import { Stack } from "expo-router";

export default function NotesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: {
          backgroundColor: "#f6f2ea",
        },
        contentStyle: {
          backgroundColor: "#f6f2ea",
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Notes",
        }}
      />
      <Stack.Screen
        name="[noteId]"
        options={{
          title: "Edit note",
        }}
      />
    </Stack>
  );
}
