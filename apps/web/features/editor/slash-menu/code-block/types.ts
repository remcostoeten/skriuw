import type { CSSProperties } from 'react'

export const LANGUAGES = [
    { value: 'typescript', label: 'TypeScript', ext: 'ts' },
    { value: 'javascript', label: 'JavaScript', ext: 'js' },
    { value: 'tsx', label: 'TSX', ext: 'tsx' },
    { value: 'jsx', label: 'JSX', ext: 'jsx' },
    { value: 'python', label: 'Python', ext: 'py' },
    { value: 'css', label: 'CSS', ext: 'css' },
    { value: 'html', label: 'HTML', ext: 'html' },
    { value: 'json', label: 'JSON', ext: 'json' },
    { value: 'bash', label: 'Bash', ext: 'sh' },
    { value: 'sql', label: 'SQL', ext: 'sql' },
    { value: 'yaml', label: 'YAML', ext: 'yaml' },
    { value: 'markdown', label: 'Markdown', ext: 'md' },
    { value: 'rust', label: 'Rust', ext: 'rs' },
    { value: 'go', label: 'Go', ext: 'go' },
    { value: 'java', label: 'Java', ext: 'java' },
    { value: 'csharp', label: 'C#', ext: 'cs' },
    { value: 'cpp', label: 'C++', ext: 'cpp' },
    { value: 'php', label: 'PHP', ext: 'php' },
    { value: 'ruby', label: 'Ruby', ext: 'rb' },
    { value: 'swift', label: 'Swift', ext: 'swift' },
    { value: 'kotlin', label: 'Kotlin', ext: 'kt' },
    { value: 'scala', label: 'Scala', ext: 'scala' },
    { value: 'graphql', label: 'GraphQL', ext: 'graphql' },
    { value: 'dockerfile', label: 'Dockerfile', ext: 'dockerfile' },
    { value: 'plaintext', label: 'Plain Text', ext: 'txt' }
] as const

export type TLanguage = (typeof LANGUAGES)[number]['value']

export function getLanguageConfig(value: string) {
    return LANGUAGES.find((l) => l.value === value) || LANGUAGES[0]
}

export function getDefaultFilename(language: string): string {
    const config = getLanguageConfig(language)
    return `untitled.${config.ext}`
}

