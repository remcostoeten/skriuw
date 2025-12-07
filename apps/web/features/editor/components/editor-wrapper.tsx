import { BlockNoteEditor } from '@blocknote/core'
import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react'

import '@blocknote/core/fonts/inter.css'
import '@blocknote/core/style.css'
import '@blocknote/react/style.css'
import '../styles/editor.css'

import { highlightCodeBlocks } from '../utils/code-highlight'
import { useUserPreferences, useSettings } from '../../settings'
import { getFontSizePx, getFontFamily } from '../styles/editor-tokens'

import { DualModeEditor } from './default-mode-editor'
import { TaskCheckboxReplacer } from './task-checkbox-replacer'

type Props = {
  editor: BlockNoteEditor | null
  className?: string
}

export type EditorWrapperHandle = {
  focusEditor: () => void
}

export const EditorWrapper = forwardRef<EditorWrapperHandle, Props>(
  ({ editor, className }, ref) => {
    const editorRef = useRef<HTMLDivElement>(null)
    const { hasWordWrap, hasRawMDXMode } = useUserPreferences()
    const {
      centeredLayout,
      blockIndicator,
      showFormattingToolbar,
      fontSize,
      fontFamily,
      lineHeight,
    } = useSettings()
    const [editorContent, setEditorContent] = useState<any[]>([])

    useImperativeHandle(ref, () => ({
      focusEditor: () => {
        if (hasRawMDXMode) {
          const textarea = editorRef.current?.querySelector('textarea') as HTMLTextAreaElement
          textarea?.focus()
        } else {
          const contentEditable = editorRef.current?.querySelector(
            '[contenteditable="true"]'
          ) as HTMLElement
          contentEditable?.focus()
        }
      },
    }))

    useEffect(() => {
      if (editor) {
        setEditorContent(editor.document)

        const handleContentChange = () => {
          setEditorContent(editor.document)
        }

        editor.onEditorContentChange(handleContentChange)
      }
    }, [editor])

    // Highlight code blocks on mount and when content changes
    useEffect(() => {
      if (!editorRef.current || hasRawMDXMode || !editor) return

      let isHighlighting = false
      let debounceTimeout: NodeJS.Timeout | null = null

      const highlight = async () => {
        if (isHighlighting) return

        isHighlighting = true
        try {
          await highlightCodeBlocks(editorRef.current!, editor as any)
        } catch (error) {
          console.warn('Failed to highlight code blocks:', error)
        } finally {
          isHighlighting = false
        }
      }

      const debouncedHighlight = () => {
        if (debounceTimeout) {
          clearTimeout(debounceTimeout)
        }
        debounceTimeout = setTimeout(highlight, 300)
      }

      const timeoutId = setTimeout(highlight, 200)

      const observer = new MutationObserver((mutations) => {
        const hasCodeBlockChange = mutations.some((mutation) => {
          if (mutation.type === 'childList') {
            for (const node of Array.from(mutation.addedNodes)) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const element = node as Element
                if (
                  element.querySelector?.('[data-content-type="codeBlock"]') ||
                  element.querySelector?.('.bn-code-block') ||
                  element.querySelector?.('pre code') ||
                  element.matches?.('[data-content-type="codeBlock"]') ||
                  element.matches?.('.bn-code-block')
                ) {
                  return true
                }
              }
            }
            if (mutation.target.nodeType === Node.ELEMENT_NODE) {
              const target = mutation.target as Element
              if (
                target.closest?.('[data-content-type="codeBlock"]') ||
                target.closest?.('.bn-code-block')
              ) {
                return true
              }
            }
          }
          return false
        })

        if (hasCodeBlockChange) {
          debouncedHighlight()
        }
      })

      observer.observe(editorRef.current, {
        childList: true,
        subtree: true,
      })

      return () => {
        clearTimeout(timeoutId)
        if (debounceTimeout) {
          clearTimeout(debounceTimeout)
        }
        observer.disconnect()
      }
    }, [editorContent, hasRawMDXMode, editor])

    // Apply word wrap data attribute
    useEffect(() => {
      if (!editorRef.current) return
      editorRef.current.setAttribute('data-word-wrap', hasWordWrap ? 'enabled' : 'disabled')
    }, [hasWordWrap])

    // Apply centered layout class
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

    function handleContentChange(newContent: any[]) {
      setEditorContent(newContent)
      if (editor) {
        editor.replaceBlocks(editor.document, newContent)
      }
    }

    return (
      <div
        ref={editorRef}
        className={`editor-container w-full h-full overflow-y-auto ${centeredLayout ? 'centered-layout' : ''} ${className ?? 'bg-background-secondary'}`}
      >
        <DualModeEditor
          editor={editor}
          value={editorContent}
          onChange={handleContentChange}
          fontSize={getFontSizePx(fontSize ?? 'medium')}
          fontFamily={getFontFamily(fontFamily ?? 'inter')}
          lineHeight={lineHeight ?? 1.6}
          wordWrap={hasWordWrap}
          blockIndicator={blockIndicator}
          showFormattingToolbar={showFormattingToolbar}
          className="w-full h-full"
        />
        <TaskCheckboxReplacer editor={editor} editorContainerRef={editorRef} />
      </div>
    )
  }
)

EditorWrapper.displayName = 'EditorWrapper'
