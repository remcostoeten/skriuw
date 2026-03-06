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

  const stats = [
    { label: 'Created', value: formatDistanceToNow(file.createdAt, { addSuffix: false }) + ' ago' },
    { label: 'Modified', value: formatDistanceToNow(file.modifiedAt, { addSuffix: false }) + ' ago' },
    { label: 'File Size', value: formatSize(fileSize) },
    { label: 'Characters', value: charCount.toLocaleString() },
    { label: 'Words', value: wordCount.toLocaleString() },
    { label: 'Read Time', value: `${readTime}m` },
  ];

  return (
    <div className="w-52 border-l border-haptic-divider bg-haptic-editor overflow-y-auto">
      {/* Tab switcher */}
      <div className="flex items-center justify-end gap-1 p-2 border-b border-haptic-divider">
        <button
          onClick={() => setActiveTab('info')}
          className={cn(
            'w-7 h-7 flex items-center justify-center rounded transition-colors',
            activeTab === 'info'
              ? 'bg-haptic-active text-foreground'
              : 'text-haptic-dim hover:text-foreground hover:bg-haptic-hover'
          )}
        >
          <Info className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <button
          onClick={() => setActiveTab('outline')}
          className={cn(
            'w-7 h-7 flex items-center justify-center rounded transition-colors',
            activeTab === 'outline'
              ? 'bg-haptic-active text-foreground'
              : 'text-haptic-dim hover:text-foreground hover:bg-haptic-hover'
          )}
        >
          <Layers className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      {activeTab === 'info' && (
        <div className="p-4 space-y-3">
          {stats.map(stat => (
            <div key={stat.label} className="flex items-center justify-between text-sm">
              <span className="text-haptic-secondary">{stat.label}</span>
              <span className="text-foreground/80 font-medium">{stat.value}</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'outline' && (
        <div className="p-4">
          <p className="text-sm text-haptic-dim">Document outline</p>
          <div className="mt-3 space-y-1.5">
            {file.content.split('\n')
              .filter(l => /^#{1,3}\s/.test(l))
              .map((heading, i) => {
                const level = heading.match(/^(#+)/)?.[1].length || 1;
                const text = heading.replace(/^#+\s+/, '');
                return (
                  <div
                    key={i}
                    className="text-sm text-foreground/60 hover:text-foreground cursor-pointer transition-colors"
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
