import { auth } from "@/lib/auth";
import { type NextRequest, NextResponse } from "next/server";

const authOnlyRoutes = new Set(["/", "/sign-in", "/sign-up"]);
const publicRoutes = new Set(["/", "/sign-in", "/sign-up", "/project-planning"]);

function isPublicRoute(path: string) {
  return (
    publicRoutes.has(path) ||
    path.startsWith("/project-planning/") ||
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

  if (!hasSession && !isPublicRoute(path)) {
    return NextResponse.redirect(new URL("/sign-in", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
  ],
};
