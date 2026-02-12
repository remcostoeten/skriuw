import { useUserPreferences, useSettings } from '../../settings'
import { getFontSizePx, getFontFamily, getMaxWidthPx } from '../styles/editor-tokens'
import { INLINE_CODE_VARIANTS, type InlineCodeVariant } from '../hooks/useEditorConfig'
import '../styles/editor.css'
import { highlightCodeBlocks } from '../utils/code-highlight'
import { registerCodeBlockTrigger } from '../slash-menu/code-block'
import { DualModeEditor } from './default-mode-editor'
import { TaskCheckboxReplacer } from './task-checkbox-replacer'
import { BlockNoteEditor } from '@blocknote/core'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/core/style.css'
import '@blocknote/react/style.css'
import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react'

export type EditorWrapperHandle = {
	focusEditor: () => void
}

type Props = {
	editor: BlockNoteEditor | null
	className?: string
	header?: React.ReactNode
	footer?: React.ReactNode
}

export const EditorWrapper = forwardRef<EditorWrapperHandle, Props>(
	({ editor, className, header, footer }, ref) => {
		const editorRef = useRef<HTMLDivElement>(null)
		const { hasWordWrap, hasRawMDXMode } = useUserPreferences()
		const {
			centeredLayout,
			blockIndicator,
			showFormattingToolbar,
			fontSize,
			fontFamily,
			lineHeight,
			maxWidth
		} = useSettings()
		const [editorContent, setEditorContent] = useState<any[]>([])

		useImperativeHandle(ref, () => ({
			focusEditor: () => {
				if (hasRawMDXMode) {
					const textarea = editorRef.current?.querySelector(
						'textarea'
					) as HTMLTextAreaElement
					textarea?.focus()
				} else {
					const contentEditable = editorRef.current?.querySelector(
						'[contenteditable="true"]'
					) as HTMLElement
					contentEditable?.focus()
				}
			}
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
				subtree: true
			})

			return () => {
				clearTimeout(timeoutId)
				if (debounceTimeout) {
					clearTimeout(debounceTimeout)
				}
				observer.disconnect()
			}
		}, [editorContent, hasRawMDXMode, editor])

		useEffect(() => {
			if (!editorRef.current) return
			editorRef.current.setAttribute('data-word-wrap', hasWordWrap ? 'enabled' : 'disabled')
		}, [hasWordWrap])

		// Register code block markdown trigger (``` + space)
		useEffect(() => {
			if (!editorRef.current || !editor || hasRawMDXMode) return
			return registerCodeBlockTrigger(editor as any, editorRef.current)
		}, [editor, hasRawMDXMode])

		useEffect(() => {
			if (!editorRef.current) return

			if (centeredLayout) {
				editorRef.current.classList.add('centered-layout')
				const resolvedWidth = getMaxWidthPx(maxWidth ?? 'medium')
				if (resolvedWidth === 'none') {
					editorRef.current.style.removeProperty('--editor-max-width')
				} else {
					editorRef.current.style.setProperty('--editor-max-width', resolvedWidth)
				}
			} else {
				editorRef.current.classList.remove('centered-layout')
				editorRef.current.style.removeProperty('--editor-max-width')
			}
		}, [centeredLayout, maxWidth])

		useEffect(() => {
			if (!editorRef.current || hasRawMDXMode || !editor) return

			const container = editorRef.current
			let activeInlineCode: HTMLElement | null = null
			let hideMenuTimeout: ReturnType<typeof setTimeout> | null = null

			const isInlineCodeElement = (target: EventTarget | null): target is HTMLElement => {
				return (
					target instanceof HTMLElement &&
					target.tagName.toLowerCase() === 'code' &&
					!target.closest('pre')
				)
			}

			const getCurrentVariant = (element: HTMLElement): InlineCodeVariant => {
				const ownVariant = element.getAttribute('data-inline-code-variant')
				if (ownVariant && INLINE_CODE_VARIANTS.includes(ownVariant as InlineCodeVariant)) {
					return ownVariant as InlineCodeVariant
				}

				const carrier = element.closest(
					'[data-style-type="inlineCodeVariant"][data-value]'
				) as HTMLElement | null
				const carrierValue = carrier?.getAttribute('data-value')
				if (carrierValue && INLINE_CODE_VARIANTS.includes(carrierValue as InlineCodeVariant)) {
					return carrierValue as InlineCodeVariant
				}

				const nestedCarrier = element.querySelector(
					'[data-style-type="inlineCodeVariant"][data-value]'
				) as HTMLElement | null
				const nestedValue = nestedCarrier?.getAttribute('data-value')
				if (nestedValue && INLINE_CODE_VARIANTS.includes(nestedValue as InlineCodeVariant)) {
					return nestedValue as InlineCodeVariant
				}

				return 'default'
			}

			const getNextVariant = (
				current: InlineCodeVariant,
				direction: 'next' | 'prev'
			): InlineCodeVariant => {
				const currentIndex = INLINE_CODE_VARIANTS.indexOf(current)
				const index = currentIndex === -1 ? 0 : currentIndex
				const nextIndex =
					direction === 'next'
						? (index + 1) % INLINE_CODE_VARIANTS.length
						: (index - 1 + INLINE_CODE_VARIANTS.length) % INLINE_CODE_VARIANTS.length
				return INLINE_CODE_VARIANTS[nextIndex] ?? 'default'
			}

			const setCodeSelection = (element: HTMLElement) => {
				const view = editor.prosemirrorView
				const textNodeWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
				const firstTextNode = textNodeWalker.nextNode() as Text | null
				let lastTextNode: Text | null = firstTextNode
				let current = firstTextNode
				while (current) {
					lastTextNode = current
					current = textNodeWalker.nextNode() as Text | null
				}

				const fromTarget = firstTextNode ?? element
				const toTarget = lastTextNode ?? element
				const toOffset = lastTextNode?.textContent?.length ?? toTarget.childNodes.length

				const from = view.posAtDOM(fromTarget, 0)
				const to = view.posAtDOM(toTarget, toOffset)
				editor._tiptapEditor.commands.setTextSelection({ from, to })
				editor.focus()
			}

			const applyVariant = (element: HTMLElement, variant: InlineCodeVariant) => {
				try {
					setCodeSelection(element)
					editor.addStyles({
						code: true,
						inlineCodeVariant: variant
					} as any)
					element.setAttribute('aria-label', `Inline code (${variant} style)`)
				} catch (error) {
					console.warn('Failed to apply inline code variant:', error)
				}
			}

			const decorateInlineCodeElements = () => {
				const inlineCodeElements = container.querySelectorAll('code:not(pre code)')
				for (const node of inlineCodeElements) {
					if (!(node instanceof HTMLElement)) continue
					node.classList.add('sk-inline-code')
					node.tabIndex = 0
					node.setAttribute('role', 'button')
					node.setAttribute('aria-label', `Inline code (${getCurrentVariant(node)} style)`)
				}
			}

			const picker = document.createElement('div')
			picker.className = 'sk-inline-code-picker'
			picker.setAttribute('role', 'radiogroup')
			picker.setAttribute('aria-label', 'Inline code style variants')

			const buttons = INLINE_CODE_VARIANTS.map((variant) => {
				const button = document.createElement('button')
				button.type = 'button'
				button.className = 'sk-inline-code-picker__button'
				button.dataset.variant = variant
				button.setAttribute('role', 'radio')
				button.setAttribute('aria-label', `${variant} style`)
				button.textContent = variant
				picker.appendChild(button)
				return button
			})

			const hidePicker = () => {
				if (hideMenuTimeout) {
					clearTimeout(hideMenuTimeout)
					hideMenuTimeout = null
				}
				picker.remove()
			}

			const scheduleHidePicker = () => {
				if (hideMenuTimeout) clearTimeout(hideMenuTimeout)
				hideMenuTimeout = setTimeout(hidePicker, 120)
			}

			const positionPicker = (target: HTMLElement) => {
				const targetRect = target.getBoundingClientRect()
				const containerRect = container.getBoundingClientRect()
				picker.style.left = `${targetRect.left - containerRect.left}px`
				picker.style.top = `${targetRect.bottom - containerRect.top + 6}px`
			}

			const syncPickerState = (target: HTMLElement) => {
				const currentVariant = getCurrentVariant(target)
				for (const button of buttons) {
					const isSelected = button.dataset.variant === currentVariant
					button.dataset.active = isSelected ? 'true' : 'false'
					button.setAttribute('aria-checked', isSelected ? 'true' : 'false')
				}
			}

			const showPicker = (target: HTMLElement, focusSelected = false) => {
				activeInlineCode = target
				if (!container.contains(picker)) {
					container.appendChild(picker)
				}
				positionPicker(target)
				syncPickerState(target)
				if (focusSelected) {
					const selectedButton =
						buttons.find((button) => button.dataset.active === 'true') ?? buttons[0]
					selectedButton?.focus()
				}
			}

			const onPointerOver = (event: MouseEvent) => {
				if (!isInlineCodeElement(event.target)) return
				showPicker(event.target)
			}

			const onFocusIn = (event: FocusEvent) => {
				if (!isInlineCodeElement(event.target)) return
				showPicker(event.target)
			}

			const onPointerOut = (event: MouseEvent) => {
				if (!isInlineCodeElement(event.target)) return
				scheduleHidePicker()
			}

			const onFocusOut = (event: FocusEvent) => {
				const relatedTarget = event.relatedTarget
				if (relatedTarget instanceof Node && picker.contains(relatedTarget)) return
				if (isInlineCodeElement(event.target)) {
					scheduleHidePicker()
				}
			}

			const onKeyDown = (event: KeyboardEvent) => {
				if (!isInlineCodeElement(event.target)) return
				const inlineCode = event.target
				const currentVariant = getCurrentVariant(inlineCode)

				if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
					event.preventDefault()
					applyVariant(inlineCode, getNextVariant(currentVariant, 'next'))
					showPicker(inlineCode)
				}

				if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
					event.preventDefault()
					applyVariant(inlineCode, getNextVariant(currentVariant, 'prev'))
					showPicker(inlineCode)
				}

				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault()
					showPicker(inlineCode, true)
				}
			}

			const onPickerClick = (event: MouseEvent) => {
				const target = event.target
				if (!(target instanceof HTMLElement)) return
				const button = target.closest('.sk-inline-code-picker__button') as HTMLElement | null
				if (!button || !activeInlineCode) return
				const variant = button.dataset.variant as InlineCodeVariant | undefined
				if (!variant) return
				applyVariant(activeInlineCode, variant)
				showPicker(activeInlineCode)
				activeInlineCode.focus()
			}

			const onPickerKeyDown = (event: KeyboardEvent) => {
				const target = event.target
				if (!(target instanceof HTMLButtonElement)) return

				const currentIndex = buttons.findIndex((button) => button === target)
				if (currentIndex < 0) return

				if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
					event.preventDefault()
					buttons[(currentIndex + 1) % buttons.length]?.focus()
				}

				if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
					event.preventDefault()
					buttons[(currentIndex - 1 + buttons.length) % buttons.length]?.focus()
				}

				if (event.key === 'Escape' && activeInlineCode) {
					event.preventDefault()
					hidePicker()
					activeInlineCode.focus()
				}
			}

			const onPickerMouseEnter = () => {
				if (hideMenuTimeout) {
					clearTimeout(hideMenuTimeout)
					hideMenuTimeout = null
				}
			}

			const onPickerMouseLeave = () => {
				scheduleHidePicker()
			}

			decorateInlineCodeElements()

			const observer = new MutationObserver(() => {
				decorateInlineCodeElements()
				if (activeInlineCode && container.contains(activeInlineCode)) {
					positionPicker(activeInlineCode)
				}
			})

			observer.observe(container, { childList: true, subtree: true })

			container.addEventListener('mouseover', onPointerOver)
			container.addEventListener('mouseout', onPointerOut)
			container.addEventListener('focusin', onFocusIn)
			container.addEventListener('focusout', onFocusOut)
			container.addEventListener('keydown', onKeyDown)
			picker.addEventListener('click', onPickerClick)
			picker.addEventListener('keydown', onPickerKeyDown)
			picker.addEventListener('mouseenter', onPickerMouseEnter)
			picker.addEventListener('mouseleave', onPickerMouseLeave)

			return () => {
				observer.disconnect()
				hidePicker()
				container.removeEventListener('mouseover', onPointerOver)
				container.removeEventListener('mouseout', onPointerOut)
				container.removeEventListener('focusin', onFocusIn)
				container.removeEventListener('focusout', onFocusOut)
				container.removeEventListener('keydown', onKeyDown)
				picker.removeEventListener('click', onPickerClick)
				picker.removeEventListener('keydown', onPickerKeyDown)
				picker.removeEventListener('mouseenter', onPickerMouseEnter)
				picker.removeEventListener('mouseleave', onPickerMouseLeave)
				if (hideMenuTimeout) {
					clearTimeout(hideMenuTimeout)
					hideMenuTimeout = null
				}
			}
		}, [hasRawMDXMode, editor])

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
				{header}
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
					className='w-full h-full'
				/>
				<TaskCheckboxReplacer editor={editor} editorContainerRef={editorRef} />
				{footer}
			</div>
		)
	}
)

EditorWrapper.displayName = 'EditorWrapper'
