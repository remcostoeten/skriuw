import { type ComponentType, createElement, lazy, Suspense } from "react";

type DynamicOptions = {
	ssr?: boolean;
	loading?: () => React.ReactNode;
};

type Loader<P> = () => Promise<ComponentType<P> | { default: ComponentType<P> }>;

export default function dynamic<P extends object>(
	loader: Loader<P>,
	options: DynamicOptions = {},
): ComponentType<P> {
	const LazyComponent = lazy(async () => {
		const mod = await loader();
		return "default" in mod ? mod : { default: mod };
	});

	return function DynamicComponent(props: P) {
		const fallback = options.loading ? options.loading() : null;
		return createElement(Suspense, { fallback }, createElement(LazyComponent, props));
	};
}
