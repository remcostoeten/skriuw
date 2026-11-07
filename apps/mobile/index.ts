// expo-task-manager unregisters a task that is not defined while the bundle loads, and a headless background launch never renders a route.
import "./src/features/sync/background-task";
import "expo-router/entry";
