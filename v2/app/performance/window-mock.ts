type Unlisten = () => void;

const performanceWindow = {
  isMaximized: () => Promise.resolve(false),
  onResized: () => Promise.resolve(() => undefined as void) as Promise<Unlisten>,
  minimize: () => Promise.resolve(),
  toggleMaximize: () => Promise.resolve(),
  close: () => Promise.resolve(),
};

export function getCurrentWindow(): typeof performanceWindow {
  return performanceWindow;
}
