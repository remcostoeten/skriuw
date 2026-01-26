"use client"

import * as React from "react"
import EmojiPicker, { Theme, EmojiClickData, Categories } from "emoji-picker-react"
import { useTheme } from "next-themes"
import { Button, Popover, PopoverContent, PopoverTrigger, Tabs, TabsContent, TabsList, TabsTrigger, Drawer, DrawerContent, DrawerTrigger } from "@skriuw/ui"
import { Smile, X, Search } from "lucide-react"
import { useMediaQuery } from "@skriuw/shared/client"
import { cn } from "@skriuw/shared"

import {
	Rocket,
	Star,
	Heart,
	Zap,
	Sun,
	Moon,
	Cloud,
	Flame,
	Sparkles,
	Trophy,
	Target,
	Flag,
	Bookmark,
	Bell,
	Calendar,
	Clock,
	Mail,
	MessageSquare,
	FileText,
	Folder,
	Home,
	Settings,
	User,
	Lock,
	Key,
	Shield,
	CheckCircle,
	AlertCircle,
	Info,
	HelpCircle,
	Code,
	Database,
	Globe,
	Wifi,
	Camera,
	Music,
	Video,
	Image,
	Lightbulb,
	PenTool,
	type LucideIcon
} from "lucide-react"

const ICON_CATEGORIES: { name: string; icons: { name: string; icon: LucideIcon }[] }[] = [
	{
		name: "General",
		icons: [
			{ name: "rocket", icon: Rocket },
			{ name: "star", icon: Star },
			{ name: "heart", icon: Heart },
			{ name: "zap", icon: Zap },
			{ name: "sparkles", icon: Sparkles },
			{ name: "flame", icon: Flame },
			{ name: "trophy", icon: Trophy },
			{ name: "target", icon: Target }
		]
	},
	{
		name: "Objects",
		icons: [
			{ name: "bookmark", icon: Bookmark },
			{ name: "bell", icon: Bell },
			{ name: "calendar", icon: Calendar },
			{ name: "clock", icon: Clock },
			{ name: "mail", icon: Mail },
			{ name: "message", icon: MessageSquare },
			{ name: "file", icon: FileText },
			{ name: "folder", icon: Folder }
		]
	},
	{
		name: "Interface",
		icons: [
			{ name: "home", icon: Home },
			{ name: "settings", icon: Settings },
			{ name: "user", icon: User },
			{ name: "lock", icon: Lock },
			{ name: "key", icon: Key },
			{ name: "shield", icon: Shield },
			{ name: "check", icon: CheckCircle },
			{ name: "alert", icon: AlertCircle }
		]
	},
	{
		name: "Tech",
		icons: [
			{ name: "code", icon: Code },
			{ name: "database", icon: Database },
			{ name: "globe", icon: Globe },
			{ name: "wifi", icon: Wifi },
			{ name: "lightbulb", icon: Lightbulb },
			{ name: "pen", icon: PenTool }
		]
	},
	{
		name: "Media",
		icons: [
			{ name: "camera", icon: Camera },
			{ name: "music", icon: Music },
			{ name: "video", icon: Video },
			{ name: "image", icon: Image },
			{ name: "sun", icon: Sun },
			{ name: "moon", icon: Moon },
			{ name: "cloud", icon: Cloud },
			{ name: "info", icon: Info },
			{ name: "help", icon: HelpCircle },
			{ name: "flag", icon: Flag }
		]
	}
]

type IconPickerProps = {
	onSelect: (iconName: string) => void
}

function IconPicker({ onSelect }: IconPickerProps) {
	const [search, setSearch] = React.useState("")

	const filteredCategories = ICON_CATEGORIES.map(category => ({
		...category,
		icons: category.icons.filter(icon =>
			icon.name.toLowerCase().includes(search.toLowerCase())
		)
	})).filter(category => category.icons.length > 0)

	return (
		<div className="space-y-3">
			<div className="relative">
				<Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
				<input
					type="text"
					placeholder="Search icons..."
					value={search}
					onChange={e => setSearch(e.target.value)}
					className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted/50 border border-border rounded-md outline-none focus:ring-1 focus:ring-ring"
				/>
			</div>
			<div className="max-h-[300px] overflow-y-auto space-y-4 pr-1">
				{filteredCategories.map(category => (
					<div key={category.name}>
						<div className="text-xs font-medium text-muted-foreground mb-2">
							{category.name}
						</div>
						<div className="grid grid-cols-6 gap-1">
							{category.icons.map(({ name, icon: Icon }) => (
								<Button
									key={name}
									variant="ghost"
									size="sm"
									className="h-8 w-8 p-0"
									onClick={() => onSelect(`lucide:${name}`)}
								>
									<Icon className="w-4 h-4" />
								</Button>
							))}
						</div>
					</div>
				))}
				{filteredCategories.length === 0 && (
					<div className="text-center text-sm text-muted-foreground py-8">
						No icons found
					</div>
				)}
			</div>
		</div>
	)
}

