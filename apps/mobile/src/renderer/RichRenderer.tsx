// Top-level native renderer: BlockNote richContent JSON -> RN views.
// Flattens the block tree and renders with FlashList for large notes.
import { useMemo } from "react";
import { FlashList } from "@shopify/flash-list";
import { flattenBlocks, type FlatBlock, type RichDocument } from "@/domain/rich-document";
import { BlockView } from "@/renderer/BlockView";

type Props = {
	document: RichDocument;
	onToggleCheck?: (blockId: string, checked: boolean) => void;
	onNavigateNote?: (noteId: string) => void;
	ListHeaderComponent?: React.ComponentType | React.ReactElement | null;
};

export function RichRenderer({
	document,
	onToggleCheck,
	onNavigateNote,
	ListHeaderComponent,
}: Props) {
	const data = useMemo<FlatBlock[]>(() => flattenBlocks(document), [document]);

	return (
		<FlashList
			data={data}
			estimatedItemSize={44}
			keyExtractor={(item, index) => item.block?.id ?? `block-${index}`}
			ListHeaderComponent={ListHeaderComponent}
			contentContainerStyle={{ padding: 16 }}
			renderItem={({ item }) => (
				<BlockView
					block={item.block}
					depth={item.depth}
					onToggleCheck={onToggleCheck}
					onNavigateNote={onNavigateNote}
				/>
			)}
		/>
	);
}
