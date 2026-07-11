export type AuthUser = {
	id: string;
	email: string;
	name: string;
	role: string | null;
	username: string | null;
	avatarColor: string | null;
};

export type BetterAuthUser = {
	id: string;
	email: string;
	name?: string | null;
	role?: string | null;
	username?: string | null;
	avatarColor?: string | null;
};

export function toAuthUser(rawUser: BetterAuthUser | null | undefined): AuthUser | null {
	if (!rawUser) return null;
	return {
		id: rawUser.id,
		email: rawUser.email ?? "",
		name: rawUser.name?.trim() || rawUser.email?.split("@")[0] || "Signed-in user",
		role: rawUser.role ?? null,
		username: rawUser.username ?? null,
		avatarColor: rawUser.avatarColor ?? null,
	};
}
