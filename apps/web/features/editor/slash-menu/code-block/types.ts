/**
 * Code Block Types
 * Type definitions for the BlockNote code block component
 */

import type { CSSProperties } from 'react'

/**
 * Supported programming languages
 */
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

/**
 * Get language config by value
 */
export function getLanguageConfig(value: string) {
    return LANGUAGES.find((l) => l.value === value) || LANGUAGES[0]
}

/**
 * Get default filename for a language
 */
export function getDefaultFilename(language: string): string {
    const config = getLanguageConfig(language)
    return `untitled.${config.ext}`
}

/**
 * Custom syntax highlighting theme using CSS variables
 */
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
        padding: '1.25rem',
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

/**
 * Code block props for the BlockNote block
 */
export type TCodeBlockProps = {
    language: string
    fileName: string
    code: string
}
