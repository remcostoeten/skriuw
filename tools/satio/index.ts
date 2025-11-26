#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

import { markdownToBlocks } from '../../src/features/notes/utils/markdown-to-blocks'

// ANSI color codes for better UX
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
}

const icons = {
  success: '✓',
  error: '✗',
  info: 'ℹ',
  warning: '⚠',
  folder: '📁',
  file: '📄',
  seed: '🌱',
}

type CliOptions = {
  input: string
  name: string
  folder?: string
  slug?: string
  outputDir?: string
  listOnly?: boolean
}

const TAGLINE = `Satio (noun) /ˈsa.ti.oː/ — Latin, “to sow, plant, or bring forth.”

Plant Markdown notes into Skriuw by converting them to BlockNote JSON and writing ready-to-import seed files.`

function parseArgs(args: string[]): CliOptions {
  const opts: Partial<CliOptions> = {}

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i]
    switch (token) {
      case '--input':
      case '-i':
        opts.input = args[i + 1]
        i += 1
        break
      case '--name':
      case '-n':
        opts.name = args[i + 1]
        i += 1
        break
      case '--folder':
      case '-f':
        opts.folder = args[i + 1]
        i += 1
        break
      case '--slug':
      case '-s':
        opts.slug = args[i + 1]
        i += 1
        break
      case '--out':
      case '-o':
        opts.outputDir = args[i + 1]
        i += 1
        break
      case '--list':
      case '-l':
        opts.listOnly = true
        break
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
      default:
        break
    }
  }

  if (opts.listOnly) {
    return {
      input: '',
      name: '',
      outputDir: opts.outputDir,
      folder: opts.folder,
      slug: opts.slug,
      listOnly: true
    }
  }

  if (!opts.input || !opts.name) {
    printHelp('Both --input and --name are required.')
    process.exit(1)
  }

  return {
    input: opts.input,
    name: opts.name,
    folder: opts.folder,
    slug: opts.slug,
    outputDir: opts.outputDir
  }
}

function printHelp(message?: string) {
  if (message) {
    console.error(`\n${colors.red}${icons.error} ${message}${colors.reset}\n`)
  }

  console.log(`${colors.cyan}${colors.bright}${TAGLINE}${colors.reset}\n`)

  console.log(`${colors.bright}Usage:${colors.reset}
  ${colors.green}pnpm satio${colors.reset} ${colors.yellow}--input${colors.reset} ./path/to/file.md ${colors.yellow}--name${colors.reset} "Note title" [options]

${colors.bright}Options:${colors.reset}
  ${colors.yellow}--input,  -i${colors.reset}   Path to a Markdown file ${colors.red}(required)${colors.reset}
  ${colors.yellow}--name,   -n${colors.reset}   Name of the note ${colors.red}(required)${colors.reset}
  ${colors.yellow}--folder, -f${colors.reset}   Optional parent folder name
  ${colors.yellow}--slug,   -s${colors.reset}   Optional slug for the generated file
  ${colors.yellow}--out,    -o${colors.reset}   Output directory relative to repo root
                    ${colors.dim}(default: src/features/notes/seeds/generated)${colors.reset}
  ${colors.yellow}--list,   -l${colors.reset}   Show a tree of current seed files and exit
  ${colors.yellow}--help,   -h${colors.reset}   Show this help message

${colors.dim}Tip: Run without arguments for interactive mode${colors.reset}
`)
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'note'
}

/**
 * Simple fuzzy match - checks if query characters appear in order in the string
 */
function fuzzyMatch(query: string, text: string): number {
  const queryLower = query.toLowerCase()
  const textLower = text.toLowerCase()
  
  if (textLower.includes(queryLower)) {
    return 100 // Exact substring match gets highest score
  }
  
  let queryIndex = 0
  let score = 0
  let consecutiveMatches = 0
  
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      score += 1
      consecutiveMatches += 1
      queryIndex++
    } else {
      consecutiveMatches = 0
    }
  }
  
  // Bonus for consecutive matches
  score += consecutiveMatches * 2
  
  // Return score only if all query characters were found
  return queryIndex === queryLower.length ? score : 0
}

/**
 * Find all markdown files recursively
 */
function findMarkdownFiles(dir: string, maxDepth = 3, currentDepth = 0): string[] {
  if (currentDepth > maxDepth) return []
  
  const files: string[] = []
  
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      
      // Skip hidden files and common ignore patterns
      if (entry.name.startsWith('.') || 
          entry.name === 'node_modules' || 
          entry.name === 'dist' ||
          entry.name === 'build') {
        continue
      }
      
      try {
        if (entry.isDirectory()) {
          files.push(...findMarkdownFiles(fullPath, maxDepth, currentDepth + 1))
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          files.push(fullPath)
        }
      } catch {
        // Skip files we can't access
        continue
      }
    }
  } catch {
    // Skip directories we can't access
  }
  
  return files
}

