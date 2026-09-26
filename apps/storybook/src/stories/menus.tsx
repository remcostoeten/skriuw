import { useState } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/shared/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import dropdownSource from "@/shared/ui/dropdown-menu.tsx?raw";
import contextSource from "@/shared/ui/context-menu.tsx?raw";
import { plainButton, type Story } from "@skriuw/storybook-shell";

function DropdownDemo() {
  const [pinned, setPinned] = useState(true);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={plainButton}>
          Note actions
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Note</DropdownMenuLabel>
        <DropdownMenuItem>
          Rename
          <DropdownMenuShortcut keys="F2" />
        </DropdownMenuItem>
        <DropdownMenuItem>
          Duplicate
          <DropdownMenuShortcut keys="Ctrl D" />
        </DropdownMenuItem>
        <DropdownMenuCheckboxItem checked={pinned} onCheckedChange={setPinned}>
          Pinned
        </DropdownMenuCheckboxItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>Inbox</DropdownMenuItem>
            <DropdownMenuItem>Projects</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          Delete
          <DropdownMenuShortcut keys="Del" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const menuStories: Story[] = [
  {
    id: "dropdown-menu",
    source: [{ label: "shared/ui/dropdown-menu.tsx", code: dropdownSource }],
    usage: `import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <button type="button">Note actions</button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Rename<DropdownMenuShortcut keys="F2" /></DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>`,
    api: [
      {
        source: dropdownSource,
        type: "DropdownMenuItemProps",
        label: "DropdownMenuItem",
        file: "shared/ui/dropdown-menu.tsx",
      },
      {
        source: dropdownSource,
        type: "DropdownMenuShortcutProps",
        label: "DropdownMenuShortcut",
        file: "shared/ui/dropdown-menu.tsx",
      },
    ],
    group: "Overlays",
    title: "DropdownMenu",
    render: () => <DropdownDemo />,
  },
  {
    id: "context-menu",
    source: [{ label: "shared/ui/context-menu.tsx", code: contextSource }],
    usage: `import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/shared/ui/context-menu";

<ContextMenu>
  <ContextMenuTrigger asChild>
    <div>Right-click here</div>
  </ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuItem>Copy link</ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>`,
    api: [
      {
        source: contextSource,
        type: "ContextMenuItemProps",
        label: "ContextMenuItem",
        file: "shared/ui/context-menu.tsx",
      },
      {
        source: contextSource,
        type: "ContextMenuShortcutProps",
        label: "ContextMenuShortcut",
        file: "shared/ui/context-menu.tsx",
      },
    ],
    group: "Overlays",
    title: "ContextMenu",
    render: () => (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="grid h-40 w-80 place-items-center rounded-md border border-dashed border-border text-[13px] text-muted-foreground">
            Right-click here
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>
            Open in split
            <ContextMenuShortcut keys="Ctrl \" />
          </ContextMenuItem>
          <ContextMenuItem>Copy link</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem>Move to trash</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    ),
  },
];
