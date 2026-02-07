/**
 * File Tree Types
 * Ported from Beautiful Interactive File Tree component
 * @see https://github.com/remcostoeten/Beautiful-interactive-file-tree
 */

/**
 * Represents a single file in the tree
 */
export type TFile = {
    /** File path (e.g., "src/components/Button.tsx") */
    path: string
    /** Optional file content for preview */
    content?: string
    /** Language for syntax highlighting (auto-detected from extension if not provided) */
    language?: string
}

/**
 * Tree node structure for folders and files
 */
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

/**
 * Full component configuration
 */
export type TComponent = {
    /** Display name of the component */
    name: string
    /** Version string shown in header */
    version?: string
    /** Show indent guide lines in tree */
    showIndentLines?: boolean
    /** Enable subtle background color on hover for file & folder rows */
    enableHoverHighlight?: boolean
    /** Array of files to display */
    files: TFile[]
}

/**
 * Tree state for tracking expanded folders and selected file
 */
export type TTreeState = {
    expandedFolders: Set<string>
    selectedFilePath: string | null
}

/**
 * Editing state for inline rename
 */
export type TEditingState = {
    id: string | null
    value: string
}

/**
 * Style variants for the file tree block
 */
export type TStyle = 'card' | 'minimal' | 'full'

/**
 * Block props for BlockNote integration
 */
export type TFileTreeBlockProps = {
    /** Serialized TComponent JSON */
    content: string
    /** Visual style variant */
    style: TStyle
    /** Show indent guide lines */
    showIndentLines: boolean
    /** Expand all folders by default */
    initialExpandedAll: boolean
}

/**
 * Language mappings for syntax highlighting
 */
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

/**
 * Get language from file extension
 */
export function getLanguageFromPath(path: string): string {
    const extension = path.split('.').pop()?.toLowerCase() || ''
    return LANGUAGE_MAP[extension] || 'plaintext'
}

/**
 * File icon colors based on extension
 */
export const FILE_COLORS: Record<string, string> = {
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

/**
 * Get file icon color from path
 */
export function getFileColor(path: string): string {
    const extension = path.split('.').pop()?.toLowerCase() || ''
    return FILE_COLORS[extension] || FILE_COLORS.default
}
