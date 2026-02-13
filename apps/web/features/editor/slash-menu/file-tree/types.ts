export type TFile = {
	path: string
	content?: string
	language?: string
}

export type TNode = {
	id: string
	name: string
	type: 'file' | 'folder'
	path: string
	children?: TNode[]
	content?: string
	language?: string
	isExpanded?: boolean
}

export type TIconColorMode = 'monochrome' | 'colored'

export type TComponent = {
	name: string
	version?: string
	showIndentLines?: boolean
	enableHoverHighlight?: boolean
	files: TFile[]
}

export type TTreeState = {
	expandedFolders: Set<string>
	selectedFilePath: string | null
}

export type TEditingState = {
	id: string | null
	value: string
}

export type TStyle = 'card' | 'minimal' | 'full'

export type TFileTreeBlockProps = {
	content: string
	style: TStyle
	showIndentLines: boolean
	initialExpandedAll: boolean
	locked: boolean
	iconColorMode: TIconColorMode
}

export const LANGUAGE_MAP: Record<string, string> = {
	ts: 'typescript',
	tsx: 'tsx',
	js: 'javascript',
	jsx: 'jsx',
	py: 'python',
	rb: 'ruby',
	rs: 'rust',
	go: 'go',
	java: 'java',
	c: 'c',
	cpp: 'cpp',
	cs: 'csharp',
	php: 'php',
	swift: 'swift',
	kt: 'kotlin',
	scala: 'scala',
	sh: 'bash',
	bash: 'bash',
	zsh: 'bash',
	fish: 'bash',
	ps1: 'powershell',
	sql: 'sql',
	graphql: 'graphql',
	gql: 'graphql',
	json: 'json',
	yaml: 'yaml',
	yml: 'yaml',
	toml: 'toml',
	xml: 'xml',
	html: 'html',
	css: 'css',
	scss: 'scss',
	sass: 'sass',
	less: 'less',
	md: 'markdown',
	mdx: 'mdx',
	vue: 'vue',
	svelte: 'svelte',
	astro: 'astro',
	dockerfile: 'dockerfile',
	docker: 'dockerfile',
	makefile: 'makefile',
	cmake: 'cmake',
	nginx: 'nginx',
	prisma: 'prisma',
	env: 'dotenv',
	gitignore: 'gitignore',
	editorconfig: 'editorconfig'
}

export function getLanguageFromPath(path: string): string {
	const extension = path.split('.').pop()?.toLowerCase() || ''
	return LANGUAGE_MAP[extension] || 'plaintext'
}

const COLORED_FILE_ICONS: Record<string, string> = {
	ts: 'text-blue-400',
	tsx: 'text-blue-400',
	js: 'text-yellow-400',
	jsx: 'text-yellow-400',
	json: 'text-yellow-600',
	css: 'text-sky-400',
	scss: 'text-pink-400',
	html: 'text-orange-500',
	md: 'text-gray-400',
	py: 'text-green-400',
	go: 'text-cyan-400',
	rs: 'text-orange-600',
	default: 'text-muted-foreground'
}

export function getFileColor(path: string, mode: TIconColorMode = 'monochrome'): string {
	if (mode === 'monochrome') return 'text-muted-foreground'
	const extension = path.split('.').pop()?.toLowerCase() || ''
	return COLORED_FILE_ICONS[extension] || COLORED_FILE_ICONS.default
}

export function getFolderColor(mode: TIconColorMode = 'monochrome'): string {
	if (mode === 'monochrome') return 'text-muted-foreground'
	return 'text-yellow-500'
}

export function getFolderOpenColor(mode: TIconColorMode = 'monochrome'): string {
	if (mode === 'monochrome') return 'text-muted-foreground'
	return 'text-yellow-500'
}
