import { Link as TanstackLink } from "@tanstack/react-router";
import { forwardRef } from "react";

type Props = {
	href: string;
	children?: React.ReactNode;
	prefetch?: boolean;
	replace?: boolean;
	scroll?: boolean;
	target?: string;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">;

const NextLink = forwardRef<HTMLAnchorElement, Props>(function NextLink(
	{ href, prefetch: _prefetch, scroll: _scroll, replace, children, ...rest },
	ref,
) {
	const isExternal = /^(https?:)?\/\//.test(href) || href.startsWith("mailto:");

	if (isExternal) {
		return (
			<a ref={ref} href={href} {...rest}>
				{children}
			</a>
		);
	}

	const [path, query = ""] = href.split("?");
	const search: Record<string, string> = {};
	for (const [key, value] of new URLSearchParams(query)) {
		search[key] = value;
	}

	return (
		<TanstackLink ref={ref} to={path} search={search} replace={replace} {...rest}>
			{children}
		</TanstackLink>
	);
});

export default NextLink;