function EmojiPickerContent({
	activeTab,
	setActiveTab,
	value,
	onRemove,
	onEmojiSelect,
	onIconSelect,
	resolvedTheme,
	isDesktop
}: {
	activeTab: "emoji" | "icon"
	setActiveTab: (v: "emoji" | "icon") => void
	value?: string
	onRemove: () => void
	onEmojiSelect: (emojiData: EmojiClickData) => void
	onIconSelect: (iconName: string) => void
	resolvedTheme?: string
	isDesktop: boolean
}) {
	return (
		<Tabs
			value={activeTab}
			onValueChange={v => setActiveTab(v as "emoji" | "icon")}
			className="w-full h-full flex flex-col"
		>
			<div className="flex items-center justify-between border-b px-2 py-1.5 shrink-0">
				<TabsList className="h-8 bg-transparent p-0 gap-1">
					<TabsTrigger
						value="emoji"
						className="h-7 px-3 text-xs data-[state=active]:bg-muted"
					>
						Emoji
					</TabsTrigger>
					<TabsTrigger
						value="icon"
						className="h-7 px-3 text-xs data-[state=active]:bg-muted"
					>
						Icons
					</TabsTrigger>
				</TabsList>
				{value && (
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
						onClick={onRemove}
					>
						<X className="w-3 h-3 mr-1" />
						Remove
					</Button>
				)}
			</div>
			<TabsContent value="emoji" className="m-0 flex-1 min-h-0">
				<EmojiPicker
					onEmojiClick={onEmojiSelect}
					theme={resolvedTheme === "dark" ? Theme.DARK : Theme.LIGHT}
					width="100%"
					height={isDesktop ? 350 : "100%"}
					searchPlaceHolder="Search emoji..."
					previewConfig={{ showPreview: false }}
					autoFocusSearch={true}
					style={{
						backgroundColor: "transparent",
						border: "none",
						"--epr-bg-color": "transparent",
						"--epr-category-label-bg-color": "transparent",
						"--epr-text-color": "hsl(var(--foreground))",
						"--epr-search-border-color": "hsl(var(--border))",
						"--epr-search-input-bg-color": "hsl(var(--muted)/0.5)",
						"--epr-search-input-text-color": "hsl(var(--foreground))",
						"--epr-hover-bg-color": "hsl(var(--accent))",
						"--epr-emoji-size": "1.5rem"
					} as React.CSSProperties}
					categories={[
						{ category: Categories.SUGGESTED, name: "Recent" },
						{ category: Categories.SMILEYS_PEOPLE, name: "Smileys" },
						{ category: Categories.ANIMALS_NATURE, name: "Nature" },
						{ category: Categories.FOOD_DRINK, name: "Food" },
						{ category: Categories.TRAVEL_PLACES, name: "Travel" },
						{ category: Categories.ACTIVITIES, name: "Activities" },
						{ category: Categories.OBJECTS, name: "Objects" },
						{ category: Categories.SYMBOLS, name: "Symbols" },
						{ category: Categories.FLAGS, name: "Flags" }
					]}
				/>
			</TabsContent>
			<TabsContent value="icon" className="m-0 p-3 flex-1 min-h-0 overflow-hidden">
				<IconPicker onSelect={onIconSelect} />
			</TabsContent>
		</Tabs>
	)
}

type Props = {
	value?: string
	onChange: (value?: string) => void
	trigger?: React.ReactNode
	className?: string
}

export function EmojiIconPicker({ value, onChange, trigger, className }: Props) {
	const [open, setOpen] = React.useState(false)
	const [activeTab, setActiveTab] = React.useState<"emoji" | "icon">("emoji")
	const { resolvedTheme } = useTheme()
	const isDesktop = useMediaQuery("(min-width: 768px)")

	const handleEmojiSelect = (emojiData: EmojiClickData) => {
		onChange(emojiData.emoji)
		setOpen(false)
	}

	const handleIconSelect = (iconName: string) => {
		onChange(iconName)
		setOpen(false)
	}

	const handleRemove = () => {
		onChange(undefined)
		setOpen(false)
	}

	const renderValue = () => {
		if (!value) return null
		if (value.startsWith("lucide:")) {
			const iconName = value.replace("lucide:", "")
			const allIcons = ICON_CATEGORIES.flatMap(c => c.icons)
			const found = allIcons.find(i => i.name === iconName)
			if (found) {
				const Icon = found.icon
				return <Icon className="w-8 h-8" />
			}
		}
		return <span className="text-4xl">{value}</span>
	}

	const triggerContent = trigger || (
		<Button
			variant="ghost"
			size={value ? "default" : "sm"}
			className={cn(
				value
					? "h-auto p-2 hover:bg-muted/50 -ml-2"
					: "text-muted-foreground opacity-50 hover:opacity-100 transition-opacity -ml-3",
				className
			)}
		>
			{value ? (
				renderValue()
			) : (
				<>
					<Smile className="w-4 h-4 mr-2" />
					Add icon
				</>
			)}
		</Button>
	)

	const content = (
		<EmojiPickerContent
			activeTab={activeTab}
			setActiveTab={setActiveTab}
			value={value}
			onRemove={handleRemove}
			onEmojiSelect={handleEmojiSelect}
			onIconSelect={handleIconSelect}
			resolvedTheme={resolvedTheme}
			isDesktop={isDesktop}
		/>
	)

	if (isDesktop) {
		return (
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					{triggerContent}
				</PopoverTrigger>
				<PopoverContent
					className="w-[350px] p-0"
					align="start"
					sideOffset={8}
				>
					{content}
				</PopoverContent>
			</Popover>
		)
	}

	return (
		<Drawer open={open} onOpenChange={setOpen}>
			<DrawerTrigger asChild>
				{triggerContent}
			</DrawerTrigger>
			<DrawerContent className="h-[50vh] focus-visible:outline-none">
				<div className="h-full mt-4">
					{content}
				</div>
			</DrawerContent>
		</Drawer>
	)
}

export function renderIcon(value?: string, className?: string) {
	if (!value) return null
	if (value.startsWith("lucide:")) {
		const iconName = value.replace("lucide:", "")
		const allIcons = ICON_CATEGORIES.flatMap(c => c.icons)
		const found = allIcons.find(i => i.name === iconName)
		if (found) {
			const Icon = found.icon
			return <Icon className={cn("w-8 h-8", className)} />
		}
	}
	return <span className={cn("text-4xl", className)}>{value}</span>
}
