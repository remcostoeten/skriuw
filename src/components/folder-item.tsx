import { highlightText } from '@/lib/search-utils';
import type { SearchOptions } from '@/hooks/use-search';

type FolderItem = {
  id: string;
  name: string;
  count: number;
  path: string;
};

type FolderItemProps = {
  folder: FolderItem;
  searchQuery: string;
  searchOptions: SearchOptions;
  isHighlighted: boolean;
  onClick?: (folder: FolderItem) => void;
};

export function FolderItem({
  folder,
  searchQuery,
  searchOptions,
  isHighlighted,
  onClick
}: FolderItemProps) {
  const highlightedName = highlightText(folder.name, searchQuery, searchOptions);

  return (
    <button
      className={`font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring hover:bg-accent rounded-md px-3 text-xs active:scale-[98%] h-7 w-full fill-muted-foreground hover:fill-foreground text-secondary-foreground/80 hover:text-foreground transition-all flex items-center justify-between ${isHighlighted ? 'ring-2 ring-yellow-400 dark:ring-yellow-600' : ''}`}
      onClick={() => onClick?.(folder)}
    >
      <div className="flex items-center w-[calc(100%-20px)] gap-2">
        <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" clipRule="evenodd" d="M7.59655 2.20712C7.10136 1.9989 6.56115 1.99943 5.9023 2.00007L4.40479 2.00015C3.57853 2.00013 2.88271 2.0001 2.32874 2.07318C1.74135 2.15066 1.20072 2.32242 0.764844 2.75008C0.328798 3.1779 0.153514 3.70882 0.0744639 4.28569C-4.74114e-05 4.82945 -2.52828e-05 5.51233 9.81743e-07 6.32281V11.8675C-1.65965e-05 13.1029 -3.08677e-05 14.1058 0.108284 14.8963C0.221156 15.72 0.464085 16.4241 1.03541 16.9846C1.60656 17.545 2.32369 17.7831 3.16265 17.8938C3.96804 18 4.99002 18 6.2493 18H13.7507C15.01 18 16.032 18 16.8374 17.8938C17.6763 17.7831 18.3934 17.545 18.9646 16.9846C19.5359 16.4241 19.7788 15.72 19.8917 14.8963C20 14.1058 20 13.1029 20 11.8676V9.94525C20 8.70992 20 7.70702 19.8917 6.91657C19.7788 6.09287 19.5359 5.38878 18.9646 4.82823C18.3934 4.26785 17.6763 4.02972 16.8374 3.91905C16.0319 3.81281 15.0099 3.81283 13.7506 3.81285L9.91202 3.81285C9.70527 3.81285 9.59336 3.81232 9.51046 3.80596C9.47861 3.80352 9.461 3.80081 9.45249 3.79919C9.44546 3.79427 9.43137 3.78367 9.40771 3.76281C9.34589 3.70835 9.26838 3.62926 9.12578 3.48235L8.91813 3.26831C8.46421 2.79975 8.09187 2.4154 7.59655 2.20712Z" />
        </svg>
        <span
          className="text-xs truncate"
          dangerouslySetInnerHTML={{ __html: highlightedName }}
        />
      </div>
      <span className="text-xs text-foreground/40">{folder.count}</span>
    </button>
  );
}