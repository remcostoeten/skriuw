import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAnnouncement } from "../../shell/announce";
import { MINIMUM_TOUCH_TARGET } from "../../shell/metrics";
import { useTheme } from "../../shell/theme";
import { describeSyncStatus } from "../sync/status";
import { useAccountAvailability, useAccountState } from "./account-provider";
import type { AccountRuntime } from "./account-runtime";
import {
  accountSummary,
  connectionSummary,
  signInDraftReady,
  type SignInMode,
} from "./sign-in-model";

/**
 * The account sheet's account section: sign in or create an account, then
 * what sync is doing for it. Signing in is asking for sync, so a valid
 * credential connects straight away.
 */
export function AccountSection() {
  const availability = useAccountAvailability();
  const theme = useTheme();

  if (availability.kind === "loading") {
    return null;
  }
  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: theme.color("sidebar-foreground", 0.5) }]}>
        Account
      </Text>
      {availability.kind === "unavailable" ? (
        <Text
          style={[styles.detail, styles.inset, { color: theme.color("sidebar-foreground", 0.6) }]}
        >
          {availability.reason}
        </Text>
      ) : (
        <AccountBody runtime={availability.runtime} />
      )}
    </View>
  );
}

type BodyProps = {
  runtime: AccountRuntime;
};

function AccountBody({ runtime }: BodyProps) {
  const { account, sync } = useAccountState();
  if (account.kind === "signed-out") {
    return (
      <SignInForm
        runtime={runtime}
        busy={account.busy}
        failure={account.failure?.message ?? null}
      />
    );
  }
  return (
    <SignedIn
      runtime={runtime}
      summary={accountSummary(account.account)}
      connection={connectionSummary(account.connection, describeSyncStatus(sync))}
      warning={account.warning}
    />
  );
}

type SignInFormProps = {
  runtime: AccountRuntime;
  busy: boolean;
  failure: string | null;
};

function SignInForm({ runtime, busy, failure }: SignInFormProps) {
  const theme = useTheme();
  const [mode, setMode] = useState<SignInMode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState(false);
  useAnnouncement(failure);
  const ready = signInDraftReady({ mode, name, email, password }) && !busy;

  function submit(): void {
    if (!ready) return;
    const credentials = { email: email.trim(), password };
    const request =
      mode === "sign-in"
        ? runtime.signIn(credentials)
        : runtime.signUp({ ...credentials, name: name.trim() });
    request.catch((error: unknown) => console.error("sign-in failed", error));
  }

  return (
    <View style={[styles.form, styles.inset]}>
      <Text style={[styles.detail, { color: theme.color("sidebar-foreground", 0.6) }]}>
        Sign in to sync this device with your other Skriuw apps. Notes stay on this device either
        way.
      </Text>
      {mode === "sign-up" ? (
        <Field label="Name" value={name} onChangeText={setName} autoComplete="name" />
      ) : null}
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoComplete="email"
        keyboardType="email-address"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
        secure={!revealed}
        onSubmitEditing={submit}
        trailing={{
          label: revealed ? "Hide" : "Show",
          hint: revealed ? "Hides the password" : "Shows the password",
          onPress: () => setRevealed(!revealed),
        }}
      />
      {failure !== null ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[styles.detail, { color: theme.color("destructive") }]}
        >
          {failure}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready, busy }}
        disabled={!ready}
        onPress={submit}
        style={[
          styles.button,
          { backgroundColor: theme.color("primary"), opacity: ready ? 1 : 0.5 },
        ]}
      >
        {busy ? (
          <ActivityIndicator color={theme.color("primary-foreground")} />
        ) : (
          <Text style={[styles.buttonLabel, { color: theme.color("primary-foreground") }]}>
            {mode === "sign-in" ? "Sign in" : "Create account"}
          </Text>
        )}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
        style={styles.link}
      >
        <Text style={[styles.linkLabel, { color: theme.color("theme-accent-blue") }]}>
          {mode === "sign-in" ? "Create an account instead" : "I already have an account"}
        </Text>
      </Pressable>
    </View>
  );
}

type SignedInProps = {
  runtime: AccountRuntime;
  summary: { title: string; subtitle: string | null };
  connection: { summary: string; detail: string | null; retry: boolean; busy: boolean };
  warning: string | null;
};

