"use client"

import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import {

} from "@/shared/components/ui/context-menu"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuSeparator,
  ContextMenuShortcut, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger
} from "ui"

export type MenuItemVariant = "default" | "destructive"

export type SubMenuItem = {
  id: string
  label: string
  icon?: LucideIcon
  disabled?: boolean
  tooltip?: string
  onSelect?: () => void
  subItems?: SubMenuItem[]
}

export type MenuItem = {
  id: string
  label: string
  icon?: LucideIcon
  shortcut?: string
  disabled?: boolean
  tooltip?: string
  variant?: MenuItemVariant
  onSelect?: () => void
  separator?: boolean
  subItems?: SubMenuItem[]
}

type props = {
  children: ReactNode
  items: MenuItem[]
  className?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function ItemContextMenu({ children, items, className, open, onOpenChange }: props) {
  const renderSubMenuItem = (subItem: SubMenuItem) => {
    const SubIcon = subItem.icon

    if (subItem.subItems && subItem.subItems.length > 0) {
      return (
        <ContextMenuSub key={subItem.id}>
          <ContextMenuSubTrigger disabled={subItem.disabled}>
            {SubIcon && <SubIcon className="h-4 w-4" />}
            {subItem.label}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {subItem.subItems.map(renderSubMenuItem)}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )
    }

    const subItemContent = (
      <ContextMenuItem key={subItem.id} disabled={subItem.disabled} onClick={subItem.onSelect}>
        {SubIcon && <SubIcon className="h-4 w-4" />}
        {subItem.label}
      </ContextMenuItem>
    )

    if (subItem.tooltip) {
      return (
        <Tooltip key={subItem.id}>
          <TooltipTrigger asChild>
            <div>{subItemContent}</div>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p className="text-xs">{subItem.tooltip}</p>
          </TooltipContent>
        </Tooltip>
      )
    }

    return subItemContent
  }

  const renderMenuItem = (item: MenuItem) => {
    const Icon = item.icon

    // Render separator
    if (item.separator) {
      return <ContextMenuSeparator key={`separator-${item.id}`} />
    }

    // Render submenu
    if (item.subItems && item.subItems.length > 0) {
      return (
        <TooltipProvider key={item.id}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <ContextMenuSub>
                  <ContextMenuSubTrigger disabled={item.disabled}>
                    {Icon && <Icon className="h-4 w-4" />}
                    {item.label}
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent>
                    {item.subItems.map(renderSubMenuItem)}
                  </ContextMenuSubContent>
                </ContextMenuSub>
              </div>
            </TooltipTrigger>
            {item.tooltip && (
              <TooltipContent side="right">
                <p className="text-xs">{item.tooltip}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      )
    }

    // Render regular menu item
    const menuItemContent = (
      <ContextMenuItem key={item.id} disabled={item.disabled} onClick={item.onSelect} variant={item.variant}>
        {Icon && <Icon className="h-4 w-4" />}
        {item.label}
        {item.shortcut && <ContextMenuShortcut>{item.shortcut}</ContextMenuShortcut>}
      </ContextMenuItem>
    )

    if (item.tooltip) {
      return (
        <TooltipProvider key={item.id}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>{menuItemContent}</div>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p className="text-xs">{item.tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }

    return menuItemContent
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild className={className}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>{items.map(renderMenuItem)}</ContextMenuContent>
    </ContextMenu>
  )
}

