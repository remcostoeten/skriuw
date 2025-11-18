import { Calendar, Clock, FileText, Hash, User, Zap } from "lucide-react";
import type { Note } from "@/features/notes/types";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { Separator } from "@/shared/ui/separator";
import { cn } from "@/lib/utils";

function formatDistanceToNow(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;
  if (weeks < 4) return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
  return `${years} year${years !== 1 ? 's' : ''} ago`;
}

interface NoteSidebarProps {
  note: Note;
}

function MetadataItem({
  icon,
  label,
  value,
  className
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 py-2", className)}>
      <div className="text-muted-foreground w-4 h-4 flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </div>
        <div className="text-sm text-foreground truncate">
          {value}
        </div>
      </div>
    </div>
  );
}

function calculateWordCount(content: any[]): number {
  if (!content || !Array.isArray(content)) return 0;

  let wordCount = 0;

  const countWordsInText = (text: string) => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  };

  const traverseBlocks = (blocks: any[]) => {
    blocks.forEach(block => {
      if (block.content) {
        if (typeof block.content === 'string') {
          wordCount += countWordsInText(block.content);
        } else if (Array.isArray(block.content)) {
          traverseBlocks(block.content);
        }
      }

      // Handle BlockNote specific structure
      if (block.children && Array.isArray(block.children)) {
        traverseBlocks(block.children);
      }

      // Handle text content in different block types
      if (block.type === 'text' && block.text) {
        wordCount += countWordsInText(block.text);
      }

      // Handle paragraph and other text blocks
      if (block.props?.content) {
        if (typeof block.props.content === 'string') {
          wordCount += countWordsInText(block.props.content);
        }
      }
    });
  };

  traverseBlocks(content);
  return wordCount;
}

function calculateReadingTime(wordCount: number): number {
  // Average reading speed: 200-250 words per minute
  const wordsPerMinute = 225;
  return Math.ceil(wordCount / wordsPerMinute) || 1;
}

function calculateBytes(content: any[]): number {
  if (!content || !Array.isArray(content)) return 0;
  return new Blob([JSON.stringify(content)]).size;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function NoteSidebar({ note }: NoteSidebarProps) {
  const wordCount = calculateWordCount(note.content);
  const readingTime = calculateReadingTime(wordCount);
  const byteSize = calculateBytes(note.content);
  const formattedSize = formatBytes(byteSize);

  const metadata = [
    {
      icon: <FileText className="w-4 h-4" />,
      label: "Type",
      value: "Note"
    },
    {
      icon: <Hash className="w-4 h-4" />,
      label: "Words",
      value: wordCount.toLocaleString()
    },
    {
      icon: <Clock className="w-4 h-4" />,
      label: "Reading time",
      value: `${readingTime} min read`
    },
    {
      icon: <Zap className="w-4 h-4" />,
      label: "Size",
      value: formattedSize
    },
    {
      icon: <Calendar className="w-4 h-4" />,
      label: "Created",
      value: formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })
    },
    {
      icon: <Calendar className="w-4 h-4" />,
      label: "Modified",
      value: formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })
    }
  ];

  return (
    <div className="w-full h-full flex flex-col bg-background">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Note Details</h3>
        <p className="text-xs text-muted-foreground mt-1 truncate">
          {note.name}
        </p>
      </div>

      {/* Metadata */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-1">
          {metadata.map((item, index) => (
            <MetadataItem
              key={index}
              icon={item.icon}
              label={item.label}
              value={item.value}
            />
          ))}
        </div>

        <Separator className="my-4" />

        {/* Additional Info */}
        <div className="px-4 pb-4">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Information
          </div>
          <div className="text-xs text-muted-foreground leading-relaxed">
            <p className="mb-2">
              This note contains <span className="font-medium text-foreground">{wordCount.toLocaleString()}</span> words
              and takes approximately <span className="font-medium text-foreground">{readingTime}</span> minutes to read.
            </p>
            <p>
              Last modified <span className="font-medium text-foreground">{formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}</span>.
            </p>
          </div>
        </div>
      </ScrollArea>

      {/* Future: Version History Section */}
      <div className="p-4 border-t border-border">
        <div className="text-xs text-muted-foreground">
          Version history coming soon...
        </div>
      </div>
    </div>
  );
}