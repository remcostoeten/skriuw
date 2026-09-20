import { Slot } from "expo-router";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ChromeProvider } from "@/shell/chrome";
import { ShellFrame } from "@/shell/shell-frame";
import { ThemeProvider, useTheme } from "@/shell/theme";
import { WorkspaceProvider } from "@/shell/workspace-provider";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ShellStatusBar />
          <WorkspaceProvider>
            <ChromeProvider>
              <ShellFrame>
                <Slot />
              </ShellFrame>
            </ChromeProvider>
          </WorkspaceProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ShellStatusBar() {
  const theme = useTheme();
  return <StatusBar style={theme.isDark ? "light" : "dark"} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
