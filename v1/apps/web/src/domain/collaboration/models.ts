export type TCollabPermission = "viewer" | "editor";
export type TCollabRequestStatus = "pending" | "accepted" | "declined";

export type TCollabRequest = {
	id: string;
	noteId: string;
	noteName: string;
	requesterId: string;
	requesterName: string;
	requesterImage: string | null;
	ownerId: string;
	status: TCollabRequestStatus;
	message: string | null;
	createdAt: string;
};

export type TCollaborator = {
	id: string;
	noteId: string;
	userId: string;
	userName: string;
	userImage: string | null;
	userEmail: string;
	permission: TCollabPermission;
	invitedBy: string;
	createdAt: string;
};

export type TSharedNote = {
	id: string;
	name: string;
	ownerId: string;
	ownerName: string;
	permission: TCollabPermission;
	createdAt: string;
	updatedAt: string;
	preferredEditorMode: string | null;
	content: string;
	richContent: unknown;
	tags: string[];
};

export type TNotification = {
	id: string;
	type: "collab_request" | "collab_accepted" | "collab_declined" | "collab_revoked";
	payload: Record<string, unknown>;
	read: boolean;
	createdAt: string;
};
