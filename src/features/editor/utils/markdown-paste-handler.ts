import type { BlockNoteEditor } from '@blocknote/core'

/**
 * BlockNote paste handler type
 * See: https://www.blocknotejs.org/docs/reference/editor/paste-handling
 */
type PasteHandler = (context: {
  event: ClipboardEvent
  editor: BlockNoteEditor
  defaultPasteHandler: (context?: {
    prioritizeMarkdownOverHTML?: boolean
    plainTextAsMarkdown?: boolean
  }) => boolean
}) => boolean

/**
 * Creates a paste handler for BlockNote that handles markdown/MDX content
 * Uses BlockNote's official pasteHandler API
 */
export function createPasteHandler(): PasteHandler {
  return ({ event, editor, defaultPasteHandler }) => {
    console.log('Paste handler called')
    const clipboardData = event.clipboardData
    if (!clipboardData) {
      console.log('No clipboard data, using default handler')
      return defaultPasteHandler()
    }

    const text = clipboardData.getData('text/plain')
    console.log('Clipboard text:', text?.substring(0, 200) + '...')

    if (!text.trim()) {
      console.log('Empty clipboard, using default handler')
      return defaultPasteHandler()
    }

    // Check if this looks like MDX content (JSX + markdown)
    if (isMDXContent(text)) {
      console.log('Detected MDX content, processing...')
      try {
        // Preprocess MDX to convert it to markdown-compatible format
        const processedMarkdown = preprocessMDX(text)

        // Use BlockNote's built-in pasteMarkdown method
        editor.pasteMarkdown(processedMarkdown)
        console.log('MDX content pasted successfully')
        return true // We handled the paste event
      } catch (error) {
        console.warn('Failed to parse MDX on paste:', error)
        // Fall back to default paste behavior
        return defaultPasteHandler()
      }
    }

    // Check if the pasted content looks like markdown
    if (isMarkdownContent(text)) {
      console.log('Detected markdown content, pasting...')
      try {
        // Use BlockNote's built-in pasteMarkdown method
        editor.pasteMarkdown(text)
        console.log('Markdown content pasted successfully')
        return true // We handled the paste event
      } catch (error) {
        console.warn('Failed to parse markdown on paste:', error)
        // Fall back to default paste behavior
        return defaultPasteHandler()
      }
    }

    console.log('No markdown detected, using default handler')
    // Let BlockNote handle the paste with default behavior
    return defaultPasteHandler()
  }
}

/**
 * Simple heuristic to detect if pasted content is likely markdown
 */
function isMarkdownContent(text: string): boolean {
  const trimmedText = text.trim()

  // Common markdown patterns that suggest this is markdown content
  const markdownPatterns = [
    /^#\s+/,                    // Headers
    /^\*\s+/,                   // Unordered lists
    /^-\s+/,                    // Unordered lists
    /^\d+\.\s+/,                // Ordered lists
    /\*\*.*?\*\*/,              // Bold text
    /\*.*?\*/,                  // Italic text
    /`.*?`/,                    // Inline code
    /```[\s\S]*?```/,           // Code blocks
    /\[.*?\]\(.*?\)/,           // Links
    /^>\s+/,                    // Blockquotes
    /^\|\s.*\s\|/,              // Tables
    /^---+$/,                   // Horizontal rules at start
    /---+/,                     // Horizontal rules anywhere
  ]

  // Check if content contains multiple markdown patterns
  let patternCount = 0
  const foundPatterns: string[] = []
  for (const pattern of markdownPatterns) {
    if (pattern.test(trimmedText)) {
      patternCount++
      foundPatterns.push(pattern.source)
    }
  }

  // Debug logging
  console.log('Markdown detection for content:', {
    length: trimmedText.length,
    preview: trimmedText.substring(0, 100) + '...',
    patternCount,
    foundPatterns,
    isMarkdown: patternCount >= 1 || /^#\s+/.test(trimmedText)
  })

  // Consider it markdown if it has 1+ patterns OR contains headers specifically
  return patternCount >= 1 || /^#\s+/.test(trimmedText)
}


/**
 * Check if content looks like MDX (contains JSX-like syntax)
 */
function isMDXContent(text: string): boolean {
  const trimmedText = text.trim()

  // JSX/MDX patterns
  const mdxPatterns = [
    /<[^>]+>/,                  // JSX-like tags
    /{[^}]*}/,                  // JSX expressions
    /export\s+/,                // Export statements
    /import\s+/,                // Import statements
  ]

  return mdxPatterns.some(pattern => pattern.test(trimmedText)) &&
         isMarkdownContent(trimmedText)
}

/**
 * Preprocess MDX content to convert it to markdown-compatible format
 * This strips JSX syntax and preserves the markdown structure
 */
function preprocessMDX(text: string): string {
  let processed = text

  // Remove JSX-like tags but keep their content
  processed = processed.replace(/<(\w+)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>/g, '$2')

  // Remove self-closing JSX tags
  processed = processed.replace(/<(\w+)(?:\s+[^>]*)?\s*\/>/g, '')

  // Remove JSX expressions in curly braces (with simple content)
  processed = processed.replace(/{[^{}]*}/g, '')

  // Remove import/export statements
  processed = processed.replace(/^(?:import|export).*$/gm, '')

  // Clean up extra whitespace
  processed = processed.replace(/\n\s*\n\s*\n/g, '\n\n')

  return processed.trim()
}