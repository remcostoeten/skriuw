import { auth } from "@/lib/auth";
import { type NextRequest, NextResponse } from "next/server";

const authOnlyRoutes = new Set(["/", "/sign-in", "/sign-up"]);
const legacyAuthRoutes = new Set(["/sign-in", "/sign-up"]);
const publicRoutes = new Set(["/", "/sign-in", "/sign-up"]);
const marketingRoutes = new Set(["/journal", "/markdown-notes", "/notes", "/writing-app"]);

function getAppAuthURL(req: NextRequest, mode: "sign-in" | "sign-up", nextPath?: string) {
	const url = new URL("/app", req.nextUrl);
	url.searchParams.set("auth", mode);
	if (nextPath) {
		url.searchParams.set("next", nextPath);
	}
	return url;
}

function isPublicRoute(path: string) {
	return (
		publicRoutes.has(path) ||
		marketingRoutes.has(path) ||
		path === "/manifest.json" ||
		path === "/sw.js" ||
		path === "/offline.html" ||
		path === "/robots.txt" ||
		path === "/sitemap.xml" ||
		path.startsWith("/s/") ||
		path.endsWith("/opengraph-image") ||
		path.endsWith("/twitter-image") ||
		path === "/app" ||
		path.startsWith("/app/")
	);
}

export default async function proxy(req: NextRequest) {
	const path = req.nextUrl.pathname;
	const session = await auth.api.getSession({ headers: req.headers });
	const hasSession = Boolean(session);

	if (hasSession && authOnlyRoutes.has(path)) {
		return NextResponse.redirect(new URL("/app", req.nextUrl));
	}

	if (!hasSession && legacyAuthRoutes.has(path)) {
		return NextResponse.redirect(
			getAppAuthURL(req, path === "/sign-up" ? "sign-up" : "sign-in"),
		);
	}

	if (!hasSession && !isPublicRoute(path)) {
		return NextResponse.redirect(getAppAuthURL(req, "sign-in", `${path}${req.nextUrl.search}`));
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/((?!api|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)"],
};
