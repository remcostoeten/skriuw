import { BlockNoteEditor } from '@blocknote/core'
import { BlockNoteView } from '@blocknote/mantine'
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'

import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { useUserPreferences, useSettings } from '@/features/settings'
import { NoteMentionSuggestionMenu } from './NoteMentionSuggestionMenu'

type props = {
    editor: BlockNoteEditor | null
}

export type EditorWrapperHandle = {
    focusEditor: () => void
}

export const EditorWrapper = forwardRef<EditorWrapperHandle, props>(
    ({ editor }, ref) => {
        const editorRef = useRef<HTMLDivElement>(null)
        const { hasWordWrap } = useUserPreferences()
        const { centeredLayout } = useSettings()

        useImperativeHandle(ref, () => ({
            focusEditor: () => {
                // Focus the editor by finding the contenteditable element
                const contentEditable = editorRef.current?.querySelector(
                    '[contenteditable="true"]'
                ) as HTMLElement
                contentEditable?.focus()
            }
        }))

        // Apply word wrap styles when setting changes
        useEffect(() => {
            if (!editorRef.current) return

            // Apply a data attribute to the container for CSS targeting
            if (hasWordWrap) {
                editorRef.current.setAttribute('data-word-wrap', 'enabled')
            } else {
                editorRef.current.setAttribute('data-word-wrap', 'disabled')
            }
        }, [hasWordWrap])

        // Apply centered layout class when setting changes
        useEffect(() => {
            if (!editorRef.current) return

            if (centeredLayout) {
                editorRef.current.classList.add('centered-layout')
            } else {
                editorRef.current.classList.remove('centered-layout')
            }
        }, [centeredLayout])

        if (!editor) {
            return null
        }

        return (
            <div
                ref={editorRef}
                className={`editor-container w-full h-full overflow-y-auto ${centeredLayout ? 'centered-layout' : ''}`}
                style={{
                    background: 'transparent'
                }}
            >
                <BlockNoteView editor={editor}>
                    <NoteMentionSuggestionMenu />
                </BlockNoteView>
                <style>{`
        .editor-container {
          background: transparent !important;
          overflow-y: auto;
          min-height: 100%;
        }
        .editor-container[data-word-wrap="enabled"] {
          overflow-x: hidden;
        }
        .editor-container[data-word-wrap="disabled"] {
          overflow-x: auto;
        }
        .editor-container.centered-layout {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .editor-container .bn-editor {
          background: transparent !important;
          padding: 1.5rem;
          max-width: 100%;
          color: rgba(230, 230, 230, 0.9);
          font-family: 'Ubuntu Sans', -apple-system, system-ui, sans-serif;
        }
        /* Word wrap styles - enabled */
        .editor-container[data-word-wrap="enabled"] .bn-editor {
          white-space: pre-wrap !important;
          overflow-wrap: break-word !important;
          word-break: break-word !important;
        }
        .editor-container[data-word-wrap="enabled"] [contenteditable="true"],
        .editor-container[data-word-wrap="enabled"] .bn-block,
        .editor-container[data-word-wrap="enabled"] .bn-inline-content {
          white-space: pre-wrap !important;
          overflow-wrap: break-word !important;
          word-break: break-word !important;
        }
        /* Exclude code blocks from word wrap */
        .editor-container[data-word-wrap="enabled"] code,
        .editor-container[data-word-wrap="enabled"] .bn-code-block,
        .editor-container[data-word-wrap="enabled"] pre {
          white-space: pre !important;
          overflow-wrap: normal !important;
          word-break: normal !important;
          overflow-x: auto !important;
        }
        /* Word wrap styles - disabled */
        /* Ensure container allows horizontal overflow when word wrap is disabled */
        .editor-container[data-word-wrap="disabled"] .bn-editor {
          white-space: pre !important;
          overflow-wrap: normal !important;
          word-break: normal !important;
        }
        .editor-container[data-word-wrap="disabled"] [contenteditable="true"],
        .editor-container[data-word-wrap="disabled"] .bn-block,
        .editor-container[data-word-wrap="disabled"] .bn-inline-content {
          white-space: pre !important;
          overflow-wrap: normal !important;
          word-break: normal !important;
        }
        /* Override global word-wrap styles when word wrap is disabled */
        /* These global styles from global.css force word wrapping */
        .editor-container[data-word-wrap="disabled"] p,
        .editor-container[data-word-wrap="disabled"] span,
        .editor-container[data-word-wrap="disabled"] li,
        .editor-container[data-word-wrap="disabled"] h1,
        .editor-container[data-word-wrap="disabled"] h2,
        .editor-container[data-word-wrap="disabled"] h3,
        .editor-container[data-word-wrap="disabled"] h4,
        .editor-container[data-word-wrap="disabled"] h5,
        .editor-container[data-word-wrap="disabled"] h6,
        .editor-container[data-word-wrap="disabled"] a,
        .editor-container[data-word-wrap="disabled"] label {
          overflow-wrap: normal !important;
          word-break: normal !important;
        }
        .editor-container.centered-layout .bn-editor {>
          width: 100%;
          max-width: 655px;
          margin-left: auto;
          margin-right: auto;
          padding-top: 0;
          padding-bottom: 1.5rem;
          padding-left: 0;
          padding-right: 0;
        }
        .editor-container.centered-layout .bn-editor > div:first-child [data-content-type="heading"][data-level="1"],
        .editor-container.centered-layout .bn-editor > div:first-child [data-content-type="heading"][data-level="2"] {
          text-align: center;
          font-weight: bold;
          margin-bottom: 0.625rem;
          padding-left: 2rem;
          padding-right: 2rem;
          display: block;
          width: 100%;
        }
        .editor-container.centered-layout .bn-editor > div:first-child [data-content-type="heading"][data-level="1"] {
          font-size: 2.25rem;
          line-height: 1.2;
        }
        .editor-container.centered-layout .bn-editor > div:first-child [data-content-type="heading"][data-level="2"] {
          font-size: 1.875rem;
          line-height: 1.3;
        }
        .editor-container.centered-layout .bn-editor > div:first-child [data-content-type="heading"][data-level="1"] > *,
        .editor-container.centered-layout .bn-editor > div:first-child [data-content-type="heading"][data-level="2"] > * {
          text-align: center;
        }
        .editor-container .bn-editor {
          outline: none !important;
          box-shadow: none !important;
        }
        .editor-container .bn-editor:focus,
        .editor-container .bn-editor:focus-visible {
          outline: none !important;
          box-shadow: none !important;
        }
        .editor-container:focus-visible {
          outline: none !important;
        }
        .editor-container .bn-block {
          color: rgba(230, 230, 230, 0.9);
        }
        .editor-container .bn-inline-content {
          color: rgba(230, 230, 230, 0.9);
        }
        .editor-container strong {
          color: rgba(230, 230, 230, 1);
        }
        .editor-container em {
          color: rgba(230, 230, 230, 0.9);
          font-style: italic;
        }
        .editor-container code {
          background: rgba(46, 46, 46, 0.5);
          color: rgba(230, 230, 230, 1);
          padding: 0.2rem 0.4rem;
          border-radius: 3px;
          font-family: monospace;
        }
        .editor-container a {
          color: rgba(249, 250, 251, 1);
          text-decoration: underline;
        }
        .editor-container a:hover {
          text-decoration: none;
        }
        .editor-container [data-placeholder] {
          color: rgba(140, 140, 140, 0.6);
        }
        .editor-container [contenteditable]:focus {
          outline: none;
        }
        .skriuw-mention-menu {
          display: flex;
          flex-direction: column;
          min-width: 260px;
          max-width: 360px;
          background: rgba(18, 18, 20, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 0.5rem;
          padding: 0.3rem;
          box-shadow: 0px 16px 48px rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(10px);
        }
        .skriuw-mention-menu.empty {
          padding: 0.75rem 1rem;
        }
        .skriuw-mention-menu__item {
          display: flex;
          align-items: center;
          width: 100%;
          gap: 0.75rem;
          padding: 0.5rem 0.6rem;
          border-radius: 0.45rem;
          background: transparent;
          color: inherit;
          text-align: left;
          cursor: pointer;
          border: none;
        }
        .skriuw-mention-menu__item.is-selected {
          background: rgba(255, 255, 255, 0.08);
        }
        .skriuw-mention-menu__item:focus-visible {
          outline: 2px solid rgba(255, 255, 255, 0.35);
        }
        .skriuw-mention-menu__icon {
          width: 1.75rem;
          height: 1.75rem;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.07);
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.85);
        }
        .skriuw-mention-menu__content {
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
        }
        .skriuw-mention-menu__title {
          font-size: 0.95rem;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.95);
        }
        .skriuw-mention-menu__title mark {
          background: transparent;
          color: rgba(233, 191, 255, 1);
          font-weight: 600;
        }
        .skriuw-mention-menu__path {
          font-size: 0.72rem;
          color: rgba(255, 255, 255, 0.55);
        }
        .skriuw-mention-menu__empty {
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.65);
        }
        .editor-container .bn-toolbar {
          background: rgba(18, 18, 18, 0.95) !important;
          border-color: rgba(46, 46, 46, 0.5) !important;
        }
        .editor-container .bn-toolbar button {
          color: rgba(230, 230, 230, 0.7);
        }
        .editor-container .bn-toolbar button:hover {
          background: rgba(46, 46, 46, 0.5) !important;
          color: rgba(230, 230, 230, 1);
        }
      `}</style>
            </div>
        )
    }
)

EditorWrapper.displayName = 'EditorWrapper'
