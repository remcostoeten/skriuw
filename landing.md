# Lovable prompt: Skriuw landing page

Build a highly modern, interactive landing page for Skriuw in this existing
Next.js app. Replace the current minimal `src/app/page.tsx` with a polished
product landing experience that still feels like Skriuw: quiet, focused,
keyboard-first, dark, precise, and useful for people who write, organize, and
reflect every day.

Skriuw is a notes and journal workspace. The product is not a generic AI SaaS
dashboard. It is a focused writing environment with notes, folders, markdown,
rich text, dated journal entries, tags, recents, favorites, command-palette
workflows, mobile support, and Supabase-backed cloud sync.

## Product message

Use this core positioning:

> Skriuw is a quiet workspace for notes and journal entries.

Use supporting copy around these ideas:

- Capture notes quickly without leaving a focused editor.
- Switch between raw markdown and rich block editing.
- Organize notes with folders, tags, recents, and favorites.
- Keep daily journal entries connected to mood, tags, and dates.
- Sync notes, folders, journal entries, and tags through a cloud workspace.
- Continue writing across web and mobile.
- Stay keyboard-first with shortcuts, command palette actions, and fast
  navigation.

Do not oversell. Keep the language calm, concrete, and product-specific.

## Existing style to preserve

The app already has a dark haptic workspace style. Match it instead of creating
a loud marketing page.

Use these existing design cues:

- Dark neutral background: near black, graphite cards, subtle borders.
- Inter as the primary font and JetBrains Mono for tiny metadata or shortcut
  labels.
- Compact, precise controls with `6px` or `8px` radius, not pill-heavy UI.
- Thin `lucide-react` icons with `strokeWidth` around `1.5` to `1.8`.
- Border-led hierarchy, soft backdrop blur, small uppercase metadata, and
  quiet hover states.
- Product shapes inspired by the Skriuw logo: three vertical writing slabs.
- Accent color should be restrained: mostly neutral UI with selective blue,
  white, and warm tag accents for state, mood, and sync signals.

Avoid generic purple gradients, oversized SaaS cards, fake testimonials,
stock-photo hero layouts, cartoon illustrations, and decorative blobs.

## Technical context

Use the repo's current stack:

- Next.js App Router and React.
- Tailwind CSS v4 tokens from `src/app/globals.css`.
- `framer-motion` for interface animation.
- `three` for the hero canvas.
- `lucide-react` for icons.
- Existing `Link` navigation to `/app`, `/sign-in`, and `/sign-up`.

If creating client-only interactive parts, split them into client components.
Keep `src/app/page.tsx` as a clean route entry point where possible.

## Required landing structure

Create a complete first-screen experience, not a placeholder hero.

### Hero

The first viewport must make Skriuw immediately visible. The H1 should include
the brand or literal product category, for example:

> Skriuw keeps notes and journal entries in one quiet workspace.

Place the primary experience in the hero:

- A full-bleed or large unframed Three.js scene, not a small decorative card.
- Foreground product UI fragments layered around the scene: a note editor pane,
  a journal date strip, a command palette chip, tag chips, save/sync status,
  and a slim icon rail.
- Primary CTA: "Open app" linking to `/app`.
- Secondary CTA: "Create account" linking to `/sign-up`.
- Tertiary text link: "Sign in" linking to `/sign-in`.

The hero must hint at the next section on both desktop and mobile.

### Three.js concept

Create a "living workspace graph" that feels like writing context becoming
organized:

- Floating note slabs inspired by the Skriuw logo.
- Thin connection lines between notes, tags, journal dates, and folders.
- A subtle cursor-reactive field that bends the graph toward the pointer.
- Particles that look like small text fragments or markdown marks, not stars.
- One larger active document plane that gently opens, rotates, or breathes.
- Tag nodes with muted blue and warm orange accents.
- A journal timeline arc or calendar beads that orbit slowly in the background.

Interaction requirements:

- Pointer movement updates a target vector and smoothly damps object movement.
- Clicking or tapping the scene emits a restrained ripple through the graph.
- Scrolling advances the scene state: capture, organize, reflect, sync.
- Use `THREE.Clock` with `delta` updates.
- Pause or reduce updates when the scene is off screen.
- Respect `prefers-reduced-motion`; reduce to opacity and tiny transforms.
- Keep the canvas nonblocking and decorative for screen readers.

Do not use a heavy GLTF model unless absolutely necessary. Procedural geometry
is enough and will better match the product.

### Feature bands

After the hero, build sections that feel like parts of the app, not marketing
tiles. Use full-width bands or unframed layouts. Cards are acceptable only for
individual repeated feature items.

Include these sections:

