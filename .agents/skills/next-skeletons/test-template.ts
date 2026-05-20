/**
 * Skeleton QA Test Template
 *
 * This Playwright test uses next-playwright's `instant()` API to capture
 * loading/skeleton states and compare them against fully loaded states,
 * detecting CLS and visual mismatches.
 *
 * Output is structured plain text printed to stdout so an agent can
 * read it directly and fix loading.tsx files without human intervention.
 *
 * Usage:
 *   1. Copy this file into your project's e2e/ directory
 *   2. Adjust the config import or inline your routes
 *   3. Run: npx playwright test skeleton-qa.spec.ts
 */

import { test, expect } from '@playwright/test'
import { instant } from '@next/playwright'
import fs from 'fs/promises'
import path from 'path'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

// ---------------------------------------------------------------------------
// Configuration — override with skeleton-qa.config.ts or inline here
// ---------------------------------------------------------------------------

interface SkeletonQAConfig {
  routes: string[]
  clsThreshold: number
  diffThreshold: number
  viewports: Array<{ width: number; height: number; name: string }>
  landmarks: string[]
  settleTime: number
}

const DEFAULT_CONFIG: SkeletonQAConfig = {
  routes: ['/'],
  clsThreshold: 2,
  diffThreshold: 0.05,
  viewports: [
    { width: 1280, height: 720, name: 'desktop' },
    { width: 375, height: 812, name: 'mobile' },
  ],
  landmarks: ['nav', 'main', '[role="complementary"]', 'footer'],
  settleTime: 1000,
}

let config: SkeletonQAConfig = DEFAULT_CONFIG

