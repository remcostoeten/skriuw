import { View, type ViewStyle } from "react-native";
import type { ShellIconName } from "./destinations";

type Props = {
  name: ShellIconName;
  color: string;
  size?: number;
};

type Part = ViewStyle;

/**
 * The shell's glyphs, drawn from views. The desktop rail uses an SVG registry
 * (`apps/workspace/src/shared/icons`); React Native has no SVG runtime in this build, so
 * each glyph is composed from the primitives that are always available and
 * scales from the box it is given.
 */
export function ShellIcon({ name, color, size = 20 }: Props) {
  const parts = glyph(name, size, color);
  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      style={{ width: size, height: size }}
    >
      {parts.map((part, index) => (
        <View key={index} style={[{ position: "absolute" }, part]} />
      ))}
    </View>
  );
}

function glyph(name: ShellIconName, size: number, color: string): Part[] {
  const stroke = Math.max(1, Math.round(size / 13));
  const unit = size / 20;
  const outline: Part = { borderColor: color, borderWidth: stroke };

  switch (name) {
    case "notes":
      return [
        { ...outline, left: 3 * unit, top: 2 * unit, width: 14 * unit, height: 16 * unit, borderRadius: 3 * unit },
        { left: 6 * unit, top: 6 * unit, width: 8 * unit, height: stroke, backgroundColor: color },
        { left: 6 * unit, top: 9.5 * unit, width: 8 * unit, height: stroke, backgroundColor: color },
        { left: 6 * unit, top: 13 * unit, width: 5 * unit, height: stroke, backgroundColor: color },
      ];
    case "journal":
      return [
        { ...outline, left: 2.5 * unit, top: 4 * unit, width: 15 * unit, height: 14 * unit, borderRadius: 3 * unit },
        { left: 2.5 * unit, top: 7.5 * unit, width: 15 * unit, height: stroke, backgroundColor: color },
        { left: 6 * unit, top: 1.5 * unit, width: stroke, height: 4 * unit, backgroundColor: color },
        { left: 14 * unit, top: 1.5 * unit, width: stroke, height: 4 * unit, backgroundColor: color },
        { left: 9 * unit, top: 11 * unit, width: 2.5 * unit, height: 2.5 * unit, borderRadius: 1.5 * unit, backgroundColor: color },
      ];
    case "tasks":
      return [
        { ...outline, left: 2.5 * unit, top: 2.5 * unit, width: 15 * unit, height: 15 * unit, borderRadius: 4 * unit },
        { left: 6 * unit, top: 10.5 * unit, width: 4 * unit, height: stroke, backgroundColor: color, transform: [{ rotate: "45deg" }] },
        { left: 8.5 * unit, top: 9 * unit, width: 7 * unit, height: stroke, backgroundColor: color, transform: [{ rotate: "-45deg" }] },
      ];
    case "tags":
      return [
        { ...outline, left: 3.5 * unit, top: 3.5 * unit, width: 13 * unit, height: 13 * unit, borderRadius: 2 * unit, transform: [{ rotate: "45deg" }] },
        { left: 7 * unit, top: 7 * unit, width: 3 * unit, height: 3 * unit, borderRadius: 2 * unit, backgroundColor: color },
      ];
    case "people":
      return [
        { ...outline, left: 6.5 * unit, top: 2.5 * unit, width: 7 * unit, height: 7 * unit, borderRadius: 4 * unit },
        { ...outline, left: 3 * unit, top: 12 * unit, width: 14 * unit, height: 10 * unit, borderRadius: 7 * unit },
      ];
    case "trash":
      return [
        { left: 3 * unit, top: 5 * unit, width: 14 * unit, height: stroke, backgroundColor: color },
        { left: 8 * unit, top: 2.5 * unit, width: 4 * unit, height: stroke, backgroundColor: color },
        { ...outline, left: 5 * unit, top: 7 * unit, width: 10 * unit, height: 11 * unit, borderRadius: 2 * unit },
        { left: 9.5 * unit, top: 9.5 * unit, width: stroke, height: 6 * unit, backgroundColor: color },
      ];
    case "account":
      return [
        { ...outline, left: 2 * unit, top: 2 * unit, width: 16 * unit, height: 16 * unit, borderRadius: 8 * unit },
        { left: 7.5 * unit, top: 5.5 * unit, width: 5 * unit, height: 5 * unit, borderRadius: 3 * unit, backgroundColor: color },
        { left: 4.5 * unit, top: 13 * unit, width: 11 * unit, height: 6 * unit, borderRadius: 5.5 * unit, backgroundColor: color },
      ];
    case "search":
      return [
        { ...outline, left: 2.5 * unit, top: 2.5 * unit, width: 11 * unit, height: 11 * unit, borderRadius: 5.5 * unit },
        { left: 11.5 * unit, top: 13.5 * unit, width: 6 * unit, height: stroke, backgroundColor: color, transform: [{ rotate: "45deg" }] },
      ];
    case "menu":
      return [
        { left: 3 * unit, top: 5 * unit, width: 14 * unit, height: stroke, backgroundColor: color },
        { left: 3 * unit, top: 9.5 * unit, width: 14 * unit, height: stroke, backgroundColor: color },
        { left: 3 * unit, top: 14 * unit, width: 14 * unit, height: stroke, backgroundColor: color },
      ];
    case "close":
      return [
        { left: 3 * unit, top: 9.5 * unit, width: 14 * unit, height: stroke, backgroundColor: color, transform: [{ rotate: "45deg" }] },
        { left: 3 * unit, top: 9.5 * unit, width: 14 * unit, height: stroke, backgroundColor: color, transform: [{ rotate: "-45deg" }] },
      ];
    case "plus":
      return [
        { left: 3.5 * unit, top: 9.5 * unit, width: 13 * unit, height: stroke, backgroundColor: color },
        { left: 9.5 * unit, top: 3.5 * unit, width: stroke, height: 13 * unit, backgroundColor: color },
      ];
    case "folder":
      return [
        { left: 2.5 * unit, top: 3.5 * unit, width: 7 * unit, height: 2.5 * unit, borderTopLeftRadius: 2 * unit, borderTopRightRadius: 2 * unit, backgroundColor: color },
        { ...outline, left: 2.5 * unit, top: 5.5 * unit, width: 15 * unit, height: 11 * unit, borderRadius: 2.5 * unit },
      ];
    case "chevron":
      return [
        {
          left: 6 * unit,
          top: 6 * unit,
          width: 7 * unit,
          height: 7 * unit,
          borderColor: color,
          borderTopWidth: stroke,
          borderRightWidth: stroke,
          transform: [{ rotate: "45deg" }],
        },
      ];
    case "pin":
      return [
        { left: 7 * unit, top: 2.5 * unit, width: 6 * unit, height: 6 * unit, borderRadius: 3 * unit, backgroundColor: color },
        { left: 9.5 * unit, top: 8 * unit, width: stroke, height: 9 * unit, backgroundColor: color },
      ];
  }
}
