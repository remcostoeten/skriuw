import { FileText, FolderOpen, CheckSquare, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IconRailProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  { id: 'notes', icon: FileText, label: 'Notes' },
  { id: 'files', icon: FolderOpen, label: 'Files' },
  { id: 'tasks', icon: CheckSquare, label: 'Tasks' },
  { id: 'search', icon: Search, label: 'Search' },
];

export function IconRail({ activeTab, onTabChange }: IconRailProps) {
  return (
    <div className="w-12 flex flex-col items-center py-3 gap-1 bg-haptic-rail border-r border-haptic-divider">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'w-9 h-9 flex items-center justify-center rounded-md transition-colors',
            activeTab === tab.id
              ? 'bg-haptic-active text-foreground'
              : 'text-haptic-dim hover:text-haptic-secondary hover:bg-haptic-hover'
          )}
          title={tab.label}
        >
          <tab.icon className="w-[18px] h-[18px]" strokeWidth={1.5} />
        </button>
      ))}
      
      {/* Bottom icons */}
      <div className="mt-auto flex flex-col gap-1">
        <button className="w-9 h-9 flex items-center justify-center rounded-md text-haptic-dim hover:text-haptic-secondary hover:bg-haptic-hover transition-colors">
          <FolderOpen className="w-[18px] h-[18px]" strokeWidth={1.5} />
        </button>
        <button className="w-9 h-9 flex items-center justify-center rounded-md text-haptic-dim hover:text-haptic-secondary hover:bg-haptic-hover transition-colors">
          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </button>
      </div>
    </div>
  );
}
