# CLS Analysis Methodology

## What We're Measuring

Traditional CLS (Core Web Vitals) measures layout shifts during the page lifecycle as
experienced by the user. Our measurement is related but distinct: we compare the
**skeleton state layout** to the **fully loaded layout** to catch shifts that occur
when dynamic content replaces loading UI.

This is specifically the shift a user would perceive during a Next.js navigation where
`loading.tsx` (or a `<Suspense>` fallback) is shown first, then replaced by streamed
content.

## Measurement Approach

### Landmark Tracking

We track "landmark" elements — structural elements that define the page layout:

- `nav` — Navigation bar
- `main` — Primary content area
- `[role="complementary"]` — Sidebar
- `footer` — Page footer
- Custom selectors from config

For each landmark, we capture the `getBoundingClientRect()` in both states and compute
the delta.

### What Constitutes a Shift

A shift is flagged when any of these exceed the threshold (default: 2px):

- **Position shift**: Element moved horizontally or vertically
- **Dimension change**: Element changed width or height

The 2px threshold accounts for sub-pixel rendering differences between states.

### Why Pixel Diff Matters Too

CLS via bounding rects catches structural shifts but misses:

- Content inside a container that causes reflow without moving the container itself
- Background/color changes that indicate missing skeleton styles
- Z-index issues where elements overlap differently

The pixel diff catches these cases. We use `pixelmatch` with a threshold of 0.1
(fairly sensitive) to generate a diff image.

## Interpreting the Diff Percentage

The diff percentage is total changed pixels / total pixels. Context matters:

- **< 5%** — Likely just content differences (text, images). Skeleton layout matches.
- **5-15%** — Some structural differences. Check the diff image for patterns.
- **15-30%** — Significant layout differences. The skeleton is likely missing major
  structural elements.
- **> 30%** — The skeleton and loaded states are fundamentally different layouts.

The default threshold is 5%. For content-heavy pages, you may want to increase this.
For commerce pages with predictable layouts, you may want to decrease it.

## Common CLS Patterns in Next.js

### 1. Missing Height Reservation

**Symptom**: Footer shifts down by hundreds of pixels.

The `loading.tsx` renders a short skeleton, then the real content is much taller.
Fix by giving the skeleton container a `min-height` matching typical content height:

```tsx
// loading.tsx
export default function Loading() {
  return (
    <div className="min-h-[800px]"> {/* Match typical content height */}
      <ProductGridSkeleton count={12} />
    </div>
  )
}
```

### 2. Conditional Layout Elements

**Symptom**: Sidebar appears/disappears between states.

The skeleton doesn't render the sidebar, or renders it at a different width.
Fix by mirroring the grid layout exactly:

```tsx
// loading.tsx
export default function Loading() {
  return (
    <div className="grid grid-cols-[250px_1fr] gap-6">
      <aside className="animate-pulse bg-muted rounded h-[600px]" />
      <main>
        <ContentSkeleton />
      </main>
    </div>
  )
}
```

### 3. Layout-Level Data Fetching

**Symptom**: The entire layout shifts, not just page content.

Data fetching in `layout.tsx` blocks the layout from rendering until data arrives,
but `loading.tsx` only wraps the page slot. Fix by moving data fetching to `page.tsx`
or wrapping it in `<Suspense>` within the layout:

```tsx
// layout.tsx
export default function Layout({ children }) {
  return (
    <div>
      <Suspense fallback={<NavSkeleton />}>
        <Nav /> {/* Nav fetches its own data */}
      </Suspense>
      {children}
    </div>
  )
}
```

### 4. Font Loading Shifts

**Symptom**: Small but consistent horizontal shifts across all text elements.

Custom fonts loading after the skeleton state cause text reflow. Fix with
`font-display: optional` or `next/font` with `display: swap` and appropriate
`size-adjust`:

```tsx
import { Inter } from 'next/font/google'
const inter = Inter({ subsets: ['latin'], display: 'swap' })
```

### 5. Image Container Collapse

**Symptom**: Image areas collapse to 0 height in skeleton, then expand.

Images without explicit dimensions cause layout shift. Fix with aspect-ratio
containers in the skeleton:

```tsx
<div className="aspect-[4/3] animate-pulse bg-muted rounded" />
```

## Multi-Viewport Considerations

CLS patterns often differ between desktop and mobile:

- **Responsive grids** may have different column counts, so sidebar-related CLS
  only appears on desktop
- **Sticky headers** may behave differently, affecting position calculations
- **Font sizes** differ, so text reflow CLS may only appear at certain breakpoints

Always test at least desktop (1280×720) and mobile (375×812) viewports.