function SignedIn({ runtime, summary, connection, warning }: SignedInProps) {
  const theme = useTheme();
  return (
    <View style={[styles.form, styles.inset]}>
      <View>
        <Text style={[styles.label, { color: theme.color("sidebar-foreground") }]}>
          {summary.title}
        </Text>
        {summary.subtitle !== null ? (
          <Text style={[styles.detail, { color: theme.color("sidebar-foreground", 0.5) }]}>
            {summary.subtitle}
          </Text>
        ) : null}
      </View>
      <View accessibilityLiveRegion="polite" style={styles.status}>
        {connection.busy ? (
          <ActivityIndicator size="small" color={theme.color("sidebar-foreground", 0.6)} />
        ) : null}
        <View style={styles.statusText}>
          <Text style={[styles.label, { color: theme.color("sidebar-foreground") }]}>
            {connection.summary}
          </Text>
          {connection.detail !== null ? (
            <Text style={[styles.detail, { color: theme.color("sidebar-foreground", 0.5) }]}>
              {connection.detail}
            </Text>
          ) : null}
        </View>
      </View>
      {warning !== null ? (
        <Text style={[styles.detail, { color: theme.color("destructive") }]}>{warning}</Text>
      ) : null}
      {connection.retry ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            runtime.retryConnection().catch((error: unknown) => console.error(error));
          }}
          style={[styles.button, { backgroundColor: theme.color("primary") }]}
        >
          <Text style={[styles.buttonLabel, { color: theme.color("primary-foreground") }]}>
            Retry sync
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Stops sync. Notes on this device are kept."
        onPress={() => {
          runtime.signOut().catch((error: unknown) => console.error(error));
        }}
        style={[styles.button, styles.outline, { borderColor: theme.color("sidebar-border") }]}
      >
        <Text style={[styles.buttonLabel, { color: theme.color("sidebar-foreground") }]}>
          Sign out
        </Text>
      </Pressable>
    </View>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  autoComplete: "name" | "email" | "current-password" | "new-password";
  keyboardType?: "default" | "email-address";
  secure?: boolean;
  onSubmitEditing?: () => void;
  trailing?: { label: string; hint: string; onPress: () => void };
};

const TEXT_CONTENT_TYPES = {
  name: "name",
  email: "username",
  "current-password": "password",
  "new-password": "newPassword",
} as const;

function Field({
  label,
  value,
  onChangeText,
  autoComplete,
  keyboardType = "default",
  secure = false,
  onSubmitEditing,
  trailing,
}: FieldProps) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.color("sidebar-foreground", 0.6) }]}>
        {label}
      </Text>
      <View style={styles.inputRow}>
        <TextInput
          accessibilityLabel={label}
          autoCapitalize={autoComplete === "name" ? "words" : "none"}
          autoComplete={autoComplete}
          autoCorrect={false}
          enterKeyHint={onSubmitEditing ? "go" : "next"}
          keyboardType={keyboardType}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmitEditing}
          secureTextEntry={secure}
          spellCheck={false}
          textContentType={TEXT_CONTENT_TYPES[autoComplete]}
          style={[
            styles.input,
            trailing ? styles.inputWithTrailing : null,
            {
              backgroundColor: theme.color("muted"),
              borderColor: theme.color("border"),
              color: theme.color("foreground"),
            },
          ]}
          value={value}
        />
        {trailing ? (
          <Pressable
            accessibilityHint={trailing.hint}
            accessibilityRole="button"
            hitSlop={8}
            onPress={trailing.onPress}
            style={styles.trailing}
          >
            <Text style={[styles.linkLabel, { color: theme.color("theme-accent-blue") }]}>
              {trailing.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingTop: 8,
  },
  heading: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 11,
    fontWeight: "600",
  },
  inset: {
    paddingHorizontal: 14,
  },
  form: {
    gap: 12,
    paddingBottom: 8,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
  },
  inputRow: {
    justifyContent: "center",
  },
  inputWithTrailing: {
    paddingRight: 64,
  },
  trailing: {
    position: "absolute",
    right: 0,
    minHeight: MINIMUM_TOUCH_TARGET,
    minWidth: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    minHeight: MINIMUM_TOUCH_TARGET,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  label: {
    fontSize: 15,
  },
  detail: {
    fontSize: 12,
  },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  statusText: {
    flex: 1,
    minWidth: 0,
  },
  button: {
    minHeight: MINIMUM_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 16,
  },
  outline: {
    borderWidth: 1,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  link: {
    minHeight: MINIMUM_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  linkLabel: {
    fontSize: 14,
  },
});
