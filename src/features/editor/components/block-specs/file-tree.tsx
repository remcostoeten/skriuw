"use client";

import { useEffect, useMemo, useState } from "react";
import { defaultProps } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import {
	Check,
	ChevronRight,
	Copy,
	FileText,
	Folder,
	FolderOpen,
	FolderTree,
	PencilLine,
	X,
} from "lucide-react";
import {
	countFileTreeNodes,
	DEFAULT_FILE_TREE_SOURCE,
	isFileTreeSource,
	normalizeFileTreeSource,
	parseFileTreeSource,
	type FileTreeNode,
} from "@/shared/lib/file-tree";
import { cn } from "@/shared/lib/utils";

type FileTreeBlockData = {
	props: {
		source?: string;
	};
};

type FileTreeEditor = {
	isEditable?: boolean;
	updateBlock: (block: unknown, update: { type: "fileTree"; props: { source: string } }) => void;
};

function getFileTreeSource(block: FileTreeBlockData): string {
	const source = block.props.source?.trim();
	return source ? normalizeFileTreeSource(source) : DEFAULT_FILE_TREE_SOURCE;
}

function getVisibleNodes(nodes: FileTreeNode[], collapsedNodeIds: Set<string>): FileTreeNode[] {
	return nodes.flatMap((node) => {
		if (node.kind === "folder" && !collapsedNodeIds.has(node.id)) {
			return [node, ...getVisibleNodes(node.children, collapsedNodeIds)];
		}
		return [node];
	});
}

const HEADER_ICON_BUTTON =
	"flex h-6 w-6 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-foreground/8 hover:text-foreground";

function FileTreeRow({
	node,
	collapsed,
	onToggle,
}: {
	node: FileTreeNode;
	collapsed: boolean;
	onToggle: (nodeId: string) => void;
}) {
	const isFolder = node.kind === "folder";
	const FolderIcon = isFolder ? (collapsed ? Folder : FolderOpen) : FileText;
	const RowElement = isFolder ? "button" : "div";

	return (
		<RowElement
			type={isFolder ? "button" : undefined}
			role="treeitem"
			aria-expanded={isFolder ? !collapsed : undefined}
			onMouseDown={isFolder ? (event) => event.preventDefault() : undefined}
			onClick={isFolder ? () => onToggle(node.id) : undefined}
			className={cn(
				"group/row flex h-7 w-full items-center text-left text-[13px] leading-none",
				"transition-colors",
				isFolder
					? "cursor-pointer text-foreground hover:bg-foreground/[0.04]"
					: "text-foreground/85",
			)}
		>
			{Array.from({ length: node.depth }).map((_, i) => (
				<div
					key={i}
					aria-hidden
					className="h-full w-4 shrink-0 border-r border-border/35"
				/>
			))}

			<div className="flex h-full flex-1 items-center gap-1.5 pl-1.5 pr-3">
				<span className="flex h-3 w-3 shrink-0 items-center justify-center">
					{isFolder ? (
						<ChevronRight
							className={cn(
								"h-3 w-3 text-muted-foreground/55 transition-transform duration-150",
								!collapsed && "rotate-90",
							)}
							strokeWidth={2}
						/>
					) : null}
				</span>

				<FolderIcon
					className={cn(
						"h-3.5 w-3.5 shrink-0",
						isFolder ? "text-foreground/60" : "text-muted-foreground/55",
					)}
					strokeWidth={1.6}
					aria-hidden
				/>

				<span
					className={cn(
						"truncate",
						isFolder ? "font-medium text-foreground/90" : "text-foreground/75",
					)}
				>
					{node.name}
				</span>
			</div>
		</RowElement>
	);
}

