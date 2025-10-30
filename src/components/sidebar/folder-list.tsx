import { highlightText, matchesSearch } from '@/lib/search-utils';

type TransformedFolder = {
    id: string;
    name: string;
    count: number;
    path: string;
    originalFolder?: any;
};

type Props = {
    folders: TransformedFolder[];
    searchQuery: string;
    searchOptions: { caseSensitive: boolean; wholeWord: boolean };
    onFolderClick?: (folder: any) => void;
};

export function FolderList({ folders, searchQuery, searchOptions, onFolderClick }: Props) {
    const filtered = folders.filter(f => matchesSearch(f.name, searchQuery, searchOptions));

    return (
        <div className="overflow-y-auto">
            {filtered.map((f) => (
                <button
                    key={f.id}
                    onClick={() => onFolderClick?.(f)}
                    className="font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring hover:bg-accent rounded-md px-3 text-xs active:scale-[98%] h-7 w-full text-secondary-foreground/80 hover:text-foreground transition-all flex items-center justify-between"
                >
                    <span
                        className="text-xs truncate"
                        dangerouslySetInnerHTML={{ __html: highlightText(f.name, searchQuery, searchOptions) }}
                    />
                    <span className="text-xs text-foreground/40">{f.count}</span>
                </button>
            ))}
        </div>
    );
}


