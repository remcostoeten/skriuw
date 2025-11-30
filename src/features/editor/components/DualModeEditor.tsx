import React, { useState, useEffect, useCallback } from 'react'
import { Block } from '@blocknote/core'
import { RawMDXEditor } from './RawMDXEditor'
import { useUserPreferences } from '@/features/settings/use-feature-flags'
import { markdownToBlocks } from '@/features/notes/utils/markdown-to-blocks'
import { blocksToMarkdown } from '@/features/notes/utils/blocks-to-markdown'
import { BlockNoteView } from './blocknote-shadcn/BlockNoteView'

interface DualModeEditorProps {
  editor: any // BlockNoteEditor instance
  value: Block[]
  onChange: (blocks: Block[]) => void
  placeholder?: string
  disabled?: boolean
  fontSize?: string
  fontFamily?: string
  lineHeight?: number
  wordWrap?: boolean
  blockIndicator?: boolean
  showFormattingToolbar?: boolean
  className?: string
}

/**
 * Dual-mode editor that supports both rich BlockNote editing and raw MDX editing
 * Users can switch between modes using the toolbar button or Ctrl+M shortcut
 */
export function DualModeEditor({
  editor,
  value,
  onChange,
  placeholder = 'Start typing your note...',
  disabled = false,
  fontSize = '16px',
  fontFamily = '"Inter", system-ui, sans-serif',
  lineHeight = 1.6,
  wordWrap = true,
  blockIndicator = true,
  showFormattingToolbar = true,
  className
}: DualModeEditorProps) {
  const { hasRawMDXMode, toggle: togglePreference } = useUserPreferences()
  const [rawMDXContent, setRawMDXContent] = useState('')
  const [isConverting, setIsConverting] = useState(false)

  // Convert BlockNote blocks to raw markdown when switching to MDX mode
  const convertBlocksToMDX = useCallback(async (blocks: Block[]) => {
    setIsConverting(true)
    try {
      const markdown = blocksToMarkdown(blocks)
      setRawMDXContent(markdown)
      return markdown
    } catch (error) {
      console.error('Failed to convert blocks to markdown:', error)
      // Fallback to plain text extraction
      const plainText = blocks.map(block =>
        block.content ? String(block.content) : ''
      ).join('\n')
      setRawMDXContent(plainText)
      return plainText
    } finally {
      setIsConverting(false)
    }
  }, [])

  // Convert raw markdown to BlockNote blocks when switching back to rich mode
  const convertMDXToBlocks = useCallback(async (markdown: string) => {
    setIsConverting(true)
    try {
      const blocks = await markdownToBlocks(markdown)
      onChange(blocks)
      return blocks
    } catch (error) {
      console.error('Failed to convert markdown to blocks:', error)
      // Fallback to creating a simple paragraph block
      const fallbackBlock = {
        id: 'fallback-' + Date.now(),
        type: 'paragraph' as const,
        props: {
          backgroundColor: 'default' as const,
          textColor: 'default' as const,
          textAlignment: 'left' as const
        },
        content: [{
          type: 'text' as const,
          text: markdown,
          styles: {}
        }],
        children: []
      }
      onChange([fallbackBlock])
      return [fallbackBlock]
    } finally {
      setIsConverting(false)
    }
  }, [onChange])

  // Handle mode toggle
  const handleToggleMode = useCallback(() => {
    togglePreference('rawMDXMode')
  }, [togglePreference])

  // Initialize MDX content when switching to MDX mode
  useEffect(() => {
    if (hasRawMDXMode && value && value.length > 0) {
      convertBlocksToMDX(value)
    }
  }, [hasRawMDXMode, value, convertBlocksToMDX])

  // Handle MDX content changes
  const handleMDXChange = useCallback(async (newMDXContent: string) => {
    setRawMDXContent(newMDXContent)

    // If not in MDX mode, convert the content to blocks
    if (!hasRawMDXMode) {
      await convertMDXToBlocks(newMDXContent)
    }
  }, [hasRawMDXMode, convertMDXToBlocks])

  // Auto-save MDX content to blocks when in MDX mode
  useEffect(() => {
    if (hasRawMDXMode && rawMDXContent) {
      const saveTimeout = setTimeout(async () => {
        await convertMDXToBlocks(rawMDXContent)
      }, 1000) // 1 second debounce

      return () => clearTimeout(saveTimeout)
    }
  }, [hasRawMDXMode, rawMDXContent, convertMDXToBlocks])

  // Sync blocks to MDX content when blocks change in rich mode
  useEffect(() => {
    if (!hasRawMDXMode && value && value.length > 0) {
      const newMarkdown = blocksToMarkdown(value)
      if (newMarkdown !== rawMDXContent) {
        setRawMDXContent(newMarkdown)
      }
    }
  }, [hasRawMDXMode, value, rawMDXContent])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+M or Cmd+M to toggle mode
      if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
        e.preventDefault()
        handleToggleMode()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleToggleMode])

  if (hasRawMDXMode) {
    // Raw MDX Editor Mode
    return (
      <div className={className}>
        {isConverting && (
          <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
            Converting content...
          </div>
        )}
        <RawMDXEditor
          value={rawMDXContent}
          onChange={handleMDXChange}
          placeholder={placeholder}
          disabled={disabled}
          wordWrap={wordWrap}
          fontSize={fontSize}
          fontFamily={fontFamily}
          lineHeight={lineHeight}
        />
      </div>
    )
  }

  // Rich BlockNote Editor Mode
  return (
    <div className={className}>
      {isConverting && (
        <div className="absolute top-0 left-0 right-0 bg-background/80 border-b border-border z-10 flex items-center justify-center p-2 text-sm text-muted-foreground">
          Converting content...
        </div>
      )}
      <BlockNoteView
        editor={editor}
        className={`${isConverting ? 'opacity-50' : ''}`}
        sideMenu={blockIndicator}
        formattingToolbar={showFormattingToolbar}
        data-theme-css-variables={false}
      />
    </div>
  )
}
