import { useEffect, useState } from "react";
import { diagramResultParts } from "@/features/ai/actions/diagram-repair";
import {
  primaryFontFamily,
  readMermaidPalette,
  renderMermaidSvg,
  type MermaidRenderResult,
} from "@/features/editor/mermaid-render";

type Props = {
  text: string;
};

/** A settled AI result with its Mermaid fences drawn instead of listed as source. */
export function AiRunResultBody({ text }: Props) {
  return (
    <>
      {diagramResultParts(text).map((part, index) =>
        part.kind === "diagram" ? (
          <AiRunDiagram key={`${index}-diagram`} source={part.source} />
        ) : (
          <span key={`${index}-text`}>{part.text}</span>
        ),
      )}
    </>
  );
}

function renderForDocument(source: string): Promise<MermaidRenderResult> {
  const root = document.documentElement;
  return renderMermaidSvg(source, readMermaidPalette(root), {
    animate: false,
    font: primaryFontFamily(getComputedStyle(root).getPropertyValue("--font-sans")),
  });
}

function AiRunDiagram({ source }: { source: string }) {
  const [result, setResult] = useState<MermaidRenderResult | null>(null);

  useEffect(() => {
    let current = true;
    renderForDocument(source).then((next) => {
      if (current) setResult(next);
    });
    return () => {
      current = false;
    };
  }, [source]);

  if (result === null || !result.ok) {
    return (
      <>
        <code className="skriuw-suggestion-diagram-source">{source}</code>
        {result !== null && (
          <span role="alert" className="skriuw-suggestion-diagram-error">
            {result.message}
          </span>
        )}
      </>
    );
  }
  return (
    <div
      className="skriuw-suggestion-diagram"
      role="img"
      aria-label="Diagram preview"
      style={{ maxWidth: result.width }}
      dangerouslySetInnerHTML={{ __html: result.svg }}
    />
  );
}
