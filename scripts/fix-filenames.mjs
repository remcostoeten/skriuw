import { readdirSync, renameSync, existsSync } from 'fs'
import { join, basename } from 'path'

const toKebabCase = (str) =>
  str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()

const isKebabCase = (filename) => /^[a-z0-9]+(-[a-z0-9]+)*\.[a-z]+$/.test(filename)

const dirs = ['src/components/haptic', 'src/components', 'src/shared/ui', 'src/hooks', 'src/lib', 'src/types', 'src/modules', 'src/store']

const fix = process.argv.includes('--fix')

let changed = 0
let errors = 0

for (const dir of dirs) {
  if (!existsSync(dir)) continue

  const files = readdirSync(dir, { withFileTypes: true })
  for (const file of files) {
    if (!file.isFile()) continue
    
    const name = file.name
    const ext = name.includes('.') ? '.' + name.split('.').pop() : ''
    const base = name.replace(ext, '')
    
    if (!isKebabCase(name) && (name.endsWith('.ts') || name.endsWith('.tsx'))) {
      const newName = toKebabCase(base) + ext
      const oldPath = join(dir, name)
      const newPath = join(dir, newName)
      
      if (fix) {
        renameSync(oldPath, newPath)
        console.log(`Renamed: ${name} -> ${newName}`)
        changed++
      } else {
        console.log(`ERROR: ${dir}/${name} should be ${newName}`)
        errors++
      }
    }
  }
}

if (fix) {
  console.log(`\nRenamed ${changed} files`)
} else if (errors > 0) {
  console.log(`\nFound ${errors} files not in kebab-case. Run with --fix to auto-rename.`)
  process.exit(1)
}
