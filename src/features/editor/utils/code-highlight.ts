import Prism from 'prismjs'
import 'prismjs/themes/prism-tomorrow.css'

// Import common language syntaxes
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-csharp'
import 'prismjs/components/prism-ruby'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-swift'
import 'prismjs/components/prism-kotlin'
import 'prismjs/components/prism-php'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-shell-session'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-markup'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-scss'
import 'prismjs/components/prism-sass'

/**
 * Maps BlockNote language identifiers to Prism language names
 */
const languageMap: Record<string, string> = {
  javascript: 'javascript',
  js: 'javascript',
  typescript: 'typescript',
  ts: 'typescript',
  jsx: 'jsx',
  tsx: 'tsx',
  python: 'python',
  py: 'python',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  csharp: 'csharp',
  cs: 'csharp',
  ruby: 'ruby',
  rb: 'ruby',
  go: 'go',
  rust: 'rust',
  rs: 'rust',
  swift: 'swift',
  kotlin: 'kotlin',
  php: 'php',
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  sql: 'sql',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  markdown: 'markdown',
  md: 'markdown',
  html: 'markup',
  xml: 'markup',
  css: 'css',
  scss: 'scss',
  sass: 'sass'
}

/**
 * Normalizes language identifier to Prism language name
 */
function normalizeLanguage(lang: string | undefined): string | undefined {
  if (!lang) return undefined
  const normalized = lang.toLowerCase().trim()
  return languageMap[normalized] || normalized
}

/**
 * Highlights code using Prism.js
 */
export function highlightCode(code: string, language?: string): string {
  const normalizedLang = normalizeLanguage(language)
  
  if (normalizedLang && Prism.languages[normalizedLang]) {
    try {
      return Prism.highlight(code, Prism.languages[normalizedLang], normalizedLang)
    } catch (error) {
      console.warn(`Failed to highlight code with language "${normalizedLang}":`, error)
    }
  }
  
  // Fallback: escape HTML if no language or language not supported
  return Prism.highlight(code, Prism.languages.plaintext || {}, 'plaintext')
}

/**
 * Highlights all code blocks in a container element
 * Works with BlockNote's code block structure
 */
export function highlightCodeBlocks(container: HTMLElement, editor?: any) {
  // Find all code block containers
  const codeBlockSelectors = [
    'pre code',
    '.bn-code-block code',
    '[data-content-type="codeBlock"] code',
    '[data-node-type="codeBlock"] code'
  ]
  
  const codeBlocks = container.querySelectorAll(codeBlockSelectors.join(', '))
  
  codeBlocks.forEach((codeElement) => {
    // Skip if already highlighted
    if (codeElement.querySelector('.token')) {
      return
    }
    
    const codeText = codeElement.textContent || ''
    if (!codeText.trim()) {
      return
    }
    
    const preElement = codeElement.parentElement
    let language: string | undefined
    
    // Method 1: Try to get language from BlockNote editor instance
    if (editor) {
      try {
        const codeBlockElement = preElement?.closest('[data-content-type="codeBlock"]') ||
                                preElement?.closest('[data-node-type="codeBlock"]')
        
        if (codeBlockElement && editor.document) {
          // Find the block ID from the DOM element
          const blockId = codeBlockElement.getAttribute('data-id') ||
                         codeBlockElement.getAttribute('id')?.replace('block-', '')
          
          if (blockId) {
            // Find the block in the editor document
            const findBlock = (blocks: any[]): any => {
              for (const block of blocks) {
                if (block.id === blockId && block.type === 'codeBlock') {
                  return block
                }
                if (block.children && block.children.length > 0) {
                  const found = findBlock(block.children)
                  if (found) return found
                }
              }
              return null
            }
            
            const block = findBlock(editor.document)
            if (block && block.props?.lang) {
              language = block.props.lang
            }
          }
        }
      } catch (error) {
        console.warn('Failed to get language from editor:', error)
      }
    }
    
    // Method 2: Try to get language from class name (e.g., language-javascript)
    if (!language) {
      const classMatch = Array.from(codeElement.classList).find(cls => cls.startsWith('language-'))
      if (classMatch) {
        language = classMatch.replace('language-', '')
      }
    }
    
    // Method 3: Try to get language from data attributes
    if (!language && preElement) {
      const codeBlockElement = preElement.closest('[data-content-type="codeBlock"], [data-node-type="codeBlock"]')
      if (codeBlockElement) {
        language = codeBlockElement.getAttribute('data-language') ||
                   codeBlockElement.getAttribute('data-lang') ||
                   preElement.getAttribute('data-language') ||
                   preElement.getAttribute('data-lang') ||
                   codeElement.getAttribute('data-language') ||
                   codeElement.getAttribute('data-lang')
      }
    }
    
    // Method 4: Try to get from lang attribute
    if (!language) {
      language = preElement?.getAttribute('lang') || codeElement.getAttribute('lang')
    }
    
    // Only highlight if we have text content
    if (codeText) {
      const highlighted = highlightCode(codeText, language)
      
      // Only update if we got actual highlighting (not just escaped HTML)
      if (highlighted !== codeText) {
        codeElement.innerHTML = highlighted
        
        // Add language class for styling
        if (language) {
          codeElement.classList.add(`language-${normalizeLanguage(language)}`)
        }
        
        // Ensure parent pre element has proper class
        if (preElement && !preElement.classList.contains('language-unknown')) {
          preElement.classList.add('bn-code-block-highlighted')
        }
      }
    }
  })
}

