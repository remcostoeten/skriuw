import { MessageSquare, Bell, Zap, ArrowUpRight, Share2 } from 'lucide-react';

export function BottomBar() {
  return (
    <div className="h-8 flex items-center justify-between px-3 bg-haptic-deep border-t border-haptic-divider">
      <div className="flex items-center gap-1">
        <button className="w-6 h-6 flex items-center justify-center rounded text-haptic-dim hover:text-haptic-secondary transition-colors">
          <MessageSquare className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
        <button className="w-6 h-6 flex items-center justify-center rounded text-haptic-dim hover:text-haptic-secondary transition-colors">
          <Bell className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>
      <div className="flex items-center gap-1">
        <button className="w-6 h-6 flex items-center justify-center rounded text-haptic-dim hover:text-haptic-secondary transition-colors">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        </button>
        <button className="w-6 h-6 flex items-center justify-center rounded text-haptic-dim hover:text-haptic-secondary transition-colors">
          <Zap className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
        <button className="w-6 h-6 flex items-center justify-center rounded text-haptic-dim hover:text-haptic-secondary transition-colors">
          <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
        <button className="w-6 h-6 flex items-center justify-center rounded text-haptic-dim hover:text-haptic-secondary transition-colors">
          <Share2 className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
