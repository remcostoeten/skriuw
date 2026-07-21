# UI architecture editor spike

This isolated browser harness compares direct ProseMirror and direct Lexical state switching without React, routing, desktop IPC, persistence, Markdown parsing, or lazy loading. It is measurement code, not the product UI.

## Run

```bash
cd spikes/ui-architecture
pnpm install --frozen-lockfile
pnpm build
pnpm exec vite preview --host 127.0.0.1 --port 4173
```

Open `http://127.0.0.1:4173`, choose a candidate, rendering strategy, and block count, then run the benchmark. Raw sample JSON remains available in the disclosure below the editor.

The automation boundary is also exposed as `window.__SKRIUW_BENCHMARK__.run(candidate, blockCount, strategy)`, where candidate is `prosemirror` or `lexical`, block count is `50`, `500`, or `2000`, and strategy is `replace` or `retained`.

After a benchmark prepares and mounts a candidate, `window.__SKRIUW_BENCHMARK__.armNativeNavigation(count)` arms trusted ArrowDown measurement. Send physical or browser-automation key input, then call `finishNativeNavigation()`. Synthetic `dispatchEvent` input is not valid evidence.

## Measured contract

- Eight deterministic cached note states are prepared before measurement.
- One outer editor host is mounted once. Replacement uses one editor instance; retained mode stacks eight pre-laid-out editor instances and switches visibility.
- Preparation, mount, and priming cost are recorded outside navigation timing.
- Active and total DOM elements, editor instances, and user-agent-specific memory delta are recorded when Chromium supports the memory API.
- One warm-up is excluded.
- One hundred state switches record synchronous reconciliation, an explicit editor-height read that forces layout, total end-to-layout duration, next-frame opportunity, frame gaps, and long tasks.
- Thirty editor-owned text updates record the same metrics separately.
- Preparation-call counts before and after navigation prove no fixture generation or state parsing entered measured switching.
- Frame duration is estimated from twelve animation frames; a frame gap above 1.5 times that estimate is counted as dropped.
- Native mode records high-resolution handler/layout marks, Event Timing input/processing/presentation fields, and Long Animation Frames when supported.

End-to-layout duration is compared provisionally with the 8 ms P95 and 16.67 ms maximum interaction targets. Synchronous reconciliation and forced-layout time remain separate diagnostic fields. Next-frame timing is reported separately but does not prove presentation because animation-frame callbacks run before paint. Event Timing provides trusted input-to-next-render evidence, but its 16 ms minimum reporting threshold and 8 ms quantization cannot prove the repository's 8 ms P95 target. Browser Long Tasks and Long Animation Frames only cover work above 50 ms and do not satisfy the 8 ms task ceiling. Chrome Performance traces remain required evidence.

## Limits

The first corpus uses equivalent headings, paragraphs, and quotes rather than a final editor schema. Measurements use a headless Chromium process and one development machine. Memory numbers require a fresh browser context and are unavailable where `measureUserAgentSpecificMemory` is unsupported. Paint presentation, Long Animation Frames, selection restoration, undo ownership, IME, native keyboard events, structured Markdown fidelity, and product plugins remain separate gates. No result here selects an editor or establishes a universal budget.
