'use client';

import type { SearchOptions } from '@/modules/search/repositories/search-repository';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

type Props = {
  query: string;
  onQueryChange: (query: string) => void;
  options: SearchOptions;
  onOptionsChange: (key: keyof SearchOptions) => void;
  onClose: () => void;
};

export function SidebarSearch({
  query,
  onQueryChange,
  options,
  onOptionsChange,
  onClose,
}: Props) {
  return (
    <div className="rounded-md w-full flex items-center justify-start bg-background pl-2 pr-1 gap-0.5 border focus-within:ring-1 focus-within:ring-ring transition-all">
      <Input
        className="w-full bg-transparent outline-none placeholder:text-muted-foreground h-[30px] text-[13px] border-0 p-0"
        type="text"
        placeholder="Search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        autoComplete="off"
        autoCorrect="off"
        autoFocus
      />

      <Button
        variant="ghost"
        size="sm"
        className={`h-7 w-6 shrink-0 transition-colors ${options.caseSensitive
          ? 'bg-accent text-accent-foreground'
          : 'hover:bg-transparent'
          }`}
        onClick={() => onOptionsChange('caseSensitive')}
        title="Case sensitive"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4 stroke-muted-foreground hover:stroke-foreground transition-colors"
        >
          <path d="M21 14h-5"></path>
          <path d="M16 16v-3.5a2.5 2.5 0 0 1 5 0V16"></path>
          <path d="M4.5 13h6"></path>
          <path d="m3 16 4.5-9 4.5 9"></path>
        </svg>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className={`h-7 w-6 shrink-0 transition-colors ${options.wholeWord
          ? 'bg-accent text-accent-foreground'
          : 'hover:bg-transparent'
          }`}
        onClick={() => onOptionsChange('wholeWord')}
        title="Whole word"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4 stroke-muted-foreground hover:stroke-foreground transition-colors"
        >
          <circle cx="7" cy="12" r="3"></circle>
          <path d="M10 9v6"></path>
          <circle cx="17" cy="12" r="3"></circle>
          <path d="M14 7v8"></path>
          <path d="M22 17v1c0 .5-.5 1-1 1H3c-.5 0-1-.5-1-1v-1"></path>
        </svg>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-6 shrink-0 hover:bg-transparent"
        onClick={onClose}
      >
        <svg
          className="w-4 h-4 stroke-muted-foreground hover:stroke-foreground transition-colors"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M5.05024 13.8891C4.75734 14.182 4.75734 14.6568 5.05024 14.9497C5.34313 15.2426 5.818 15.2426 6.1109 14.9497L10 11.0606L13.8891 14.9497C14.182 15.2426 14.6569 15.2426 14.9498 14.9497C15.2427 14.6568 15.2427 14.182 14.9498 13.8891L11.0607 9.99996L14.9497 6.1109C15.2426 5.818 15.2426 5.34313 14.9497 5.05024C14.6568 4.75734 14.182 4.75734 13.8891 5.05024L10 8.9393L6.11095 5.05024C5.81805 4.75734 5.34318 4.75734 5.05029 5.05024C4.75739 5.34313 4.75739 5.818 5.05029 6.1109L8.93935 9.99996L5.05024 13.8891Z"
          />
        </svg>
      </Button>
    </div>
  );
}
