import { useMemo } from 'react';

interface MarkdownRendererProps {
  content: string;
}

// Simple markdown renderer
export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const rendered = useMemo(() => {
    const lines = content.split('\n');
    const elements: JSX.Element[] = [];
    let inList = false;
    let listItems: JSX.Element[] = [];
    let listKey = 0;

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(<ul key={`list-${listKey}`} className="list-disc list-inside space-y-1 mb-4 text-foreground/80">{listItems}</ul>);
        listItems = [];
        listKey++;
      }
      inList = false;
    };

    const renderInline = (text: string): React.ReactNode[] => {
      const parts: React.ReactNode[] = [];
      let remaining = text;
      let key = 0;

      while (remaining.length > 0) {
        // Bold + italic
        const boldItalicMatch = remaining.match(/\*\*\*(.*?)\*\*\*/);
        const boldMatch = remaining.match(/\*\*(.*?)\*\*/);
        const italicMatch = remaining.match(/\*(.*?)\*/);
        const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
        const codeMatch = remaining.match(/`([^`]+)`/);

        const matches = [
          boldItalicMatch && { index: boldItalicMatch.index!, type: 'bolditalic', match: boldItalicMatch },
          boldMatch && { index: boldMatch.index!, type: 'bold', match: boldMatch },
          italicMatch && { index: italicMatch.index!, type: 'italic', match: italicMatch },
          linkMatch && { index: linkMatch.index!, type: 'link', match: linkMatch },
          codeMatch && { index: codeMatch.index!, type: 'code', match: codeMatch },
        ].filter(Boolean).sort((a, b) => a!.index - b!.index);

        if (matches.length === 0) {
          parts.push(<span key={key++}>{remaining}</span>);
          break;
        }

        const first = matches[0]!;
        if (first.index > 0) {
          parts.push(<span key={key++}>{remaining.slice(0, first.index)}</span>);
        }

        switch (first.type) {
          case 'bolditalic':
            parts.push(<strong key={key++} className="italic">{first.match[1]}</strong>);
            remaining = remaining.slice(first.index + first.match[0].length);
            continue;
          case 'bold':
            parts.push(<strong key={key++} className="font-semibold text-foreground">{first.match[1]}</strong>);
            remaining = remaining.slice(first.index + first.match[0].length);
            continue;
          case 'italic':
            parts.push(<em key={key++} className="italic">{first.match[1]}</em>);
            remaining = remaining.slice(first.index + first.match[0].length);
            continue;
          case 'link':
            parts.push(
              <a key={key++} href={first.match[2]} className="text-foreground underline decoration-foreground/40 underline-offset-2 hover:decoration-foreground/80 font-medium" target="_blank" rel="noopener">
                {first.match[1]}
              </a>
            );
            remaining = remaining.slice(first.index + first.match[0].length);
            continue;
          case 'code':
            parts.push(<code key={key++} className="px-1.5 py-0.5 rounded bg-haptic-hover text-sm font-mono">{first.match[1]}</code>);
            remaining = remaining.slice(first.index + first.match[0].length);
            continue;
        }
        break;
      }

      return parts;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Horizontal rule
      if (/^---+$/.test(line.trim())) {
        flushList();
        elements.push(<hr key={i} className="border-haptic-divider my-6" />);
        continue;
      }

      // Headers
      const headerMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headerMatch) {
        flushList();
        const level = headerMatch[1].length;
        const text = headerMatch[2];
        const Tag = `h${level}` as keyof JSX.IntrinsicElements;
        const sizes: Record<number, string> = {
          1: 'text-3xl font-bold mb-4 mt-2',
          2: 'text-xl font-bold mb-3 mt-6',
          3: 'text-lg font-semibold mb-2 mt-4',
          4: 'text-base font-semibold mb-2 mt-3',
        };
        elements.push(
          <Tag key={i} className={`${sizes[level] || sizes[4]} text-foreground`}>
            {renderInline(text)}
          </Tag>
        );
        continue;
      }

      // Checkbox items
      const checkboxMatch = line.match(/^-\s+\[([ x])\]\s+(.+)/);
      if (checkboxMatch) {
        flushList();
        const checked = checkboxMatch[1] === 'x';
        elements.push(
          <div key={i} className="flex items-start gap-2.5 mb-1.5">
            <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex-shrink-0 ${checked ? 'border-foreground/40 bg-foreground/20' : 'border-foreground/25'}`} />
            <span className="text-foreground/80">{renderInline(checkboxMatch[2])}</span>
          </div>
        );
        continue;
      }

      // List items  
      const listMatch = line.match(/^[-*]\s+(.+)/);
      if (listMatch) {
        if (!inList) inList = true;
        listItems.push(<li key={i}>{renderInline(listMatch[1])}</li>);
        continue;
      }

      // Numbered list
      const numMatch = line.match(/^\d+\.\s+(.+)/);
      if (numMatch) {
        flushList();
        elements.push(
          <div key={i} className="mb-1 text-foreground/80">{renderInline(line)}</div>
        );
        continue;
      }

      flushList();

      // Empty line
      if (line.trim() === '') {
        elements.push(<div key={i} className="h-4" />);
        continue;
      }

      // Paragraph
      elements.push(
        <p key={i} className="mb-2 text-foreground/80 leading-relaxed">
          {renderInline(line)}
        </p>
      );
    }

    flushList();
    return elements;
  }, [content]);

  return <div className="prose-haptic">{rendered}</div>;
}
