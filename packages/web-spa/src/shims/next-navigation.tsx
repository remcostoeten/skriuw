import {
	useRouter as useTanstackRouter,
	useRouterState,
} from "@tanstack/react-router";

type NextRouter = {
	push: (href: string) => void;
	replace: (href: string) => void;
	back: () => void;
	forward: () => void;
	refresh: () => void;
	prefetch: (href: string) => void;
};

export function useRouter(): NextRouter {
	const router = useTanstackRouter();

	return {
		push: (href) => {
			router.navigate({ to: href });
		},
		replace: (href) => {
			router.navigate({ to: href, replace: true });
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
			router.preloadRoute({ to: href }).catch(noopPrefetch);
		},
	};
}

export function usePathname(): string {
	return useRouterState({ select: (s) => s.location.pathname });
}

export function useSearchParams(): URLSearchParams {
	const search = useRouterState({ select: (s) => s.location.searchStr });
	return new URLSearchParams(search ?? "");
}

export function useParams<T extends Record<string, string>>(): T {
	return useRouterState({ select: (s) => s.matches.at(-1)?.params ?? {} }) as T;
}

export function redirect(href: string): never {
	window.location.assign(href);
	throw new Error(`redirect(${href})`);
}

export function notFound(): never {
	throw new Error("notFound()");
}

function noopPrefetch() {}
