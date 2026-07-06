export type TExtractKind = "article" | "selection" | "page";

export type TExtractResult = {
	title: string;
	url: string;
	markdown: string;
	excerpt?: string;
	byline?: string;
	tags: string[];
	kind: TExtractKind;
};

export type TCapturePayload = {
	url: string;
	title: string;
	markdown: string;
	selection: boolean;
	tags: string[];
	parentId?: string | null;
	source: "chrome-extension";
};

export type TCaptureResponse = {
	id: string;
	name: string;
	path: string;
};

export type TSettings = {
	apiBase: string;
	token: string;
	parentId: string | null;
	openAfterSave: boolean;
};

export type TTokenInfo = {
	id: string;
	name: string;
	scopes: string[];
	canWrite: boolean;
	expiresAt: string | null;
};

export type TFolderSummary = {
	id: string;
	name: string;
	parentId: string | null;
	sortOrder: number;
};

export type TSyncEventSummary = {
	id: string;
	tokenId: string | null;
	operation: "capture" | "export" | "folders";
	status: "success" | "error";
	resourceId: string | null;
	resourceName: string | null;
	message: string | null;
	source: string | null;
	createdAt: string;
};

export type TQueueItem = {
	id: string;
	payload: TCapturePayload;
	attempts: number;
	nextAt: number;
};

export type TRuntimeMessage =
	| {
			type: "clip";
			kind: TExtractKind;
			extra?: { title?: string; tags?: string[]; parentId?: string | null };
	  }
	| { type: "extract"; kind: TExtractKind };
