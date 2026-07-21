# UI architecture editor spike

This isolated browser harness compares direct ProseMirror and direct Lexical state switching without React, routing, desktop IPC, persistence, Markdown parsing, or lazy loading. It is measurement code, not the product UI.

## Run

```bash
cd spikes/ui-architecture
pnpm install --frozen-lockfile
pnpm build
pnpm exec vite preview --host 127.0.0.1 --port 4173
```

Open `http://127.0.0.1:4173`, choose a candidate and block count, then run the benchmark. Raw sample JSON remains available in the disclosure below the editor.

The automation boundary is also exposed as `window.__SKRIUW_BENCHMARK__.run(candidate, blockCount)`, where candidate is `prosemirror` or `lexical` and block count is `50`, `500`, or `2000`.

## Measured contract

- Eight deterministic cached note states are prepared before measurement.
- One persistent editor host is mounted once.
- One warm-up is excluded.
- One hundred state switches record synchronous reconciliation, forced layout, next-frame opportunity, frame gaps, and long tasks.
- Thirty editor-owned text updates record the same metrics separately.
- Preparation-call counts before and after navigation prove no fixture generation or state parsing entered measured switching.
- Frame duration is estimated from twelve animation frames; a frame gap above 1.5 times that estimate is counted as dropped.

Synchronous reconciliation is compared with the 8 ms P95 and 16.67 ms maximum interaction targets. Next-frame timing is reported separately and is not mislabeled as synchronous editor work.

## Limits

The first corpus uses equivalent headings, paragraphs, and quotes rather than a final editor schema. Measurements use a headless Chromium process and one development machine. Memory, selection restoration, undo ownership, IME, native keyboard events, structured Markdown fidelity, and product plugins remain separate gates. No result here selects an editor or establishes a universal budget.
