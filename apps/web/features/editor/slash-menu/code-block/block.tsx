'use client'

import { createReactBlockSpec } from '@blocknote/react'
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { cn } from '@skriuw/shared'
import { detectLanguage } from './types'
import { OverlayEditor } from './renderer'

const DEFAULT_LANGUAGE = 'typescript'

export const codeBlockSpec = createReactBlockSpec(
	{
		type: 'codeBlock',
		propSchema: {
			language: {
				default: DEFAULT_LANGUAGE
			},
			code: {
				default: ''
			},
			autoFocus: {
				default: false
			}
		},
		content: 'none'
	},
	{
		render: function CodeBlockRender({ block, editor }) {
			const code = (block.props.code as string) || ''
			const autoFocus = (block.props.autoFocus as boolean) || false
			const savedLanguage = (block.props.language as string) || DEFAULT_LANGUAGE

			const [localCode, setLocalCode] = useState(code)
			const containerRef = useRef<HTMLDivElement>(null)
			const localCodeRef = useRef(localCode)

			useEffect(() => { localCodeRef.current = localCode }, [localCode])

			useEffect(() => {
				setLocalCode(code)
			}, [code])

			useEffect(() => {
				if (autoFocus) {
					editor.updateBlock(block.id, {
						props: { ...block.props, autoFocus: false }
					})
				}
			}, [autoFocus, editor, block.id, block.props])

			const debouncedSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)

			const handleChange = useCallback((newCode: string) => {
				setLocalCode(newCode)

				if (debouncedSaveRef.current) clearTimeout(debouncedSaveRef.current)
				debouncedSaveRef.current = setTimeout(() => {
					const detected = newCode ? detectLanguage(newCode) : DEFAULT_LANGUAGE
					editor.updateBlock(block.id, {
						props: {
							language: detected,
							code: newCode
						}
					})
				}, 400)
			}, [editor, block.id])

			useEffect(() => {
				return () => {
					if (debouncedSaveRef.current) clearTimeout(debouncedSaveRef.current)
				}
			}, [])

			const handleExit = useCallback(() => {
				if (debouncedSaveRef.current) {
					clearTimeout(debouncedSaveRef.current)
					debouncedSaveRef.current = null
				}
				const detected = localCodeRef.current ? detectLanguage(localCodeRef.current) : DEFAULT_LANGUAGE
				editor.updateBlock(block.id, {
					props: {
						language: detected,
						code: localCodeRef.current
					}
				})
			}, [editor, block.id])

			const handleContainerKeyDown = useCallback((e: React.KeyboardEvent) => {
				if (
					(e.key === 'Delete' || e.key === 'Backspace') &&
					e.target === containerRef.current &&
					!localCodeRef.current
				) {
					e.preventDefault()
					editor.removeBlocks([block.id])
				}
			}, [editor, block.id])

			return (
				<div
					ref={containerRef}
					className={cn(
						'relative my-3 w-full overflow-hidden',
						'bg-[hsl(var(--sh-background))]',
						'transition-shadow duration-150',
						'focus-within:ring-1 focus-within:ring-ring/40'
					)}
					onKeyDown={handleContainerKeyDown}
					data-block-type="codeBlock"
					role="region"
					aria-label="Code block"
				>
					<OverlayEditor
						code={localCode}
						language={savedLanguage}
						onChange={handleChange}
						onExit={handleExit}
						autoFocus={autoFocus}
					/>
				</div>
			)
		}
	}
)
