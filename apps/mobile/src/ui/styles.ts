import { StyleSheet } from "react-native";

export const palette = {
  canvas: "#f6f2ea",
  canvasStrong: "#efe8db",
  surface: "#fbf7f1",
  border: "#eadfce",
  text: "#201914",
  textMuted: "#6a5a4b",
  accent: "#bc5b2c",
  accentSoft: "#f3d3bf",
  danger: "#b24b43",
} as const;

export const commonStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.canvas,
  },
  scrollContent: {
    padding: 20,
    gap: 18,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 18,
    gap: 12,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: palette.accent,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
    color: palette.text,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: palette.textMuted,
  },
  button: {
    minHeight: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    backgroundColor: palette.accent,
  },
  buttonSecondary: {
    minHeight: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    backgroundColor: palette.accentSoft,
  },
  buttonDanger: {
    minHeight: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    backgroundColor: "#f3d0cd",
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff7ef",
  },
  buttonLabelSecondary: {
    fontSize: 15,
    fontWeight: "700",
    color: palette.accent,
  },
  buttonLabelDanger: {
    fontSize: 15,
    fontWeight: "700",
    color: palette.danger,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#fffdfa",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: palette.text,
  },
  textArea: {
    minHeight: 180,
    textAlignVertical: "top",
  },
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  rowWrap: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: palette.accentSoft,
    alignSelf: "flex-start",
  },
  chipLabel: {
    color: palette.accent,
    fontSize: 13,
    fontWeight: "600",
  },
});
