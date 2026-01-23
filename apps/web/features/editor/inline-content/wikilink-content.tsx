import { createReactInlineContentSpec } from "@blocknote/react";
import { useRouter } from "next/navigation";
import { useNotesContext } from "@/features/notes/context/notes-context";
import { useNoteSlug } from "@/features/notes/hooks/use-note-slug";

// Separate component to use hooks
const WikiLinkComponent = ({ noteName, noteId }: { noteName: string, noteId: string }) => {
    const router = useRouter();
    const { items } = useNotesContext(); // Access context to get slugs/urls
    const { getNoteUrl } = useNoteSlug(items);

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (noteId) {
            const url = getNoteUrl(noteId);
            router.push(url);
        } else {
            // Fallback or "create new" logic could go here if we tracked missing notes
            console.warn("WikiLink clicked without noteId");
        }
    };

    return (
        <span
            className="wikilink-chip text-primary underline decoration-dotted cursor-pointer hover:bg-muted/50 rounded px-1 transition-colors"
            onClick={handleClick}
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
