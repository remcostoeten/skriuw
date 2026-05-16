"use client";

import { Code2, FileText } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { DemoFrame } from "../demo-frame";

type RawMdxModeDemoProps = {
  enabled: boolean;
};

function DemoLine({ className }: { className?: string }) {
  return <div className={cn("h-2 rounded-full bg-foreground/10", className)} />;
}

export function RawMdxModeDemo({ enabled }: RawMdxModeDemoProps) {
  return (
    <DemoFrame title="Preview" status={enabled ? "Raw MDX" : "Block editor"}>
      {enabled ? (
        <div className="font-mono text-[11px] leading-5 text-foreground/88">
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <Code2 className="h-3.5 w-3.5" />
            <span>Raw source</span>
          </div>
          <div className="space-y-2">
            <div className="inline-flex items-center rounded-sm bg-accent px-2 py-0.5 text-[10px] text-accent-foreground">
              # Draft note
            </div>
            <DemoLine className="w-11/12" />
            <DemoLine className="w-9/12" />
            <div className="mt-3 rounded-sm border border-border/70 bg-background px-2 py-1.5 text-[10px] text-muted-foreground">
              <span className="text-foreground/85">#</span> markdown stays editable as source
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            <span>Block view</span>
          </div>
          <div className="space-y-1.5">
            <div className="rounded-sm bg-background px-2 py-1.5">
              <div className="text-[10px] font-medium text-foreground">Draft note</div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                Visual blocks and formatting tools
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-foreground/20" />
              <DemoLine className="w-8/12" />
            </div>
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-foreground/20" />
              <DemoLine className="w-10/12" />
            </div>
          </div>
        </div>
      )}
    </DemoFrame>
  );
}
