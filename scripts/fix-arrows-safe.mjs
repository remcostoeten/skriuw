/**
 * SAFE arrow function fixer.
 * Only converts `const name = (simpleParams) => {` to `function name(simpleParams) {`
 * when `(` is the very first non-whitespace after `= ` (i.e., params start immediately).
 * This avoids false positives with React.forwardRef, cva, etc.
 *
 * Also handles: `const name = (params) => expr;` (expression body on same line).
 * Also handles: `const name = () => {` (no params).
 */
import { readFileSync, writeFileSync } from "fs";

// List files with known violations (from the earlier analysis)
const ROOT = "/home/remcostoeten/dev/skriuw";

// Build a list of unique files with violations
const files = [
	"apps/web/src/shared/ui/breadcrumb.tsx",
	"apps/web/src/shared/ui/context-menu.tsx",
	"apps/web/src/shared/ui/dialog.tsx",
	"apps/web/src/shared/ui/dropdown-menu.tsx",
	"apps/web/src/shared/ui/sheet.tsx",
	"apps/web/src/domain/notes/note-links.ts",
	"apps/web/src/domain/notes/rich-document.ts",
	"apps/web/src/domain/notes/versioning.ts",
	"apps/web/src/app/api/notifications/stream/route.ts",
	"apps/web/src/app/app/graph/page.tsx",
	"apps/web/src/app/app/journal/page.tsx",
	"apps/web/src/app/app/page.tsx",
	"apps/web/src/app/(auth)/email-domain-autocomplete.tsx",
	"apps/web/src/features/collaboration/anchored-marks/engine.ts",
	"apps/web/src/features/collaboration/hooks/use-collab-presence.ts",
	"apps/web/src/features/collaboration/hooks/use-collab-room.ts",
	"apps/web/src/features/desktop/desktop-zoom.tsx",
	"apps/web/src/features/desktop/plain-select.tsx",
	"apps/web/src/features/desktop/window-controls.tsx",
	"apps/web/src/features/editor/components/block-specs/CodeBlock.tsx",
	"apps/web/src/features/editor/components/editor-container.tsx",
	"apps/web/src/features/editor/components/fmt-menu.tsx",
	"apps/web/src/features/editor/components/rich-text-editor.tsx",
	"apps/web/src/features/editor/components/selection-bubble-menu.tsx",
	"apps/web/src/features/editor/hooks/use-ai-editor-handle.ts",
	"apps/web/src/features/editor/hooks/use-selection-reporter.ts",
	"apps/web/src/features/editor/hooks/use-title-commit.ts",
	"apps/web/src/features/editor/lib/ai-diff-highlight.ts",
	"apps/web/src/features/editor/lib/editor-instance.ts",
	"apps/web/src/features/editor/lib/streaming-applier.ts",
	"apps/web/src/features/journal/components/journal-database-view.tsx",
	"apps/web/src/features/journal/components/journal-sidebar.tsx",
	"apps/web/src/features/journal/components/plain-text-editor.tsx",
	"apps/web/src/features/journal/hooks/use-journal-ai.ts",
	"apps/web/src/features/journal/hooks/use-journal-layout.ts",
	"apps/web/src/features/layout/components/icon-rail.tsx",
	"apps/web/src/features/notes/components/editor-tabs/tab-bar.tsx",
	"apps/web/src/features/notes/components/editor-workspace.tsx",
	"apps/web/src/features/notes/components/file-list.tsx",
	"apps/web/src/features/notes/components/metadata-panel.tsx",
	"apps/web/src/features/notes/components/note-send-menu.tsx",
	"apps/web/src/features/notes/components/sidebar/journal/journal-section.tsx",
	"apps/web/src/features/notes/components/sidebar-panel.tsx",
	"apps/web/src/features/notes/components/sidebar/sidebar-config-manager.tsx",
	"apps/web/src/features/notes/components/sidebar/sidebar-section.tsx",
	"apps/web/src/features/notes/components/sidebar/store.ts",
	"apps/web/src/features/notes/components/split-drop-zone.tsx",
	"apps/web/src/features/notes/hooks/use-document-outline.ts",
	"apps/web/src/features/notes/hooks/use-notes-layout.ts",
	"apps/web/src/features/notes/hooks/use-notes-layout-save-controller.ts",
	"apps/web/src/features/notes/hooks/use-notes-layout-viewport.ts",
	"apps/web/src/features/notes/store.ts",
	"apps/web/src/features/notifications/components/notification-bell.tsx",
	"apps/web/src/features/notifications/hooks/use-notifications.ts",
	"apps/web/src/features/settings/components/ai-settings.tsx",
	"apps/web/src/features/settings/components/connected-accounts.tsx",
	"apps/web/src/features/settings/components/settings-modal.tsx",
	"apps/web/src/features/settings/lib/import-ai-titles.ts",
	"apps/web/src/features/settings/lib/use-note-cleanup-scan.ts",
	"apps/web/src/features/settings/sections/account-section.tsx",
	"apps/web/src/features/settings/sections/data-section.tsx",
	"apps/web/src/features/sharing/components/shared-notes-overview.tsx",
	"apps/web/src/features/sharing/hooks/use-note-sharing.ts",
	"apps/web/src/shared/api/use-api-mutation.ts",
	"apps/web/src/shared/devtools/pulse.tsx",
	"apps/web/src/shared/hooks/use-mobile.tsx",
	"apps/web/src/shared/icons/avatar-face.tsx",
	"apps/web/src/shared/perf/perf-overlay.tsx",
	"packages/web-spa/src/components/window-drag-region.tsx",
	"scripts/coverage-tui.ts",
	"apps/web/__tests__/domain/notes/graph.test.ts",
	"apps/web/__tests__/features/notes/components/sidebar/sidebar-compact-states.test.tsx",
	"apps/web/__tests__/features/notes/components/sidebar/store.test.ts",
	"apps/web/__tests__/features/notes/hooks/use-notes-navigation.test.ts",
	"apps/web/__tests__/features/settings/store.test.ts",
	"apps/web/__tests__/shared/ui/command-palette.test.ts",
	// Additional files found in the second scan
	"apps/web/src/features/journal/components/journal-editor.tsx",
	"apps/web/src/features/notes/lib/note-indexes.ts",
	"apps/web/__tests__/features/collaboration/anchored-marks/store.test.ts",
	"apps/web/__tests__/e2e/skeleton-qa.e2e.ts",
];

