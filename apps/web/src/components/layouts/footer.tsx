import { Lightbulb, X, Settings, Zap, Upload, Download } from 'lucide-react';

export function Footer() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 h-9 bg-background border-t border-border flex items-center justify-between px-1.5 z-20">
      <div className="flex items-center gap-0.5">
        <button 
          className="p-1.5 rounded hover:bg-foreground/10 dark:hover:bg-foreground/20 transition-colors duration-150"
          aria-label="Lightbulb"
        >
          <Lightbulb size={16} className="text-foreground/80 hover:text-foreground" strokeWidth={2} />
        </button>
        <button 
          className="p-1.5 rounded hover:bg-foreground/10 dark:hover:bg-foreground/20 transition-colors duration-150"
          aria-label="Close"
        >
          <X size={16} className="text-foreground/80 hover:text-foreground" strokeWidth={2} />
        </button>
      </div>

      <div className="flex items-center gap-0.5">
        <button 
          className="p-1.5 rounded hover:bg-foreground/10 dark:hover:bg-foreground/20 transition-colors duration-150"
          aria-label="Settings"
        >
          <Settings size={16} className="text-foreground/80 hover:text-foreground" strokeWidth={2} />
        </button>
        <button 
          className="p-1.5 rounded hover:bg-foreground/10 dark:hover:bg-foreground/20 transition-colors duration-150"
          aria-label="Spark"
        >
          <Zap size={16} className="text-foreground/80 hover:text-foreground" strokeWidth={2} />
        </button>
        <button 
          className="p-1.5 rounded hover:bg-foreground/10 dark:hover:bg-foreground/20 transition-colors duration-150"
          aria-label="Upload"
        >
          <Upload size={16} className="text-foreground/80 hover:text-foreground" strokeWidth={2} />
        </button>
        <button 
          className="p-1.5 rounded hover:bg-foreground/10 dark:hover:bg-foreground/20 transition-colors duration-150"
          aria-label="Download"
        >
          <Download size={16} className="text-foreground/80 hover:text-foreground" strokeWidth={2} />
        </button>
      </div>
    </footer>
  );
}
