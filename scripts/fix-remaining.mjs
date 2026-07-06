import { readFileSync, writeFileSync } from "fs";

const ROOT = "/home/remcostoeten/dev/skriuw";

function fixFile(relPath, transforms) {
	const fullPath = `${ROOT}/${relPath}`;
	let content;
	try {
		content = readFileSync(fullPath, "utf8");
	} catch {
		console.error("  SKIP:", relPath);
		return false;
	}

	let modified = false;
	let result = content;

	for (const t of transforms) {
		if (result.includes(t.from)) {
			result = result.replace(t.from, t.to);
			modified = true;
		} else {
			console.error(`  MISS: ${relPath} — pattern not found`);
		}
	}

	if (modified) {
		writeFileSync(fullPath, result);
		console.log(`  FIXED: ${relPath}`);
	}
	return modified;
}

// ── JSX return: const Foo = (params) => (\n ... \n); ──
fixFile("apps/web/src/shared/ui/breadcrumb.tsx", [
	{
		from: 'const BreadcrumbSeparator = ({ children, className, ...props }: React.ComponentProps<"li">) => (\n\t<li\n\t\trole="presentation"\n\t\taria-hidden="true"\n\t\tclassName={cn("[&>svg]:w-3.5 [&>svg]:h-3.5", className)}\n\t\t{...props}\n\t>\n\t\t{children ?? <ChevronRight />}\n\t</li>\n);',
		to: 'function BreadcrumbSeparator({ children, className, ...props }: React.ComponentProps<"li">) {\n\treturn (\n\t\t<li\n\t\t\trole="presentation"\n\t\t\taria-hidden="true"\n\t\t\tclassName={cn("[&>svg]:w-3.5 [&>svg]:h-3.5", className)}\n\t\t\t{...props}\n\t\t>\n\t\t\t{children ?? <ChevronRight />}\n\t\t</li>\n\t);\n}',
	},
	{
		from: 'const BreadcrumbEllipsis = ({ className, ...props }: React.ComponentProps<"span">) => (\n\t<span\n\t\trole="presentation"\n\t\taria-hidden="true"\n\t\tclassName={cn("flex h-9 w-9 items-center justify-center", className)}\n\t\t{...props}\n\t>\n\t\t<MoreHorizontal className="h-4 w-4" />\n\t\t<span className="sr-only">More</span>\n\t</span>\n);',
		to: 'function BreadcrumbEllipsis({ className, ...props }: React.ComponentProps<"span">) {\n\treturn (\n\t\t<span\n\t\t\trole="presentation"\n\t\t\taria-hidden="true"\n\t\t\tclassName={cn("flex h-9 w-9 items-center justify-center", className)}\n\t\t\t{...props}\n\t\t>\n\t\t\t<MoreHorizontal className="h-4 w-4" />\n\t\t\t<span className="sr-only">More</span>\n\t\t</span>\n\t);\n}',
	},
]);

fixFile("apps/web/src/shared/ui/dialog.tsx", [
	{
		from: 'const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (\n\t<div\n\t\tclassName={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}\n\t\t{...props}\n\t/>\n);',
		to: 'function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {\n\treturn (\n\t\t<div\n\t\t\tclassName={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}\n\t\t\t{...props}\n\t\t/>\n\t);\n}',
	},
	{
		from: 'const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (\n\t<div\n\t\tclassName={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}\n\t\t{...props}\n\t/>\n);',
		to: 'function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {\n\treturn (\n\t\t<div\n\t\t\tclassName={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}\n\t\t\t{...props}\n\t\t/>\n\t);\n}',
	},
]);

fixFile("apps/web/src/shared/ui/sheet.tsx", [
	{
		from: 'const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (\n\t<div\n\t\tclassName={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}\n\t\t{...props}\n\t/>\n);',
		to: 'function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {\n\treturn (\n\t\t<div\n\t\t\tclassName={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}\n\t\t\t{...props}\n\t\t/>\n\t);\n}',
	},
	{
		from: 'const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (\n\t<div\n\t\tclassName={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}\n\t\t{...props}\n\t/>\n);',
		to: 'function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {\n\treturn (\n\t\t<div\n\t\t\tclassName={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}\n\t\t\t{...props}\n\t\t/>\n\t);\n}',
	},
]);

