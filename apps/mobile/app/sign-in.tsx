import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LoadingScreen } from "@/src/features/workspace/loading-screen";
import {
  signInWithOAuth,
  signInWithPassword,
  signUpWithPassword,
  type MobileAuthSnapshot,
  type OAuthProvider,
} from "@/src/platform/auth";
import { useAuthSnapshot } from "@/src/platform/auth/use-auth";
import { commonStyles, palette } from "@/src/ui/styles";

type AuthIntent = "sign-in" | "sign-up" | OAuthProvider;

export default function SignInRoute() {
  const auth = useAuthSnapshot() as MobileAuthSnapshot;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingIntent, setPendingIntent] = useState<AuthIntent | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function runAuth(intent: AuthIntent) {
    try {
      setPendingIntent(intent);
      setMessage(null);

      if (intent === "sign-in") {
        await signInWithPassword({ email: email.trim(), password });
        return;
      }

      if (intent === "sign-up") {
        await signUpWithPassword({ email: email.trim(), password });
        return;
      }

      await signInWithOAuth(intent);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to continue.");
    } finally {
      setPendingIntent(null);
    }
  }

  if (!auth.isReady) {
    return <LoadingScreen />;
  }

  return (
    <SafeAreaView style={commonStyles.screen} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={commonStyles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={commonStyles.screen}
          contentContainerStyle={[commonStyles.scrollContent, { justifyContent: "center", flexGrow: 1 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={commonStyles.heroCard}>
            <View style={commonStyles.heroGlow} />
            <Text style={commonStyles.eyebrow}>Account required</Text>
            <Text style={commonStyles.headline}>Sign in to your workspace.</Text>
            <Text style={commonStyles.subtitle}>
              Use the same account you use on web to access your notes and journal on mobile.
            </Text>
          </View>

          <View style={commonStyles.card}>
            <Text style={commonStyles.sectionTitle}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="you@example.com"
              placeholderTextColor={palette.textSoft}
              style={commonStyles.input}
            />

            <Text style={commonStyles.sectionTitle}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              placeholder="••••••••"
              placeholderTextColor={palette.textSoft}
              style={commonStyles.input}
            />

            <Pressable
              style={[
                commonStyles.button,
                (!auth.isSupabaseConfigured || !email.trim() || !password || pendingIntent !== null) && {
                  opacity: 0.6,
                },
              ]}
              disabled={!auth.isSupabaseConfigured || !email.trim() || !password || pendingIntent !== null}
              onPress={() => {
                void runAuth("sign-in");
              }}
            >
              <Text style={commonStyles.buttonLabel}>
                {pendingIntent === "sign-in" ? "Signing in…" : "Sign in"}
              </Text>
            </Pressable>

            <Pressable
              style={[
                commonStyles.buttonSecondary,
                (!auth.isSupabaseConfigured || !email.trim() || !password || pendingIntent !== null) && {
                  opacity: 0.6,
                },
              ]}
              disabled={!auth.isSupabaseConfigured || !email.trim() || !password || pendingIntent !== null}
              onPress={() => {
                void runAuth("sign-up");
              }}
            >
              <Text style={commonStyles.buttonLabelSecondary}>
                {pendingIntent === "sign-up" ? "Creating account…" : "Create account"}
              </Text>
            </Pressable>

            <Pressable
              style={[
                commonStyles.buttonSecondary,
                (pendingIntent !== null) && {
                  opacity: 0.6,
                },
              ]}
              disabled={pendingIntent !== null}
              onPress={() => {
                void runAuth("google");
              }}
            >
              <Text style={commonStyles.buttonLabelSecondary}>
                {pendingIntent === "google" ? "Connecting Google…" : "Continue with Google"}
              </Text>
            </Pressable>

            <Pressable
              style={[
                commonStyles.buttonSecondary,
                (pendingIntent !== null) && {
                  opacity: 0.6,
                },
              ]}
              disabled={pendingIntent !== null}
              onPress={() => {
                void runAuth("github");
              }}
            >
              <Text style={commonStyles.buttonLabelSecondary}>
                {pendingIntent === "github" ? "Connecting GitHub…" : "Continue with GitHub"}
              </Text>
            </Pressable>
            {message || auth.error ? (
              <View
                style={[
                  {
                    marginTop: 16,
                    borderRadius: 20,
                    borderWidth: 1,
                    padding: 14,
                  },
                  {
                    backgroundColor: palette.accentWash,
                    borderColor: palette.borderSubtle,
                  },
                ]}
              >
                <Text style={commonStyles.subtitle}>{message ?? auth.error}</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
