import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import { BlockNoteEditor } from '@blocknote/core';
import { motion, AnimatePresence } from 'framer-motion';

type InDocumentSearchProps = {
  editor: BlockNoteEditor | null;
  isOpen: boolean;
  onClose: () => void;
};

export function InDocumentSearch({ editor, isOpen, onClose }: InDocumentSearchProps) {
  const [query, setQuery] = useState('');
  const [currentMatch, setCurrentMatch] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const highlightsRef = useRef<HTMLElement[]>([]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Clear highlights when component unmounts or closes
  useEffect(() => {
    if (!isOpen) {
      clearHighlights();
      setQuery('');
      setCurrentMatch(0);
      setTotalMatches(0);
    }
  }, [isOpen]);

  const clearHighlights = useCallback(() => {
    highlightsRef.current.forEach((highlight) => {
      const parent = highlight.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(highlight.textContent || ''), highlight);
        parent.normalize();
      }
    });
    highlightsRef.current = [];
  }, []);

  const highlightMatches = useCallback((searchQuery: string) => {
    if (!editor || !searchQuery.trim()) {
      clearHighlights();
      setTotalMatches(0);
      setCurrentMatch(0);
      return;
    }

    // Wait a bit for editor to be fully mounted
    setTimeout(() => {
      clearHighlights();

      const editorElement = editor.domElement;
      if (!editorElement) {
        setTotalMatches(0);
        setCurrentMatch(0);
        return;
      }

      const walker = document.createTreeWalker(
        editorElement,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            // Skip nodes that are already inside highlights
            let parent = node.parentNode;
            while (parent && parent !== editorElement) {
              if (parent instanceof HTMLElement && parent.classList.contains('search-highlight')) {
                return NodeFilter.FILTER_REJECT;
              }
              parent = parent.parentNode;
            }
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );

      const textNodes: Text[] = [];
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
          textNodes.push(node as Text);
        }
      }

      if (textNodes.length === 0) {
        setTotalMatches(0);
        setCurrentMatch(0);
        return;
      }

      const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      let matchCount = 0;
      const newHighlights: HTMLElement[] = [];

      textNodes.forEach((textNode) => {
        const text = textNode.textContent || '';
        const matches = Array.from(text.matchAll(regex));
        
        if (matches.length > 0) {
          const parent = textNode.parentNode;
          if (!parent) return;

          let lastIndex = 0;
          const fragment = document.createDocumentFragment();

          matches.forEach((match) => {
            if (match.index === undefined) return;
            
            // Add text before match
            if (match.index > lastIndex) {
              fragment.appendChild(
                document.createTextNode(text.substring(lastIndex, match.index))
              );
            }

            // Add highlighted match
            const highlight = document.createElement('mark');
            highlight.className = 'search-highlight';
            highlight.textContent = match[0];
            highlight.style.backgroundColor = 'rgba(250, 204, 21, 0.3)';
            highlight.style.color = 'inherit';
            highlight.style.padding = '0';
            highlight.style.borderRadius = '2px';
            highlight.setAttribute('data-search-match', 'true');
            newHighlights.push(highlight);
            fragment.appendChild(highlight);
            matchCount++;

            lastIndex = match.index + match[0].length;
          });

          // Add remaining text
          if (lastIndex < text.length) {
            fragment.appendChild(
              document.createTextNode(text.substring(lastIndex))
            );
          }

          try {
            parent.replaceChild(fragment, textNode);
          } catch (e) {
            // If replacement fails, skip this node
            console.warn('Failed to highlight search match:', e);
          }
        }
      });

      highlightsRef.current = newHighlights;
      setTotalMatches(matchCount);
      setCurrentMatch(matchCount > 0 ? 1 : 0);

      // Scroll to first match
      if (newHighlights.length > 0) {
        requestAnimationFrame(() => {
          newHighlights[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }
    }, 100);
  }, [editor, clearHighlights]);

  const handleQueryChange = (newQuery: string) => {
    setQuery(newQuery);
    highlightMatches(newQuery);
  };

  const navigateMatch = (direction: 'next' | 'prev') => {
    if (highlightsRef.current.length === 0) return;

    const newIndex =
      direction === 'next'
        ? (currentMatch % totalMatches) + 1
        : currentMatch === 1
        ? totalMatches
        : currentMatch - 1;

    setCurrentMatch(newIndex);
    const targetHighlight = highlightsRef.current[newIndex - 1];
    if (targetHighlight) {
      targetHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add a brief flash effect
      targetHighlight.style.backgroundColor = 'rgba(250, 204, 21, 0.6)';
      setTimeout(() => {
        targetHighlight.style.backgroundColor = 'rgba(250, 204, 21, 0.3)';
      }, 300);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      navigateMatch('prev');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      navigateMatch('next');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: 'auto' }}
          exit={{ opacity: 0, width: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="flex items-center gap-1.5 overflow-hidden"
        >
          <div className="flex items-center gap-1 bg-Skriuw-darker border border-Skriuw-border rounded-md px-2 py-1">
            <Search className="w-3.5 h-3.5 text-Skriuw-icon flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search in document..."
              className="bg-transparent outline-none text-xs text-Skriuw-text placeholder:text-Skriuw-icon min-w-[150px] max-w-[200px]"
            />
            {query && (
              <>
                <div className="flex items-center gap-0.5 border-l border-Skriuw-border pl-1 ml-1">
                  <button
                    onClick={() => navigateMatch('prev')}
                    disabled={totalMatches === 0}
                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-Skriuw-border/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Previous match"
                  >
                    <ChevronUp className="w-3 h-3 text-Skriuw-icon" />
                  </button>
                  <span className="text-xs text-Skriuw-text-muted px-1 min-w-[30px] text-center">
                    {totalMatches > 0 ? `${currentMatch}/${totalMatches}` : '0'}
                  </span>
                  <button
                    onClick={() => navigateMatch('next')}
                    disabled={totalMatches === 0}
                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-Skriuw-border/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Next match"
                  >
                    <ChevronDown className="w-3 h-3 text-Skriuw-icon" />
                  </button>
                </div>
                <button
                  onClick={onClose}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-Skriuw-border/50 transition-colors ml-1"
                  aria-label="Close search"
                >
                  <X className="w-3 h-3 text-Skriuw-icon" />
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

