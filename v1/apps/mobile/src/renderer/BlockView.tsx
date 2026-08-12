// Renders a single BlockNote block natively. Every block type the notes MVP
// supports is handled here; anything unrecognised falls through to a labeled
// fallback so future block types never crash an older app build.
import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/theme/theme-provider";
import { fonts } from "@/theme/fonts";
import { InlineContent } from "@/renderer/InlineContent";
import {
	inlineToPlainText,
	type Block,
	type InlineContent as Inline,
	type TableContent,
} from "@/domain/rich-document";

type Props = {
	block: Block;
	depth: number;
	onToggleCheck?: (blockId: string, checked: boolean) => void;
	onNavigateNote?: (noteId: string) => void;
};

const INDENT = 16;

function asInline(content: Block["content"]): Inline[] {
	return Array.isArray(content) ? content : [];
}

export function BlockView({ block, depth, onToggleCheck, onNavigateNote }: Props) {
	const { theme } = useTheme();
	const indent = { paddingLeft: depth * INDENT };

	switch (block.type) {
		case "heading": {
			const level = block.props?.level ?? 1;
			const size = level === 1 ? 26 : level === 2 ? 21 : 18;
			return (
				<View style={[{ marginTop: 18, marginBottom: 6 }, indent]}>
					<InlineContent
						content={asInline(block.content)}
						baseStyle={{ color: theme.foreground, fontSize: size, fontWeight: "700" }}
						onNavigateNote={onNavigateNote}
					/>
				</View>
			);
		}

		case "paragraph":
			return (
				<View style={[{ marginVertical: 6 }, indent]}>
					<InlineContent
						content={asInline(block.content)}
						baseStyle={{ color: theme.foreground, fontSize: 16, lineHeight: 24 }}
						onNavigateNote={onNavigateNote}
					/>
				</View>
			);

		case "bulletListItem":
			return (
				<View style={[{ flexDirection: "row", marginVertical: 3 }, indent]}>
					<Text style={{ color: theme.mutedForeground, fontSize: 16, width: 18 }}>
						{"\u2022"}
					</Text>
					<InlineContent
						content={asInline(block.content)}
						baseStyle={{
							color: theme.foreground,
							fontSize: 16,
							lineHeight: 24,
							flex: 1,
						}}
						onNavigateNote={onNavigateNote}
					/>
				</View>
			);

		case "numberedListItem":
			return (
				<View style={[{ flexDirection: "row", marginVertical: 3 }, indent]}>
					<Text style={{ color: theme.mutedForeground, fontSize: 16, width: 22 }}>
						{(block.props?.index as number | undefined) ?? "1"}.
					</Text>
					<InlineContent
						content={asInline(block.content)}
						baseStyle={{
							color: theme.foreground,
							fontSize: 16,
							lineHeight: 24,
							flex: 1,
						}}
						onNavigateNote={onNavigateNote}
					/>
				</View>
			);

		case "checkListItem": {
			const checked = Boolean(block.props?.checked);
			return (
				<Pressable
					accessibilityRole="checkbox"
					accessibilityState={{ checked }}
					onPress={() => onToggleCheck?.(block.id, !checked)}
					style={[
						{ flexDirection: "row", alignItems: "flex-start", marginVertical: 3 },
						indent,
					]}
				>
					<View
						style={{
							width: 18,
							height: 18,
							borderRadius: 4,
							borderWidth: 1.5,
							borderColor: checked ? theme.success : theme.border,
							backgroundColor: checked ? theme.success : "transparent",
							marginRight: 8,
							marginTop: 3,
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						{checked ? (
							<Text style={{ color: theme.background, fontSize: 12 }}>
								{"\u2713"}
							</Text>
						) : null}
					</View>
					<InlineContent
						content={asInline(block.content)}
						baseStyle={{
							color: checked ? theme.mutedForeground : theme.foreground,
							fontSize: 16,
							lineHeight: 24,
							flex: 1,
							textDecorationLine: checked ? "line-through" : "none",
						}}
						onNavigateNote={onNavigateNote}
					/>
				</Pressable>
			);
		}

		case "quote":
			return (
				<View
					style={[
						{
							borderLeftWidth: 3,
							borderLeftColor: theme.border,
							paddingLeft: 12,
							marginVertical: 8,
						},
						indent,
					]}
				>
					<InlineContent
						content={asInline(block.content)}
						baseStyle={{
							color: theme.mutedForeground,
							fontSize: 16,
							fontStyle: "italic",
							lineHeight: 24,
						}}
						onNavigateNote={onNavigateNote}
					/>
				</View>
			);

		case "codeBlock":
		case "procode":
			return (
				<View
					style={[
						{
							backgroundColor: theme.bgDeep,
							borderRadius: 8,
							borderWidth: 1,
							borderColor: theme.border,
							padding: 12,
							marginVertical: 8,
						},
						indent,
					]}
				>
					{block.props?.language ? (
						<Text
							style={{ color: theme.mutedForeground, fontSize: 11, marginBottom: 6 }}
						>
							{String(block.props.language)}
						</Text>
					) : null}
					<Text
						style={{
							color: theme.foreground,
							fontFamily: fonts.mono,
							fontSize: 13,
							lineHeight: 20,
						}}
					>
						{inlineToPlainText(block.content)}
					</Text>
				</View>
			);

		case "table":
			return <TableView content={block.content as TableContent} indent={indent} />;

		case "image":
			// Render-only in MVP (no upload). Show caption/url as a placeholder line.
			return (
				<View style={[{ marginVertical: 8 }, indent]}>
					<Text style={{ color: theme.mutedForeground, fontSize: 13 }}>
						{"\uD83D\uDDBC "}
						{block.props?.caption || block.props?.url || "image"}
					</Text>
				</View>
			);

		case "diagram":
		case "fileTree":
			// Degrade path: render the raw source as a labeled code fence.
			return (
				<View
					style={[
						{
							backgroundColor: theme.bgDeep,
							borderRadius: 8,
							borderWidth: 1,
							borderColor: theme.border,
							padding: 12,
							marginVertical: 8,
						},
						indent,
					]}
				>
					<Text style={{ color: theme.warning, fontSize: 11, marginBottom: 6 }}>
						{block.type}
					</Text>
					<Text style={{ color: theme.foreground, fontFamily: fonts.mono, fontSize: 12 }}>
						{inlineToPlainText(block.content) || "(preview unavailable)"}
					</Text>
				</View>
			);

		default:
			// Forward-compatible fallback for unknown block types.
			return (
				<View style={[{ marginVertical: 6 }, indent]}>
					<Text style={{ color: theme.mutedForeground, fontSize: 14 }}>
						{inlineToPlainText(block.content) || `[${block.type}]`}
					</Text>
				</View>
			);
	}
}

function TableView({
	content,
	indent,
}: {
	content: TableContent;
	indent: { paddingLeft: number };
}) {
	const { theme } = useTheme();
	if (!content || content.type !== "tableContent") return null;
	return (
		<View
			style={[
				{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, marginVertical: 8 },
				indent,
			]}
		>
			{content.rows.map((row, r) => (
				<View
					key={r}
					style={{
						flexDirection: "row",
						borderBottomWidth: r < content.rows.length - 1 ? 1 : 0,
						borderBottomColor: theme.border,
					}}
				>
					{row.cells.map((cell, c) => (
						<View
							key={c}
							style={{
								flex: 1,
								padding: 8,
								borderRightWidth: c < row.cells.length - 1 ? 1 : 0,
								borderRightColor: theme.border,
							}}
						>
							<InlineContent
								content={cell.content}
								baseStyle={{ color: theme.foreground, fontSize: 14 }}
							/>
						</View>
					))}
				</View>
			))}
		</View>
	);
}
