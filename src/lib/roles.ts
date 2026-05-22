export const ADMIN_ROLE = "admin";

export function isAdmin(role: string | null | undefined): boolean {
	return role === ADMIN_ROLE;
}
