import { FileText } from "lucide-react";
import { getNoteTitle } from "@/domain/notes/note-links";
import type { NoteFile } from "@/types/notes";

type Props = {
	files: NoteFile[];
	activeFileId?: string;
	onSelect: (file: NoteFile) => void;
};

export function NoteLinkMenuList({ files, activeFileId, onSelect }: Props) {
	const noteItems = files.filter((file) => file.id !== activeFileId).slice(0, 12);

	if (noteItems.length === 0) {
		return <p className="px-3 py-2 text-xs text-muted-foreground">No other notes available.</p>;
	}

	return (
		<div className="max-h-64 min-w-56 overflow-y-auto p-1">
			{noteItems.map((file) => (
				<button
					key={file.id}
					type="button"
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => onSelect(file)}
					className="flex min-h-8 w-full items-center gap-2 rounded-[4px] px-2 text-left text-xs text-foreground/82 transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:outline-none"
				>
					<FileText
						className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
						strokeWidth={1.6}
					/>
					<span className="min-w-0 flex-1 truncate">{getNoteTitle(file)}</span>
				</button>
			))}
		</div>
	);
}
