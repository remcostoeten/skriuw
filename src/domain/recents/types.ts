export type RecentItemType = "file" | "folder";

export type RecentItem = {
	id: string;
	itemId: string;
	itemType: RecentItemType;
	accessedAt: Date;
};
