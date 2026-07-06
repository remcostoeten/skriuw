import { readFileSync, writeFileSync } from "fs";

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
];

const ROOT = "/home/remcostoeten/dev/skriuw";
let fixed = 0;

for (const relPath of files) {
	const fullPath = `${ROOT}/${relPath}`;
	let content;
	try {
		content = readFileSync(fullPath, "utf8");
	} catch {
		continue;
	}

	const lines = content.split("\n");
	const out = [];

	// Pass 1: replace declaration lines + track closing braces
	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i].trimStart();
		const m = trimmed.match(/^const\s+(\w+)\s*=\s*/);
		if (!m) {
			out.push(lines[i]);
			continue;
		}

		const indent = lines[i].slice(0, lines[i].length - trimmed.length);
		const name = m[1];
		const afterEq = lines[i].slice(lines[i].indexOf("=") + 1);
		const parenPos = afterEq.indexOf("(");
		if (parenPos === -1) {
			out.push(lines[i]);
			continue;
		}

		// Build combined text to find ) + =>
		let combined = afterEq;
		let extra = 0;

		while (extra <= 30) {
			// Find matching )
			let depth = 1;
			let cp = -1;
			for (let j = parenPos + 1; j < combined.length; j++) {
				if (combined[j] === "(") {
					depth++;
				} else if (combined[j] === ")") {
					depth--;
				} else if (combined[j] === '"' || combined[j] === "'" || combined[j] === "`") {
					const q = combined[j];
					j++;
					while (j < combined.length && combined[j] !== q) {
						if (combined[j] === "\\") {
							j++;
						}
						j++;
					}
				}
				if (depth === 0) {
					cp = j;
					break;
				}
			}

			if (cp === -1) {
				extra++;
				if (i + extra >= lines.length) {
					break;
				}
				combined += `\n${lines[i + extra]}`;
				continue;
			}

			const afterParen = combined.slice(cp + 1).trimStart();
			if (!afterParen.startsWith("=>")) {
				extra++;
				if (i + extra >= lines.length) {
					break;
				}
				combined += `\n${lines[i + extra]}`;
				continue;
			}

			// === ARROW FUNCTION FOUND ===
			const paramsRaw = combined.slice(parenPos + 1, cp);
			const params = paramsRaw.replace(/\n\s*/g, " ").trim();
			const body = afterParen.slice(2).trimStart();

			// Track brace depth for block bodies
			if (body.startsWith("{")) {
				out.push(`${indent}function ${name}(${params}) {`);

				let braceDepth = 0;
				// Scan brace depth from the rest of body (after `{`)
				const rest = body.slice(1);
				// Check if there's content after `{` on the same logical line
				if (rest.trim()) {
					// The rest may have the closing } on the same line
					// E.g. `{ return x; }` - single line block
					// Compute depth
					for (const ch of rest) {
						if (ch === "{") {
							braceDepth++;
						} else if (ch === "}") {
							braceDepth--;
						}
					}
					if (braceDepth < 0) {
						// Closing brace is on this line
						// Find `}` position
						const ci = rest.indexOf("}");
						const afterClose = rest.slice(ci + 1).trim();
						if (afterClose === ";") {
							out.push(`${indent}${rest.slice(0, ci)}}`);
						} else {
							out.push(`${indent}${rest}`);
						}
						// Skip the rest of the function (it was all on this line)
						// Move past the combined lines
						i += extra;
						fixed++;
						break;
					} else {
						out.push(`${indent}${rest}`);
						braceDepth = 0; // Reset, we'll track from following lines
						// But the rest already closed some braces. Let me recount.
						braceDepth = 0;
						for (const ch of rest) {
							if (ch === "{") {
								braceDepth++;
							} else if (ch === "}") {
								braceDepth--;
							}
						}
					}
				}

				// Track forward for matching }
				let currentDepth = 0;
				// Scan from the last line of combined text + 1
				let endFound = false;
				for (let j = i + extra + 1; j < lines.length && !endFound; j++) {
					const l = lines[j];
					let lineDepth = 0;
					let closeIdx = -1;

					for (let k = 0; k < l.length; k++) {
						if (l[k] === '"' || l[k] === "'" || l[k] === "`") {
							const q = l[k];
							k++;
							while (k < l.length && l[k] !== q) {
								if (l[k] === "\\") {
									k++;
								}
								k++;
							}
							continue;
						}
						if (l[k] === "{") {
							lineDepth++;
						} else if (l[k] === "}") {
							lineDepth--;
							if (currentDepth + lineDepth <= 0 && closeIdx === -1) {
								closeIdx = k;
							}
						}
					}

					currentDepth += lineDepth;

					if (currentDepth <= 0 && closeIdx !== -1) {
						// Found closing brace
						const afterClose = l.slice(closeIdx + 1).trim();
						if (afterClose === ";") {
							out.push(l.slice(0, closeIdx + 1));
						} else {
							out.push(l);
						}
						endFound = true;
						i = j;
						fixed++;
					} else {
						out.push(l);
					}
				}

				if (endFound) {
					break;
				}
				// Fall through to keep original
				out.pop();
				out.push(lines[i]);
				break;
			}

			// Expression or JSX body
			if (body.startsWith("(")) {
				// Could be JSX or curried
				// Fast check: is it curried? `(inner) => ...`
				let innerDepth = 1;
				let ip = -1;
				for (let j = 1; j < body.length; j++) {
					if (body[j] === "(") {
						innerDepth++;
					} else if (body[j] === ")") {
						innerDepth--;
						if (innerDepth === 0) {
							ip = j;
							break;
						}
					}
				}

				const afterInner = ip !== -1 ? body.slice(ip + 1).trimStart() : "";
				const isCurried = afterInner.startsWith("=>");

				if (isCurried) {
					// Curried: just keep original for now, handle manually
					out.push(lines[i]);
					// Skip extra lines
					for (let e = 1; e <= extra; e++) {
						out.push(lines[i + e]);
					}
					i += extra;
					break;
				}

				// JSX return body
				// Change declaration and find matching closing paren
				// This is complex multi-line, keep original for now
				out.push(lines[i]);
				for (let e = 1; e <= extra; e++) {
					out.push(lines[i + e]);
				}
				i += extra;
				break;
			}

			// Expression body: `=> expr;`
			if (body.includes(";") || extra === 0) {
				const exprBody = body.endsWith(";") ? body.slice(0, -1).trimEnd() : body.trimEnd();
				out.push(`${indent}function ${name}(${params}) { return ${exprBody}; }`);
				i += extra;
				fixed++;
			} else {
				// Multi-line expression, keep original
				out.push(lines[i]);
				for (let e = 1; e <= extra; e++) {
					out.push(lines[i + e]);
				}
				i += extra;
			}
			break;
		}

		if (out[out.length - 1] !== lines[i] && out[out.length - 1] !== undefined) {
			// Already handled
		} else if (out[out.length - 1] !== lines[i]) {
			out.push(lines[i]);
		}
	}

	if (fixed > 0 || content !== out.join("\n")) {
		writeFileSync(fullPath, out.join("\n"));
		if (fixed > 0) {
			console.log(`  FIXED: ${relPath}`);
		}
	}
}

console.log(`\nDone! Fixed some files.`);
