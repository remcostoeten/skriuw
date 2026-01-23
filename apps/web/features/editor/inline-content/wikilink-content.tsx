import { createReactInlineContentSpec } from "@blocknote/react";
import { useRouter } from "next/navigation";
import { useNotesContext } from "@/features/notes/context/notes-context";
import { useNoteSlug } from "@/features/notes/hooks/use-note-slug";
import { notify } from "@/lib/notify";

// Separate component to use hooks
const WikiLinkComponent = ({ noteName, noteId }: { noteName: string, noteId: string }) => {
    const router = useRouter();
    const { items, createNote } = useNotesContext(); // Access context to get slugs/urls and createNote
    const { getNoteUrl } = useNoteSlug(items);

    const handleClick = async (e: React.MouseEvent | React.KeyboardEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (noteId) {
            const url = getNoteUrl(noteId);
            router.push(url);
        } else {
            // Logic for missing note (create new)
            try {
                notify(`Creating note "${noteName}"...`).duration(2000);
                const newNote = await createNote(noteName);
                if (newNote) {
                    const url = getNoteUrl(newNote.id);
                    router.push(url);
                    notify(`Created "${noteName}"`);
                }
            } catch (error) {
                console.error("Failed to create note from wikilink", error);
                notify("Failed to create note");
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            handleClick(e);
        }
    };

    return (
        <span
            className="wikilink-chip text-primary underline decoration-dotted cursor-pointer hover:bg-muted/50 rounded px-1 transition-colors"
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            tabIndex={0}
            role="link"
            title={`Go to ${noteName}`}
        >
            [[{noteName}]]
        </span>
    );
};

export const WikiLink = createReactInlineContentSpec(
    {
        type: "wikilink",
        propSchema: {
            noteName: {
                default: "Untitled",
            },
            noteId: {
                default: "",
            },
        },
        content: "none",
    },
    {
        render: (props) => (
            <WikiLinkComponent
                noteName={props.inlineContent.props.noteName}
                noteId={props.inlineContent.props.noteId}
            />
        ),
    }
);
