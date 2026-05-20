#!/usr/bin/env node

/**
 * Generate an agent-readable text report from skeleton-qa test results.
 *
 * Usage:
 *   npx tsx generate-report.ts [results-dir]
 *
 * Defaults to ./test-results/skeleton-qa
 *
 * Outputs a structured plain-text summary to stdout that an agent can
 * parse and act on. Also writes report.json for programmatic use.
 */

import fs from 'fs/promises'
import path from 'path'

interface CLSResult {
  selector: string
  skeleton: { x: number; y: number; width: number; height: number; exists: boolean }
  loaded: { x: number; y: number; width: number; height: number; exists: boolean }
  deltaX: number
  deltaY: number
  deltaWidth: number
  deltaHeight: number
  shifted: boolean
}

interface RouteReport {
  route: string
  viewport: string
  cls: CLSResult[]
  diffPercentage: number
  passed: boolean
}

async function findReports(dir: string): Promise<RouteReport[]> {
  const results: RouteReport[] = []

  async function walk(current: string) {
    const entries = await fs.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.name === 'report.json') {
        const content = await fs.readFile(full, 'utf-8')
        results.push(JSON.parse(content))
      }
    }
  }

  await walk(dir)
  return results
}

function suggestFix(cls: CLSResult): string {
  if (!cls.skeleton.exists && cls.loaded.exists) {
    return `${cls.selector} exists in the loaded state but is missing from the fallback shell. The Suspense boundary's fallback needs to include this element.`
  }
  if (cls.skeleton.exists && !cls.loaded.exists) {
    return `${cls.selector} appears in the fallback but not in the loaded state. Remove it from the skeleton.`
  }
  if (cls.deltaHeight > 50) {
    return `Skeleton height for ${cls.selector} is off by ${cls.deltaHeight}px. Add min-height or aspect-ratio to the skeleton container to reserve space.`
  }
  if (cls.deltaWidth > 20) {
    return `Skeleton width for ${cls.selector} is off by ${cls.deltaWidth}px. The fallback should mirror the loaded layout's grid/flex structure.`
  }
  if (cls.deltaY > 10) {
    return `${cls.selector} shifts ${cls.deltaY}px vertically. An element above it likely changes size — check skeleton heights of preceding elements.`
  }
  if (cls.deltaX > 10) {
    return `${cls.selector} shifts ${cls.deltaX}px horizontally. The skeleton should mirror the loaded layout's column structure.`
  }
  return `${cls.selector} shifted slightly (${cls.deltaX}px x, ${cls.deltaY}px y). May be caused by font loading or sub-pixel differences.`
}

function formatReport(reports: RouteReport[]): string {
  const passed = reports.filter(r => r.passed).length
  const failed = reports.length - passed
  const lines: string[] = []

  lines.push('=== SKELETON QA REPORT ===')
  lines.push(`PASSED: ${passed}/${reports.length}  FAILED: ${failed}/${reports.length}`)
  lines.push('')

  // Sort: failures first
  reports.sort((a, b) => {
    if (a.passed !== b.passed) return a.passed ? 1 : -1
    return `${a.viewport}${a.route}`.localeCompare(`${b.viewport}${b.route}`)
  })

  for (const report of reports) {
    const status = report.passed ? 'PASS' : 'FAIL'
    const diffPct = (report.diffPercentage * 100).toFixed(1)
    lines.push(`--- ${status} [${report.viewport}] ${report.route} (${diffPct}% pixel diff) ---`)

    const violations = report.cls.filter(c => c.shifted)
    if (violations.length === 0 && report.diffPercentage < 0.05) {
      lines.push('  No issues.')
    }

    for (const v of violations) {
      lines.push(`  SHIFT: ${v.selector} moved (${v.deltaX}px, ${v.deltaY}px), size changed (${v.deltaWidth}px, ${v.deltaHeight}px)`)
      lines.push(`    Fix: ${suggestFix(v)}`)
    }

    if (report.diffPercentage >= 0.05 && violations.length === 0) {
      lines.push(`  DIFF: ${diffPct}% pixel difference exceeds 5% threshold.`)
      lines.push(`    Fix: The fallback shell's layout structure may not match the loaded state. Check the relevant Suspense boundary's fallback.`)
    }

    lines.push('')
  }

  if (failed > 0) {
    lines.push('=== NEXT STEPS ===')
    lines.push('1. Fix the Suspense fallback shells for failing routes using the suggestions above.')
    lines.push('2. Re-run: npx playwright test e2e/skeleton-qa.spec.ts')
    lines.push('3. Repeat until all routes pass.')
  } else {
    lines.push('All routes passed. Skeleton layouts match loaded states.')
  }

  return lines.join('\n')
}

async function main() {
  const resultsDir = process.argv[2] || path.join(process.cwd(), 'test-results', 'skeleton-qa')
  const reports = await findReports(resultsDir)

  if (reports.length === 0) {
    console.error('No report.json files found in', resultsDir)
    process.exit(1)
  }

  // Write combined JSON for programmatic use
  const outPath = path.join(resultsDir, 'combined-report.json')
  await fs.writeFile(outPath, JSON.stringify(reports, null, 2))

  // Print agent-readable text to stdout
  console.log(formatReport(reports))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
