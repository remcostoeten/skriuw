"use client";

type HashIconProps = {
	size?: number;
	className?: string;
	stroke?: string;
	duration?: number;
};

function HashIcon({
	size = 24,
	className,
	stroke = "currentColor",
	duration = 2.4,
}: HashIconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 100 100"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
			role="img"
			aria-label="Hash"
		>
			<style>{`
				.hash-line {
					stroke: ${stroke};
					stroke-width: 7;
					stroke-linecap: round;
					fill: none;
					stroke-dasharray: 90;
					transform-box: fill-box;
					transform-origin: center;
				}
				.hash-v1 { animation: hash-draw ${duration}s ease-in-out infinite, hash-glide-x ${duration * 2}s ease-in-out infinite; }
				.hash-v2 { animation: hash-draw ${duration}s ease-in-out infinite 0.12s, hash-glide-x ${duration * 2}s ease-in-out infinite 0.12s; }
				.hash-h1 { animation: hash-draw ${duration}s ease-in-out infinite 0.24s, hash-glide-y ${duration * 2}s ease-in-out infinite 0.24s; }
				.hash-h2 { animation: hash-draw ${duration}s ease-in-out infinite 0.36s, hash-glide-y ${duration * 2}s ease-in-out infinite 0.36s; }
				@keyframes hash-draw {
					0% { stroke-dashoffset: 90; opacity: 0.15; }
					40% { stroke-dashoffset: 0; opacity: 1; }
					70% { stroke-dashoffset: 0; opacity: 1; }
					100% { stroke-dashoffset: -90; opacity: 0.15; }
				}
				@keyframes hash-glide-x {
					0%, 100% { transform: translateX(0); }
					50% { transform: translateX(3px); }
				}
				@keyframes hash-glide-y {
					0%, 100% { transform: translateY(0); }
					50% { transform: translateY(3px); }
				}
				@media (prefers-reduced-motion: reduce) {
					.hash-line { animation: none; stroke-dashoffset: 0; opacity: 1; }
				}
			`}</style>
			<line className="hash-line hash-v1" x1="38" y1="15" x2="30" y2="85" />
			<line className="hash-line hash-v2" x1="70" y1="15" x2="62" y2="85" />
			<line className="hash-line hash-h1" x1="18" y1="40" x2="85" y2="36" />
			<line className="hash-line hash-h2" x1="15" y1="66" x2="82" y2="62" />
		</svg>
	);
}

export { HashIcon };
