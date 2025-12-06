import { createReactBlockSpec } from '@blocknote/react'
import { Check, ChevronDown, Code2, Copy } from 'lucide-react'
import Prism from 'prismjs'
import { useEffect, useRef, useState, useMemo } from 'react'

// Import languages to ensure they are loaded
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-yaml'

export const LANGUAGES = [
    { value: 'typescript', label: 'TypeScript' },
    { value: 'javascript', label: 'JavaScript' },
    { value: 'css', label: 'CSS' },
    { value: 'json', label: 'JSON' },
    { value: 'bash', label: 'Bash' },
    { value: 'markdown', label: 'Markdown' },
    { value: 'python', label: 'Python' },
    { value: 'sql', label: 'SQL' },
    { value: 'yaml', label: 'YAML' },
    { value: 'text', label: 'Plain Text' },
] as const

export const customCodeBlockSpec = createReactBlockSpec(
    {
        type: 'codeBlock',
        propSchema: {
            language: {
                default: 'typescript',
            },
        },
        content: 'inline',
    },
    {
        render: ({ block, editor, contentRef }) => {
            const [isEditing, setIsEditing] = useState(false)
            const [isCopied, setIsCopied] = useState(false)

            // Initialize from existing content if available
            const getBlockContent = () => {
                if (Array.isArray(block.content)) {
                    return block.content.map((c: any) => c.text || '').join('')
                }
                return ''
            }
            const [localText, setLocalText] = useState(getBlockContent())
            const textareaRef = useRef<HTMLTextAreaElement>(null)

            // Sync local state when block content changes (external updates)
            useEffect(() => {
                setLocalText(getBlockContent())
                // eslint-disable-next-line react-hooks/exhaustive-deps
            }, [block.content])

            const highlight = useMemo(() => {
                const lang = block.props.language
                const grammar = Prism.languages[lang] || Prism.languages.text || Prism.languages.plain
                return Prism.highlight(localText || '', grammar, lang)
            }, [localText, block.props.language])

            const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
                editor.updateBlock(block.id, {
                    props: { language: e.target.value },
                })
            }

            const handleBlur = () => {
                setIsEditing(false)
                editor.updateBlock(block.id, {
                    content: localText,
                })
            }

            const handleCopy = async (e: React.MouseEvent) => {
                e.stopPropagation()
                await navigator.clipboard.writeText(localText)
                setIsCopied(true)
                setTimeout(() => setIsCopied(false), 2000)
            }

            // Auto-resize textarea
            useEffect(() => {
                if (isEditing && textareaRef.current) {
                    textareaRef.current.style.height = 'auto'
                    textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
                    textareaRef.current.focus()
                }
            }, [isEditing, localText])

            return (
                <div
                    className="relative group my-4 rounded-md border border-border bg-card overflow-hidden text-sm"
                    data-language={block.props.language}
                >
                    {/* Header with Language Dropdown */}
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-muted/30 select-none">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Code2 className="w-3.5 h-3.5" />
                            <div className="relative flex items-center">
                                <select
                                    value={block.props.language}
                                    onChange={handleLanguageChange}
                                    className="appearance-none bg-transparent hover:text-foreground cursor-pointer pr-4 focus:outline-none"
                                >
                                    {LANGUAGES.map((lang) => (
                                        <option key={lang.value} value={lang.value}>
                                            {lang.label}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown className="w-3 h-3 absolute right-0 pointer-events-none opacity-50" />
                            </div>
                        </div>

                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={handleCopy}
                                className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted-foreground/10 transition-colors flex items-center gap-1"
                                title="Copy code"
                            >
                                {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                            <button
                                onClick={() => setIsEditing(!isEditing)}
                                className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted-foreground/10 transition-colors"
                            >
                                {isEditing ? 'Done' : 'Edit'}
                            </button>
                        </div>
                    </div>

                    {/* Hidden content ref to satisfy BlockNote's content requirement */}
                    <div className="hidden" ref={contentRef} />

                    <div className="relative font-mono text-[13px] leading-6">
                        <div className="p-3">
                            {isEditing ? (
                                <textarea
                                    ref={textareaRef}
                                    value={localText}
                                    onChange={(e) => setLocalText(e.target.value)}
                                    onBlur={handleBlur}
                                    className="block w-full min-h-[3rem] bg-transparent border-0 p-0 focus:ring-0 outline-none resize-none font-mono text-[13px] leading-6 text-foreground whitespace-pre-wrap overflow-hidden"
                                    spellCheck={false}
                                    style={{ height: 'auto' }}
                                />
                            ) : (
                                <div
                                    onClick={() => setIsEditing(true)}
                                    className="overflow-x-auto cursor-text text-foreground whitespace-pre-wrap"
                                >
                                    <pre className="font-mono text-[13px] leading-6 bg-transparent p-0 m-0">
                                        <code dangerouslySetInnerHTML={{ __html: highlight }} />
                                    </pre>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )
        },
    }
)
