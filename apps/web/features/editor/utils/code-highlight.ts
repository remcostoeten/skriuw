import Prism from 'prismjs'

/**
 * Language component import map for dynamic loading
 * Maps normalized language names to their Prism component paths
 */
const languageImports: Record<string, () => Promise<void>> = {
	// Markup (HTML/XML) - must be loaded first as it's a dependency
	markup: async () => {
		// @ts-ignore
		await import('prismjs/components/prism-markup')
		return Promise.resolve()
	},
	// CSS
	css: async () => {
		// @ts-ignore
		await import('prismjs/components/prism-css')
		return Promise.resolve()
	},
	// JavaScript/TypeScript
	javascript: async () => {
		// @ts-ignore
		await import('prismjs/components/prism-javascript')
		return Promise.resolve()
	},
	typescript: async () => {
		// @ts-ignore
		await import('prismjs/components/prism-typescript')
		return Promise.resolve()
	},
	// Python
	python: async () => {
		// @ts-ignore
		await import('prismjs/components/prism-python')
		return Promise.resolve()
	},
	// Go
	go: async () => {
		// @ts-ignore
		await import('prismjs/components/prism-go')
		return Promise.resolve()
	},
	// Shell/Bash
	bash: async () => {
		// @ts-ignore
		await import('prismjs/components/prism-bash')
		return Promise.resolve()
	},
	'shell-session': async () => {
		// @ts-ignore
		await import('prismjs/components/prism-shell-session')
		return Promise.resolve()
	},
	// JSON
	json: async () => {
		// @ts-ignore
		await import('prismjs/components/prism-json')
		return Promise.resolve()
	},
	// Markdown
	markdown: async () => {
		// @ts-ignore
		await import('prismjs/components/prism-markdown')
		return Promise.resolve()
	},
}

/**
 * Cache of loaded languages to avoid re-importing
 */
const loadedLanguages = new Set<string>()

/**
 * Dynamically loads a Prism language component if not already loaded
 */
async function loadLanguage(lang: string): Promise<void> {
	const normalizedLang = normalizeLanguage(lang)
	if (!normalizedLang) return

	// Skip if already loaded
	if (loadedLanguages.has(normalizedLang)) return

	// Check if language is already available in Prism
	if (Prism.languages[normalizedLang]) {
		loadedLanguages.add(normalizedLang)
		return
	}

	// Load the language component dynamically
	const loader = languageImports[normalizedLang]
	if (loader) {
		try {
			await loader()
			loadedLanguages.add(normalizedLang)
		} catch (error) {
			console.warn(`Failed to load Prism language "${normalizedLang}":`, error)
		}
	}
}

/**
 * Maps BlockNote language identifiers to Prism language names
 */
