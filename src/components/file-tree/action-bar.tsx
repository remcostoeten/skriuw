import { useCreateFolder } from "@/modules/folders/api/mutations/create";
import { useCreateNote } from "@/modules/notes/api/mutations/create";
import { useSidebarSearch } from "@/modules/search/hooks/use-sidebar-search";
import { BaseActionBar } from "@/shared/components/base-action-bar";
import { FilePlus, FolderPlus } from "lucide-react";

type props = {
    isExpanded: boolean;
    onExpandToggle: () => void;
}

export function ActionBar({
    isExpanded,
    onExpandToggle,
}: props) {
    const { createNote } = useCreateNote();
    const { createFolder } = useCreateFolder();
    const { searchState } = useSidebarSearch();

    const handleNewNote = async () => {
        try {
            await createNote({
                title: "Untitled Note",
                content: "",
                position: Date.now(),
            });
        } catch (error) {
            console.error("Failed to create note:", error);
        }
    };

    const handleNewFolder = async () => {
        try {
            await createFolder(undefined);
        } catch (error) {
            console.error("Failed to create folder:", error);
        }
    };

    return (
        <BaseActionBar
            buttons={[
                {
                    icon: <FilePlus className="w-[18px] h-[18px]" />,
                    tooltip: "New File",
                    onClick: handleNewNote,
                },
                {
                    icon: <FolderPlus className="w-[18px] h-[18px]" />,
                    tooltip: "New Folder",
                    onClick: handleNewFolder,
                },
            ]}
            searchConfig={{
                query: searchState.query,
                setQuery: searchState.setQuery,
                close: () => {
                    searchState.close();
                },
                toggle: () => {
                    searchState.toggle();
                },
                updateOptions: searchState.updateOptions,
            }}
            expandConfig={{
                isExpanded,
                onToggle: onExpandToggle,
            }}
        />
    );
}
