import { auth } from "@/lib/auth";
import { isDemoGuestModeEnabled } from "@/lib/demo-guest";
import { isTrialModeEnabled } from "@/lib/trial";
import { type NextRequest, NextResponse } from "next/server";

const authOnlyRoutes = new Set(["/", "/sign-in", "/sign-up"]);
const publicRoutes = new Set(["/sign-in", "/sign-up", "/project-planning"]);

function isPublicRoute(path: string) {
	return (
		publicRoutes.has(path) ||
		path.startsWith("/project-planning/") ||
		path.startsWith("/s/") ||
		path.startsWith("/api/demo-guest/") ||
		path.startsWith("/api/trial/")
	);
}

function isDemoGuestAppRoute(path: string) {
	return path === "/app" || path.startsWith("/app/");
}

export default async function proxy(req: NextRequest) {
	const path = req.nextUrl.pathname;
	const session = await auth.api.getSession({ headers: req.headers });
	const hasSession = Boolean(session);

	if (hasSession && authOnlyRoutes.has(path)) {
		return NextResponse.redirect(new URL("/app", req.nextUrl));
	}

	if (!hasSession && isTrialModeEnabled() && isDemoGuestAppRoute(path)) {
		const enter = new URL("/api/trial/enter", req.nextUrl);
		enter.searchParams.set("next", `${path}${req.nextUrl.search}`);
		return NextResponse.redirect(enter);
	}

	if (!hasSession && isDemoGuestModeEnabled() && isDemoGuestAppRoute(path)) {
		const enter = new URL("/api/demo-guest/enter", req.nextUrl);
		enter.searchParams.set("next", `${path}${req.nextUrl.search}`);
		return NextResponse.redirect(enter);
	}

	if (!hasSession && !isPublicRoute(path)) {
		return NextResponse.redirect(new URL("/sign-in", req.nextUrl));
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/((?!api|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)"],
};
