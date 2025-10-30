import { CaseSensitive, WholeWord, X } from 'lucide-react';
import type { SearchOptions } from '@/modules/search/repositories/search-repository';
import { useEffect } from 'react';

type props = {
  query: string;
  onQueryChange: (query: string) => void;
  options: SearchOptions;
  onOptionsChange: (options: SearchOptions) => void;
  onClose: () => void;
};

/**
 * ToDo: create a global keyboard event listener HoC
 */

export function SidebarSearch({
  query,
  onQueryChange,
  options,
  onOptionsChange,
  onClose
}: props) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function toggleCaseSensitive() {
    onOptionsChange({ ...options, caseSensitive: !options.caseSensitive });
  }

  function toggleWholeWord() {
    onOptionsChange({ ...options, wholeWord: !options.wholeWord });
  }

  return (
    <div className="rounded-md w-full flex items-center justify-start bg-background pl-2 pr-1 gap-0.5 border focus-within:ring-1 focus-within:ring-ring transition-all">
      <input
        className="w-full bg-transparent outline-none placeholder:text-muted-foreground h-[30px] text-[13px]"
        type="text"
        placeholder="Search folders and notes"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        autoFocus
      />

      <button
        onClick={toggleCaseSensitive}
        className={`inline-flex items-center justify-center rounded-md text-sm font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:scale-95 h-7 w-6 shrink-0 group hover:bg-transparent transition-all ${options.caseSensitive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        aria-label="Toggle case sensitive search"
      >
        <CaseSensitive className="w-[18px] h-[18px] stroke-[1.5px]" />
      </button>

      <button
        onClick={toggleWholeWord}
        className={`inline-flex items-center justify-center rounded-md text-sm font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:scale-95 h-7 w-6 shrink-0 group hover:bg-transparent transition-all ${options.wholeWord ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        aria-label="Toggle whole word search"
      >
        <WholeWord className="w-4 h-4 stroke-[1.5px]" />
      </button>

      <button
        onClick={onClose}
        className="inline-flex items-center justify-center rounded-md text-sm font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:scale-95 h-7 w-6 group shrink-0 transition-all hover:bg-transparent fill-muted-foreground hover:fill-foreground"
        aria-label="Close search"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}