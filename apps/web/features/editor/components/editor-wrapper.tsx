import { BlockNoteEditor } from '@blocknote/core'
import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react'

import '@blocknote/core/fonts/inter.css'
import '@blocknote/core/style.css'
import '@blocknote/react/style.css'
import '../styles/editor.css'

import { highlightCodeBlocks } from '../utils/code-highlight'
import { useUserPreferences, useSettings } from '../../settings'
import { getFontSizePx, getFontFamily, getMaxWidthPx } from '../styles/editor-tokens'

import { DualModeEditor } from './default-mode-editor'
import { TaskCheckboxReplacer } from './task-checkbox-replacer'
import { MobileFormattingToolbar } from './mobile-formatting-toolbar'

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
      maxWidth,
      updateSetting,
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

        function handleContentChange() {
          if (editor) {
            setEditorContent(editor.document)
          }
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

      function debouncedHighlight() {
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
        // Apply max-width variable
        editorRef.current.style.setProperty('--editor-max-width', getMaxWidthPx(maxWidth ?? 'medium'))
      } else {
        editorRef.current.classList.remove('centered-layout')
        editorRef.current.style.removeProperty('--editor-max-width')
      }
    }, [centeredLayout, maxWidth])

    // Pinch-to-zoom for font size
    useEffect(() => {
      const el = editorRef.current
      if (!el) return

      let startDistance = 0
      let baseFontSize = fontSize || 'medium' // Snapshot at start of gesture

      // Font size progression: small -> medium -> large -> x-large
      const sizes = ['small', 'medium', 'large', 'x-large']

      const getDistance = (touches: TouchList) => {
        const touch1 = touches[0]
        const touch2 = touches[1]
        return Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY)
      }

      const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          startDistance = getDistance(e.touches)
          baseFontSize = fontSize || 'medium'
        }
      }

      const handleTouchMove = (e: TouchEvent) => {
        if (e.touches.length === 2 && startDistance > 0) {
          const newDistance = getDistance(e.touches)
          const scale = newDistance / startDistance

          // Determine direction
          let newSize = baseFontSize
          const currentIndex = sizes.indexOf(baseFontSize)

          if (scale > 1.3) {
            // Zoom In
            if (currentIndex < sizes.length - 1) {
              newSize = sizes[currentIndex + 1]
            }
          } else if (scale < 0.7) {
            // Zoom Out
            if (currentIndex > 0) {
              newSize = sizes[currentIndex - 1]
            }
          }

          // Only update if changed
          if (newSize !== fontSize) {
            updateSetting('fontSize', newSize)
            // Reset base to avoid rapid firing, effectively converting continuous pinch into steps
            baseFontSize = newSize
            startDistance = newDistance
          }
        }
      }

      el.addEventListener('touchstart', handleTouchStart as any, { passive: true })
      el.addEventListener('touchmove', handleTouchMove as any, { passive: true })

      return () => {
        el.removeEventListener('touchstart', handleTouchStart as any)
        el.removeEventListener('touchmove', handleTouchMove as any)
      }
    }, [fontSize, updateSetting])

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
        className={`editor-container w-full h-full overflow-y-auto ${centeredLayout ? 'centered-layout' : ''}`}
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
        <MobileFormattingToolbar editor={editor} />
      </div>
    )
  }
)

EditorWrapper.displayName = 'EditorWrapper'
