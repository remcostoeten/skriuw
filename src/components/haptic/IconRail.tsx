import { FolderOpen, Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

interface IconRailProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function IconRail({ activeTab, onTabChange }: IconRailProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="w-12 flex flex-col items-center py-3 gap-1 bg-haptic-rail border-r border-haptic-divider">
      {/* Notes/Folders tab */}
      <button
        onClick={() => onTabChange('notes')}
        className={cn(
          'w-9 h-9 flex items-center justify-center rounded-md transition-colors',
          activeTab === 'notes'
            ? 'bg-haptic-active text-foreground'
            : 'text-haptic-dim hover:text-haptic-secondary hover:bg-haptic-hover'
        )}
        title="Notes"
      >
        <FolderOpen className="w-[18px] h-[18px]" strokeWidth={1.5} />
      </button>
      
      {/* Bottom icons - Theme toggle */}
      <div className="mt-auto flex flex-col gap-1">
        <button 
          onClick={toggleTheme}
          className="w-9 h-9 flex items-center justify-center rounded-md text-haptic-dim hover:text-haptic-secondary hover:bg-haptic-hover transition-colors"
          title="Toggle theme"
        >
          {mounted ? (
            theme === 'dark' ? (
              <Sun className="w-[18px] h-[18px]" strokeWidth={1.5} />
            ) : (
              <Moon className="w-[18px] h-[18px]" strokeWidth={1.5} />
            )
          ) : (
            <Sun className="w-[18px] h-[18px]" strokeWidth={1.5} />
          )}
        </button>
      </div>
    </div>
  );
}
