import { Moon, CloudOff, Globe, Zap, Upload } from "lucide-react";

export function Footer() {
  return (
    <div className="h-9 bg-Skriuw-darker border-t border-Skriuw-border flex items-center justify-between px-1.5">
      <div className="flex items-center gap-1.5">
        <button className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors">
          <Moon className="w-4 h-4 text-Skriuw-icon" />
        </button>
        <button className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors">
          <CloudOff className="w-4 h-4 text-Skriuw-icon" />
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <button className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors">
          <Globe className="w-4 h-4 text-Skriuw-icon" />
        </button>
        <button className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors">
          <Zap className="w-4 h-4 text-Skriuw-icon" />
        </button>
        <button className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-Skriuw-border/50 transition-colors">
          <Upload className="w-4 h-4 text-Skriuw-icon" />
        </button>
      </div>
    </div>
  );
}
