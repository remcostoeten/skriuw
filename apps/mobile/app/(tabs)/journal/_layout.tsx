import { Stack } from "expo-router";

export default function JournalLayout() {
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
          title: "Journal",
        }}
      />
      <Stack.Screen
        name="[entryId]"
        options={{
          title: "Edit entry",
        }}
      />
    </Stack>
  );
}
