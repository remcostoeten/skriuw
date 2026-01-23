import { PreviewProps } from "../types";
import dynamic from "next/dynamic";

// Dynamically import BlockNote to prevent SSR issues
// ProseMirror plugins cause "Duplicate use of selection JSON ID" errors during SSR
const BlockNotePreviewContent = dynamic(() => import('./blocknote-preview-content'), {
	ssr: false,
	loading: () => (
		<div className='mt-3 rounded-md overflow-hidden border border-border'>
			<div className='text-xs text-muted-foreground px-3 py-1.5 bg-muted/50 border-b border-border flex items-center justify-between'>
				<span>BlockNote Editor Preview</span>
			</div>
			<div className='h-[200px] flex items-center justify-center text-muted-foreground'>
				Loading preview...
			</div>
		</div>
	)
})

export default function BlockNotePreview({ value }: PreviewProps<boolean>) {
	return <BlockNotePreviewContent value={value} />
}
