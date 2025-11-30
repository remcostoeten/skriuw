import {
    type ComponentProps as BlockNoteComponentProps,
    type Components
} from '@blocknote/react'
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator
} from '@/shared/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { Input } from '@/shared/ui/input'
import { cn } from '@/shared/utilities'
import React, { forwardRef } from 'react'

const ToolbarRoot = forwardRef<HTMLDivElement, BlockNoteComponentProps['FormattingToolbar']['Root']>(
    ({ className, children, onMouseEnter, onMouseLeave }, ref) => (
        <div
            ref={ref}
            role="toolbar"
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            className={cn(
                'bn-toolbar flex items-center gap-1 rounded-md border border-border bg-background/90 px-2 py-1 shadow-md backdrop-blur',
                className
            )}
        >
            {children}
        </div>
    )
)

const ToolbarButton = ({
    className,
    children,
    label,
    icon,
    onClick,
    isSelected,
    isDisabled,
    mainTooltip,
    secondaryTooltip
}: BlockNoteComponentProps['FormattingToolbar']['Button']) => (
    <button
        type="button"
        className={cn(
            'bn-toolbar-button inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-border/60 bg-muted/60 px-2 text-xs font-medium text-foreground/90 transition hover:bg-muted',
            isSelected && 'bg-primary/20 text-primary border-primary/40',
            isDisabled && 'cursor-not-allowed opacity-40',
            className
        )}
        disabled={isDisabled}
        title={secondaryTooltip || mainTooltip || label}
        onClick={(event) => {
            if (isDisabled) return
            onClick?.(event as any)
        }}
    >
        {icon}
        {label && !children ? <span className="ml-1">{label}</span> : children}
    </button>
)