/**
 * Count net brace depth in a line (respects strings).
 */
function netDepth(line) {
	let d = 0;
	for (let i = 0; i < line.length; i++) {
		if (line[i] === '"' || line[i] === "'" || line[i] === "`") {
			const q = line[i];
			i++;
			while (i < line.length && line[i] !== q) {
				if (line[i] === "\\") i++;
				i++;
			}
			continue;
		}
		if (line[i] === "{") d++;
		else if (line[i] === "}") d--;
	}
	return d;
}

/**
 * SAFE check: is this line `const name = (params)` where `(` is the
 * first non-whitespace token after `= `?
 * Returns { indent, name, params, afterParen } or null.
 */
function matchDeclaration(line) {
	const trimmed = line.trimStart();
	// Must start with `const name = (` with nothing between = and (
	const m = trimmed.match(/^const\s+(\w+)\s*=\s*\(([^]*)\)\s*=>\s*(\{.*)?$/);
	if (!m) return null;

	// Extra safety: [^]* for params but it captures greedily to the LAST `)`
	// We want the FIRST `)` because params should be simple (no nested parens)
	// Actually, let me check: the params contain `([^]*)` which is any char including newlines
	// This might not work for multi-line. Let me handle that.

	// For now, single-line only:
	const m2 = trimmed.match(/^const\s+(\w+)\s*=\s*\(([^)]*)\)\s*=>\s*(\{)?(.*)$/);
	if (!m2) return null;

	const indent = line.slice(0, line.length - trimmed.length);
	const name = m2[1];
	const params = m2[2];
	const hasBlock = !!m2[3];
	const rest = m2[4]; // everything after `{` or after `=> `

	// Check that params have no nested parens (safety)
	if (params.includes("(")) return null;

	return { indent, name, params, hasBlock, rest };
}

let fixed = 0;

for (const relPath of files) {
	const fullPath = `${ROOT}/${relPath}`;
	let content;
	try {
		content = readFileSync(fullPath, "utf8");
	} catch {
		console.error(`  SKIP: ${relPath}`);
		continue;
	}

	const lines = content.split("\n");
	const out = [];
	let modified = false;

	for (let i = 0; i < lines.length; i++) {
		const decl = matchDeclaration(lines[i]);
		if (!decl) {
			out.push(lines[i]);
			continue;
		}

		const { indent, name, params, hasBlock, rest } = decl;

		if (hasBlock) {
			// `=> {` after params on the same line
			// Check: is the closing `}` also on this line?
			if (rest.includes("}")) {
				// Single-line: `const foo = (x) => { return x; };`
				const ci = rest.indexOf("}");
				const afterBrace = rest.slice(ci + 1).trim();
				const body = rest.slice(0, ci);
				if (afterBrace === ";") {
					out.push(`${indent}function ${name}(${params}) {${body}}`);
				} else {
					out.push(`${indent}function ${name}(${params}) {${rest}`);
				}
				modified = true;
			} else {
				// `{` is on the same line but closing `}` is below
				out.push(`${indent}function ${name}(${params}) {`);
				// Track forward for closing }
				let depth = netDepth(rest);
				let found = false;

				for (let j = i + 1; j < lines.length && !found; j++) {
					const l = lines[j];
					const d = netDepth(l);
					depth += d;

					if (depth <= 0 && l.includes("}")) {
						const ci = l.lastIndexOf("}");
						const afterBrace = l.slice(ci + 1).trim();
						if (afterBrace === ";") {
							out.push(l.slice(0, ci + 1));
						} else {
							out.push(l);
						}
						found = true;
						i = j;
					} else {
						out.push(l);
					}
				}
				if (found) modified = true;
			}
		} else {
			// Expression body on the same line
			// `const foo = (x) => expr;` or `const foo = (x) => expr`
			const exprBody = rest.endsWith(";") ? rest.slice(0, -1).trimEnd() : rest.trimEnd();
			out.push(`${indent}function ${name}(${params}) { return ${exprBody}; }`);
			modified = true;
		}
	}

	if (modified) {
		writeFileSync(fullPath, out.join("\n"));
		if (modified) console.log(`  FIXED: ${relPath}`);
		fixed++;
	}
}

console.log(`\nFixed ${fixed} files`);
