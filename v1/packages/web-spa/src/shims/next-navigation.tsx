import { useRouter as useTanstackRouter, useRouterState } from "@tanstack/react-router";

type NextRouter = {
	push: (href: string) => void;
	replace: (href: string) => void;
	back: () => void;
	forward: () => void;
	refresh: () => void;
	prefetch: (href: string) => void;
};

let cachedSearch = "";
let cachedSearchParams = new URLSearchParams();

/**
 * Splits a Next-style href ("/app?note=abc") into the shape TanStack Router
 * expects — a bare `to` path plus a `search` object. Passing the raw href as
 * `to` would make the query string part of the path and fail route matching.
 */
function toNavigateOptions(href: string): { to: string; search: Record<string, string> } {
	const [path, query = ""] = href.split("?");
	const search: Record<string, string> = {};
	for (const [key, value] of new URLSearchParams(query)) {
		search[key] = value;
	}
	return { to: path, search };
}

export function useRouter(): NextRouter {
	const router = useTanstackRouter();

	return {
		push: (href) => {
			router.navigate(toNavigateOptions(href));
		},
		replace: (href) => {
			router.navigate({ ...toNavigateOptions(href), replace: true });
		},
		back: () => {
			router.history.back();
		},
		forward: () => {
			router.history.forward();
		},
		refresh: () => {
			router.invalidate();
		},
		prefetch: (href) => {
			router.preloadRoute(toNavigateOptions(href)).catch(noopPrefetch);
		},
	};
}

export function usePathname(): string {
	return useRouterState({ select: (s) => s.location.pathname });
}

export function useSearchParams(): URLSearchParams {
	const search = useRouterState({ select: (s) => s.location.searchStr });
	const nextSearch = search ?? "";
	if (cachedSearch !== nextSearch) {
		cachedSearch = nextSearch;
		cachedSearchParams = new URLSearchParams(nextSearch);
	}
	return cachedSearchParams;
}

export function useParams<T extends Record<string, string>>(): T {
	// TanStack's structural-sharing generics reject a caller-supplied return
	// type; the runtime shape is a plain params record, so cast around them.
	const options = {
		select: (s: { matches: Array<{ params: unknown }> }) => s.matches.at(-1)?.params ?? {},
	};
	return useRouterState(options as never) as T;
}

export function redirect(href: string): never {
	window.location.assign(href);
	throw new Error(`redirect(${href})`);
}

export function notFound(): never {
	throw new Error("notFound()");
}

function noopPrefetch() {}