/**
 * Interactive file picker with fuzzy search
 */
async function pickMarkdownFile(): Promise<string> {
  const rootDir = process.cwd()
  const commonDirs = [
    'tmp',
    'docs',
    '.',
    'src',
    'tools'
  ]
  
  console.log(`${colors.cyan}${icons.info} Scanning for Markdown files...${colors.reset}`)
  
  // Find all markdown files
  const allFiles: string[] = []
  for (const dir of commonDirs) {
    const dirPath = path.join(rootDir, dir)
    if (existsSync(dirPath)) {
      const files = findMarkdownFiles(dirPath)
      allFiles.push(...files)
    }
  }
  
  // Remove duplicates and sort
  const uniqueFiles = Array.from(new Set(allFiles))
    .map(file => path.relative(rootDir, file))
    .sort()
  
  if (uniqueFiles.length === 0) {
    console.log(`${colors.yellow}${icons.warning} No Markdown files found.${colors.reset}`)
    const rl = readline.createInterface({ input, output })
    const answer = await rl.question(`${colors.cyan}Path to Markdown file: ${colors.reset}`)
    rl.close()
    return answer.trim()
  }
  
  console.log(`${colors.green}${icons.success} Found ${uniqueFiles.length} Markdown file${uniqueFiles.length !== 1 ? 's' : ''}${colors.reset}\n`)
  
  const rl = readline.createInterface({ input, output })
  let filteredFiles = uniqueFiles
  let searchQuery = ''
  
  while (true) {
    // Display files
    const displayCount = Math.min(filteredFiles.length, 15)
    console.log(`${colors.bright}${icons.info} Select Markdown file${colors.reset}`)
    if (searchQuery) {
      console.log(`${colors.dim}Search: "${searchQuery}" (${filteredFiles.length} match${filteredFiles.length !== 1 ? 'es' : ''})${colors.reset}\n`)
    } else {
      console.log(`${colors.dim}Type to search, or enter number to select${colors.reset}\n`)
    }
    
    for (let i = 0; i < displayCount; i++) {
      const file = filteredFiles[i]
      const num = String(i + 1).padStart(2, ' ')
      console.log(`${colors.cyan}${num}.${colors.reset} ${file}`)
    }
    
    if (filteredFiles.length > displayCount) {
      console.log(`${colors.dim}... and ${filteredFiles.length - displayCount} more${colors.reset}`)
    }
    
    if (filteredFiles.length === 0) {
      console.log(`${colors.yellow}${icons.warning} No files match "${searchQuery}"${colors.reset}`)
    }
    
    console.log('')
    const answer = await rl.question(
      searchQuery 
        ? `${colors.cyan}Search / Select (1-${Math.min(filteredFiles.length, displayCount)}) / Enter path: ${colors.reset}`
        : `${colors.cyan}Search / Select (1-${Math.min(filteredFiles.length, displayCount)}) / Enter path: ${colors.reset}`
    )
    
    const trimmed = answer.trim()
    
    // Check if it's a number selection
    const num = parseInt(trimmed, 10)
    if (!isNaN(num) && num >= 1 && num <= displayCount && num <= filteredFiles.length) {
      rl.close()
      return filteredFiles[num - 1]
    }
    
    // Check if it's a direct path
    if (trimmed && (trimmed.includes('/') || trimmed.includes('\\') || trimmed.endsWith('.md'))) {
      rl.close()
      return trimmed
    }
    
    // Update search query
    if (trimmed) {
      searchQuery = trimmed
      // Fuzzy search
      const scored = uniqueFiles.map(file => ({
        file,
        score: fuzzyMatch(searchQuery, file)
      }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.file)
      
      filteredFiles = scored
    } else {
      // Clear search
      searchQuery = ''
      filteredFiles = uniqueFiles
    }
    
    // Clear previous output (simple approach)
    console.log('')
  }
}

async function promptInteractive(): Promise<CliOptions> {
  console.log(`${colors.cyan}${colors.bright}${TAGLINE}${colors.reset}\n`)

  const rl = readline.createInterface({ input, output })
  const ask = async (question: string, required = false): Promise<string> => {
    while (true) {
      const answer = (await rl.question(`${colors.cyan}${question}${colors.reset}`)).trim()
      if (!required || answer) {
        return answer
      }
      console.log(`${colors.red}${icons.error} This field is required. Please enter a value.${colors.reset}\n`)
    }
  }

  console.log(`${colors.bright}${icons.info} Select mode:${colors.reset}`)
  const mode = (await ask(`${colors.dim}  [1]${colors.reset} Create new seed\n${colors.dim}  [2]${colors.reset} List existing seeds\n${colors.cyan}> ${colors.reset}`, true))
  const normalized = mode.startsWith('2') || mode.toLowerCase().startsWith('l') ? 'list' : 'create'

  if (normalized === 'list') {
    const customDir = await ask(
      `${colors.bright}Directory to list${colors.reset} ${colors.dim}(leave empty for src/features/notes/seeds):${colors.reset} `
    )
    rl.close()
    return {
      input: '',
      name: '',
      listOnly: true,
      outputDir: customDir || 'src/features/notes/seeds'
    }
  }

  console.log(`\n${colors.bright}${icons.seed} Creating new seed file${colors.reset}\n`)
  const inputPath = await pickMarkdownFile()
  if (!inputPath) {
    console.log(`${colors.red}${icons.error} No file selected${colors.reset}\n`)
    process.exit(1)
  }
  const noteName = await ask(`${colors.bright}Note title${colors.reset} ${colors.red}*${colors.reset}: `, true)
  const folder = await ask(`${colors.bright}Parent folder name${colors.reset} ${colors.dim}(optional, press Enter to skip):${colors.reset} `)
  const slug = await ask(`${colors.bright}Custom slug${colors.reset} ${colors.dim}(optional, press Enter to auto-generate):${colors.reset} `)
  const outDir = await ask(
    `${colors.bright}Output directory${colors.reset} ${colors.dim}(default: src/features/notes/seeds/generated):${colors.reset} `
  )
  rl.close()

  return {
    input: inputPath,
    name: noteName,
    folder: folder || undefined,
    slug: slug || undefined,
    outputDir: outDir || undefined
  }
}

async function run() {
  const args = process.argv.slice(2)
  const options = args.length === 0 ? await promptInteractive() : parseArgs(args)
  const rootDir = path.resolve(process.cwd())

  if (options.listOnly) {
    const target = path.resolve(rootDir, options.outputDir ?? 'src/features/notes/seeds')
    printSeedTree(target)
    return
  }

  const inputPath = path.resolve(rootDir, options.input)

  if (!existsSync(inputPath)) {
    console.error(`\n${colors.red}${icons.error} Input file not found at ${inputPath}${colors.reset}\n`)
    process.exit(1)
  }

  console.log(`${colors.cyan}${icons.info} Reading Markdown file...${colors.reset}`)
  const markdown = readFileSync(inputPath, 'utf8')
  
  let blocks
  // Suppress console warnings/errors from BlockNote (it expects a DOM environment)
  const originalWarn = console.warn
  const originalError = console.error
  const suppressedMessages = [
    'document is not defined',
    'window object',
    'tiptap error',
    'tryParseMarkdownToBlocks failed',
    'TipTap markdown parsing failed',
    'All markdown parsing methods failed'
  ]
  
  console.warn = (...args: any[]) => {
    const message = String(args[0] || '')
    const shouldSuppress = suppressedMessages.some(msg => 
      message.toLowerCase().includes(msg.toLowerCase())
    )
    if (!shouldSuppress) {
      originalWarn(...args)
    }
  }
  
  console.error = (...args: any[]) => {
    const message = String(args[0] || '')
    const shouldSuppress = suppressedMessages.some(msg => 
      message.toLowerCase().includes(msg.toLowerCase())
    )
    if (!shouldSuppress) {
      originalError(...args)
    }
  }
  
  try {
    console.log(`${colors.cyan}${icons.info} Converting to BlockNote format...${colors.reset}`)
    blocks = await markdownToBlocks(markdown)
    console.log(`${colors.green}${icons.success} Conversion successful${colors.reset}`)
  } catch (error) {
    // Suppress noisy error messages - the fallback works fine
    const isDomError = error instanceof Error && (
      error.message.includes('document is not defined') ||
      error.message.includes('window object') ||
      error.message.includes('tiptap error')
    )
    
    if (!isDomError) {
      console.warn(`${colors.yellow}${icons.warning} Markdown parsing issue, using fallback format${colors.reset}`)
    } else {
      console.log(`${colors.dim}${icons.info} Using fallback format (Node.js environment)${colors.reset}`)
    }
    
    blocks = [
      {
        id: `seed_${Date.now().toString(36)}`,
        type: 'paragraph',
        props: {},
        content: [
          {
            type: 'text',
            text: markdown,
            styles: {}
          }
        ],
        children: []
      }
    ]
  } finally {
    // Restore original console methods
    console.warn = originalWarn
    console.error = originalError
  }

  const safeSlug = options.slug ?? slugify(options.name)
  const outputDir =
    options.outputDir?.startsWith('/')
      ? options.outputDir
      : path.join(rootDir, options.outputDir ?? 'src/features/notes/seeds/generated')

  mkdirSync(outputDir, { recursive: true })

  const camelSeed = safeSlug
    .replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
  const exportName = /^[a-zA-Z]/.test(camelSeed) ? `${camelSeed}Seed` : `seed${camelSeed || 'Note'}`
  const filePath = path.join(outputDir, `${safeSlug}.ts`)
  const fileContents = `import type { DefaultNote } from '@/features/notes/utils/initialize-defaults'

export const ${exportName} = {
  name: ${JSON.stringify(options.name)},
  ${options.folder ? `parentFolderName: ${JSON.stringify(options.folder)},\n  ` : ''}content: ${JSON.stringify(blocks, null, 2)}
} satisfies DefaultNote
`

  console.log(`${colors.cyan}${icons.info} Writing seed file...${colors.reset}`)
  writeFileSync(filePath, fileContents, 'utf8')

  console.log(`\n${colors.green}${icons.success} ${colors.bright}Successfully sowed note!${colors.reset}\n`)
  console.log(`${colors.bright}Note:${colors.reset} ${colors.cyan}"${options.name}"${colors.reset}`)
  if (options.folder) {
    console.log(`${colors.bright}Folder:${colors.reset} ${colors.cyan}${options.folder}${colors.reset}`)
  }
  console.log(`${colors.bright}File:${colors.reset} ${colors.dim}${path.relative(process.cwd(), filePath)}${colors.reset}`)
  console.log(`${colors.bright}Export:${colors.reset} ${colors.cyan}${exportName}${colors.reset}\n`)
  console.log(`${colors.dim}${icons.info} Import this seed into your initializer to include it in future installs.${colors.reset}\n`)
}

function printSeedTree(baseDir: string) {
  if (!existsSync(baseDir)) {
    console.warn(`\n${colors.yellow}${icons.warning} Seeds directory not found at ${baseDir}${colors.reset}\n`)
    return
  }

  console.log(`${colors.cyan}${colors.bright}${TAGLINE}${colors.reset}\n`)
  const relativePath = path.relative(process.cwd(), baseDir) || '.'
  console.log(`${colors.bright}${icons.folder} Current seeds under ${colors.cyan}${relativePath}${colors.reset}:\n`)

  let foundSeeds = false
  let seedCount = 0

  const walk = (dir: string, prefix = '') => {
    const entries = readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() || (entry.isFile() && entry.name.endsWith('.ts')))
      .sort((a, b) => {
        // Directories first, then files, then by name
        if (a.isDirectory() && !b.isDirectory()) return -1
        if (!a.isDirectory() && b.isDirectory()) return 1
        return a.name.localeCompare(b.name)
      })

    entries.forEach((entry, index) => {
      const isLast = index === entries.length - 1
      const connector = isLast ? '└─ ' : '├─ '
      const nextPrefix = prefix + (isLast ? '   ' : '│  ')
      
      let entryName = entry.name
      let icon = ''
      if (entry.isDirectory()) {
        icon = `${colors.blue}${icons.folder}${colors.reset} `
        entryName += '/'
      } else {
        icon = `${colors.green}${icons.seed}${colors.reset} `
        foundSeeds = true
        seedCount++
      }
      console.log(`${prefix}${connector}${icon}${colors.cyan}${entryName}${colors.reset}`)
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), nextPrefix)
      }
    })
  }

  walk(baseDir)

  if (!foundSeeds) {
    console.log(`${colors.dim}${' '.repeat(3)}No seed files (.ts) found in this directory.${colors.reset}\n`)
  } else {
    console.log(`\n${colors.green}${icons.success} Found ${colors.bright}${seedCount}${colors.reset}${colors.green} seed file${seedCount !== 1 ? 's' : ''}${colors.reset}\n`)
  }
}

run().catch(error => {
  console.error(`\n${colors.red}${icons.error} ${colors.bright}Satio failed to generate seed file${colors.reset}\n`)
  if (error instanceof Error) {
    console.error(`${colors.red}${error.message}${colors.reset}`)
    if (error.stack) {
      console.error(`${colors.dim}${error.stack}${colors.reset}`)
    }
  } else {
    console.error(`${colors.red}${String(error)}${colors.reset}`)
  }
  console.error('')
  process.exit(1)
})
