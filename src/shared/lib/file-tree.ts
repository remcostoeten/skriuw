export type FileTreeNodeKind = "file" | "folder";

export type FileTreeNode = {
	id: string;
	name: string;
	kind: FileTreeNodeKind;
	depth: number;
	children: FileTreeNode[];
};

export type ParsedFileTree = {
	rootName: string;
	children: FileTreeNode[];
};

type ParsedFileTreeLine = {
	depth: number;
	name: string;
	explicitFolder: boolean;
	hasChildren: boolean;
};

type RawFileTreeLine = Omit<ParsedFileTreeLine, "hasChildren">;

const CONNECTOR_PATTERN = /(?:\|--|`--|\u251c\u2500\u2500|\u2514\u2500\u2500)/;
const FILE_TREE_LANGUAGES = new Set(["filetree", "tree"]);

export const DEFAULT_FILE_TREE_SOURCE = `Skriuw starter notes
|-- Start here - editor field guide.md
|-- Product Studio/
|   |-- Launch review - sync v2.md
|   \`-- Research/
|       \`-- Research brief - local-first notes.md
|-- Playground/
|   |-- Idea board.md
|   |-- Experiments Lab/
|   |   |-- MDX: Component gallery.mdx
|   |   \`-- Prompt snippets for rewriting.md
|   \`-- Recipes/
|       \`-- MDX: Space Pancakes.mdx
\`-- Templates/
    |-- Daily note template.md
    \`-- Meeting notes template.md`;

function removeCommonIndent(lines: string[]): string[] {
	const indents = lines
		.filter((line) => line.trim().length > 0)
		.map((line) => line.match(/^\s*/)?.[0].length ?? 0);

	if (indents.length === 0) {
		return lines;
	}

	const commonIndent = Math.min(...indents);
	return lines.map((line) => line.slice(commonIndent));
}

export function normalizeFileTreeSource(source: string): string {
	const lines = removeCommonIndent(source.replace(/\r\n?/g, "\n").split("\n"));
	return lines
		.map((line) => line.replace(/\s+$/g, ""))
		.join("\n")
		.trim();
}

export function isFileTreeSource(source: string): boolean {
	const lines = normalizeFileTreeSource(source)
		.split("\n")
		.filter((line) => line.trim().length > 0);
	const connectorLineCount = lines.filter((line) => CONNECTOR_PATTERN.test(line)).length;

	return connectorLineCount >= 2;
}

export function isFileTreeFence(language: string, source: string): boolean {
	const normalizedLanguage = language.trim().toLowerCase();

	if (FILE_TREE_LANGUAGES.has(normalizedLanguage)) {
		return true;
	}

	return normalizedLanguage === "text" && isFileTreeSource(source);
}

function slug(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "") || "item"
	);
}

function getConnectorIndex(line: string): number {
	const match = line.match(CONNECTOR_PATTERN);
	return match?.index ?? -1;
}

function toParsedLines(lines: string[]): ParsedFileTreeLine[] {
	const treeLines: RawFileTreeLine[] = [];

	for (const line of lines) {
		const connectorIndex = getConnectorIndex(line);
		if (connectorIndex < 0) {
			continue;
		}

		const connector = line.match(CONNECTOR_PATTERN)?.[0] ?? "";
		const rawName = line.slice(connectorIndex + connector.length).trim();
		if (!rawName) {
			continue;
		}

		treeLines.push({
			depth: Math.max(0, Math.floor(connectorIndex / 4)),
			name: rawName.replace(/\/$/g, "").trim(),
			explicitFolder: rawName.endsWith("/"),
		});
	}

	return treeLines.map((line, index) => ({
		...line,
		hasChildren: (treeLines[index + 1]?.depth ?? -1) > line.depth,
	}));
}

export function parseFileTreeSource(source: string): ParsedFileTree {
	const lines = normalizeFileTreeSource(source)
		.split("\n")
		.filter((line) => line.trim().length > 0);
	const firstTreeLineIndex = lines.findIndex((line) => CONNECTOR_PATTERN.test(line));
	const rootName =
		firstTreeLineIndex > 0 ? lines.slice(0, firstTreeLineIndex).join(" ").trim() : "File tree";
	const treeLines = toParsedLines(
		firstTreeLineIndex >= 0 ? lines.slice(firstTreeLineIndex) : lines,
	);
	const root: FileTreeNode = {
		id: "root",
		name: rootName || "File tree",
		kind: "folder",
		depth: -1,
		children: [],
	};
	const stack: FileTreeNode[] = [root];

	treeLines.forEach((line, index) => {
		while (stack.length > line.depth + 1) {
			stack.pop();
		}

		const parent = stack[stack.length - 1] ?? root;
		const kind: FileTreeNodeKind = line.explicitFolder || line.hasChildren ? "folder" : "file";
		const node: FileTreeNode = {
			id: `${parent.id}/${slug(line.name)}-${index}`,
			name: line.name,
			kind,
			depth: line.depth,
			children: [],
		};

		parent.children.push(node);

		if (kind === "folder") {
			stack.push(node);
		}
	});

	return {
		rootName: root.name,
		children: root.children,
	};
}

export function countFileTreeNodes(nodes: FileTreeNode[]): { files: number; folders: number } {
	return nodes.reduce(
		(total, node) => {
			if (node.kind === "folder") {
				total.folders += 1;
			} else {
				total.files += 1;
			}

			const children = countFileTreeNodes(node.children);
			total.files += children.files;
			total.folders += children.folders;

			return total;
		},
		{ files: 0, folders: 0 },
	);
}