1. Capture
   - Raw markdown and rich block editing.
   - Fast note creation.
   - Autosave or save-status feedback.

2. Organize
   - Folders, drag-and-drop movement, recents, favorites, tags, and metadata.
   - Show a compact file tree and metadata panel motif.

3. Reflect
   - Journal entries by date.
   - Mood, tags, and calendar navigation.
   - Show a mini timeline or calendar interaction.

4. Sync
   - Supabase-backed account workspace.
   - Notes, folders, journal entries, and tags travel across devices.
   - Web and mobile continuity.

5. Keyboard flow
   - Command palette, shortcuts, and quick navigation.
   - Show shortcut keys in small mono labels.

### Interactive product moments

Include at least six meaningful micro interactions:

- Buttons scale to about `0.97` on press.
- Feature rows reveal additional context on hover or focus.
- Tag chips can be toggled in a small demo state.
- A command-palette preview opens from a keyboard shortcut-looking trigger.
- A journal date strip can switch the active date preview.
- A sync badge transitions between "Saved", "Syncing", and "Synced".
- Editor mode toggle switches between "Markdown" and "Blocks".
- The Three.js scene reacts to pointer movement and click ripples.

Use stateful demos where useful, but keep all data local to the landing page.

## Animation direction

Follow these animation rules closely:

- Animate `transform` and `opacity` first.
- Use custom ease-out curves instead of default browser easing.
- Keep most UI transitions under `300ms`.
- Use spring motion for natural drag, hover, or selection movement.
- Use `scale(0.97)` for press feedback.
- Never animate from `scale(0)`. Use `scale(0.95)` or opacity instead.
- Make animations interruptible.
- Use staggered children only where it improves scan order.
- Use blur sparingly to bridge state changes.
- Respect `prefers-reduced-motion` with reduced transforms, not a broken page.

Suggested easing:

```ts
const easeOut = [0.22, 1, 0.36, 1];
const iosSheet = [0.32, 0.72, 0, 1];
```

Suggested durations:

- Hover and press: `120ms` to `180ms`.
- Section reveals: `180ms` to `260ms`.
- Drawer or command-palette preview: `360ms` to `500ms`.
- Three.js motion: frame-based damping with `delta`, not CSS timing.

## Visual composition

The page should feel advanced but not noisy.

Use this composition:

- Sticky top nav with Skriuw logo, section anchors, and CTAs.
- Hero with large product headline, compact copy, CTA group, and live workspace
  scene.
- Below hero, a horizontal "workflow rail" that maps Capture, Organize,
  Reflect, and Sync.
- Alternating dark workspace bands with product UI fragments.
- End with a concise CTA section that feels like a workspace opening, not a
  sales banner.

Make the layout dense enough to feel like a real productivity tool. Avoid
giant empty sections.

## Copy examples

Use or adapt this copy:

- "A quiet workspace for notes and journal entries."
- "Write in markdown when you want speed. Switch to blocks when structure helps."
- "Folders, tags, recents, and favorites keep small pieces of context findable."
- "Daily entries stay connected to mood, dates, and the notes that shaped them."
- "Your cloud workspace keeps notes, folders, journal entries, and tags in
  sync."
- "Keyboard shortcuts and command actions keep the writing flow intact."

Avoid vague claims like "supercharge productivity" or "revolutionize writing."

## Accessibility and responsive behavior

Requirements:

- Fully responsive from mobile to wide desktop.
- Text must not overlap or clip at any viewport.
- Buttons and interactive controls need accessible labels.
- Canvas must have `aria-hidden="true"` if decorative.
- Keyboard users must be able to focus all interactive landing controls.
- Honor `prefers-reduced-motion`.
- Maintain readable contrast on dark surfaces.
- Do not trap scroll or pointer interactions inside the hero canvas.

## Implementation constraints

- Keep the implementation focused on the landing page and any local components
  it needs.
- Use existing design tokens where possible.
- Use `lucide-react` icons rather than custom inline icon SVGs.
- Do not introduce a new UI library.
- Do not create fake backend calls.
- Do not require authentication on the landing page.
- Do not remove existing app routes or auth routes.

## Acceptance criteria

The result is successful when:

- `/` is a complete modern Skriuw landing page.
- The first viewport clearly communicates Skriuw and shows a real-feeling
  interactive product experience.
- Three.js renders a nonblank interactive scene on desktop and mobile.
- Micro interactions feel fast, purposeful, and interruptible.
- Reduced motion mode still produces a polished page.
- CTAs route to `/app`, `/sign-up`, and `/sign-in`.
- The page matches the existing Skriuw dark workspace style.
- There are no obvious layout shifts, text overlaps, hydration errors, or
  console errors.

