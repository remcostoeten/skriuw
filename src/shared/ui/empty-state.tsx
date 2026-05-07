"use client";

import { useState } from "react";
import {
  Bell,
  Check,
  Copy,
  FileText,
  FolderPlus,
  Image as ImageIcon,
  Inbox,
  MessageSquare,
  Search,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";

export type EmptyStateVariant =
  | "projects"
  | "chats"
  | "search"
  | "inbox"
  | "notifications"
  | "files"
  | "media"
  | "members";

type Action =
  | { label: string; icon?: LucideIcon; href: string; onClick?: never }
  | { label: string; icon?: LucideIcon; onClick: () => void; href?: never };

type Preset = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export interface EmptyStateProps {
  variant?: EmptyStateVariant;
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: Action;
  className?: string;
}

const PRESETS: Record<EmptyStateVariant, Preset> = {
  projects: {
    icon: FolderPlus,
    title: "No projects yet.",
    description: "Create one to group related notes and folders.",
  },
  chats: {
    icon: MessageSquare,
    title: "No chats yet.",
    description: "Start a conversation to see it appear here.",
  },
  search: {
    icon: Search,
    title: "No results found.",
    description: "Try adjusting your search or filters.",
  },
  inbox: {
    icon: Inbox,
    title: "Inbox zero.",
    description: "New messages will show up here.",
  },
  notifications: {
    icon: Bell,
    title: "No notifications.",
    description: "Items that need attention will appear here.",
  },
  files: {
    icon: FileText,
    title: "No files yet.",
    description: "Create a note or folder to start organizing your work.",
  },
  media: {
    icon: ImageIcon,
    title: "No media yet.",
    description: "Images and videos you add will appear here.",
  },
  members: {
    icon: Users,
    title: "No members yet.",
    description: "Invite teammates to collaborate on this workspace.",
  },
};

const ACTION_CLASSES =
  "mt-5 inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-transparent px-3 py-1 text-[12px] font-normal text-foreground/90 transition-colors hover:bg-accent/50";

function ActionButton({ action }: { action: Action }) {
  const Icon = action.icon;
  const content = (
    <>
      {Icon ? <Icon className="h-3.5 w-3.5" strokeWidth={1.5} /> : null}
      {action.label}
    </>
  );

  if (action.href) {
    return (
      <a href={action.href} className={ACTION_CLASSES}>
        {content}
      </a>
    );
  }

  return (
    <button type="button" onClick={action.onClick} className={ACTION_CLASSES}>
      {content}
    </button>
  );
}

export function EmptyState({
  variant = "projects",
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const preset = PRESETS[variant];
  const Icon = icon ?? preset.icon;

  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      <Icon className="mb-3 h-7 w-7 text-muted-foreground/40" strokeWidth={1.5} />
      <h2 className="text-[13px] font-medium leading-tight text-foreground/90">
        {title ?? preset.title}
      </h2>
      <p className="mt-1 max-w-[200px] text-[12px] leading-snug text-muted-foreground/70">
        {description ?? preset.description}
      </p>
      {action ? <ActionButton action={action} /> : null}
    </div>
  );
}

export function EmptyStateCopyButton({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copy usage code"
      className={cn(
        "fixed bottom-6 right-6 z-50 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/90 px-3 py-2 text-[12px] font-medium text-foreground/90 shadow-lg backdrop-blur transition-colors hover:bg-accent/60",
        className,
      )}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" strokeWidth={2} />
          Copied!
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
          Copy usage
        </>
      )}
    </button>
  );
}
