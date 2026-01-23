import { parseWikilinks, extractWikilinksFromBlocks } from "../../features/notes/utils/wikilink-parser";
import { describe, expect, it } from "vitest";

describe('wikilink parser', () => {
    it('parses simple wikilinks', () => {
        const text = "Check out [[Project Alpha]] and [[Beta]]";
        const links = parseWikilinks(text);

        expect(links).toHaveLength(2);
        expect(links[0]).toEqual({
            fullMatch: "[[Project Alpha]]",
            noteName: "Project Alpha",
            startIndex: 10,
            endIndex: 27
        });
        expect(links[1]).toEqual({
            fullMatch: "[[Beta]]",
            noteName: "Beta",
            startIndex: 32,
            endIndex: 40
        });
    });

    it('ignores partial brackets', () => {
        const text = "This is [not a link] but [[this is]]";
        const links = parseWikilinks(text);
        expect(links).toHaveLength(1);
        expect(links[0].noteName).toBe("this is");
    });

    it('parses from block structure', () => {
        const blocks = [
            {
                type: 'paragraph',
                content: [
                    { type: 'text', text: 'Hello [[World]]' }
                ]
            },
            {
                type: 'bulletListItem',
                content: [
                    { type: 'text', text: 'See [[Another Note]]' }
                ]
            }
        ];

        const links = extractWikilinksFromBlocks(blocks);
        expect(links).toHaveLength(2);
        expect(links[0].noteName).toBe("World");
        expect(links[1].noteName).toBe("Another Note");
    });

    it('parses from child blocks', () => {
        const blocks = [
            {
                type: 'paragraph',
                content: [],
                children: [
                    {
                        type: 'paragraph',
                        content: [
                            { type: 'text', text: 'Nested [[Link]]' }
                        ]
                    }
                ]
            }
        ];

        const links = extractWikilinksFromBlocks(blocks);
        expect(links).toHaveLength(1);
        expect(links[0].noteName).toBe("Link");
    });
});
