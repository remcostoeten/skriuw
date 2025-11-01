import { useCreateFolder } from "@/modules/folders/api/mutations/create";
import { useCreateNote } from "@/modules/notes/api/mutations/create";
import { useSidebarSearch } from "@/modules/search/hooks/use-sidebar-search";
import { BaseActionBar } from "@/shared/components/base-action-bar";
import { FilePlus, FolderPlus } from "lucide-react";
import { useCallback, useMemo } from "react";

type props = {
    isExpanded: boolean;
    onExpandToggle: () => void;
    onNoteCreate?: (noteId: string) => void;
}

export function ActionBar({
    isExpanded,
    onExpandToggle,
    onNoteCreate,
}: props) {
    const { createNote } = useCreateNote();
    const { createFolder } = useCreateFolder();
    const { searchState } = useSidebarSearch();

    const handleNewNote = useCallback(async () => {
        try {
            const note = await createNote({
                title: "Untitled Note",
                content: "",
                position: Date.now(),
            });
            onNoteCreate?.(note.id);
        } catch (error) {
            console.error("Failed to create note:", error);
        }
    }, [createNote, onNoteCreate]);

    const handleNewFolder = useCallback(async () => {
        try {
            await createFolder(undefined);
        } catch (error) {
            console.error("Failed to create folder:", error);
        }
    }, [createFolder]);

    const filePlusIcon = useMemo(() => <FilePlus />, []);
    const folderPlusIcon = useMemo(() => <FolderPlus />, []);

    const buttons = useMemo(() => [
        {
            icon: filePlusIcon,
            tooltip: "New File",
            onClick: handleNewNote,
        },
        {
            icon: folderPlusIcon,
            tooltip: "New Folder",
            onClick: handleNewFolder,
        },
    ], [handleNewNote, handleNewFolder, filePlusIcon, folderPlusIcon]);

    const searchConfig = useMemo(() => ({
        query: searchState.query,
        setQuery: searchState.setQuery,
        close: searchState.close,
        toggle: searchState.toggle,
        updateOptions: searchState.updateOptions,
    }), [searchState.query, searchState.setQuery, searchState.close, searchState.toggle, searchState.updateOptions]);

    const expandConfig = useMemo(() => ({
        isExpanded,
        onToggle: onExpandToggle,
    }), [isExpanded, onExpandToggle]);

    return (
        <BaseActionBar
            buttons={buttons}
            searchConfig={searchConfig}
            expandConfig={expandConfig}
        />
    );
}
