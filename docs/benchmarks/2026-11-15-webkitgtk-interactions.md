# WebKitGTK interactions

Date: 2026-11-15

Revisions: `perf/webview-rig` against its base `a1d0312e2`.

Reference machine: `remcostoeten`, Intel Core i7-10700F, NVIDIA RTX 3060 Ti
(driver 610.57.04), Arch Linux 7.2.9, WebKitGTK 2.54.1, KDE Plasma on
Wayland. Displays: 3840x2160 at 150% scale and 2560x1440. Load average 2.1 to
3.6 during the runs.

## Method

The `performance/` page (the real `<App>` on the `wide-1000` fixture with 150
block notes, `varied` content, bridge mocked) was built twice with
`performance/vite.config.ts`: a production build for timings and an
unminified one (`--minify false --outDir performance/dist-profile`) for
attribution. Both were served statically and loaded in a bare WebKitGTK 4.1
window by the `tauri-webview-perf` rig at 3840x2112 device pixels (2560x1408
CSS pixels, device pixel ratio 1.5), on the software rendering path.
`performance/rig.app.js` describes the interactions.

`painted` is two animation frames after the DOM shows the result, median of 6
to 16 samples. `commits` counts React commits in the window.

## Results

| Interaction | Painted before (ms) | Painted after (ms) | Commits before | Commits after |
| --- | ---: | ---: | ---: | ---: |
| Open Tasks (581 tasks) | 316 | 95 | 3 | 19 |
| Command menu open | 194 | 132 | 2 | 2 |
| Settings open | 230 | 185 | 3 | 3 |
| Settings close | 148 | 120 | 2 | 2 |
| Search close | 231 | 215 | 3 | 3 |
| Note switch (cached) | 81 | 93 | 4 | 4 |
| Back to Notes | 105 | 94 | 3 | 3 |
| Sidebar toggle | 48 | 46 | 1 | 1 |
| Metadata toggle | 74 | 71 | 5 | 5 |

Note switch, sidebar and metadata toggles did not change in code; their
differences are run-to-run noise.

Opening Tasks first mounted 3106 components in one commit (55 to 71 ms of
render) and then spent about 200 ms in one style and layout pass. It now
mounts 601 components first and the remaining rows in 60-row commits after
each paint, each 10 ms or less of render. The extra commits are that growth.

`focus()` plus `blur()` on a sidebar button took 3 to 5 ms before and 1 ms
after.

## Causes and fixes

- Tasks rendered every row at once. The first 80 rows mount with the view,
  the rest after each paint, and `content-visibility: auto` on rows skips
  layout for rows off screen. Without `content-visibility` the same change
  painted at 116 ms.
- Tailwind compiles `group-focus-within:` to `:where(.group):focus-within *`.
  WebKit cannot see the class inside `:where()`, so each focus change
  restyled the subtree of every ancestor. The variant is redefined as
  `:is(.group:focus-within *)`.
- Every native modal `<dialog>` open and close restyled the whole document,
  because WebKit computes `inert` as style. An empty dialog's `showModal()`
  plus `close()` cost 71 to 87 ms here; showing and hiding the same dialog as
  a manual popover costs 1 ms. Dialogs now open with `show()` plus
  `showPopover()`, which keeps them in the top layer with their `::backdrop`
  and `dialog[open]`, and a transparent popover under each one takes the
  pointer input the page used to refuse. Tab wraps inside the dialog and
  `aria-modal` is set. The whole-document recalculation inside `close()`
  (38 to 40 ms) and after `showModal()` (36 to 40 ms) no longer appears in the
  timeline; settings close went from 43 ms to 4 ms of synchronous work. Those
  runs overlapped with a game using about 175% CPU, so painted times from
  them are left out.

## Not changed

- Style resolution costs about 13 microseconds per element in this app under
  WebKitGTK. Removing all CSS still leaves 31 ms for the modal flip; no single
  rule or layer dominates.
- Search close waits for its 200 ms exit animation by design.
- After Settings opens, WebKitGTK repaints the content scrollbar strip at
  60 Hz for a few seconds (overlay scrollbar fade, about 2 ms a frame).

## Rendering paths

Synthetic probe, frames per second, rig window:

| Path | Size | Idle | Transform | Opacity | Scroll |
| --- | --- | ---: | ---: | ---: | ---: |
| Software | 3840x2112 device px | 62.5 | 24.2 | 24.3 | 43.0 |
| GPU, shared memory | 3840x2112 device px | 62.4 | 24.0 | 24.2 | 42.6 |
| GPU, native Wayland | 2560x1408 CSS px, dpr 2 | 62.7 | 13.1 | 12.6 | 14.8 |

The rig's Wayland window renders at scale 2 on the 150% display, 5120x2816
device pixels, and was as slow on a blank page.

Real debug binary (`tauri build --debug --no-bundle`), maximized, isolated
profile and `SKRIUW_DB`, the app's own choice of path (native Wayland, GPU):
62.2 idle, 58.7 transform, 58.9 opacity, 60.0 scroll, at 2560x1408 with a
device pixel ratio of 1. The window opened on the 2560x1440 display, so the
4K display was not measured with the real binary. Forcing software with
`SKRIUW_GDK_BACKEND=x11 WEBKIT_DISABLE_DMABUF_RENDERER=1` failed to start GTK
in this session. Mesa drivers were not tested.
