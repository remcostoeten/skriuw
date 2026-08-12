import { useEffect, useState } from "react";
import { renderDiagram } from "@/shared/lib/diagram";

type Props = {
	chart: string;
};

export function MermaidPreview({ chart }: Props) {
	const [svg, setSvg] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void renderDiagram(chart).then((result) => {
			if (cancelled) return;
			if (result.ok) {
				setSvg(result.svg);
				setError(null);
			} else {
				setError(result.error);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [chart]);

	if (error) {
		return (
			<pre className="whitespace-pre-wrap font-mono text-xs text-destructive/90">{error}</pre>
		);
	}

	if (!svg) {
		return <p className="text-xs italic text-muted-foreground/60">Rendering diagram…</p>;
	}

	return (
		<div
			className="flex justify-center [&_svg]:h-auto [&_svg]:max-w-full"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid output under securityLevel strict
			dangerouslySetInnerHTML={{ __html: svg }}
		/>
	);
}
