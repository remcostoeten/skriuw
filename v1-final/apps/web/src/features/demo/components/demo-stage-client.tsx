"use client";

import dynamic from "next/dynamic";

type Props = {
	slug: string;
};

const DemoStageRoot = dynamic(
	() => import("./demo-stage").then((mod) => ({ default: mod.DemoStageRoot })),
	{ ssr: false },
);

export function DemoStageClient({ slug }: Props) {
	const query =
		typeof window === "undefined" ? null : new URLSearchParams(window.location.search);

	return (
		<DemoStageRoot
			slug={slug}
			autoplay={query?.get("autoplay") === "1"}
			loop={query?.get("loop") === "1"}
		/>
	);
}
