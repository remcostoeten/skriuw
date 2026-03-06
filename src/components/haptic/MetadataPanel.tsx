import { NoteFile } from '@/types/notes';
import { formatDistanceToNow } from 'date-fns';
import { Info, Layers } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface MetadataPanelProps {
  file: NoteFile | null;
}

export function MetadataPanel({ file }: MetadataPanelProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'outline'>('info');

  if (!file) return null;

  const wordCount = file.content.split(/\s+/).filter(Boolean).length;
  const charCount = file.content.length;
  const fileSize = new Blob([file.content]).size;
  const readTime = Math.max(1, Math.ceil(wordCount / 200));

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    if (bytes < 1024) return `${bytes} Bytes`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const formatTime = (date: Date) => {
    const distance = formatDistanceToNow(date, { addSuffix: false });
    return distance + ' ago';
  };

  const stats = [
    { label: 'Created', value: formatTime(file.createdAt) },
    { label: 'Modified', value: formatTime(file.modifiedAt) },
    { label: 'File Size', value: formatSize(fileSize) },
    { label: 'Characters', value: charCount.toLocaleString() },
    { label: 'Words', value: wordCount.toLocaleString() },
    { label: 'Read Time', value: readTime === 0 ? '0s' : `${readTime}m` },
  ];

  return (
    <div className="w-48 border-l border-border bg-background flex flex-col">
      {/* Tab switcher - right aligned */}
      <div className="flex items-center justify-end gap-0.5 px-2 h-[40px] border-b border-border shrink-0">
        <button
          onClick={() => setActiveTab('info')}
          className={cn(
            'w-7 h-7 flex items-center justify-center rounded transition-colors',
            activeTab === 'info'
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          )}
        >
          <Info className="w-[15px] h-[15px]" strokeWidth={1.5} />
        </button>
        <button
          onClick={() => setActiveTab('outline')}
          className={cn(
            'w-7 h-7 flex items-center justify-center rounded transition-colors',
            activeTab === 'outline'
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          )}
        >
          <Layers className="w-[15px] h-[15px]" strokeWidth={1.5} />
        </button>
      </div>

      {activeTab === 'info' && (
        <div className="px-4 py-4 space-y-2.5 overflow-y-auto">
          {stats.map(stat => (
            <div key={stat.label} className="flex items-baseline justify-between">
              <span className="text-[13px] text-muted-foreground">{stat.label}</span>
              <span className="text-[13px] text-foreground/80 font-medium tabular-nums">{stat.value}</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'outline' && (
        <div className="px-4 py-4 overflow-y-auto">
          <p className="text-[13px] text-muted-foreground mb-3">Document outline</p>
          <div className="space-y-1">
            {file.content.split('\n')
              .filter(l => /^#{1,3}\s/.test(l))
              .map((heading, i) => {
                const level = heading.match(/^(#+)/)?.[1].length || 1;
                const text = heading.replace(/^#+\s+/, '');
                return (
                  <div
                    key={i}
                    className="text-[13px] text-foreground/50 hover:text-foreground cursor-pointer transition-colors truncate"
                    style={{ paddingLeft: `${(level - 1) * 12}px` }}
                  >
                    {text}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
