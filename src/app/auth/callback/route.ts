import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/core/supabase/server-client";

function getSafeNextPath(request: NextRequest): string {
  const next = request.nextUrl.searchParams.get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/app";
  }

  return next;
}

export async function GET(request: NextRequest) {
  const requestUrl = request.nextUrl;
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error_description") ?? requestUrl.searchParams.get("error");
  const next = getSafeNextPath(request);

  if (error) {
    const signInUrl = new URL("/sign-in", requestUrl.origin);
    signInUrl.searchParams.set("error", error);
    return NextResponse.redirect(signInUrl);
  }

  if (!code) {
    const signInUrl = new URL("/sign-in", requestUrl.origin);
    signInUrl.searchParams.set("error", "Missing OAuth callback code.");
    return NextResponse.redirect(signInUrl);
  }

  const supabase = await createServerSupabaseClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    const signInUrl = new URL("/sign-in", requestUrl.origin);
    signInUrl.searchParams.set("error", exchangeError.message);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