function FileTreeBlockView({
	block,
	editor,
}: {
	block: FileTreeBlockData;
	editor: FileTreeEditor;
}) {
	const source = getFileTreeSource(block);
	const parsedTree = useMemo(() => parseFileTreeSource(source), [source]);
	const totals = useMemo(() => countFileTreeNodes(parsedTree.children), [parsedTree.children]);
	const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set());
	const [editing, setEditing] = useState(false);
	const [draftSource, setDraftSource] = useState(source);
	const [copied, setCopied] = useState(false);

	const visibleNodes = useMemo(
		() => getVisibleNodes(parsedTree.children, collapsedNodeIds),
		[collapsedNodeIds, parsedTree.children],
	);

	useEffect(() => {
		setDraftSource(source);
	}, [source]);

	function toggleNode(nodeId: string) {
		setCollapsedNodeIds((current) => {
			const next = new Set(current);
			if (next.has(nodeId)) next.delete(nodeId);
			else next.add(nodeId);
			return next;
		});
	}

	function saveDraft() {
		const nextSource = normalizeFileTreeSource(draftSource);
		if (!nextSource) return;
		editor.updateBlock(block, {
			type: "fileTree",
			props: { source: nextSource },
		});
		setEditing(false);
	}

	async function copySource() {
		try {
			await navigator.clipboard.writeText(source);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1200);
		} catch {
			setCopied(false);
		}
	}

	return (
		<section
			contentEditable={false}
			className="group/tree my-1 w-full overflow-hidden rounded-md border border-border/60 bg-muted/25"
		>
			<header className="flex h-9 items-center gap-2 border-b border-border/40 bg-muted/30 pl-3 pr-1.5">
				<FolderTree
					className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70"
					strokeWidth={1.7}
					aria-hidden
				/>
				<p className="truncate text-xs font-medium tracking-tight text-foreground">
					{parsedTree.rootName}
				</p>
				{(totals.folders > 0 || totals.files > 0) && (
					<p className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
						{totals.folders} {totals.folders === 1 ? "folder" : "folders"} ·{" "}
						{totals.files} {totals.files === 1 ? "file" : "files"}
					</p>
				)}

				<div
					className={cn(
						"ml-auto flex items-center gap-0.5",
						"opacity-0 transition-opacity group-hover/tree:opacity-100 focus-within:opacity-100",
						editing && "opacity-100",
					)}
				>
					{editor.isEditable ? (
						editing ? (
							<>
								<button
									type="button"
									className={HEADER_ICON_BUTTON}
									aria-label="Save file tree"
									title="Save (⌘↩)"
									onMouseDown={(event) => event.preventDefault()}
									onClick={saveDraft}
								>
									<Check className="h-3.5 w-3.5" strokeWidth={1.8} />
								</button>
								<button
									type="button"
									className={HEADER_ICON_BUTTON}
									aria-label="Cancel edit"
									title="Cancel (Esc)"
									onMouseDown={(event) => event.preventDefault()}
									onClick={() => {
										setDraftSource(source);
										setEditing(false);
									}}
								>
									<X className="h-3.5 w-3.5" strokeWidth={1.8} />
								</button>
							</>
						) : (
							<button
								type="button"
								className={HEADER_ICON_BUTTON}
								aria-label="Edit file tree"
								title="Edit"
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => setEditing(true)}
							>
								<PencilLine className="h-3.5 w-3.5" strokeWidth={1.8} />
							</button>
						)
					) : null}
					<button
						type="button"
						className={HEADER_ICON_BUTTON}
						aria-label={copied ? "Copied" : "Copy file tree source"}
						title={copied ? "Copied" : "Copy"}
						onMouseDown={(event) => event.preventDefault()}
						onClick={copySource}
					>
						{copied ? (
							<Check className="h-3.5 w-3.5 text-success" strokeWidth={1.8} />
						) : (
							<Copy className="h-3.5 w-3.5" strokeWidth={1.8} />
						)}
					</button>
				</div>
			</header>

			{editing ? (
				<textarea
					autoFocus
					spellCheck={false}
					value={draftSource}
					onChange={(event) => setDraftSource(event.target.value)}
					onKeyDown={(event) => {
						if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
							event.preventDefault();
							saveDraft();
						}
						if (event.key === "Escape") {
							event.preventDefault();
							setDraftSource(source);
							setEditing(false);
						}
					}}
					className={cn(
						"block w-full resize-y bg-transparent px-3 py-2.5 font-mono text-xs leading-relaxed",
						"text-foreground/90 outline-none placeholder:text-muted-foreground/40",
						"min-h-[160px]",
					)}
					placeholder="Notes\n|-- folder/\n    |-- file.md"
				/>
			) : (
				<div role="tree" aria-label={parsedTree.rootName} className="py-1.5">
					{visibleNodes.length === 0 ? (
						<p className="px-3 py-2 text-xs italic text-muted-foreground/60">
							Empty tree
						</p>
					) : (
						visibleNodes.map((node) => (
							<FileTreeRow
								key={node.id}
								node={node}
								collapsed={collapsedNodeIds.has(node.id)}
								onToggle={toggleNode}
							/>
						))
					)}
				</div>
			)}
		</section>
	);
}

export const createFileTree = createReactBlockSpec(
	{
		type: "fileTree",
		propSchema: {
			...defaultProps,
			source: {
				default: DEFAULT_FILE_TREE_SOURCE,
			},
		},
		content: "none" as const,
	},
	{
		render: (props) => (
			<FileTreeBlockView
				block={props.block as FileTreeBlockData}
				editor={props.editor as FileTreeEditor}
			/>
		),
		toExternalHTML: (props) => (
			<pre data-skriuw-file-tree="true">
				<code>{getFileTreeSource(props.block as FileTreeBlockData)}</code>
			</pre>
		),
		parse: (element) => {
			const source = normalizeFileTreeSource(element.textContent ?? "");
			if (element.hasAttribute("data-skriuw-file-tree") || isFileTreeSource(source)) {
				return { source };
			}
			return undefined;
		},
		runsBefore: ["codeBlock"],
		meta: {
			isolating: true,
		},
	},
);
