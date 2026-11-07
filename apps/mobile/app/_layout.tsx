import { Slot } from "expo-router";
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AccountProvider, RemoteChangeSync } from "@/features/auth/account-provider";
import { LockGate } from "@/features/lock/lock-gate";
import { QuickActionHandler } from "@/features/quick-actions/quick-action-handler";
import { ColdStartProbe } from "@/features/startup/cold-start-probe";
import { ChromeProvider } from "@/shell/chrome";
import { ShellFrame } from "@/shell/shell-frame";
import { ThemeProvider, useTheme } from "@/shell/theme";
import { themePreferenceFromSettings } from "@/shell/theme-model";
import { WorkspaceProvider, useWorkspaceSelector } from "@/shell/workspace-provider";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <ThemeProvider>
            <ShellStatusBar />
            <AccountProvider>
              <WorkspaceProvider>
                <WorkspaceThemePreference />
                <RemoteChangeSync />
                <ColdStartProbe />
                <ChromeProvider>
                  <QuickActionHandler />
                  <LockGate>
                    <ShellFrame>
                      <Slot />
                    </ShellFrame>
                  </LockGate>
                </ChromeProvider>
              </WorkspaceProvider>
            </AccountProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

function WorkspaceThemePreference() {
  const storedTheme = useWorkspaceSelector((state) => state.settings.theme);
  const { setPreference } = useTheme();
  const preference = themePreferenceFromSettings(storedTheme);
  useEffect(() => setPreference(preference), [preference, setPreference]);
  return null;
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
