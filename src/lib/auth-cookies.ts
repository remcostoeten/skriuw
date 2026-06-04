import { type NextResponse } from "next/server";

export function safeRedirectPath(value: string | null): string {
	if (!value || !value.startsWith("/") || value.startsWith("//")) {
		return "/app";
	}
	return value;
}

export function forwardAuthCookies(source: Response, target: NextResponse): void {
	const cookies =
		typeof source.headers.getSetCookie === "function"
			? source.headers.getSetCookie()
			: [];
	if (cookies.length > 0) {
		for (const cookie of cookies) {
			target.headers.append("set-cookie", cookie);
		}
		return;
	}
	const setCookie = source.headers.get("set-cookie");
	if (setCookie) {
		target.headers.set("set-cookie", setCookie);
	}
}
