'use client'

/**
 * Code Block BlockNote Block Specification
 * Creates a custom block for BlockNote that renders an accessible code editor
 */

import { createReactBlockSpec } from '@blocknote/react'
import React, { useState, useCallback, useRef, useEffect } from 'react'
import { cn } from '@skriuw/shared'
import { getDefaultFilename } from './types'
import { LanguageSelector } from './language-selector'
import { CodeEditor } from './editor'
import { CodeRenderer } from './renderer'

const DEFAULT_LANGUAGE = 'typescript'
const DEFAULT_FILENAME = 'untitled.ts'

export const codeBlockSpec = createReactBlockSpec(
    {
        type: 'codeBlock',
        propSchema: {
            /** Programming language for syntax highlighting */
            language: {
                default: DEFAULT_LANGUAGE
            },
            /** Display filename */
            fileName: {
                default: DEFAULT_FILENAME
            },
            /** The actual code content */
            code: {
                default: ''
            }
        },
        content: 'none'
    },
    {
        render: function CodeBlockRender({ block, editor }) {
            const language = (block.props.language as string) || DEFAULT_LANGUAGE
            const fileName = (block.props.fileName as string) || DEFAULT_FILENAME
            const code = (block.props.code as string) || ''

            const [isEditing, setIsEditing] = useState(false)
            const [localCode, setLocalCode] = useState(code)
            const [localFileName, setLocalFileName] = useState(fileName)

            const containerRef = useRef<HTMLDivElement>(null)
            const fileNameInputRef = useRef<HTMLInputElement>(null)
            const languageSelectorRef = useRef<HTMLDivElement>(null)

            // Sync local state when block props change externally
            useEffect(() => {
                if (!isEditing) {
                    setLocalCode(code)
                }
            }, [code, isEditing])

            useEffect(() => {
                if (!isEditing) {
                    setLocalFileName(fileName)
                }
            }, [fileName, isEditing])

            // Update the block when language changes
            const handleLanguageChange = useCallback(
                (newLanguage: string) => {
                    // Auto-update filename extension if it's the default name
                    const defaultName = getDefaultFilename(language)
                    const isDefaultName = localFileName === defaultName || localFileName.startsWith('untitled.')

                    let newFileName = localFileName
                    if (isDefaultName) {
                        newFileName = getDefaultFilename(newLanguage)
                    }

                    editor.updateBlock(block.id, {
                        props: {
                            language: newLanguage,
                            fileName: newFileName,
                            code: localCode
                        }
                    })
                    setLocalFileName(newFileName)
                },
                [editor, block.id, localFileName, localCode, language]
            )

            // Save content when exiting edit mode
            const localCodeRef = useRef(localCode)
            useEffect(() => { localCodeRef.current = localCode }, [localCode])

            const handleBlur = useCallback((e: React.FocusEvent) => {
                if (containerRef.current && !containerRef.current.contains(e.relatedTarget as Node)) {
                    setIsEditing(false)
                    editor.updateBlock(block.id, {
                        props: {
                            language,
                            fileName: localFileName,
                            code: localCodeRef.current
                        }
                    })
                }
            }, [editor, block.id, language, localFileName])

            // Handle filename change
            const handleFileNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
                setLocalFileName(e.target.value)
            }, [])

            // Handle filename blur - save immediately
            const handleFileNameBlur = useCallback(() => {
                editor.updateBlock(block.id, {
                    props: {
                        language,
                        fileName: localFileName || getDefaultFilename(language),
                        code: localCode
                    }
                })
            }, [editor, block.id, language, localFileName, localCode])

            // Handle keyboard navigation in filename input
            const handleFileNameKeyDown = useCallback(
                (e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Tab' && !e.shiftKey) {
                        // Tab forward to code editor
                        e.preventDefault()
                        setIsEditing(true)
                    } else if (e.key === 'Escape') {
                        e.currentTarget.blur()
                    }
                },
                []
            )

            // Enter edit mode on click
            const handleContainerClick = useCallback(() => {
                if (!isEditing) {
                    setIsEditing(true)
                }
            }, [isEditing])

            // Handle keyboard on container
            const handleContainerKeyDown = useCallback(
                (e: React.KeyboardEvent) => {
                    // If Delete or Backspace is pressed when container is focused (not child)
                    if (
                        (e.key === 'Delete' || e.key === 'Backspace') &&
                        e.target === containerRef.current
                    ) {
                        e.preventDefault()
                        editor.removeBlocks([block.id])
                    }
                },
                [editor, block.id]
            )

            return (
                <div
                    ref={containerRef}
                    className={cn(
                        'relative group my-4 overflow-hidden w-full',
                        'rounded-xl',
                        'ring-1 ring-border',
                        'bg-[hsl(var(--sh-background))]/90 backdrop-blur',
                        'transition-all duration-200',
                        'focus-within:ring-2 focus-within:ring-ring'
                    )}
                    tabIndex={-1}
                    onKeyDown={handleContainerKeyDown}
                    onBlurCapture={handleBlur}
                    data-block-type="codeBlock"
                >
                    {/* Header */}
                    <header
                        className={cn(
                            'flex items-center gap-2 px-3 py-2',
                            'bg-[hsl(var(--sh-background))]/80 backdrop-blur-md',
                            'border-b border-[hsl(var(--sh-border))]'
                        )}
                    >
                        {/* Language Selector - Tab stop 1 */}
                        <div ref={languageSelectorRef}>
                            <LanguageSelector
                                value={language}
                                onChange={handleLanguageChange}
                            />
                        </div>

                        {/* Filename Input - Tab stop 2 */}
                        <input
                            ref={fileNameInputRef}
                            type="text"
                            value={localFileName}
                            onChange={handleFileNameChange}
                            onBlur={handleFileNameBlur}
                            onKeyDown={handleFileNameKeyDown}
                            className={cn(
                                'flex-1 px-2 py-0.5 text-xs font-mono',
                                'bg-transparent border-0 focus:outline-none focus:ring-0',
                                'text-muted-foreground focus:text-foreground',
                                'placeholder:text-muted-foreground/50'
                            )}
                            placeholder="filename.ts"
                            aria-label="File name"
                        />
                    </header>

                    {/* Code Content - Tab stop 3 */}
                    <div className="relative min-h-[100px]">
                        {isEditing ? (
                            <CodeEditor
                                value={localCode}
                                onChange={setLocalCode}
                                language={language}
                                autoFocus={true}
                                placeholder="Enter code..."
                            />
                        ) : (
                            <div
                                onClick={handleContainerClick}
                                className="cursor-text"
                                role="button"
                                tabIndex={0}
                                onFocus={() => setIsEditing(true)}
                                aria-label="Click to edit code"
                            >
                                {localCode ? (
                                    <CodeRenderer
                                        code={localCode}
                                        language={language}
                                        showLineNumbers={true}
                                        className="my-0"
                                    />
                                ) : (
                                    <div className="p-4 text-muted-foreground/50 text-sm font-mono">
                                        Click to add code...
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )
        }
    }
)
