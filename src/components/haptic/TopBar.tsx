import { Github, Download } from 'lucide-react';

export function TopBar() {
  return (
    <div className="h-10 flex items-center justify-between px-4 bg-haptic-deep border-b border-haptic-divider">
      <div />
      <span className="text-sm text-foreground/60 font-medium tracking-wide">Haptic</span>
      <div className="flex items-center gap-2">
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener"
          className="flex items-center gap-1.5 px-3 py-1 text-xs text-foreground/70 border border-haptic-btn-outline rounded-md hover:bg-haptic-hover transition-colors"
        >
          <Github className="w-3.5 h-3.5" />
          Star on Github
        </a>
        <button className="flex items-center gap-1.5 px-3 py-1 text-xs text-foreground/90 border border-haptic-btn-outline rounded-md hover:bg-haptic-hover transition-colors font-medium">
          <Download className="w-3.5 h-3.5" />
          Download
        </button>
      </div>
    </div>
  );
}
