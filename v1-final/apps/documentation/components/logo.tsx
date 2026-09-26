import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & {
	size?: number;
};

export function Logo({ size = 22, ...props }: Props) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 40 40"
			width={size}
			height={size}
			preserveAspectRatio="xMidYMid meet"
			aria-hidden="true"
			{...props}
		>
			<g fill="currentColor">
				<rect x="4" y="8" width="8" height="24" rx="1" />
				<rect x="16" y="4" width="8" height="32" rx="1" />
				<rect x="28" y="12" width="8" height="16" rx="1" />
			</g>
		</svg>
	);
}
