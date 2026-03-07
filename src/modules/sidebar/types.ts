// Sidebar section types for the modular sidebar system

export type SidebarSectionType = 
  | 'search'
  | 'favorites'
  | 'recents'
  | 'projects'
  | 'file-tree'
  | 'tags'
  | 'custom';

export type SidebarSection = {
  id: string;
  type: SidebarSectionType;
  name: string;
  icon?: string;
  isCollapsed: boolean;
  isVisible: boolean;
  order: number;
  // For custom sections
  customConfig?: {
    color?: string;
    description?: string;
  };
};

export type FavoriteItem = {
  id: string;
  itemId: string;
  itemType: 'file' | 'folder';
  addedAt: Date;
};

export type RecentItem = {
  id: string;
  itemId: string;
  itemType: 'file' | 'folder';
  accessedAt: Date;
};

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
  { name: 'Gray', value: 'bg-zinc-500', text: 'text-zinc-500' },
  { name: 'Red', value: 'bg-red-500', text: 'text-red-500' },
  { name: 'Orange', value: 'bg-orange-500', text: 'text-orange-500' },
  { name: 'Amber', value: 'bg-amber-500', text: 'text-amber-500' },
  { name: 'Green', value: 'bg-emerald-500', text: 'text-emerald-500' },
  { name: 'Teal', value: 'bg-teal-500', text: 'text-teal-500' },
  { name: 'Blue', value: 'bg-blue-500', text: 'text-blue-500' },
  { name: 'Purple', value: 'bg-purple-500', text: 'text-purple-500' },
  { name: 'Pink', value: 'bg-pink-500', text: 'text-pink-500' },
] as const;

export const DEFAULT_SECTIONS: SidebarSection[] = [
  { id: 'search', type: 'search', name: 'Search', isCollapsed: false, isVisible: true, order: 0 },
  { id: 'favorites', type: 'favorites', name: 'Favorites', isCollapsed: false, isVisible: true, order: 1 },
  { id: 'recents', type: 'recents', name: 'Recents', isCollapsed: false, isVisible: true, order: 2 },
  { id: 'projects', type: 'projects', name: 'Projects', isCollapsed: false, isVisible: true, order: 3 },
  { id: 'file-tree', type: 'file-tree', name: 'All Notes', isCollapsed: false, isVisible: true, order: 4 },
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
