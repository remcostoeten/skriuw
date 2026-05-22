import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

const authOnlyRoutes = new Set(["/", "/sign-in", "/sign-up"]);
const publicRoutes = new Set(["/sign-in", "/sign-up", "/project-planning"]);

function isPublicRoute(path: string) {
	return publicRoutes.has(path) || path.startsWith("/project-planning/");
}

export default function proxy(req: NextRequest) {
	const path = req.nextUrl.pathname;
	const sessionCookie = getSessionCookie(req);
	const hasSession = Boolean(sessionCookie);

	if (hasSession && authOnlyRoutes.has(path)) {
		return NextResponse.redirect(new URL("/app", req.nextUrl));
	}

	if (!hasSession && !isPublicRoute(path)) {
		return NextResponse.redirect(new URL("/sign-in", req.nextUrl));
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/((?!api|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)"],
};
