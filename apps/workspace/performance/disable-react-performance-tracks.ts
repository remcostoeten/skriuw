// react-dom/profiling logs a console.timeStamp per component while a trace records; production react-dom has none, so it must not count against traced budgets.
Object.defineProperty(console, "timeStamp", { value: undefined, configurable: true });
