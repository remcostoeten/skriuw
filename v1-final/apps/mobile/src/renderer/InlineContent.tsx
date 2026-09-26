// Renders a run of BlockNote inline content: styled text, links, and the
// Skriuw custom chips (#tag, [[wikilink]], $person, @user).
import { Fragment } from "react";
import { Linking, Text, type StyleProp, type TextStyle } from "react-native";
import { useTheme } from "@/theme/theme-provider";
import { fonts } from "@/theme/fonts";
import type { TTheme } from "@/theme/tokens";
import type { InlineContent as Inline, InlineStyles } from "@/domain/rich-document";

function styleToRN(styles?: InlineStyles): StyleProp<TextStyle> {
	if (!styles) return undefined;
	return {
		fontWeight: styles.bold ? "700" : undefined,
		fontStyle: styles.italic ? "italic" : undefined,
		textDecorationLine: styles.underline
			? "underline"
			: styles.strike
				? "line-through"
				: undefined,
		color: styles.textColor,
		backgroundColor: styles.backgroundColor,
		fontFamily: styles.code ? fonts.mono : undefined,
	};
}

type Props = {
	content: Inline[];
	baseStyle?: StyleProp<TextStyle>;
	onNavigateNote?: (noteId: string) => void;
};

export function InlineContent({ content, baseStyle, onNavigateNote }: Props) {
	const { theme } = useTheme();
	return (
		<Text style={baseStyle}>
			{content.map((node, i) => (
				<Fragment key={i}>{renderNode(node, theme, onNavigateNote)}</Fragment>
			))}
		</Text>
	);
}

function renderNode(node: Inline, theme: TTheme, onNavigateNote?: (id: string) => void) {
	switch (node.type) {
		case "text":
			return <Text style={styleToRN(node.styles)}>{node.text}</Text>;

		case "link":
			return (
				<Text
					style={{ color: theme.link, textDecorationLine: "underline" }}
					onPress={() => Linking.openURL(node.href).catch(() => {})}
				>
					{node.content.map((c) => c.text).join("")}
				</Text>
			);

		case "noteLink":
			return (
				<Text
					style={{ color: theme.noteLink }}
					onPress={() => onNavigateNote?.(node.props.noteId)}
				>
					{node.props.alias ?? node.props.title}
				</Text>
			);

		case "tag":
			return (
				<Text style={{ color: node.props.color ?? theme.tag }}>
					{"#"}
					{node.props.tag}
				</Text>
			);

		case "person":
			return <Text style={{ color: theme.person }}>${node.props.name}</Text>;

		case "user":
			return <Text style={{ color: theme.person }}>@{node.props.username}</Text>;

		default:
			// Forward-compatible: unknown inline types render nothing rather than crash.
			return null;
	}
}