// ── Curried: const fn = (a) => (b) => { body }; ──
fixFile("apps/web/src/features/notes/components/editor-tabs/tab-bar.tsx", [
	{
		from: '	const handleDragStart = (fileId: string) => (event: DragEvent<HTMLDivElement>) => {\n		setDraggingId(fileId);\n		event.dataTransfer.effectAllowed = "move";\n		event.dataTransfer.setData("text/plain", fileId);\n	};',
		to: '	function handleDragStart(fileId: string) {\n		return (event: DragEvent<HTMLDivElement>) => {\n			setDraggingId(fileId);\n			event.dataTransfer.effectAllowed = "move";\n			event.dataTransfer.setData("text/plain", fileId);\n		};\n	}',
	},
	{
		from: '	const handleDragOver = (fileId: string) => (event: DragEvent<HTMLDivElement>) => {\n		if (!draggingId) {\n			if (!onDropNote || !isTreeItemDrag(event)) return;\n			event.preventDefault();\n			event.dataTransfer.dropEffect = "copy";\n			externalOverRef.current = fileId;\n			if (fileId !== dragOverId) setDragOverId(fileId);\n			return;\n		}\n		event.preventDefault();\n		event.dataTransfer.dropEffect = "move";\n		if (fileId !== dragOverId) setDragOverId(fileId);\n	};',
		to: '	function handleDragOver(fileId: string) {\n		return (event: DragEvent<HTMLDivElement>) => {\n			if (!draggingId) {\n				if (!onDropNote || !isTreeItemDrag(event)) return;\n				event.preventDefault();\n				event.dataTransfer.dropEffect = "copy";\n				externalOverRef.current = fileId;\n				if (fileId !== dragOverId) setDragOverId(fileId);\n				return;\n			}\n			event.preventDefault();\n			event.dataTransfer.dropEffect = "move";\n			if (fileId !== dragOverId) setDragOverId(fileId);\n		};\n	}',
	},
	{
		from: "	const handleDrop = (fileId: string) => (event: DragEvent<HTMLDivElement>) => {\n		event.preventDefault();\n		if (!draggingId && onDropNote && isTreeItemDrag(event)) {\n			externalOverRef.current = null;\n			if (droppedId) onDropNote(fileId, droppedId);\n			setDragOverId(null);\n			return;\n		}\n		reorderAround(fileId);\n		setDraggingId(null);\n		setDragOverId(null);\n	};",
		to: "	function handleDrop(fileId: string) {\n		return (event: DragEvent<HTMLDivElement>) => {\n			event.preventDefault();\n			if (!draggingId && onDropNote && isTreeItemDrag(event)) {\n				externalOverRef.current = null;\n				if (droppedId) onDropNote(fileId, droppedId);\n				setDragOverId(null);\n				return;\n			}\n			reorderAround(fileId);\n			setDraggingId(null);\n			setDragOverId(null);\n		};\n	}",
	},
]);

// ── Expression body: const avg = (c) => (c.timed ? ... : null); ──
// The body is a parenthesized expression, not JSX
fixFile("apps/web/src/shared/devtools/pulse.tsx", [
	{
		from: "\tconst avg = (c: ReportComponent) => (c.timed ? c.selfTotal / c.timed : null);",
		to: "\tfunction avg(c: ReportComponent) { return c.timed ? c.selfTotal / c.timed : null; }",
	},
]);

// ── Return type annotation: const fn = (params): Type => { ──
fixFile("apps/web/src/features/journal/components/journal-editor.tsx", [
	{
		from: "\tconst getTagColor = (name: string): string => {",
		to: "\tfunction getTagColor(name: string): string {",
	},
]);

fixFile("apps/web/src/features/notes/lib/note-indexes.ts", [
	{
		from: "\tconst countDescendants = (folderId: string, visited: Set<string> = new Set()): number => {",
		to: "\tfunction countDescendants(folderId: string, visited: Set<string> = new Set()): number {",
	},
]);

fixFile("apps/web/__tests__/features/collaboration/anchored-marks/store.test.ts", [
	{
		from: "\tconst resolved = (mark: TAnchoredMark, from: number, to: number): TResolvedMark => ({",
		to: "\tfunction resolved(mark: TAnchoredMark, from: number, to: number): TResolvedMark {",
	},
]);

fixFile("apps/web/__tests__/e2e/skeleton-qa.e2e.ts", [
	{
		from: "\tconst normalize = (source: PNG): PNG => {",
		to: "\tfunction normalize(source: PNG): PNG {",
	},
]);

// ── icon-rail.tsx: JSX return ──
fixFile("apps/web/src/features/layout/components/icon-rail.tsx", [
	{
		from: "\tconst renderNavItem = (item: (typeof navItems)[number] | typeof trashNavItem) => (",
		to: "\tfunction renderNavItem(item: (typeof navItems)[number] | typeof trashNavItem) {",
	},
]);

// ── store tests: multi-line expression body ──
// Const useBoundStore = (selector?: ...) =>
//   ...
fixFile("apps/web/__tests__/features/notes/components/sidebar/store.test.ts", [
	{
		from: "\t\t\tconst useBoundStore = (selector?: (state: unknown) => unknown) =>\n\t\t\t\tcreateSelectors(useBoundStore).use,\n\t\t\t);",
		to: "\t\t\tfunction useBoundStore(selector?: (state: unknown) => unknown) {\n\t\t\t\treturn createSelectors(useBoundStore).use;\n\t\t\t});",
	},
]);

fixFile("apps/web/__tests__/features/settings/store.test.ts", [
	{
		from: "\t\t\tconst useBoundStore = (selector?: (state: unknown) => unknown) =>\n\t\t\t\tcreateSelectors(useBoundStore).use,\n\t\t\t);",
		to: "\t\t\tfunction useBoundStore(selector?: (state: unknown) => unknown) {\n\t\t\t\treturn createSelectors(useBoundStore).use;\n\t\t\t});",
	},
]);

console.log("\nDone with remaining fixes!");