const ToolbarSelect = ({
    className,
    items,
    isDisabled
}: BlockNoteComponentProps['FormattingToolbar']['Select']) => {
    const selected = items.find((item) => item.isSelected) ?? items[0]

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        'bn-toolbar-select inline-flex h-8 items-center justify-between rounded-md border border-border/60 bg-muted/60 px-2 text-xs font-medium text-foreground/90',
                        isDisabled && 'cursor-not-allowed opacity-40',
                        className
                    )}
                    disabled={isDisabled}
                >
                    <span className="flex items-center gap-1">
                        {selected?.icon}
                        {selected?.text}
                    </span>
                    <span className="text-muted-foreground">v</span>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bn-toolbar-select-menu">
                {items.map((item) => (
                    <DropdownMenuItem
                        key={item.text}
                        data-selected={item.isSelected ? '' : undefined}
                        className={cn(item.isSelected && 'bg-muted text-primary')}
                        onSelect={(event) => {
                            event.preventDefault()
                            if (item.isDisabled) return
                            item.onClick?.()
                        }}
                    >
                        <span className="mr-2 inline-flex items-center gap-1">
                            {item.icon}
                            {item.text}
                        </span>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

const SideMenuRoot = ({ className, children }: BlockNoteComponentProps['SideMenu']['Root']) => (
    <div className={cn('bn-side-menu flex flex-col items-center gap-2 rounded-md bg-background/80 p-1 shadow', className)}>
        {children}
    </div>
)

const SideMenuButton = ({
    className,
    icon,
    label,
    onClick,
    draggable,
    onDragEnd,
    onDragStart,
    children
}: BlockNoteComponentProps['SideMenu']['Button']) => (
    <button
        type="button"
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className={cn(
            'bn-side-menu-button flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-muted/70 text-muted-foreground transition hover:bg-muted',
            className
        )}
        onClick={onClick}
        title={label}
    >
        {icon || children}
    </button>
)

const SuggestionMenuRoot = ({
    id,
    className,
    children
}: BlockNoteComponentProps['SuggestionMenu']['Root']) => (
    <div
        id={id}
        className={cn(
            'bn-suggestion-menu min-w-[260px] rounded-lg border border-border bg-background/95 p-2 text-sm shadow-xl backdrop-blur',
            className
        )}
    >
        {children}
    </div>
)

const SuggestionMenuItem = ({
    className,
    isSelected,
    onClick,
    item
}: BlockNoteComponentProps['SuggestionMenu']['Item']) => (
    <button
        type="button"
        onClick={onClick}
        className={cn(
            'bn-suggestion-item flex w-full items-start gap-2 rounded-md px-2 py-1 text-left text-sm transition hover:bg-muted',
            isSelected && 'bg-muted text-primary',
            className
        )}
    >
        <div className="text-base">{item.icon ?? '*'}</div>
        <div className="flex-1">
            <div className="font-medium leading-none">{item.title || 'Unknown'}</div>
            {item.description && (
                <div className="text-xs text-muted-foreground">{item.description}</div>
            )}
        </div>
    </button>
)

const SuggestionMenuEmpty = ({ className, children }: BlockNoteComponentProps['SuggestionMenu']['EmptyItem']) => (
    <div className={cn('bn-suggestion-empty px-2 py-1 text-sm text-muted-foreground', className)}>
        {children}
    </div>
)

const SuggestionMenuLabel = ({ className, children }: BlockNoteComponentProps['SuggestionMenu']['Label']) => (
    <div className={cn('bn-suggestion-label px-2 pb-1 text-xs uppercase tracking-wide text-muted-foreground', className)}>
        {children}
    </div>
)

const SuggestionMenuLoader = ({ className }: BlockNoteComponentProps['SuggestionMenu']['Loader']) => (
    <div className={cn('bn-suggestion-loader px-2 py-2 text-sm text-muted-foreground', className)}>
        Loading...
    </div>
)

const GridSuggestionMenuRoot = ({ id, className, columns, children }: BlockNoteComponentProps['GridSuggestionMenu']['Root']) => (
    <div
        id={id}
        className={cn(
            'bn-grid-suggestion-menu rounded-lg border border-border bg-background/95 p-3 shadow-xl backdrop-blur',
            className
        )}
        style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gap: '0.35rem'
        }}
    >
        {children}
    </div>
)

const GridSuggestionMenuItem = ({
    className,
    isSelected,
    onClick,
    item
}: BlockNoteComponentProps['GridSuggestionMenu']['Item']) => (
    <button
        type="button"
        onClick={onClick}
        className={cn(
            'bn-grid-suggestion-item flex flex-col items-center rounded-md border border-transparent bg-muted/40 p-2 text-xs text-muted-foreground transition hover:border-border hover:bg-muted/70',
            isSelected && 'border-primary text-primary',
            className
        )}
    >
        <div className="text-xl">{item.icon}</div>
        <span className="mt-1 truncate">{item.title || 'Unknown'}</span>
    </button>
)

const GridSuggestionMenuEmpty = ({ className, children }: BlockNoteComponentProps['GridSuggestionMenu']['EmptyItem']) => (
    <div className={cn('bn-grid-suggestion-empty col-span-full text-center text-sm text-muted-foreground', className)}>
        {children}
    </div>
)

const GridSuggestionMenuLoader = ({ className, columns }: BlockNoteComponentProps['GridSuggestionMenu']['Loader']) => (
    <div
        className={cn('bn-grid-suggestion-loader col-span-full text-center text-sm text-muted-foreground', className)}
        style={{ gridColumn: `span ${columns}` }}
    >
        Loading...
    </div>
)

const TableHandleRoot = ({
    className,
    children,
    draggable,
    onDragEnd,
    onDragStart
}: BlockNoteComponentProps['TableHandle']['Root']) => (
    <div
        className={cn(
            'bn-table-handle flex cursor-grab select-none items-center justify-center rounded-md border border-border bg-background px-2 py-1 text-xs shadow',
            className
        )}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
    >
        {children}
    </div>
)

const TableExtendButton = ({
    className,
    onClick,
    onMouseDown,
    children
}: BlockNoteComponentProps['TableHandle']['ExtendButton']) => (
    <button
        type="button"
        className={cn('bn-table-extend-button rounded-md border border-border bg-muted px-2 py-1 text-xs', className)}
        onClick={onClick}
        onMouseDown={onMouseDown}
    >
        {children}
    </button>
)

const FilePanelRoot = ({ className, children }: BlockNoteComponentProps['FilePanel']['Root']) => (
    <div className={cn('bn-file-panel rounded-xl border border-border bg-background p-4 shadow', className)}>
        {children}
    </div>
)

const FilePanelButton = ({ className, onClick, children, label }: BlockNoteComponentProps['FilePanel']['Button']) => (
    <button
        type="button"
        className={cn(
            'bn-file-panel-button inline-flex items-center justify-center rounded-md border border-border bg-muted px-3 py-1 text-sm font-medium',
            className
        )}
        onClick={onClick}
    >
        {children || label}
    </button>
)

const FilePanelInput = ({
    className,
    placeholder,
    onChange,
    value,
    onKeyDown,
    ...rest
}: BlockNoteComponentProps['FilePanel']['TextInput']) => (
    <Input
        className={cn('bn-file-panel-input', className)}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        {...rest}
    />
)

const FilePanelFileInput = ({ className, onChange, accept }: BlockNoteComponentProps['FilePanel']['FileInput']) => (
    <input
        type="file"
        className={cn('bn-file-panel-file-input text-sm', className)}
        accept={accept}
        onChange={(event) => onChange?.(event.target.files?.[0] ?? null)}
    />
)

const FilePanelTab = ({ className, children }: BlockNoteComponentProps['FilePanel']['TabPanel']) => (
    <div className={cn('bn-file-panel-tab space-y-2', className)}>{children}</div>
)

const BadgeRoot = ({ className, text, icon, onClick }: BlockNoteComponentProps['Generic']['Badge']['Root']) => (
    <button
        type="button"
        onClick={onClick}
        className={cn(
            'bn-badge inline-flex items-center gap-2 rounded-full border border-border px-2 py-0.5 text-xs',
            className
        )}
    >
        {icon}
        <span>{text}</span>
    </button>
)

const BadgeGroup = ({ className, children }: BlockNoteComponentProps['Generic']['Badge']['Group']) => (
    <div className={cn('bn-badge-group flex flex-wrap gap-1', className)}>{children}</div>
)

const FormRoot = ({ children }: BlockNoteComponentProps['Generic']['Form']['Root']) => (
    <div className="bn-form space-y-2">{children}</div>
)

const FormTextInput = ({
    className,
    placeholder,
    value,
    onChange,
    onKeyDown,
    icon,
    rightSection,
    disabled,
    ...rest
}: BlockNoteComponentProps['Generic']['Form']['TextInput']) => (
    <div className={cn('bn-form-input relative flex items-center', className)}>
        {icon && <span className="pointer-events-none pl-2 text-muted-foreground">{icon}</span>}
        <Input
            className={cn(icon ? 'pl-8' : '', rightSection ? 'pr-8' : '')}
            placeholder={placeholder}
            value={value}
            disabled={disabled}
            onChange={onChange}
            onKeyDown={onKeyDown}
            {...rest}
        />
        {rightSection && <span className="absolute right-2 text-muted-foreground">{rightSection}</span>}
    </div>
)

const MenuRoot = ({
    children,
    onOpenChange
}: BlockNoteComponentProps['Generic']['Menu']['Root']) => (
    <DropdownMenu onOpenChange={onOpenChange}>{children}</DropdownMenu>
)

const MenuTrigger = ({ children }: BlockNoteComponentProps['Generic']['Menu']['Trigger']) => (
    <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
)

const MenuDropdown = ({ className, children }: BlockNoteComponentProps['Generic']['Menu']['Dropdown']) => (
    <DropdownMenuContent className={cn('bn-menu min-w-[220px]', className)}>{children}</DropdownMenuContent>
)

const MenuItem = ({
    className,
    children,
    onClick,
    icon,
    ...itemProps
}: BlockNoteComponentProps['Generic']['Menu']['Item']) => (
    <DropdownMenuItem
        className={className}
        {...itemProps}
        onSelect={(event) => {
            event.preventDefault()
            onClick?.()
        }}
    >
        {icon}
        {children}
    </DropdownMenuItem>
)

const MenuLabel = ({ className, children }: BlockNoteComponentProps['Generic']['Menu']['Label']) => (
    <DropdownMenuLabel className={className}>{children}</DropdownMenuLabel>
)

const MenuDivider = ({ className }: BlockNoteComponentProps['Generic']['Menu']['Divider']) => (
    <DropdownMenuSeparator className={className} />
)

const MenuButton = ({ className, children, onClick }: BlockNoteComponentProps['Generic']['Menu']['Button']) => (
    <button
        type="button"
        className={cn('bn-menu-button inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted', className)}
        onClick={onClick}
    >
        {children}
    </button>
)

const PopoverRoot = ({
    children,
    opened
}: BlockNoteComponentProps['Generic']['Popover']['Root']) => (
    <Popover open={opened}>{children}</Popover>
)

const PopoverTriggerWrapper = ({ children }: BlockNoteComponentProps['Generic']['Popover']['Trigger']) => (
    <PopoverTrigger asChild>{children}</PopoverTrigger>
)

const PopoverContentWrapper = ({ className, children }: BlockNoteComponentProps['Generic']['Popover']['Content']) => (
    <PopoverContent className={cn('bn-popover-content', className)}>{children}</PopoverContent>
)

const GenericToolbarRoot = ToolbarRoot
const GenericToolbarButton = ToolbarButton
const GenericToolbarSelect = ToolbarSelect

const CommentsCard = ({ className, children }: BlockNoteComponentProps['Comments']['Card']) => (
    <div className={cn('bn-comments-card rounded-lg border border-border bg-background/95 p-3 shadow', className)}>{children}</div>
)

const CommentsCardSection = ({ className, children }: BlockNoteComponentProps['Comments']['CardSection']) => (
    <div className={cn('bn-comments-card-section py-2', className)}>{children}</div>
)

const CommentsExpandPrompt = ({ className, children }: BlockNoteComponentProps['Comments']['ExpandSectionsPrompt']) => (
    <div className={cn('bn-comments-expand text-xs text-muted-foreground', className)}>{children}</div>
)

const CommentsEditor = ({ className, children }: BlockNoteComponentProps['Comments']['Editor']) => (
    <div className={cn('bn-comments-editor', className)}>{children}</div>
)

const CommentsComment = ({ className, children }: BlockNoteComponentProps['Comments']['Comment']) => (
    <div className={cn('bn-comments-comment rounded-md border border-border/60 bg-muted/40 p-2 text-sm', className)}>
        {children}
    </div>
)

export const shadcnComponents: Components = {
    FormattingToolbar: {
        Root: ToolbarRoot,
        Button: ToolbarButton,
        Select: ToolbarSelect
    },
    LinkToolbar: {
        Root: ToolbarRoot,
        Button: ToolbarButton,
        Select: ToolbarSelect
    },
    SideMenu: {
        Root: SideMenuRoot,
        Button: SideMenuButton
    },
    SuggestionMenu: {
        Root: SuggestionMenuRoot,
        Item: SuggestionMenuItem,
        EmptyItem: SuggestionMenuEmpty,
        Label: SuggestionMenuLabel,
        Loader: SuggestionMenuLoader
    },
    GridSuggestionMenu: {
        Root: GridSuggestionMenuRoot,
        Item: GridSuggestionMenuItem,
        EmptyItem: GridSuggestionMenuEmpty,
        Loader: GridSuggestionMenuLoader
    },
    FilePanel: {
        Root: FilePanelRoot,
        Button: FilePanelButton,
        FileInput: FilePanelFileInput,
        TabPanel: FilePanelTab,
        TextInput: FilePanelInput
    },
    TableHandle: {
        Root: TableHandleRoot,
        ExtendButton: TableExtendButton
    },
    Comments: {
        Card: CommentsCard,
        CardSection: CommentsCardSection,
        ExpandSectionsPrompt: CommentsExpandPrompt,
        Editor: CommentsEditor,
        Comment: CommentsComment
    },
    Generic: {
        Badge: {
            Root: BadgeRoot,
            Group: BadgeGroup
        },
        Form: {
            Root: FormRoot,
            TextInput: FormTextInput
        },
        Menu: {
            Root: MenuRoot,
            Trigger: MenuTrigger,
            Dropdown: MenuDropdown,
            Divider: MenuDivider,
            Item: MenuItem,
            Label: MenuLabel,
            Button: MenuButton
        },
        Popover: {
            Root: PopoverRoot,
            Trigger: PopoverTriggerWrapper,
            Content: PopoverContentWrapper
        },
        Toolbar: {
            Root: GenericToolbarRoot,
            Button: GenericToolbarButton,
            Select: GenericToolbarSelect
        }
    }
} as Components