const LANGUAGE_PATTERNS: Array<{ language: TLanguage; patterns: RegExp[] }> = [
    {
        language: 'python',
        patterns: [/\bdef\s+\w+\s*\(/, /\bimport\s+\w+/, /\bclass\s+\w+.*:/, /\bprint\s*\(/]
    },
    {
        language: 'rust',
        patterns: [/\bfn\s+\w+/, /\blet\s+mut\b/, /\bimpl\s+/, /\b(pub\s+)?(struct|enum|trait)\b/, /::new\(/]
    },
    {
        language: 'go',
        patterns: [/\bfunc\s+\w+/, /\bpackage\s+\w+/, /\bfmt\./, /\b:=\b/]
    },
    {
        language: 'tsx',
        patterns: [/\binterface\s+\w+/, /<\w+[\s/>]/, /\bconst\s+\w+.*:\s*(React\.)?FC/, /\bJSX\.Element/]
    },
    {
        language: 'jsx',
        patterns: [/\breturn\s*\(\s*</, /\bReact\.createElement/]
    },
    {
        language: 'typescript',
        patterns: [/:\s*(string|number|boolean|any|void)\b/, /\binterface\s+\w+/, /\btype\s+\w+\s*=/, /\bas\s+(string|number|any)\b/]
    },
    {
        language: 'javascript',
        patterns: [/\bconst\s+\w+\s*=/, /\bfunction\s+\w+/, /\bconsole\.\w+/, /\bmodule\.exports/, /\brequire\s*\(/]
    },
    {
        language: 'html',
        patterns: [/<!DOCTYPE/i, /<html/i, /<div\b/, /<\/\w+>/]
    },
    {
        language: 'css',
        patterns: [/\{[\s\S]*?:\s*[\s\S]*?;[\s\S]*?\}/, /\.([\w-]+)\s*\{/, /@media\s/, /@import\s/]
    },
    {
        language: 'sql',
        patterns: [/\bSELECT\b/i, /\bFROM\b/i, /\bWHERE\b/i, /\bINSERT\s+INTO\b/i, /\bCREATE\s+TABLE\b/i]
    },
    {
        language: 'json',
        patterns: [/^\s*[\[{]/, /"\w+":\s*["{\[\dtfn]/]
    },
    {
        language: 'yaml',
        patterns: [/^\w+:\s/, /^\s+-\s+\w+/m]
    },
    {
        language: 'bash',
        patterns: [/^#!/, /\becho\s/, /\bsudo\s/, /\|\s*grep\b/, /\bcd\s+/]
    },
    {
        language: 'php',
        patterns: [/<\?php/, /\$\w+\s*=/, /\becho\s/]
    },
    {
        language: 'ruby',
        patterns: [/\bdef\s+\w+/, /\bend\s*$/, /\bputs\s/, /\brequire\s+'/]
    },
    {
        language: 'java',
        patterns: [/\bpublic\s+class\b/, /\bSystem\.out\.print/, /\bvoid\s+main\b/]
    },
    {
        language: 'kotlin',
        patterns: [/\bfun\s+\w+/, /\bval\s+\w+/, /\bvar\s+\w+/, /\bprintln\s*\(/]
    },
    {
        language: 'swift',
        patterns: [/\bfunc\s+\w+/, /\bvar\s+\w+\s*:/, /\blet\s+\w+\s*:/, /\bguard\s+let\b/]
    },
    {
        language: 'graphql',
        patterns: [/\b(query|mutation|subscription)\s+\w+/, /\btype\s+\w+\s*\{/]
    },
    {
        language: 'dockerfile',
        patterns: [/^FROM\s+/m, /^RUN\s+/m, /^COPY\s+/m, /^CMD\s+/m]
    }
]

export function detectLanguage(code: string): TLanguage {
    if (!code.trim()) return 'typescript'

    let bestMatch: TLanguage = 'typescript'
    let bestScore = 0

    for (const { language, patterns } of LANGUAGE_PATTERNS) {
        let score = 0
        for (const pattern of patterns) {
            if (pattern.test(code)) {
                score++
            }
        }
        if (score > bestScore) {
            bestScore = score
            bestMatch = language
        }
    }

    return bestScore >= 1 ? bestMatch : 'typescript'
}

export type TCustomTheme = { [key: string]: CSSProperties }

const sharedCodeStyles: CSSProperties = {
    color: 'hsl(var(--sh-text))',
    background: 'none',
    fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    textAlign: 'left',
    whiteSpace: 'pre-wrap',
    wordSpacing: 'normal',
    wordBreak: 'normal',
    overflowWrap: 'anywhere',
    lineHeight: '1.6',
    fontSize: '14px',
    tabSize: 2,
    hyphens: 'none'
}

export const codeBlockTheme: TCustomTheme = {
    'code[class*="language-"]': { ...sharedCodeStyles },
    'pre[class*="language-"]': {
        ...sharedCodeStyles,
        padding: '1rem 1rem 1rem 0',
        margin: '0'
    },
    comment: { color: 'hsl(var(--sh-comment))', fontStyle: 'italic' },
    'block-comment': { color: 'hsl(var(--sh-comment))', fontStyle: 'italic' },
    prolog: { color: 'hsl(var(--sh-comment))' },
    doctype: { color: 'hsl(var(--sh-comment))' },
    cdata: { color: 'hsl(var(--sh-comment))' },
    punctuation: { color: 'hsl(var(--sh-punctuation))' },
    operator: { color: 'hsl(var(--sh-operator))' },
    url: { color: 'hsl(var(--sh-string))' },
    tag: { color: 'hsl(var(--sh-tag))' },
    'attr-name': { color: 'hsl(var(--sh-function))' },
    namespace: { color: 'hsl(var(--sh-keyword))' },
    property: { color: 'hsl(var(--sh-function))' },
    symbol: { color: 'hsl(var(--sh-function))' },
    important: { color: 'hsl(var(--sh-keyword))', fontWeight: 'bold' },
    atrule: { color: 'hsl(var(--sh-keyword))' },
    keyword: { color: 'hsl(var(--sh-keyword))' },
    regex: { color: 'hsl(var(--sh-string))' },
    entity: { color: 'hsl(var(--sh-keyword))', cursor: 'help' },
    'function-name': { color: 'hsl(var(--sh-function))' },
    function: { color: 'hsl(var(--sh-function))' },
    'class-name': { color: 'hsl(var(--sh-function))' },
    builtin: { color: 'hsl(var(--sh-keyword))' },
    boolean: { color: 'hsl(var(--sh-number))' },
    number: { color: 'hsl(var(--sh-number))' },
    constant: { color: 'hsl(var(--sh-number))' },
    string: { color: 'hsl(var(--sh-string))' },
    char: { color: 'hsl(var(--sh-string))' },
    'attr-value': { color: 'hsl(var(--sh-string))' },
    selector: { color: 'hsl(var(--sh-keyword))' },
    deleted: { color: 'hsl(var(--destructive))' },
    inserted: { color: 'hsl(var(--sh-string))' },
    variable: { color: 'hsl(var(--sh-function))' },
    bold: { fontWeight: 'bold' },
    italic: { fontStyle: 'italic' }
}

export type TCodeBlockProps = {
    language: string
    code: string
}
