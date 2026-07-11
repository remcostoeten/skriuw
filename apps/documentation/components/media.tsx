import type { ReactNode } from "react";

type Props = {
	src?: string;
	poster?: string;
	caption?: ReactNode;
	label?: string;
	aspect?: "video" | "square" | "wide";
};

const ASPECT_CLASS: Record<NonNullable<Props["aspect"]>, string> = {
	square: "aspect-square",
	video: "aspect-video",
	wide: "aspect-[21/9]",
};

function PlaceholderIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			width={28}
			height={28}
			fill="none"
			stroke="currentColor"
			strokeWidth={1.5}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<rect x="2" y="4" width="20" height="16" rx="2" />
			<path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" />
		</svg>
	);
}

export function Media({ src, poster, caption, label, aspect = "video" }: Props) {
	const isVideo = Boolean(src) && /\.(mp4|webm|mov)$/i.test(src ?? "");
	const frameClass = `not-prose relative overflow-hidden rounded-lg border border-fd-border bg-fd-muted/40 ${ASPECT_CLASS[aspect]}`;

	return (
		<figure className="my-6">
			<div className={frameClass}>
				{src ? (
					isVideo ? (
						<video
							className="h-full w-full object-cover"
							src={src}
							poster={poster}
							controls
							loop
							muted
							playsInline
						/>
					) : (
						<img className="h-full w-full object-cover" src={src} alt={label ?? ""} />
					)
				) : (
					<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-fd-muted-foreground">
						<PlaceholderIcon />
						<span className="text-sm font-medium">{label ?? "Recording coming soon"}</span>
						<span className="text-xs opacity-70">A short demo of this feature will land here.</span>
					</div>
				)}
			</div>
			{caption ? (
				<figcaption className="mt-2 text-center text-sm text-fd-muted-foreground">
					{caption}
				</figcaption>
			) : null}
		</figure>
	);
}