const languageMap: Record<string, string> = {
	// JavaScript/TypeScript
	javascript: 'javascript',
	js: 'javascript',
	typescript: 'typescript',
	ts: 'typescript',
	// Python
	python: 'python',
	py: 'python',
	// Go
	go: 'go',
	golang: 'go',
	// Shell
	bash: 'bash',
	sh: 'bash',
	shell: 'bash',
	fish: 'bash', // Fish uses bash highlighting
	// JSON
	json: 'json',
	// Markdown
	markdown: 'markdown',
	md: 'markdown',
	// HTML/CSS
	html: 'markup',
	xml: 'markup',
	css: 'css',
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
 * Highlights code using Prism.js with dynamic language loading
 * @param code - The code to highlight
 * @param language - Optional language identifier
 * @returns HTML string with syntax highlighting
 */
export async function highlightCode(code: string, language?: string): Promise<string> {
	// Check if Prism is available (should be, but safe guard in case of module loading issues)
	if (typeof Prism === 'undefined' || !Prism) {
		console.warn('Prism.js is not available, skipping highlighting')
		// Return HTML-escaped code as fallback
		const div = document.createElement('div')
		div.textContent = code
		return div.innerHTML
	}

	const normalizedLang = normalizeLanguage(language)

	// Load language component if needed
	if (normalizedLang) {
		await loadLanguage(normalizedLang)
	}

	if (normalizedLang && Prism.languages[normalizedLang]) {
		try {
			return Prism.highlight(code, Prism.languages[normalizedLang], normalizedLang)
		} catch (error) {
			console.warn(`Failed to highlight code with language "${normalizedLang}":`, error)
		}
	}

	// Fallback: escape HTML if no language or language not supported
	const div = document.createElement('div')
	div.textContent = code
	return div.innerHTML
}

/**
 * Synchronous version for backwards compatibility
 * Note: This will not load languages dynamically - use highlightCode for that
 */
export function highlightCodeSync(code: string, language?: string): string {
	if (typeof Prism === 'undefined' || !Prism) {
		const div = document.createElement('div')
		div.textContent = code
		return div.innerHTML
	}

	const normalizedLang = normalizeLanguage(language)

	if (normalizedLang && Prism.languages[normalizedLang]) {
		try {
			return Prism.highlight(code, Prism.languages[normalizedLang], normalizedLang)
		} catch (error) {
			console.warn(`Failed to highlight code with language "${normalizedLang}":`, error)
		}
	}

	const div = document.createElement('div')
	div.textContent = code
	return div.innerHTML
}

/**
 * BlockNote block structure (minimal type for language extraction)
 */
interface BlockNoteBlock {
	id: string
	type: string
	props?: {
		lang?: string
	}
	children?: BlockNoteBlock[]
}

/**
 * BlockNote editor interface (minimal type for language extraction)
 */
interface BlockNoteEditorLike {
	document?: BlockNoteBlock[]
}

/**
 * Extracts language identifier from a code element
 */
function extractLanguage(
	codeElement: Element,
	preElement: Element | null,
	editor?: BlockNoteEditorLike
): string | undefined {
	// Method 1: Try to get language from BlockNote editor instance
	if (editor) {
		try {
			const codeBlockElement =
				preElement?.closest('[data-content-type="codeBlock"]') ||
				preElement?.closest('[data-node-type="codeBlock"]')

			if (codeBlockElement && editor.document) {
				// Find the block ID from the DOM element
				const blockId =
					codeBlockElement.getAttribute('data-id') ||
					codeBlockElement.getAttribute('id')?.replace('block-', '')

				if (blockId) {
					// Find the block in the editor document
					function findBlock(blocks: BlockNoteBlock[]): BlockNoteBlock | null {
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
						return block.props.lang
					}
				}
			}
		} catch (error) {
			console.warn('Failed to get language from editor:', error)
		}
	}

	// Method 2: Try to get language from class name (e.g., language-javascript)
	const classMatch = Array.from(codeElement.classList).find((cls) => cls.startsWith('language-'))
	if (classMatch) {
		return classMatch.replace('language-', '')
	}

	// Method 3: Try to get language from data attributes
	if (preElement) {
		const codeBlockElement = preElement.closest(
			'[data-content-type="codeBlock"], [data-node-type="codeBlock"]'
		)
		if (codeBlockElement) {
			const lang =
				codeBlockElement.getAttribute('data-language') ||
				codeBlockElement.getAttribute('data-lang') ||
				preElement.getAttribute('data-language') ||
				preElement.getAttribute('data-lang') ||
				codeElement.getAttribute('data-language') ||
				codeElement.getAttribute('data-lang')
			if (lang) return lang
		}
	}

	// Method 4: Try to get from lang attribute
	return preElement?.getAttribute('lang') || codeElement.getAttribute('lang') || undefined
}

/**
 * Highlights all code blocks in a container element with dynamic language loading
 * Works with BlockNote's code block structure
 */
export async function highlightCodeBlocks(
	container: HTMLElement,
	editor?: BlockNoteEditorLike
): Promise<void> {
	// Find all code block containers
	const codeBlockSelectors = [
		'pre code',
		'.bn-code-block code',
		'[data-content-type="codeBlock"] code',
		'[data-node-type="codeBlock"] code',
	]

	const codeBlocks = Array.from(container.querySelectorAll(codeBlockSelectors.join(', ')))

	// Process all code blocks in parallel for better performance
	await Promise.all(
		codeBlocks.map(async (codeElement) => {
			// Skip if already highlighted by Prism, Shiki, or BlockNote
			if (
				codeElement.querySelector('.token') ||
				codeElement.closest('.shiki') ||
				codeElement.classList.contains('shiki') ||
				codeElement.innerHTML !== codeElement.textContent
			) {
				return
			}

			const codeText = codeElement.textContent || ''
			if (!codeText.trim()) {
				return
			}

			const preElement = codeElement.parentElement
			const language = extractLanguage(codeElement, preElement, editor)

			// Load language and highlight
			const highlighted = await highlightCode(codeText, language)

			// Only update if we got actual highlighting (not just escaped HTML)
			if (highlighted !== codeText) {
				codeElement.innerHTML = highlighted

				// Add language class for styling
				if (language) {
					const normalized = normalizeLanguage(language)
					if (normalized) {
						codeElement.classList.add(`language-${normalized}`)
					}
				}

				// Ensure parent pre element has proper class
				if (preElement && !preElement.classList.contains('language-unknown')) {
					preElement.classList.add('bn-code-block-highlighted')
				}
			}
		})
	)
}