// Try to load project config — falls back to defaults silently
try {
  const userConfig = require('../skeleton-qa.config')
  config = { ...DEFAULT_CONFIG, ...userConfig.default ?? userConfig }
} catch {
  // No config file found — using defaults
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BoundingRect {
  selector: string
  x: number
  y: number
  width: number
  height: number
  exists: boolean
}

interface CLSResult {
  selector: string
  skeleton: BoundingRect
  loaded: BoundingRect
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Measure bounding rects for all landmark selectors on the current page.
 */
async function measureLandmarks(
  page: import('@playwright/test').Page,
  selectors: string[]
): Promise<BoundingRect[]> {
  return page.evaluate((sels) => {
    return sels.map((selector) => {
      const el = document.querySelector(selector)
      if (!el) {
        return { selector, x: 0, y: 0, width: 0, height: 0, exists: false }
      }
      const rect = el.getBoundingClientRect()
      return {
        selector,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        exists: true,
      }
    })
  }, selectors)
}

/**
 * Compare two sets of bounding rects and compute shifts.
 */
function computeCLS(
  skeletonRects: BoundingRect[],
  loadedRects: BoundingRect[],
  threshold: number
): CLSResult[] {
  return skeletonRects.map((skeleton, i) => {
    const loaded = loadedRects[i]
    const deltaX = Math.abs(skeleton.x - loaded.x)
    const deltaY = Math.abs(skeleton.y - loaded.y)
    const deltaWidth = Math.abs(skeleton.width - loaded.width)
    const deltaHeight = Math.abs(skeleton.height - loaded.height)
    const shifted =
      (skeleton.exists && loaded.exists) &&
      (deltaX > threshold || deltaY > threshold ||
       deltaWidth > threshold || deltaHeight > threshold)

    return {
      selector: skeleton.selector,
      skeleton,
      loaded,
      deltaX,
      deltaY,
      deltaWidth,
      deltaHeight,
      shifted,
    }
  })
}

/**
 * Run pixelmatch on two screenshot buffers. Returns diff percentage and
 * optionally writes the diff image to disk.
 */
async function compareScreenshots(
  skeletonBuffer: Buffer,
  loadedBuffer: Buffer,
  diffOutputPath: string
): Promise<number> {
  const skeletonPng = PNG.sync.read(skeletonBuffer)
  const loadedPng = PNG.sync.read(loadedBuffer)

  const width = Math.max(skeletonPng.width, loadedPng.width)
  const height = Math.max(skeletonPng.height, loadedPng.height)

  const normalize = (src: PNG): PNG => {
    if (src.width === width && src.height === height) return src
    const out = new PNG({ width, height })
    for (let i = 0; i < out.data.length; i += 4) {
      out.data[i] = 255
      out.data[i + 1] = 255
      out.data[i + 2] = 255
      out.data[i + 3] = 255
    }
    PNG.bitblt(src, out, 0, 0, src.width, src.height, 0, 0)
    return out
  }

  const normSkeleton = normalize(skeletonPng)
  const normLoaded = normalize(loadedPng)
  const diff = new PNG({ width, height })

  const numDiffPixels = pixelmatch(
    normSkeleton.data as unknown as Uint8Array,
    normLoaded.data as unknown as Uint8Array,
    diff.data as unknown as Uint8Array,
    width,
    height,
    { threshold: 0.1 }
  )

  await fs.mkdir(path.dirname(diffOutputPath), { recursive: true })
  await fs.writeFile(diffOutputPath, PNG.sync.write(diff))

  return numDiffPixels / (width * height)
}

/**
 * Suggest a fix for a CLS violation based on the pattern.
 */
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

/**
 * Print a structured, agent-readable summary of the test results.
 */
function printReport(report: RouteReport) {
  const status = report.passed ? 'PASS' : 'FAIL'
  const diffPct = (report.diffPercentage * 100).toFixed(1)
  const violations = report.cls.filter(c => c.shifted)
  const missingInSkeleton = report.cls.filter(c => !c.skeleton.exists && c.loaded.exists)
  const missingInLoaded = report.cls.filter(c => c.skeleton.exists && !c.loaded.exists)

  console.log('')
  console.log(`--- ${status} [${report.viewport}] ${report.route} ---`)
  console.log(`Pixel diff: ${diffPct}% (threshold: ${(config.diffThreshold * 100).toFixed(1)}%)`)
  console.log(`CLS violations: ${violations.length}`)

  if (missingInSkeleton.length > 0) {
    console.log(`Elements missing from skeleton: ${missingInSkeleton.map(c => c.selector).join(', ')}`)
  }
  if (missingInLoaded.length > 0) {
    console.log(`Elements in skeleton but not in loaded state: ${missingInLoaded.map(c => c.selector).join(', ')}`)
  }

  for (const v of violations) {
    console.log(`  SHIFT: ${v.selector} moved (${v.deltaX}px, ${v.deltaY}px), size delta (${v.deltaWidth}px, ${v.deltaHeight}px)`)
    console.log(`    Fix: ${suggestFix(v)}`)
  }

  if (report.diffPercentage >= config.diffThreshold && violations.length === 0) {
    console.log(`  DIFF: ${diffPct}% pixel difference exceeds threshold.`)
    console.log(`    Fix: The fallback shell's layout structure may not match the loaded state. Check the relevant Suspense boundary's fallback.`)
  }

  if (report.passed) {
    console.log('  No issues.')
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const resultsDir = path.join(process.cwd(), 'test-results', 'skeleton-qa')

for (const viewport of config.viewports) {
  for (const route of config.routes) {
    const routeSlug = route.replace(/\//g, '_').replace(/^_/, '') || 'index'
    const testName = `[${viewport.name}] ${route} — skeleton vs loaded`

    test(testName, async ({ page, baseURL }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      })

      const outputDir = path.join(resultsDir, viewport.name, routeSlug)
      await fs.mkdir(outputDir, { recursive: true })

      // ---------------------------------------------------------------
      // Phase 1: Capture the LOADED state
      // ---------------------------------------------------------------
      await page.goto(route, { waitUntil: 'networkidle' })
      await page.waitForTimeout(config.settleTime)

      const loadedScreenshot = await page.screenshot({ fullPage: true })
      await fs.writeFile(path.join(outputDir, 'loaded.png'), loadedScreenshot)

      const loadedRects = await measureLandmarks(page, config.landmarks)

      // ---------------------------------------------------------------
      // Phase 2: Capture the SKELETON state using instant()
      // ---------------------------------------------------------------
      let skeletonScreenshot: Buffer
      let skeletonRects: BoundingRect[]

      await instant(
        page,
        async () => {
          await page.goto(route)
          await page.waitForTimeout(200)

          skeletonScreenshot = await page.screenshot({ fullPage: true })
          await fs.writeFile(
            path.join(outputDir, 'skeleton.png'),
            skeletonScreenshot
          )

          skeletonRects = await measureLandmarks(page, config.landmarks)
        },
        { baseURL: baseURL ?? undefined }
      )

      // ---------------------------------------------------------------
      // Phase 3: CLS Analysis
      // ---------------------------------------------------------------
      const clsResults = computeCLS(
        skeletonRects!,
        loadedRects,
        config.clsThreshold
      )

      const clsViolations = clsResults.filter((r) => r.shifted)

      // ---------------------------------------------------------------
      // Phase 4: Pixel Diff
      // ---------------------------------------------------------------
      const diffPercentage = await compareScreenshots(
        skeletonScreenshot!,
        loadedScreenshot,
        path.join(outputDir, 'diff.png')
      )

      // ---------------------------------------------------------------
      // Phase 5: Write Report & Print Results
      // ---------------------------------------------------------------
      const report: RouteReport = {
        route,
        viewport: viewport.name,
        cls: clsResults,
        diffPercentage,
        passed: clsViolations.length === 0 && diffPercentage < config.diffThreshold,
      }

      await fs.writeFile(
        path.join(outputDir, 'report.json'),
        JSON.stringify(report, null, 2)
      )

      // Print agent-readable output to stdout
      printReport(report)

      // ---------------------------------------------------------------
      // Assertions
      // ---------------------------------------------------------------
      expect(
        clsViolations,
        `${clsViolations.length} landmark(s) shifted between skeleton and loaded states`
      ).toHaveLength(0)

      expect(
        diffPercentage,
        `Pixel diff is ${(diffPercentage * 100).toFixed(1)}% — above the ` +
        `${(config.diffThreshold * 100).toFixed(1)}% threshold`
      ).toBeLessThan(config.diffThreshold)
    })
  }
}
