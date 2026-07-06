/**
 * BlockNote theme + editor CSS, extracted from rich-text-editor.tsx (#209).
 * Rendered via a single <style> tag inside RichTextEditor.
 */
export const EDITOR_STYLES = `
				.blocknote-wrapper .bn-editor .vim-normal {
					caret-color: hsl(var(--primary));
				}
				.blocknote-wrapper .bn-editor .vim-visual {
					caret-color: transparent;
				}
				.blocknote-wrapper .bn-editor .vim-visual ::selection {
					background: hsl(var(--primary) / 0.34);
				}
				.blocknote-wrapper .bn-editor ::selection {
					background: hsl(var(--editor-selection) / 0.6);
				}
				.blocknote-wrapper {
					--bn-colors-editor-background: hsl(var(--card));
					--bn-colors-editor-text: hsl(var(--card-foreground));
					--bn-colors-menu-background: hsl(var(--popover));
					--bn-colors-menu-text: hsl(var(--popover-foreground));
					--bn-colors-tooltip-background: hsl(var(--popover));
					--bn-colors-tooltip-text: hsl(var(--popover-foreground));
					--bn-colors-hovered-background: hsl(var(--accent));
					--bn-colors-selected-background: hsl(var(--editor-selection));
					--bn-colors-disabled-background: hsl(var(--muted));
					--bn-colors-disabled-text: hsl(var(--muted-foreground));
					--bn-colors-border: hsl(var(--border));
					--bn-colors-side-menu: hsl(var(--muted-foreground));
					height: 100%;
					min-height: 100%;
					background: hsl(var(--card));
				}
				.blocknote-wrapper .bn-container,
				.blocknote-wrapper .bn-container [data-theming-css-variables-demo],
				.blocknote-wrapper .bn-scroller,
				.blocknote-wrapper .bn-editor-container {
					background: transparent !important;
				}
				.blocknote-wrapper .bn-editor {
					box-sizing: border-box;
					padding-left: 0;
					padding-right: 0;
					padding-top: 0;
					padding-bottom: 0;
					width: 100%;
					max-width: 42rem;
					margin: 0 auto;
					min-height: 100%;
					background: hsl(var(--card)) !important;
				}
				.blocknote-wrapper .bn-editor:focus,
				.blocknote-wrapper .bn-editor:focus-visible,
				.blocknote-wrapper .bn-editor [contenteditable="true"]:focus,
				.blocknote-wrapper .bn-editor [contenteditable="true"]:focus-visible {
					outline: none !important;
					box-shadow: none !important;
				}
				.blocknote-wrapper .bn-block-content.ProseMirror-selectednode > *,
				.blocknote-wrapper .ProseMirror-selectednode > .bn-block-content > * {
					outline: none !important;
					border-radius: inherit !important;
				}
				.blocknote-wrapper .bn-editor,
				.blocknote-wrapper .bn-block-content,
				.blocknote-wrapper .bn-inline-content {
					font-family: var(--bn-font-family);
				}
				.blocknote-wrapper .bn-block-content {
					font-size: 1rem;
					line-height: var(--skriuw-editor-line-height);
				}
				.blocknote-wrapper [data-content-type="heading"] {
					line-height: 1.15;
					margin-top: 0.5rem;
					margin-bottom: 0.35rem;
				}
				.blocknote-wrapper .bn-block-group:first-child [data-content-type="heading"],
				.blocknote-wrapper .bn-block-group:first-child .bn-block-content[data-content-type="heading"] {
					margin-top: 0;
				}
				.blocknote-wrapper .bn-inline-content code {
					background: hsl(var(--popover));
					border: 1px solid hsl(var(--border));
					color: hsl(var(--popover-foreground));
					padding: 0.1rem 0.375rem;
					border-radius: 0.25rem;
					font-size: 0.875em;
				}
				.blocknote-wrapper .bn-inline-content a {
					color: hsl(var(--editor-link));
					text-decoration-line: underline;
					text-decoration-color: hsl(var(--editor-link) / 0.42);
					text-decoration-thickness: 1px;
					text-underline-offset: 0.26em;
					transition:
						color 120ms ease,
						text-decoration-color 120ms ease;
				}
				.blocknote-wrapper .bn-inline-content a:hover {
					color: hsl(var(--editor-link-hover));
					text-decoration-color: hsl(var(--editor-link-hover) / 0.72);
				}
				.blocknote-wrapper .bn-inline-content a:focus-visible {
					border-radius: 0.2rem;
					outline: 1px solid hsl(var(--ring));
					outline-offset: 2px;
				}
				.blocknote-wrapper .bn-inline-content a[href^="note://"] {
					color: hsl(var(--editor-note-link));
					text-decoration-color: hsl(var(--editor-note-link) / 0.36);
				}
				.blocknote-wrapper .bn-inline-content a[href^="note://"]:hover {
					color: hsl(var(--editor-note-link-hover));
					text-decoration-color: hsl(var(--editor-note-link-hover) / 0.72);
				}
				.blocknote-wrapper .bn-inline-content a[href^="note://"]::before {
					content: "";
					display: inline-block;
					width: 0.42em;
					height: 0.42em;
					margin-right: 0.28em;
					border-radius: 999px;
					background: currentColor;
					opacity: 0.76;
					vertical-align: 0.08em;
				}
				.blocknote-wrapper .bn-inline-content a[href^="http://"]::after,
				.blocknote-wrapper .bn-inline-content a[href^="https://"]::after {
					content: "";
					display: inline-block;
					width: 0.42em;
					height: 0.42em;
					margin-left: 0.24em;
					border-top: 1px solid currentColor;
					border-right: 1px solid currentColor;
					opacity: 0.7;
					transform: translateY(-0.14em) rotate(45deg);
				}
				.blocknote-wrapper [data-note-link],
				.blocknote-wrapper [data-note-tag] {
					cursor: pointer;
					user-select: none;
					white-space: nowrap;
				}
				.blocknote-wrapper [data-note-tag] {
					display: inline-flex;
					max-width: 16ch;
					vertical-align: baseline;
					overflow: hidden;
					text-overflow: ellipsis;
				}
				.blocknote-wrapper .bn-suggestion-decorator {
					border-radius: 0.2rem;
					background: hsl(var(--editor-selection));
					box-shadow: 0 0 0 1px hsl(var(--ring) / 0.7);
				}
				/* Real-time collaboration: remote carets, name labels, selections. */
				.blocknote-wrapper .bn-collaboration-cursor__caret {
					border-radius: 1px;
					/* Notch the caret away from the glyph edges so it reads as a
						   distinct cursor, not part of the text. */
					border-left: 1px solid hsl(var(--card));
					border-right: 1px solid hsl(var(--card));
				}
				.blocknote-wrapper .bn-collaboration-cursor__base[data-active] .bn-collaboration-cursor__label {
					top: -1.3rem;
					max-height: 1.2rem;
					border-radius: 4px 4px 4px 1px;
					padding: 0.06rem 0.34rem;
					font-size: 10.5px;
					font-weight: 600;
					letter-spacing: 0.01em;
					line-height: 1.2;
					box-shadow: 0 2px 8px hsl(var(--editor-shadow) / 0.38);
				}
				/* Remote text selection tint. y-prosemirror sets the per-user color
					   inline (with alpha); we only soften the corners + keep it from
					   bleeding past line boxes. */
				.blocknote-wrapper .ProseMirror-yjs-selection {
					border-radius: 2px;
					padding: 0.02em 0;
				}
				/* Anchored comments: author-tinted highlight via the engine's
					   --anchored-comment-color custom property. Falls back to the
					   ring color so it's never invisible. */
				.blocknote-wrapper .anchored-comment {
					background: hsl(var(--anchored-comment-color, var(--ring)) / 0.16);
					border-bottom: 2px solid hsl(var(--anchored-comment-color, var(--ring)) / 0.7);
					border-radius: 2px;
					cursor: pointer;
					transition: background 120ms ease;
				}
				.blocknote-wrapper .anchored-comment:hover {
					background: hsl(var(--anchored-comment-color, var(--ring)) / 0.26);
				}
				.blocknote-wrapper .anchored-comment--resolved {
					background: transparent;
					border-bottom-style: dotted;
					opacity: 0.55;
				}
				/* AI diff highlight: a transient, view-only tint that showcases
					   the content an AI action just inserted. Applied to a block's
					   [data-id] node; never touches the document, so it is not saved
					   or synced. Fade timing is driven from ai-diff-highlight.ts. */
				.blocknote-wrapper [data-id].skriuw-ai-diff {
					border-radius: 5px;
					background: hsl(var(--success) / 0.16);
					box-shadow:
						inset 4px 0 0 hsl(var(--success)),
						0 0 0 1px hsl(var(--success) / 0.3);
					transition:
						background 600ms ease,
						box-shadow 600ms ease;
					animation: skriuw-ai-diff-in 440ms ease;
				}
				.blocknote-wrapper [data-id].skriuw-ai-diff.skriuw-ai-diff--leaving {
					background: hsl(var(--success) / 0);
					box-shadow:
						inset 4px 0 0 hsl(var(--success) / 0),
						0 0 0 1px hsl(var(--success) / 0);
				}
				@keyframes skriuw-ai-diff-in {
					from {
						background: hsl(var(--success) / 0.34);
					}
					to {
						background: hsl(var(--success) / 0.16);
					}
				}
				@media (prefers-reduced-motion: reduce) {
					.blocknote-wrapper [data-id].skriuw-ai-diff {
						animation: none;
						transition: none;
					}
				}
				.blocknote-wrapper .skriuw-fmt-focus-ring {
					position: absolute;
					top: 0;
					left: 0;
					z-index: 0;
					opacity: 0;
					border-radius: calc(var(--radius) - 2px);
					background: hsl(var(--accent));
					box-shadow: inset 0 0 0 1px hsl(var(--ring) / 0.55);
					pointer-events: none;
					transition:
						transform 220ms cubic-bezier(0.16, 1, 0.3, 1),
						width 220ms cubic-bezier(0.16, 1, 0.3, 1),
						height 220ms cubic-bezier(0.16, 1, 0.3, 1),
						opacity 140ms ease;
				}
				@media (prefers-reduced-motion: reduce) {
					.blocknote-wrapper .skriuw-fmt-focus-ring {
						transition: opacity 140ms ease;
					}
				}
				.blocknote-wrapper .skriuw-fmt-btn,
				.blocknote-wrapper .skriuw-fmt-trigger,
				.blocknote-wrapper .skriuw-fmt-menu,
				.blocknote-wrapper .skriuw-fmt-sep {
					position: relative;
					z-index: 1;
				}
				.blocknote-wrapper .skriuw-fmt-btn:focus-visible,
				.blocknote-wrapper .skriuw-fmt-trigger:focus-visible {
					outline: none;
				}
				.blocknote-wrapper .skriuw-fmt-toolbar {
					display: flex;
					align-items: center;
					gap: 1px;
					padding: 2px;
					overflow: visible;
				}
					.blocknote-wrapper .skriuw-fmt-toolbar[data-mobile="true"] {
						max-width: calc(100vw - 16px);
						min-height: 2.75rem;
						flex-wrap: wrap;
						row-gap: 0.2rem;
						overflow: visible;
						padding: 0.3rem;
						gap: 0.15rem;
					}
				.blocknote-wrapper .skriuw-fmt-btn,
				.blocknote-wrapper .skriuw-fmt-trigger {
					display: inline-flex;
					align-items: center;
					justify-content: center;
					gap: 0.28rem;
					height: 1.75rem;
					min-width: 1.75rem;
					padding: 0 0.42rem;
					border: 0;
					border-radius: calc(var(--radius) - 2px);
					background: transparent;
					color: hsl(var(--popover-foreground));
					font-size: 0.75rem;
					font-weight: 500;
					cursor: pointer;
					transition:
						background-color 120ms ease,
						color 120ms ease;
				}
				.blocknote-wrapper .skriuw-fmt-btn {
					width: 1.75rem;
					padding: 0;
				}
				.blocknote-wrapper .skriuw-fmt-toolbar[data-mobile="true"] .skriuw-fmt-btn,
				.blocknote-wrapper .skriuw-fmt-toolbar[data-mobile="true"] .skriuw-fmt-trigger {
					flex: 0 0 auto;
					height: 2.75rem;
					min-width: 2.75rem;
					padding: 0 0.58rem;
				}
				.blocknote-wrapper .skriuw-fmt-toolbar[data-mobile="true"] .skriuw-fmt-btn {
					width: 2.75rem;
					padding: 0;
				}
				.blocknote-wrapper .skriuw-fmt-btn:hover,
				.blocknote-wrapper .skriuw-fmt-trigger:hover {
					background: hsl(var(--accent));
					color: hsl(var(--foreground));
				}
				.blocknote-wrapper .skriuw-fmt-btn[data-active="true"],
				.blocknote-wrapper .skriuw-fmt-trigger[aria-expanded="true"] {
					background: hsl(var(--muted));
					color: hsl(var(--foreground));
				}
				.blocknote-wrapper .skriuw-fmt-btn svg,
				.blocknote-wrapper .skriuw-fmt-trigger svg {
					width: 0.95rem;
					height: 0.95rem;
				}
				.blocknote-wrapper .skriuw-fmt-trigger-label {
					white-space: nowrap;
				}
				.blocknote-wrapper .skriuw-fmt-toolbar[data-mobile="true"] .skriuw-fmt-trigger-label {
					max-width: 6.5rem;
					overflow: hidden;
					text-overflow: ellipsis;
				}
				.blocknote-wrapper .skriuw-fmt-caret {
					opacity: 0.6;
				}
				.blocknote-wrapper .skriuw-fmt-sep {
					width: 1px;
					align-self: stretch;
					margin: 0.2rem 0.18rem;
					background: hsl(var(--border));
				}
				.blocknote-wrapper .skriuw-fmt-menu {
					position: relative;
					display: inline-flex;
					flex: 0 0 auto;
				}
				.blocknote-wrapper .skriuw-fmt-dropdown {
					position: absolute;
					top: calc(100% + 4px);
					left: 0;
					z-index: 60;
					min-width: 11rem;
					max-height: min(20rem, 60vh);
					overflow-y: auto;
					padding: 0.25rem;
					border: 1px solid hsl(var(--border));
					border-radius: var(--radius);
					background: hsl(var(--popover));
					color: hsl(var(--popover-foreground));
					box-shadow: 0 16px 36px hsl(var(--editor-shadow) / 0.42);
				}
				.blocknote-wrapper .skriuw-fmt-toolbar[data-mobile="true"] .skriuw-fmt-dropdown {
					top: auto;
					bottom: calc(100% + 0.5rem);
					left: 0;
					max-height: min(18rem, 48dvh);
				}
				.blocknote-wrapper .skriuw-fmt-item {
					display: flex;
					align-items: center;
					gap: 0.5rem;
					width: 100%;
					min-height: 1.85rem;
					padding: 0.2rem 0.5rem;
					border: 0;
					border-radius: calc(var(--radius) - 2px);
					background: transparent;
					color: hsl(var(--popover-foreground));
					font-size: 0.8rem;
					text-align: left;
					cursor: pointer;
				}
				.blocknote-wrapper .skriuw-fmt-item:hover {
					background: hsl(var(--accent));
					color: hsl(var(--foreground));
				}
				.blocknote-wrapper .skriuw-fmt-item[data-active="true"] {
					background: hsl(var(--muted));
					color: hsl(var(--foreground));
				}
				.blocknote-wrapper .skriuw-fmt-item-icon {
					display: inline-flex;
					color: hsl(var(--muted-foreground));
				}
				.blocknote-wrapper .skriuw-fmt-item-icon svg {
					width: 0.95rem;
					height: 0.95rem;
				}
				.blocknote-wrapper .skriuw-fmt-form {
					display: flex;
					align-items: center;
					gap: 0.4rem;
					padding: 0.15rem;
				}
				.blocknote-wrapper .skriuw-fmt-comment {
					display: flex;
					flex-direction: column;
					gap: 0.4rem;
					padding: 0.15rem;
				}
				.blocknote-wrapper .skriuw-fmt-input,
				.blocknote-wrapper .skriuw-fmt-textarea {
					flex: 1;
					min-width: 0;
					border: 1px solid hsl(var(--border));
					border-radius: calc(var(--radius) - 2px);
					background: hsl(var(--background));
					color: hsl(var(--foreground));
					font-size: 0.78rem;
					padding: 0.32rem 0.46rem;
					outline: none;
				}
				.blocknote-wrapper .skriuw-fmt-input:focus,
				.blocknote-wrapper .skriuw-fmt-textarea:focus {
					border-color: hsl(var(--ring));
					box-shadow: 0 0 0 1px hsl(var(--ring));
				}
				.blocknote-wrapper .skriuw-fmt-textarea {
					height: 4.5rem;
					resize: none;
				}
				.blocknote-wrapper .skriuw-fmt-apply {
					border: 0;
					border-radius: calc(var(--radius) - 2px);
					background: hsl(var(--foreground));
					color: hsl(var(--background));
					font-size: 0.72rem;
					font-weight: 600;
					padding: 0.34rem 0.6rem;
					cursor: pointer;
				}
				.blocknote-wrapper .skriuw-fmt-apply:disabled {
					opacity: 0.5;
					cursor: default;
				}
				.blocknote-wrapper .skriuw-fmt-ghost {
					border: 0;
					border-radius: calc(var(--radius) - 2px);
					background: transparent;
					color: hsl(var(--muted-foreground));
					font-size: 0.72rem;
					padding: 0.34rem 0.5rem;
					cursor: pointer;
				}
				.blocknote-wrapper .skriuw-fmt-ghost:hover {
					background: hsl(var(--muted));
				}
				.blocknote-wrapper .skriuw-fmt-comment-actions {
					display: flex;
					justify-content: flex-end;
					gap: 0.4rem;
				}
				.blocknote-wrapper .bn-toolbar {
					min-height: 2rem;
					background: hsl(var(--popover)) !important;
					border: 1px solid hsl(var(--border)) !important;
					color: hsl(var(--popover-foreground)) !important;
					box-shadow: 0 16px 36px hsl(var(--editor-shadow) / 0.42);
					padding: 1px;
					gap: 1px;
					border-radius: var(--radius);
				}
				.blocknote-wrapper .bn-toolbar .mantine-Button-root,
				.blocknote-wrapper .bn-toolbar .mantine-ActionIcon-root {
					min-height: 1.75rem;
					height: 1.75rem;
					background: transparent !important;
					color: hsl(var(--popover-foreground)) !important;
					border-radius: calc(var(--radius) - 2px);
				}
				.blocknote-wrapper .bn-toolbar .mantine-Button-root {
					padding-left: 0.45rem;
					padding-right: 0.45rem;
					font-size: 0.6875rem;
				}
				.blocknote-wrapper .bn-toolbar .mantine-Button-section {
					margin-inline: 0.2rem;
				}
				.blocknote-wrapper .bn-toolbar .mantine-ActionIcon-root {
					width: 1.75rem;
					min-width: 1.75rem;
				}
				.blocknote-wrapper .bn-toolbar .mantine-Button-root:hover,
				.blocknote-wrapper .bn-toolbar .mantine-ActionIcon-root:hover,
				.blocknote-wrapper .bn-toolbar .mantine-UnstyledButton-root:hover {
					background: hsl(var(--accent)) !important;
					color: hsl(var(--foreground)) !important;
				}
				.blocknote-wrapper .bn-toolbar .mantine-Button-root[data-active="true"],
				.blocknote-wrapper .bn-toolbar .mantine-ActionIcon-root[data-active="true"],
				.blocknote-wrapper .bn-toolbar .mantine-UnstyledButton-root[data-active="true"] {
					background: hsl(var(--muted)) !important;
					color: hsl(var(--foreground)) !important;
				}
				.blocknote-wrapper .bn-toolbar svg {
					width: 0.82rem;
					height: 0.82rem;
				}
				.blocknote-wrapper .bn-toolbar .mantine-Menu-item {
					min-height: 1.75rem;
					height: 1.75rem;
					font-size: 0.75rem;
				}
				.blocknote-wrapper .bn-toolbar .mantine-Menu-dropdown,
				.blocknote-wrapper .bn-toolbar .mantine-Popover-dropdown,
				.blocknote-wrapper .bn-toolbar .mantine-Tooltip-tooltip {
					background: hsl(var(--popover)) !important;
					border: 1px solid hsl(var(--border)) !important;
					color: hsl(var(--popover-foreground)) !important;
					box-shadow: 0 16px 36px hsl(var(--editor-shadow) / 0.42) !important;
					backdrop-filter: none !important;
				}
				:global(.mantine-Menu-dropdown),
				:global(.mantine-Popover-dropdown) {
					z-index: 10050 !important;
				}
				.blocknote-wrapper .bn-toolbar .mantine-Menu-item:hover,
				.blocknote-wrapper .bn-toolbar .mantine-Menu-item[data-hovered],
				.blocknote-wrapper .bn-toolbar .mantine-Menu-item[data-selected] {
					background: hsl(var(--accent)) !important;
					color: hsl(var(--foreground)) !important;
				}
				.blocknote-wrapper .skriuw-editor-suggestion-menu {
					background: hsl(var(--popover)) !important;
					border: 1px solid hsl(var(--border)) !important;
					color: hsl(var(--popover-foreground)) !important;
					box-shadow:
						0 20px 25px -5px rgb(0 0 0 / 0.4),
						0 8px 10px -6px rgb(0 0 0 / 0.4) !important;
				}
				.blocknote-wrapper .skriuw-file-tree {
					--skriuw-file-tree-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
					width: min(100%, 42rem);
					overflow: hidden;
					border: 1px solid hsl(var(--border));
					border-radius: 0.5rem;
					background: hsl(var(--popover));
					color: hsl(var(--popover-foreground));
					box-shadow: inset 0 1px 0 hsl(var(--foreground) / 0.03);
				}
				.blocknote-wrapper .skriuw-file-tree__header {
					display: flex;
					min-height: 2.75rem;
					align-items: center;
					justify-content: space-between;
					gap: 0.75rem;
					border-bottom: 1px solid hsl(var(--border));
					padding: 0.5rem 0.625rem 0.5rem 0.75rem;
				}
				.blocknote-wrapper .skriuw-file-tree__title-wrap {
					display: flex;
					min-width: 0;
					align-items: center;
					gap: 0.55rem;
				}
				.blocknote-wrapper .skriuw-file-tree__header-icon,
				.blocknote-wrapper .skriuw-file-tree__icon {
					flex: 0 0 auto;
					color: hsl(var(--muted-foreground));
				}
				.blocknote-wrapper .skriuw-file-tree__title {
					margin: 0;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
					font-size: 0.8125rem;
					font-weight: 600;
					line-height: 1.25;
					color: hsl(var(--foreground));
				}
				.blocknote-wrapper .skriuw-file-tree__meta {
					margin: 0.1rem 0 0;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
					font-size: 0.6875rem;
					line-height: 1.2;
					color: hsl(var(--muted-foreground));
				}
				.blocknote-wrapper .skriuw-file-tree__actions {
					display: flex;
					flex: 0 0 auto;
					align-items: center;
					gap: 0.125rem;
				}
				.blocknote-wrapper .skriuw-file-tree__icon-button {
					display: inline-flex;
					height: 1.75rem;
					width: 1.75rem;
					align-items: center;
					justify-content: center;
					border: 0;
					border-radius: 0.375rem;
					background: transparent;
					color: hsl(var(--muted-foreground));
					transition:
						background-color 140ms var(--skriuw-file-tree-ease-out),
						color 140ms var(--skriuw-file-tree-ease-out),
						transform 140ms var(--skriuw-file-tree-ease-out);
				}
				.blocknote-wrapper .skriuw-file-tree__icon-button:active {
					transform: scale(0.97);
				}
				.blocknote-wrapper .skriuw-file-tree__icon-button:focus-visible,
				.blocknote-wrapper .skriuw-file-tree__row:focus-visible {
					outline: 1px solid hsl(var(--ring));
					outline-offset: -1px;
				}
				.blocknote-wrapper .skriuw-file-tree__body {
					padding: 0.375rem;
				}
				.blocknote-wrapper .skriuw-file-tree__row {
					display: flex;
					width: 100%;
					min-height: 1.75rem;
					align-items: center;
					gap: 0.375rem;
					border: 0;
					border-radius: 0.375rem;
					background: transparent;
					color: hsl(var(--foreground) / 0.86);
					padding: 0.125rem 0.5rem 0.125rem calc(0.375rem + var(--depth, 0) * 1.125rem);
					text-align: left;
					transition:
						background-color 140ms var(--skriuw-file-tree-ease-out),
						color 140ms var(--skriuw-file-tree-ease-out),
						transform 140ms var(--skriuw-file-tree-ease-out);
				}
				.blocknote-wrapper .skriuw-file-tree__row--folder {
					cursor: pointer;
					font: inherit;
				}
				.blocknote-wrapper .skriuw-file-tree__row--folder:active {
					transform: scale(0.997);
				}
				.blocknote-wrapper .skriuw-file-tree__toggle {
					display: inline-flex;
					width: 0.875rem;
					flex: 0 0 0.875rem;
					align-items: center;
					justify-content: center;
					color: hsl(var(--muted-foreground));
				}
				.blocknote-wrapper .skriuw-file-tree__chevron {
					transition: transform 150ms var(--skriuw-file-tree-ease-out);
				}
				.blocknote-wrapper .skriuw-file-tree__chevron.is-open {
					transform: rotate(90deg);
				}
				.blocknote-wrapper .skriuw-file-tree__name {
					min-width: 0;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
					font-family: "SFMono-Regular", "Cascadia Code", "Roboto Mono", monospace;
					font-size: 0.78rem;
					line-height: 1.35;
				}
				.blocknote-wrapper .skriuw-file-tree__editor {
					display: block;
					width: calc(100% - 0.75rem);
					min-height: 16rem;
					resize: vertical;
					border: 1px solid hsl(var(--border));
					border-radius: 0.375rem;
					background: hsl(var(--background));
					color: hsl(var(--foreground));
					font-family: "SFMono-Regular", "Cascadia Code", "Roboto Mono", monospace;
					font-size: 0.75rem;
					line-height: 1.65;
					margin: 0.375rem;
					padding: 0.625rem 0.75rem;
					outline: none;
				}
				.blocknote-wrapper .skriuw-file-tree__editor:focus {
					border-color: hsl(var(--ring));
					box-shadow: 0 0 0 1px hsl(var(--ring));
				}
				@media (hover: hover) and (pointer: fine) {
					.blocknote-wrapper .skriuw-file-tree__icon-button:hover,
					.blocknote-wrapper .skriuw-file-tree__row--folder:hover {
						background: hsl(var(--accent));
						color: hsl(var(--accent-foreground));
					}
				}
				@media (prefers-reduced-motion: reduce) {
					.blocknote-wrapper .skriuw-file-tree__icon-button,
					.blocknote-wrapper .skriuw-file-tree__row,
					.blocknote-wrapper .skriuw-file-tree__chevron {
						transition-duration: 0ms;
					}
				}
				.blocknote-wrapper [data-content-type="procode"] .pro-code-code {
					white-space: pre-wrap !important;
					overflow-wrap: anywhere;
					word-break: break-word;
				}
				/* Override any mantine styles */
				.blocknote-wrapper .mantine-Paper-root,
				.blocknote-wrapper [class*="mantine-"] {
					--mantine-color-body: hsl(var(--background));
				}
				.blocknote-wrapper .bn-editor [data-content-type="table"] th,
				.blocknote-wrapper .bn-editor [data-content-type="table"] td {
					border-color: hsl(var(--border) / 0.72) !important;
				}
				.blocknote-wrapper .bn-editor [data-content-type="table"] th {
					background: hsl(var(--muted) / 0.6);
					font-weight: 500;
				}
`;
