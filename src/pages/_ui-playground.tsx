import { useState, useMemo } from 'react'

import { AppLayout } from '@/components/layout/app-layout'
import { TableOfContents } from '@/components/sidebar/table-of-contents'
import type { TableOfContentsItem } from '@/components/sidebar/table-of-contents'

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger
} from '@/shared/ui/alert-dialog'
import { Button } from '@/shared/ui/button'
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuCheckboxItem,
    ContextMenuRadioGroup,
    ContextMenuRadioItem,
    ContextMenuShortcut,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger
} from '@/shared/ui/context-menu'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '@/shared/ui/dialog'
import {
    Dialog as DialogDrawer,
    DialogContent as DialogDrawerContent,
    DialogClose,
    DialogHeader as DialogDrawerHeader,
    DialogTitle as DialogDrawerTitle,
    DialogFooter as DialogDrawerFooter
} from '@/shared/ui/dialog-drawer'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuCheckboxItem,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger
} from '@/shared/ui/dropdown-menu'
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger
} from '@/shared/ui/hover-card'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/shared/ui/select'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger
} from '@/shared/ui/sheet'

import {
    WordWrapExample,
    ConditionalWordWrapExample
} from '../_examples/word-wrap-example'

export default function _UIPlayground() {
    const [dialogOpen, setDialogOpen] = useState(false)
    const [dialogDrawerOpen, setDialogDrawerOpen] = useState(false)
    const [selectValue, setSelectValue] = useState('')

    const colors = [
        { name: 'background', var: 'var(--background)' },
        { name: 'foreground', var: 'var(--foreground)' },
        { name: 'card', var: 'var(--card)' },
        { name: 'card-foreground', var: 'var(--card-foreground)' },
        { name: 'popover', var: 'var(--popover)' },
        { name: 'popover-foreground', var: 'var(--popover-foreground)' },
        { name: 'primary', var: 'var(--primary)' },
        { name: 'primary-foreground', var: 'var(--primary-foreground)' },
        { name: 'secondary', var: 'var(--secondary)' },
        { name: 'secondary-foreground', var: 'var(--secondary-foreground)' },
        { name: 'muted', var: 'var(--muted)' },
        { name: 'muted-foreground', var: 'var(--muted-foreground)' },
        { name: 'accent', var: 'var(--accent)' },
        { name: 'accent-foreground', var: 'var(--accent-foreground)' },
        { name: 'destructive', var: 'var(--destructive)' },
        {
            name: 'destructive-foreground',
            var: 'var(--destructive-foreground)'
        },
        { name: 'border', var: 'var(--border)' },
        { name: 'input', var: 'var(--input)' },
        { name: 'ring', var: 'var(--ring)' }
    ]

    const sidebarColors = [
        { name: 'sidebar-background', var: 'var(--sidebar-background)' },
        { name: 'sidebar-foreground', var: 'var(--sidebar-foreground)' },
        { name: 'sidebar-primary', var: 'var(--sidebar-primary)' },
        {
            name: 'sidebar-primary-foreground',
            var: 'var(--sidebar-primary-foreground)'
        },
        { name: 'sidebar-accent', var: 'var(--sidebar-accent)' },
        {
            name: 'sidebar-accent-foreground',
            var: 'var(--sidebar-accent-foreground)'
        },
        { name: 'sidebar-border', var: 'var(--sidebar-border)' },
        { name: 'sidebar-ring', var: 'var(--sidebar-ring)' }
    ]

    // Generate table of contents from sections
    const tableOfContents: TableOfContentsItem[] = useMemo(() => {
        const items: TableOfContentsItem[] = [
            { id: 'color-palette', label: 'Color Palette', level: 1 },
            { id: 'component-demos', label: 'Component Demos', level: 1 },
            { id: 'examples', label: 'Examples', level: 1 },
            { id: 'focus-outline', label: 'Focus Outline Variants', level: 1 },
        ]
        return items
    }, [])

    return (
        <AppLayout 
            showSidebar={true}
            sidebarContentType="table-of-contents"
            sidebarCustomContent={<TableOfContents items={tableOfContents} />}
        >
            <div className="flex-1 overflow-y-auto bg-background text-foreground p-8 transition-colors duration-300">
                <div className="max-w-6xl mx-auto space-y-12">
                <header className="space-y-4" id="header">
                    <h1 className="text-4xl font-bold">
                        UI Testing Playground
                    </h1>
                    <p className="text-muted-foreground">
                        Test all UI components, color palette, modals, dialogs,
                        and popovers in one place.
                    </p>
                </header>

                {/* Color Palette Section */}
                <section className="space-y-4" id="color-palette">
                    <h2 className="text-2xl font-semibold">Color Palette</h2>
                    <p className="text-sm text-muted-foreground">
                        Visualizing the application's color palette. Toggle your
                        system theme or use a theme switcher to see Dark Mode.
                    </p>

                    <div className="space-y-6">
                        <div>
                            <h3 className="text-xl font-semibold mb-4">
                                Base Colors
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {colors.map((color) => (
                                    <div
                                        key={color.name}
                                        className="space-y-2 border border-border rounded-lg p-4 bg-card"
                                    >
                                        <div
                                            className="h-20 w-full rounded-md border border-border shadow-sm"
                                            style={{
                                                backgroundColor: `hsl(${color.var})`
                                            }}
                                        />
                                        <div className="space-y-1">
                                            <p className="font-medium text-sm">
                                                {color.name}
                                            </p>
                                            <p className="text-xs text-muted-foreground font-mono">
                                                {color.var}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <h3 className="text-xl font-semibold mb-4">
                                Sidebar Colors
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {sidebarColors.map((color) => (
                                    <div
                                        key={color.name}
                                        className="space-y-2 border border-border rounded-lg p-4 bg-card"
                                    >
                                        <div
                                            className="h-20 w-full rounded-md border border-border shadow-sm"
                                            style={{
                                                backgroundColor: `hsl(${color.var})`
                                            }}
                                        />
                                        <div className="space-y-1">
                                            <p className="font-medium text-sm">
                                                {color.name}
                                            </p>
                                            <p className="text-xs text-muted-foreground font-mono">
                                                {color.var}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <h3 className="text-xl font-semibold mb-4">
                                UI Components Preview
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Sidebar Mockup */}
                                <div className="border border-sidebar-border rounded-lg overflow-hidden flex h-64">
                                    <div className="w-16 bg-sidebar-background border-r border-sidebar-border flex flex-col items-center py-4 gap-4">
                                        <div className="w-8 h-8 rounded-md bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center font-bold">
                                            H
                                        </div>
                                        <div className="w-8 h-8 rounded-md text-sidebar-foreground/60 flex items-center justify-center">
                                            A
                                        </div>
                                        <div className="w-8 h-8 rounded-md text-sidebar-foreground/60 flex items-center justify-center">
                                            B
                                        </div>
                                    </div>
                                    <div className="w-48 bg-sidebar-background border-r border-sidebar-border flex flex-col">
                                        <div className="p-4 border-b border-sidebar-border">
                                            <span className="text-sidebar-foreground font-semibold">
                                                Files
                                            </span>
                                        </div>
                                        <div className="p-2 space-y-1">
                                            <div className="px-2 py-1.5 rounded-md bg-sidebar-accent text-sidebar-accent-foreground text-sm">
                                                Active Note
                                            </div>
                                            <div className="px-2 py-1.5 rounded-md text-sidebar-foreground text-sm hover:bg-sidebar-accent/50">
                                                Inactive Note
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex-1 bg-background p-6">
                                        <h3 className="text-2xl font-bold text-foreground mb-4">
                                            Note Title
                                        </h3>
                                        <p className="text-foreground/80">
                                            This is the main content area. It
                                            uses the standard background and
                                            foreground colors.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Component Demos Section */}
                <section className="space-y-8" id="component-demos">
                    <div className="space-y-2">
                        <h2 className="text-2xl font-semibold">
                            Component Demos
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            Test all popover, modal, and dialog components
                        </p>
                    </div>

                    {/* Dialog */}
                    <div className="space-y-4">
                        <h3 className="text-xl font-semibold">Dialog</h3>
                        <div className="flex gap-4">
                            <Dialog
                                open={dialogOpen}
                                onOpenChange={setDialogOpen}
                            >
                                <DialogTrigger asChild>
                                    <Button>Open Dialog</Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Dialog Title</DialogTitle>
                                        <DialogDescription>
                                            This is a standard dialog component.
                                            It has a backdrop and can be closed
                                            by clicking outside or pressing
                                            Escape.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="py-4">
                                        <p className="text-sm text-muted-foreground">
                                            Dialog content goes here. You can
                                            add any content you want.
                                        </p>
                                    </div>
                                    <DialogFooter>
                                        <Button
                                            variant="outline"
                                            onClick={() => setDialogOpen(false)}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            onClick={() => setDialogOpen(false)}
                                        >
                                            Confirm
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>

                    {/* Dialog Drawer (Custom Modal / Settings Modal) */}
                    <div className="space-y-4">
                        <h3 className="text-xl font-semibold">
                            Dialog Drawer (Custom Modal)
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            This is the custom modal used for settings. It
                            adapts to mobile with a drawer-style interface.
                        </p>
                        <div className="flex gap-4">
                            <DialogDrawer
                                open={dialogDrawerOpen}
                                onOpenChange={setDialogDrawerOpen}
                            >
                                <Button
                                    onClick={() => setDialogDrawerOpen(true)}
                                >
                                    Open Dialog Drawer
                                </Button>
                                <DialogDrawerContent>
                                    <DialogClose />
                                    <DialogDrawerHeader>
                                        <DialogDrawerTitle>
                                            Settings Modal
                                        </DialogDrawerTitle>
                                    </DialogDrawerHeader>
                                    <div className="py-4">
                                        <p className="text-sm text-muted-foreground">
                                            This is the custom dialog drawer
                                            component. On mobile, it slides up
                                            from the bottom. On desktop, it
                                            appears as a centered modal.
                                        </p>
                                    </div>
                                    <DialogDrawerFooter>
                                        <Button
                                            variant="outline"
                                            onClick={() =>
                                                setDialogDrawerOpen(false)
                                            }
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            onClick={() =>
                                                setDialogDrawerOpen(false)
                                            }
                                        >
                                            Save
                                        </Button>
                                    </DialogDrawerFooter>
                                </DialogDrawerContent>
                            </DialogDrawer>
                        </div>
                    </div>

                    {/* Alert Dialog */}
                    <div className="space-y-4">
                        <h3 className="text-xl font-semibold">Alert Dialog</h3>
                        <div className="flex gap-4">
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive">
                                        Delete Item
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>
                                            Are you absolutely sure?
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This action cannot be undone. This
                                            will permanently delete your item
                                            and remove your data from our
                                            servers.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>
                                            Cancel
                                        </AlertDialogCancel>
                                        <AlertDialogAction>
                                            Continue
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>

                    {/* Popover */}
                    <div className="space-y-4">
                        <h3 className="text-xl font-semibold">Popover</h3>
                        <div className="flex gap-4">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline">
                                        Open Popover
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent>
                                    <div className="space-y-2">
                                        <h4 className="font-medium leading-none">
                                            Dimensions
                                        </h4>
                                        <p className="text-sm text-muted-foreground">
                                            Set the dimensions for the layer.
                                        </p>
                                        <div className="grid gap-2">
                                            <div className="grid grid-cols-3 items-center gap-4">
                                                <label className="text-sm">
                                                    Width
                                                </label>
                                                <input
                                                    type="number"
                                                    defaultValue="100%"
                                                    className="col-span-2 h-8 rounded-md border border-input bg-background px-3 text-sm"
                                                />
                                            </div>
                                            <div className="grid grid-cols-3 items-center gap-4">
                                                <label className="text-sm">
                                                    Height
                                                </label>
                                                <input
                                                    type="number"
                                                    defaultValue="100%"
                                                    className="col-span-2 h-8 rounded-md border border-input bg-background px-3 text-sm"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>

                    {/* Context Menu */}
                    <div className="space-y-4">
                        <h3 className="text-xl font-semibold">Context Menu</h3>
                        <p className="text-sm text-muted-foreground">
                            Right-click on the box below to see the context
                            menu.
                        </p>
                        <div className="flex gap-4">
                            <ContextMenu>
                                <ContextMenuTrigger asChild>
                                    <div className="flex h-[150px] w-[300px] items-center justify-center rounded-md border border-dashed border-muted-foreground/50 bg-muted/50 text-sm">
                                        Right click here
                                    </div>
                                </ContextMenuTrigger>
                                <ContextMenuContent className="w-64">
                                    <ContextMenuItem inset>
                                        Back
                                        <ContextMenuShortcut>
                                            ⌘[
                                        </ContextMenuShortcut>
                                    </ContextMenuItem>
                                    <ContextMenuItem inset disabled>
                                        Forward
                                        <ContextMenuShortcut>
                                            ⌘]
                                        </ContextMenuShortcut>
                                    </ContextMenuItem>
                                    <ContextMenuItem inset>
                                        Reload
                                        <ContextMenuShortcut>
                                            ⌘R
                                        </ContextMenuShortcut>
                                    </ContextMenuItem>
                                    <ContextMenuSub>
                                        <ContextMenuSubTrigger inset>
                                            More Tools
                                        </ContextMenuSubTrigger>
                                        <ContextMenuSubContent className="w-48">
                                            <ContextMenuItem>
                                                Save Page As...
                                                <ContextMenuShortcut>
                                                    ⇧⌘S
                                                </ContextMenuShortcut>
                                            </ContextMenuItem>
                                            <ContextMenuItem>
                                                Create Shortcut...
                                            </ContextMenuItem>
                                            <ContextMenuItem>
                                                Name Window...
                                            </ContextMenuItem>
                                            <ContextMenuSeparator />
                                            <ContextMenuItem>
                                                Developer Tools
                                            </ContextMenuItem>
                                        </ContextMenuSubContent>
                                    </ContextMenuSub>
                                    <ContextMenuSeparator />
                                    <ContextMenuCheckboxItem checked>
                                        Show Bookmarks Bar
                                        <ContextMenuShortcut>
                                            ⌘⇧B
                                        </ContextMenuShortcut>
                                    </ContextMenuCheckboxItem>
                                    <ContextMenuCheckboxItem>
                                        Show Full URLs
                                    </ContextMenuCheckboxItem>
                                    <ContextMenuSeparator />
                                    <ContextMenuRadioGroup value="pedro">
                                        <ContextMenuLabel inset>
                                            People
                                        </ContextMenuLabel>
                                        <ContextMenuSeparator />
                                        <ContextMenuRadioItem value="pedro">
                                            Pedro Duarte
                                        </ContextMenuRadioItem>
                                        <ContextMenuRadioItem value="colm">
                                            Colm Tuite
                                        </ContextMenuRadioItem>
                                    </ContextMenuRadioGroup>
                                </ContextMenuContent>
                            </ContextMenu>
                        </div>
                    </div>

                    {/* Select */}
                    <div className="space-y-4">
                        <h3 className="text-xl font-semibold">Select</h3>
                        <div className="flex gap-4">
                            <Select
                                value={selectValue}
                                onValueChange={setSelectValue}
                            >
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Select a fruit" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="apple">Apple</SelectItem>
                                    <SelectItem value="banana">
                                        Banana
                                    </SelectItem>
                                    <SelectItem value="blueberry">
                                        Blueberry
                                    </SelectItem>
                                    <SelectItem value="grapes">
                                        Grapes
                                    </SelectItem>
                                    <SelectItem value="pineapple">
                                        Pineapple
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Hover Card */}
                    <div className="space-y-4">
                        <h3 className="text-xl font-semibold">Hover Card</h3>
                        <p className="text-sm text-muted-foreground">
                            Hover over the button to see the hover card.
                        </p>
                        <div className="flex gap-4">
                            <HoverCard>
                                <HoverCardTrigger asChild>
                                    <Button variant="link">@nextjs</Button>
                                </HoverCardTrigger>
                                <HoverCardContent className="w-80">
                                    <div className="flex justify-between space-x-4">
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold">
                                                @nextjs
                                            </h4>
                                            <p className="text-sm">
                                                The React Framework – created
                                                and maintained by @vercel.
                                            </p>
                                            <div className="flex items-center pt-2">
                                                <span className="text-xs text-muted-foreground">
                                                    Joined December 2021
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </HoverCardContent>
                            </HoverCard>
                        </div>
                    </div>

                    {/* Dropdown Menu */}
                    <div className="space-y-4">
                        <h3 className="text-xl font-semibold">Dropdown Menu</h3>
                        <div className="flex gap-4">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline">Open Menu</Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-56">
                                    <DropdownMenuLabel>
                                        My Account
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem>Profile</DropdownMenuItem>
                                    <DropdownMenuItem>Billing</DropdownMenuItem>
                                    <DropdownMenuItem>Team</DropdownMenuItem>
                                    <DropdownMenuItem>
                                        Subscription
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuSub>
                                        <DropdownMenuSubTrigger>
                                            Invite users
                                        </DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent>
                                            <DropdownMenuItem>
                                                Email
                                            </DropdownMenuItem>
                                            <DropdownMenuItem>
                                                Message
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem>
                                                More...
                                            </DropdownMenuItem>
                                        </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuCheckboxItem checked>
                                        Show notifications
                                    </DropdownMenuCheckboxItem>
                                    <DropdownMenuCheckboxItem>
                                        Hide keyboard shortcuts
                                    </DropdownMenuCheckboxItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuRadioGroup value="top">
                                        <DropdownMenuLabel>
                                            Position
                                        </DropdownMenuLabel>
                                        <DropdownMenuRadioItem value="top">
                                            Top
                                        </DropdownMenuRadioItem>
                                        <DropdownMenuRadioItem value="bottom">
                                            Bottom
                                        </DropdownMenuRadioItem>
                                        <DropdownMenuRadioItem value="right">
                                            Right
                                        </DropdownMenuRadioItem>
                                    </DropdownMenuRadioGroup>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem>Log out</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>

                    {/* Sheet */}
                    <div className="space-y-4">
                        <h3 className="text-xl font-semibold">Sheet</h3>
                        <div className="flex gap-4">
                            <Sheet>
                                <SheetTrigger asChild>
                                    <Button variant="outline">
                                        Open Sheet
                                    </Button>
                                </SheetTrigger>
                                <SheetContent>
                                    <SheetHeader>
                                        <SheetTitle>Edit Profile</SheetTitle>
                                        <SheetDescription>
                                            Make changes to your profile here.
                                            Click save when you're done.
                                        </SheetDescription>
                                    </SheetHeader>
                                    <div className="grid gap-4 py-4">
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <label
                                                htmlFor="name"
                                                className="text-right"
                                            >
                                                Name
                                            </label>
                                            <input
                                                id="name"
                                                defaultValue="Pedro Duarte"
                                                className="col-span-3 h-8 rounded-md border border-input bg-background px-3 text-sm"
                                            />
                                        </div>
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <label
                                                htmlFor="username"
                                                className="text-right"
                                            >
                                                Username
                                            </label>
                                            <input
                                                id="username"
                                                defaultValue="@peduarte"
                                                className="col-span-3 h-8 rounded-md border border-input bg-background px-3 text-sm"
                                            />
                                        </div>
                                    </div>
                                </SheetContent>
                            </Sheet>
                        </div>
                    </div>
                </section>

                {/* Examples Section */}
                <section className="space-y-8" id="examples">
                    <div className="space-y-2">
                        <h2 className="text-2xl font-semibold">Examples</h2>
                        <p className="text-sm text-muted-foreground">
                            Interactive examples showcasing various features and
                            patterns
                        </p>
                    </div>

                    {/* Word Wrap Example */}
                    <div className="space-y-4 border border-border rounded-lg p-6 bg-card">
                        <h3 className="text-xl font-semibold">
                            Word Wrap Settings
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            Example demonstrating word wrap settings using
                            editor settings hooks
                        </p>
                        <WordWrapExample />
                    </div>

                    {/* Conditional Word Wrap Example */}
                    <div className="space-y-4 border border-border rounded-lg p-6 bg-card">
                        <h3 className="text-xl font-semibold">
                            Conditional Rendering Example
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            Example showing conditional rendering based on user
                            preferences
                        </p>
                        <ConditionalWordWrapExample />
                    </div>
                </section>

                <div id="focus-outline">
                    <FocusOutlineShowcase />
                </div>
                </div>
            </div>
        </AppLayout>
    )
}

type TVariant = {
    name: string
    css: string
    description: string
}

export function FocusOutlineShowcase() {
    const [selectedVariant, setSelectedVariant] = useState(0)

    const variants: TVariant[] = [
        {
            name: 'Soft Glow',
            css: `*:focus-visible {
  outline: none !important;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.2) !important;
}`,
            description: 'Subtle white glow effect'
        },
        {
            name: 'Solid Ring',
            css: `*:focus-visible {
  outline: 2px solid #60a5fa !important;
  outline-offset: 2px !important;
}`,
            description: 'Blue outline with offset'
        },
        {
            name: 'Double Ring',
            css: `*:focus-visible {
  outline: none !important;
  box-shadow: 0 0 0 2px #1f2937, 0 0 0 4px #60a5fa !important;
}`,
            description: 'Layered ring effect'
        },
        {
            name: 'Neon Accent',
            css: `*:focus-visible {
  outline: none !important;
  box-shadow: 0 0 0 2px #8b5cf6, 0 0 12px rgba(139, 92, 246, 0.5) !important;
}`,
            description: 'Purple glow with blur'
        },
        {
            name: 'Minimal Underline',
            css: `*:focus-visible {
  outline: none !important;
  border-bottom: 2px solid #10b981 !important;
}`,
            description: 'Simple bottom border'
        }
    ]

    function applyVariantStyles(variant: TVariant) {
        const existingStyle = document.getElementById('focus-variant-style')
        if (existingStyle) {
            existingStyle.remove()
        }

        const style = document.createElement('style')
        style.id = 'focus-variant-style'
        style.textContent = `.focus-demo ${variant.css.replace('*:focus-visible', '*:focus-visible')}`
        document.head.appendChild(style)
    }

    function handleVariantChange(index: number) {
        setSelectedVariant(index)
        applyVariantStyles(variants[index])
    }

    useState(() => {
        applyVariantStyles(variants[0])
    })

    return (
        <div className="min-h-screen bg-[#1a1a1a] text-gray-300 p-8">
            <div className="max-w-4xl mx-auto space-y-8">
                <div>
                    <h1 className="text-2xl font-bold text-white mb-2">
                        Focus Outline Variants
                    </h1>
                    <p className="text-gray-400">
                        Press Tab to navigate through interactive elements
                    </p>
                </div>

                <div className="bg-[#252525] rounded-lg p-6 space-y-4">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Select Variant
                    </label>
                    <select
                        className="focus-demo w-full bg-[#1a1a1a] text-gray-300 border border-gray-700 rounded px-4 py-2"
                        value={selectedVariant}
                        onChange={(e) =>
                            handleVariantChange(Number(e.target.value))
                        }
                    >
                        {variants.map((variant, index) => (
                            <option key={index} value={index}>
                                {variant.name} - {variant.description}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="bg-[#252525] rounded-lg p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">
                        Interactive Elements
                    </h2>
                    <div className="focus-demo grid grid-cols-2 gap-4">
                        <button className="bg-[#3a3a3a] hover:bg-[#4a4a4a] text-gray-200 px-4 py-2 rounded">
                            Button
                        </button>
                        <input
                            type="text"
                            placeholder="Text input"
                            className="bg-[#1a1a1a] border border-gray-700 text-gray-300 px-4 py-2 rounded"
                        />
                        <textarea
                            placeholder="Textarea"
                            className="bg-[#1a1a1a] border border-gray-700 text-gray-300 px-4 py-2 rounded resize-none"
                            rows={3}
                        />
                        <div className="space-y-2">
                            <label className="flex items-center gap-2">
                                <input type="checkbox" className="w-4 h-4" />
                                <span className="text-sm">Checkbox option</span>
                            </label>
                            <label className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="radio"
                                    className="w-4 h-4"
                                />
                                <span className="text-sm">Radio option</span>
                            </label>
                        </div>
                        <a
                            href="#"
                            className="text-blue-400 hover:text-blue-300 underline"
                        >
                            Link element
                        </a>
                        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">
                            Primary Action
                        </button>
                    </div>
                </div>

                <div className="bg-[#252525] rounded-lg p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">
                        CSS Code
                    </h2>
                    <pre className="bg-[#1a1a1a] text-gray-300 p-4 rounded overflow-x-auto text-sm">
                        <code>{variants[selectedVariant].css}</code>
                    </pre>
                </div>
            </div>
        </div>
    )
}
