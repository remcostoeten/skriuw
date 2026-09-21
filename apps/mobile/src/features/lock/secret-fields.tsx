import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MINIMUM_TOUCH_TARGET } from "../../shell/metrics";
import { useTheme } from "../../shell/theme";
import { secretNoun, type SecretDraft } from "./lock-model";
import type { NoteLockKind } from "./port";

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secure?: boolean;
  numeric?: boolean;
  autoFocus?: boolean;
  monospace?: boolean;
  placeholder?: string;
  describedBy?: string | null;
};

/**
 * One labelled field. The label is a real `Text` bound by `accessibilityLabel`
 * rather than a placeholder, so VoiceOver and TalkBack announce it after the
 * field has been typed into (R-Q2).
 */
export function LockField({
  label,
  value,
  onChangeText,
  secure = false,
  numeric = false,
  autoFocus = false,
  monospace = false,
  placeholder,
  describedBy = null,
}: FieldProps) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.color("muted-foreground") }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={describedBy ?? undefined}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        keyboardType={numeric ? "number-pad" : "default"}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.color("muted-foreground", 0.6)}
        secureTextEntry={secure}
        spellCheck={false}
        style={[
          styles.input,
          monospace && styles.monospace,
          {
            backgroundColor: theme.color("muted"),
            borderColor: theme.color("border"),
            color: theme.color("foreground"),
          },
        ]}
        value={value}
      />
    </View>
  );
}

type KindProps = {
  value: NoteLockKind;
  onChange: (kind: NoteLockKind) => void;
};

const KINDS: readonly { kind: NoteLockKind; label: string }[] = [
  { kind: "pin", label: "PIN" },
  { kind: "passphrase", label: "Passphrase" },
];

function KindChoice({ value, onChange }: KindProps) {
  const theme = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Lock type" style={styles.kinds}>
      {KINDS.map((option) => {
        const selected = value === option.kind;
        return (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            key={option.kind}
            onPress={() => onChange(option.kind)}
            style={[
              styles.kind,
              {
                backgroundColor: selected ? theme.color("theme-accent-blue", 0.16) : "transparent",
                borderColor: selected ? theme.color("theme-accent-blue") : theme.color("border"),
              },
            ]}
          >
            <Text style={{ color: theme.color("foreground"), fontSize: 15 }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type Props = {
  value: SecretDraft;
  onChange: (value: SecretDraft) => void;
  showKind?: boolean;
  autoFocus?: boolean;
};

/**
 * The secret form shared by setup, change and recovery, so all three refuse
 * the same inputs and ask for a repeat and an optional hint in one order.
 */
export function SecretFields({ value, onChange, showKind = true, autoFocus = true }: Props) {
  const noun = secretNoun(value.kind);
  const isPin = value.kind === "pin";
  return (
    <>
      {showKind && (
        <KindChoice
          value={value.kind}
          onChange={(kind) => onChange({ ...value, kind, secret: "", confirm: "" })}
        />
      )}
      <LockField
        autoFocus={autoFocus}
        label={isPin ? "PIN (at least 4 digits)" : "Passphrase (at least 6 characters)"}
        numeric={isPin}
        onChangeText={(secret) => onChange({ ...value, secret })}
        secure
        value={value.secret}
      />
      <LockField
        label={`Repeat the ${noun}`}
        numeric={isPin}
        onChangeText={(confirm) => onChange({ ...value, confirm })}
        secure
        value={value.confirm}
      />
      <LockField
        label="Hint (optional, shown after a wrong attempt)"
        onChangeText={(hint) => onChange({ ...value, hint })}
        value={value.hint}
      />
    </>
  );
}

type ErrorProps = { children: string };

export function LockError({ children }: ErrorProps) {
  const theme = useTheme();
  return (
    <Text
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[styles.error, { color: theme.color("destructive") }]}
    >
      {children}
    </Text>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
};

export function LockButton({ label, onPress, primary = false, disabled = false }: ButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        {
          backgroundColor: primary ? theme.color("theme-accent-blue") : theme.color("muted"),
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          { color: primary ? theme.color("primary-foreground") : theme.color("foreground") },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  field: {
    gap: 6,
  },
  label: {
    fontSize: 12,
  },
  input: {
    minHeight: MINIMUM_TOUCH_TARGET,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  monospace: {
    fontFamily: "Courier",
    letterSpacing: 1.5,
  },
  kinds: {
    flexDirection: "row",
    gap: 10,
  },
  kind: {
    minHeight: MINIMUM_TOUCH_TARGET,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
  },
  error: {
    fontSize: 13,
  },
  button: {
    minHeight: MINIMUM_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 16,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
});
