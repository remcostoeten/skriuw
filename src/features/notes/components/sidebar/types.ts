// Sidebar section types for the notes-owned sidebar system

import type { RecentItem, RecentItemType } from "@/domain/recents/types";

export type SidebarSectionType =
	| "search"
	| "favorites"
	| "recents"
	| "projects"
	| "file-tree"
	| "tags"
	| "journal"
	| "custom";

export type SidebarSection = {
	id: string;
	type: SidebarSectionType;
	name: string;
	icon?: string;
	isCollapsed: boolean;
	isVisible: boolean;
	order: number;
	customConfig?: {
		color?: string;
		description?: string;
		fileIds?: string[];
		folderIds?: string[];
	};
};

export type FavoriteItem = {
	id: string;
	itemId: string;
	itemType: "file" | "folder";
	addedAt: Date;
};

export type { RecentItem, RecentItemType };

export type Project = {
	id: string;
	name: string;
	description?: string;
	color: string;
	icon?: string;
	fileIds: string[];
	folderIds: string[];
	createdAt: Date;
	updatedAt: Date;
};

export type SidebarConfig = {
	sections: SidebarSection[];
	favorites: FavoriteItem[];
	recents: RecentItem[];
	projects: Project[];
	maxRecents: number;
	showSectionHeaders: boolean;
	compactMode: boolean;
};

export const PROJECT_COLORS = [
	{ name: "Gray", value: "bg-project-gray", text: "text-project-gray" },
	{ name: "Red", value: "bg-project-red", text: "text-project-red" },
	{ name: "Orange", value: "bg-project-orange", text: "text-project-orange" },
	{ name: "Amber", value: "bg-project-amber", text: "text-project-amber" },
	{ name: "Green", value: "bg-project-green", text: "text-project-green" },
	{ name: "Teal", value: "bg-project-teal", text: "text-project-teal" },
	{ name: "Blue", value: "bg-project-blue", text: "text-project-blue" },
	{ name: "Purple", value: "bg-project-purple", text: "text-project-purple" },
	{ name: "Pink", value: "bg-project-pink", text: "text-project-pink" },
] as const;

export function resolveProjectColorClass(value: string) {
	if (PROJECT_COLORS.some((color) => color.value === value)) {
		return value;
	}

	return PROJECT_COLORS[0].value;
}

export const DEFAULT_SECTIONS: SidebarSection[] = [
	{
		id: "file-tree",
		type: "file-tree",
		name: "All Notes",
		isCollapsed: false,
		isVisible: true,
		order: 0,
	},
	{ id: "search", type: "search", name: "Search", isCollapsed: false, isVisible: true, order: 1 },
	{
		id: "journal",
		type: "journal",
		name: "Journal",
		isCollapsed: false,
		isVisible: true,
		order: 2,
	},
	{
		id: "favorites",
		type: "favorites",
		name: "Favorites",
		isCollapsed: false,
		isVisible: true,
		order: 3,
	},
	{
		id: "recents",
		type: "recents",
		name: "Recents",
		isCollapsed: false,
		isVisible: true,
		order: 4,
	},
	{
		id: "projects",
		type: "projects",
		name: "Projects",
		isCollapsed: false,
		isVisible: true,
		order: 5,
	},
];

export const DEFAULT_SIDEBAR_CONFIG: SidebarConfig = {
	sections: DEFAULT_SECTIONS,
	favorites: [],
	recents: [],
	projects: [],
	maxRecents: 10,
	showSectionHeaders: true,
	compactMode: false,
};
