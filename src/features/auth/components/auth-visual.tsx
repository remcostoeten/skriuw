"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

function AuthVisualFallback() {
	return <div aria-hidden="true" className="auth-visual-fallback" />;
}

const PixelBlast = dynamic(() => import("@/shared/PixelBlast"), {
	ssr: false,
	loading: AuthVisualFallback,
});

export function AuthVisual() {
	const [shouldRender, setShouldRender] = useState(false);
	const [accentColor, setAccentColor] = useState<string | null>(null);

	useEffect(() => {
		const desktopQuery = window.matchMedia("(min-width: 768px)");
		const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

		const sync = () => {
			setShouldRender(desktopQuery.matches && !reducedMotionQuery.matches);
			const token = getComputedStyle(document.documentElement)
				.getPropertyValue("--project-purple")
				.trim();
			if (token) {
				setAccentColor(`hsl(${token.replaceAll(" ", ", ")})`);
			}
		};

		sync();
		desktopQuery.addEventListener("change", sync);
		reducedMotionQuery.addEventListener("change", sync);

		return () => {
			desktopQuery.removeEventListener("change", sync);
			reducedMotionQuery.removeEventListener("change", sync);
		};
	}, []);

	if (!shouldRender) {
		return null;
	}

	return (
		<>
			<AuthVisualFallback />
			{accentColor && (
				<PixelBlast
					variant="circle"
					pixelSize={2}
					color={accentColor}
					className="pixel-blast-auth-fade"
					style={{}}
					patternScale={1.5}
					patternDensity={0.6}
					enableRipples
					rippleSpeed={0.2}
					rippleThickness={0.25}
					rippleIntensityScale={0.6}
					speed={1.3}
					transparent
					edgeFade={0.2}
				/>
			)}
		</>
	);
}
