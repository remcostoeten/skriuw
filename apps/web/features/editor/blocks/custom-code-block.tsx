import { createReactBlockSpec } from "@blocknote/react";
import DOMPurify from "isomorphic-dompurify";
import { Check, Copy, Maximize2, Minimize2 } from "lucide-react";
import Prism from "prismjs";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-css";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-json";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-python";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-yaml";
import { useEffect, useRef, useState, useMemo } from "react";

// Import languages to ensure they are loaded
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
	{ value: 'text', label: 'Plain Text' }
] as const

export const customCodeBlockSpec: any = createReactBlockSpec(
	{
		type: 'codeBlock',
		propSchema: {
			language: {
				default: 'typescript'
			},
			maxHeight: {
				default: 400
			}
		},
		content: 'inline'
	},
	{
		render: ({ block, editor, contentRef }) => {
			const [isEditing, setIsEditing] = useState(false)
			const [localText, setLocalText] = useState(() => {
				if (Array.isArray(block.content)) {
					return block.content.map((c: any) => c.text || '').join('')
				}
				return ''
			})
			const textareaRef = useRef<HTMLTextAreaElement>(null)
			const [isCopied, setIsCopied] = useState(false)
			const [isCollapsed, setIsCollapsed] = useState(false)

			// Initialize from existing content if available
			// Sync local state when block content changes (external updates)
			useEffect(() => {
				const content = Array.isArray(block.content)
					? block.content.map((c: any) => c.text || '').join('')
					: ''
				setLocalText(content)
			}, [block.content])

			const highlight = useMemo(() => {
				const lang = block.props.language
				const grammar =
					Prism.languages[lang] || Prism.languages.text || Prism.languages.plain
				const raw = Prism.highlight(localText || '', grammar, lang)
				return DOMPurify.sanitize(raw)
			}, [localText, block.props.language])

			function handleBlur() {
				setIsEditing(false)
				editor.updateBlock(block.id, {
					content: localText
				})
			}

			const handleCopy = async (e: React.MouseEvent) => {
				e.stopPropagation()
				await navigator.clipboard.writeText(localText)
				setIsCopied(true)
				setTimeout(() => setIsCopied(false), 2000)
			}

			function handleMaxHeightChange(e: React.ChangeEvent<HTMLInputElement>) {
				const newHeight = parseInt(e.target.value) || 400
				editor.updateBlock(block.id, {
					props: { maxHeight: newHeight }
				})
			}

			function toggleCollapse() {
				setIsCollapsed(!isCollapsed)
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
					className='relative group overflow-hidden text-sm'
					data-language={block.props.language}
				>
					{/* Copy button - fixed top right on hover */}
					<div className='absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity'>
						<button
							onClick={handleCopy}
							className='text-xs text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-muted-foreground/10 transition-colors flex items-center gap-1 bg-card/90 backdrop-blur-sm border border-border/30'
							title='Copy code'
						>
							{isCopied ? (
								<Check className='w-3.5 h-3.5' />
							) : (
								<Copy className='w-3.5 h-3.5' />
							)}
						</button>
					</div>

					{/* Other controls - bottom right on hover */}
					<div className='absolute bottom-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1'>
						<input
							type='number'
							value={block.props.maxHeight}
							onChange={handleMaxHeightChange}
							className='w-16 text-xs text-muted-foreground bg-card/90 backdrop-blur-sm border border-border/30 rounded px-1 py-0.5 focus:outline-none focus:border-border/60'
							title='Max height (px)'
							min='100'
							max='1000'
						/>
						<button
							onClick={toggleCollapse}
							className='text-xs text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-muted-foreground/10 transition-colors bg-card/90 backdrop-blur-sm border border-border/30'
							title={isCollapsed ? 'Expand code' : 'Collapse code'}
						>
							{isCollapsed ? (
								<Maximize2 className='w-3.5 h-3.5' />
							) : (
								<Minimize2 className='w-3.5 h-3.5' />
							)}
						</button>
						<button
							onClick={() => setIsEditing(!isEditing)}
							className='text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted-foreground/10 transition-colors bg-card/90 backdrop-blur-sm border border-border/30'
						>
							{isEditing ? 'Done' : 'Edit'}
						</button>
					</div>

					{/* Hidden content ref to satisfy BlockNote's content requirement */}
					<div className='hidden' ref={contentRef} />

					<div className='relative font-mono text-[13px] leading-6 bg-card'>
						<div
							style={{
								maxHeight: isCollapsed ? `${block.props.maxHeight}px` : 'none',
								overflow: isCollapsed ? 'hidden' : 'visible',
								position: 'relative'
							}}
						>
							{isEditing ? (
								<textarea
									ref={textareaRef}
									value={localText}
									onChange={(e) => setLocalText(e.target.value)}
									onBlur={handleBlur}
									className='block w-full bg-transparent border-0 focus:ring-0 outline-none resize-none font-mono font-[500] !text-[14px] leading-6 text-foreground px-3 pt-[14px] !pb-[7px] overflow-hidden'
									spellCheck={false}
									style={{
										height: 'auto',
										whiteSpace: 'pre-wrap',
										wordWrap: 'break-word',
										overflowWrap: 'break-word'
									}}
								/>
							) : (
								<div
									onClick={() => setIsEditing(true)}
									className='cursor-text text-foreground overflow-x-auto'
								>
									<pre
										className='font-mono font-[500] !text-[14px] bg-transparent px-3 pt-[4px]  m-0'
										style={{
											whiteSpace: 'pre-wrap',
											wordWrap: 'break-word',
											overflowWrap: 'break-word'
										}}
									>
										{/* Highlighted output is sanitized with DOMPurify */}
										<code dangerouslySetInnerHTML={{ __html: highlight }} />
									</pre>
								</div>
							)}
						</div>
						{isCollapsed && (
							<div className='absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-t from-card to-transparent pointer-events-none' />
						)}
					</div>
				</div>
			)
		}
	}
)
