import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const authOnlyRoutes = new Set(["/", "/sign-in", "/sign-up"]);
const publicRoutes = new Set(["/sign-in", "/sign-up"]);

function isPublicRoute(path: string) {
  return publicRoutes.has(path) || path.startsWith("/auth/callback");
}

function redirectWithCookies(url: URL, response: NextResponse) {
  const redirectResponse = NextResponse.redirect(url);
  for (const cookie of response.cookies.getAll()) {
    redirectResponse.cookies.set(cookie);
  }
  return redirectResponse;
}

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  let response = NextResponse.next({
    request: req,
  });

  let user = null;

  if (SUPABASE_URL && SUPABASE_KEY) {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            req.cookies.set(name, value);
          }

          response = NextResponse.next({
            request: req,
          });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });

    const result = await supabase.auth.getUser();
    user = result.data.user;
  }

  if (user && authOnlyRoutes.has(path)) {
    return redirectWithCookies(new URL("/app", req.nextUrl), response);
  }

  if (!user && !isPublicRoute(path)) {
    return redirectWithCookies(new URL("/sign-in", req.nextUrl), response);
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)"],
};
