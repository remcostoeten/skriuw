import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

const authOnlyRoutes = new Set(["/", "/sign-in", "/sign-up"]);
const legacyAuthRoutes = new Set(["/sign-in", "/sign-up"]);
const publicRoutes = new Set(["/", "/sign-in", "/sign-up"]);
const marketingRoutes = new Set(["/journal", "/markdown-notes", "/notes", "/writing-app"]);
const mobileWebDevelopmentOrigins = new Set(["http://localhost:8081", "http://127.0.0.1:8081"]);

function mobileWebCorsHeaders(request: NextRequest): HeadersInit | undefined {
	// The Expo web dev server is a separate origin from Next's local API. Native
	// Expo uses a manual Cookie header, whereas browsers must use credentials.
	if (process.env.NODE_ENV === "production") return undefined;
	const origin = request.headers.get("origin");
	if (!origin || !mobileWebDevelopmentOrigins.has(origin)) return undefined;

	return {
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Credentials": "true",
		"Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Idempotency-Key, If-Unmodified-Since",
		Vary: "Origin",
	};
}

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
		path.startsWith("/app/") ||
		// The docs recording stages render a fake, auth-free workspace. They 404
		// unless NEXT_PUBLIC_ENABLE_DEMO_ROUTES is set, so this stays closed in prod.
		path.startsWith("/demo")
	);
}

export default async function proxy(req: NextRequest) {
	const path = req.nextUrl.pathname;
	const corsHeaders = mobileWebCorsHeaders(req);
	if (corsHeaders && req.method === "OPTIONS") {
		return new NextResponse(null, { status: 204, headers: corsHeaders });
	}

	const next = () => {
		const response = NextResponse.next();
		if (corsHeaders) {
			for (const [key, value] of Object.entries(corsHeaders))
				response.headers.set(key, value);
		}
		return response;
	};
	// API routes return their own authentication responses; the page-navigation
	// redirects below must never turn an API 401 into HTML.
	if (path.startsWith("/api/")) return next();
	// Cookie presence only — no session-table lookup on every navigation.
	// Pages still verify the session server-side via getServerUser().
	const hasSession = Boolean(getSessionCookie(req));

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

	return next();
}

export const config = {
	matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)"],
};
