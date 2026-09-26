import { forwardRef } from "react";

type Props = {
	src: string | { src: string };
	alt?: string;
	width?: number | string;
	height?: number | string;
	fill?: boolean;
	priority?: boolean;
	quality?: number;
	loading?: "eager" | "lazy";
} & Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "width" | "height">;

const NextImage = forwardRef<HTMLImageElement, Props>(function NextImage(
	{ src, alt = "", fill, priority: _priority, quality: _quality, style, ...rest },
	ref,
) {
	const resolvedSrc = typeof src === "string" ? src : src.src;
	const fillStyle: React.CSSProperties | undefined = fill
		? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style }
		: style;

	return <img ref={ref} src={resolvedSrc} alt={alt} style={fillStyle} {...rest} />;
});

export default NextImage;
