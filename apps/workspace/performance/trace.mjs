const SCENARIO_PHASES = [
  "save-pause",
  "pending-save-switch",
  "bubble-hold",
  "sidebar-collapse",
  "sidebar-expand",
  "scroll",
];
const SAVE_MARK = "bridge:apply_workspace_operations";
const MAIN_THREAD_TASK = "ThreadControllerImpl::RunTask";

/**
 * @name summarizeTraceEvents
 * @description Summarizes the durations of complete trace events in milliseconds.
 * @example
 * summarizeTraceEvents(events.filter((event) => event.name === "FireIdleCallback"));
 */
export function summarizeTraceEvents(events) {
  const samples = events
    .filter((event) => typeof event.dur === "number")
    .map((event) => event.dur / 1_000);
  const sorted = [...samples].sort((left, right) => left - right);
  function at(fraction) {
    return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
  }
  return {
    count: samples.length,
    samplesMs: samples,
    p50Ms: at(0.5),
    p95Ms: at(0.95),
    p99Ms: at(0.99),
    maxMs: sorted.at(-1) ?? 0,
  };
}

/**
 * @name traceSummary
 * @description Summarizes `EventDispatch` durations for one DOM event type.
 * @example
 * traceSummary(events, "keydown").maxMs;
 */
export function traceSummary(events, eventType) {
  return summarizeTraceEvents(
    events.filter(
      (event) => event.name === "EventDispatch" && event.args?.data?.type === eventType,
    ),
  );
}

function isMark(event) {
  return typeof event.cat === "string" && event.cat.includes("blink.user_timing");
}

function phaseWindows(marks, name) {
  const starts = marks.filter((mark) => mark.name === `phase:${name}:start`);
  const ends = marks.filter((mark) => mark.name === `phase:${name}:end`);
  return starts.flatMap((start) => {
    const end = ends.find((candidate) => candidate.ts >= start.ts);
    return end ? [{ start: start.ts, end: end.ts }] : [];
  });
}

function inside(windows, timestamp) {
  return windows.some((window) => timestamp >= window.start && timestamp <= window.end);
}

/**
 * @name scenarioTrace
 * @description Attributes main-thread tasks from a trace to the harness scenario phases, using
 * the `phase:<name>:start|end` user timing marks, and finds the task that ran each save.
 * @example
 * const trace = scenarioTrace(events);
 * trace.windows.scroll.longestTaskMs;
 */
export function scenarioTrace(events) {
  const marks = events.filter(isMark).sort((left, right) => left.ts - right.ts);
  const anchor = marks.find((mark) => mark.name.startsWith("phase:"));
  if (!anchor) {
    return { windows: {}, saveTasksMs: {} };
  }
  function mainThread(event) {
    return event.pid === anchor.pid && event.tid === anchor.tid;
  }
  const tasks = events.filter(
    (event) =>
      event.name === MAIN_THREAD_TASK && typeof event.dur === "number" && mainThread(event),
  );
  const dispatches = events.filter((event) => event.name === "EventDispatch" && mainThread(event));
  const saveMarks = marks.filter((mark) => mark.name === SAVE_MARK);
  const windows = {};
  const saveTasksMs = {};
  for (const name of SCENARIO_PHASES) {
    const ranges = phaseWindows(marks, name);
    if (ranges.length === 0) {
      continue;
    }
    const phaseTasks = tasks.filter((task) => inside(ranges, task.ts));
    const durations = phaseTasks.map((task) => task.dur / 1_000);
    const phaseDispatches = dispatches.filter((event) => inside(ranges, event.ts));
    function dispatchSummary(type) {
      return summarizeTraceEvents(
        phaseDispatches.filter((event) => event.args?.data?.type === type),
      );
    }
    windows[name] = {
      taskCount: durations.length,
      busyMs: durations.reduce((total, duration) => total + duration, 0),
      longestTaskMs: durations.length === 0 ? 0 : Math.max(...durations),
      tasksOver8Ms: durations.filter((duration) => duration > 8).length,
      tasksOver16Ms: durations.filter((duration) => duration > 16.67).length,
      keydown: dispatchSummary("keydown"),
      click: dispatchSummary("click"),
      mousedown: dispatchSummary("mousedown"),
      wheel: dispatchSummary("wheel"),
    };
    saveTasksMs[name] = saveMarks
      .filter((mark) => inside(ranges, mark.ts))
      .flatMap((mark) => {
        const task = tasks.find(
          (candidate) => candidate.ts <= mark.ts && mark.ts <= candidate.ts + candidate.dur,
        );
        return task ? [task.dur / 1_000] : [];
      });
  }
  return { windows, saveTasksMs };
}
