# Product tree N4 integration measurement

Date: 2026-07-23

Revision: `1e426ba335fe75d545c77ac03dba560582f9762c`

Command:

```bash
node app/performance/run.mjs \
  --output docs/benchmarks/raw/2026-07-23-product-tree-n4.json
```

## Scope

N4 ports the fixed-row virtual tree into the product shell, persists folder
expansion as native-only SQLite state, and clamps visual indentation without
changing semantic depth. The production runner uses the real React shell,
external store, persistent ProseMirror editor, deterministic 1,000- and
5,000-node fixtures, trusted keyboard input, Chrome traces, and fresh browser
profiles.

## Correctness result

Every deterministic assertion passed:

- 36 tree items were mounted for both the 1,000- and 5,000-node fixtures.
- Total DOM fell to 348 elements at 1,000 nodes and 490 at 5,000 nodes.
- The shell stayed within the viewport and produced no horizontal overflow.
- The editor host and view remained mounted.
- Navigation issued no bridge calls and loaded no resources.
- Typing produced zero React commits.
- One hundred keyboard switches completed with zero observed dropped frames.
- The 2,000-block editor retained its 192-block DOM cap and whole-document
  accessibility surface.

A separate browser review at a 2,053 CSS-pixel viewport rendered 76 rows,
kept the shell exactly viewport-height, exposed the focused virtual row through
`aria-activedescendant`, showed meaningful content, and produced no console
errors or Vite overlay. The product pool is viewport-bounded up to 80 rows,
not globally fixed to the 36 rows needed by the recorded runner viewport.

## Timing result

| Fixture | Editor install P95 / max | Keystroke-to-paint P95 / max | Dropped switch frames |
| --- | ---: | ---: | ---: |
| wide-1000 / 50 blocks | 4.1 / 6.6 ms | 7.1 / 7.2 ms | 0 |
| wide-5000 / 500 blocks | 7.4 / 15.2 ms | 7.0 / 7.1 ms | 0 |
| wide-5000 / 2,000 blocks | 4.9 / 17.2 ms | 6.9 / 7.9 ms | 0 |

The 2,000-block maximum missed the 16.67 ms ceiling once by 0.53 ms.
Selection-dispatch P95 values were 9.2, 10.5, and 8.3 ms, while an immediately
preceding same-source review run recorded 3.5, 10.9, and 10.8 ms. Timing is
therefore evidence, not release sign-off. C3 retains the fixed-runner gate and
must not hide this variance.

## Limitations

- Linux Chrome only; native WebKit, Windows, and macOS were not measured here.
- The host was not isolated from normal desktop activity.
- Event Timing remains censored and does not replace Chrome trace evidence.
- This run proves a bounded product DOM and exploratory interaction behavior,
  not the final reference-hardware release claim.

Complete raw samples and machine metadata are in
`docs/benchmarks/raw/2026-07-23-product-tree-n4.json`.
