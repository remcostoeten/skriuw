import Module = require("node:module");
import { createElement, Fragment, type ReactElement, type ReactNode } from "react";

/**
 * Renders a React Native component tree in Node without a native runtime.
 *
 * `react-native` and the shell modules that need a provider are replaced by
 * stubs, and every host view records the props it rendered with, so a test can
 * read roles, labels, sizes and handlers off the tree a screen reader and a
 * finger would meet.
 */

export type HostNode = { type: string; props: Record<string, unknown> };

type Style = Record<string, unknown>;

type ModuleLoader = { _load: (request: string, parent: unknown, isMain: boolean) => unknown };

const recorded: HostNode[] = [];
let workspaceValue: unknown = null;

function host(type: string) {
  return function HostView(props: { children?: ReactNode }) {
    recorded.push({ type, props: props as Record<string, unknown> });
    return createElement(Fragment, null, props.children);
  };
}

/** Flattens a React Native style prop the way the native side reads it. */
export function flattenStyle(style: unknown): Style {
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.map(flattenStyle)) as Style;
  }
  return style !== null && typeof style === "object" ? (style as Style) : {};
}

class AnimatedValue {
  setValue(): void {}
  interpolate(): number {
    return 0;
  }
}

const reactNative = {
  Animated: {
    View: host("Animated.View"),
    Value: AnimatedValue,
    timing: () => ({ start: () => undefined, stop: () => undefined }),
  },
  Easing: { bezier: () => (value: number) => value },
  Modal: host("Modal"),
  PanResponder: { create: () => ({ panHandlers: {} }) },
  Pressable: host("Pressable"),
  ScrollView: host("ScrollView"),
  StyleSheet: {
    create: <T,>(styles: T) => styles,
    flatten: flattenStyle,
    hairlineWidth: 1,
    absoluteFill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  },
  Text: host("Text"),
  View: host("View"),
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
};

const shellStubs: Record<string, unknown> = {
  theme: { useTheme: () => ({ color: () => "#000000" }) },
  icons: { ShellIcon: host("ShellIcon") },
  "workspace-provider": { useWorkspaceSelector: () => workspaceValue },
};

const stubs: Record<string, unknown> = {
  "react-native": reactNative,
  "react-native-safe-area-context": {
    useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 16, left: 0 }),
  },
};

const loader = Module as unknown as ModuleLoader;
const load = loader._load;
loader._load = function loadWithStubs(request, parent, isMain) {
  const direct = stubs[request];
  if (direct !== undefined) {
    return direct;
  }
  const shell = /(?:^\.\/|\/shell\/)(theme|icons|workspace-provider)$/.exec(request);
  if (shell?.[1] !== undefined) {
    return shellStubs[shell[1]];
  }
  return load.call(this, request, parent, isMain);
};

const { renderToStaticMarkup } = require("react-dom/server") as {
  renderToStaticMarkup: (element: ReactElement) => string;
};

/** Renders once and returns every host view in render order. */
export function renderHosts(element: ReactElement): HostNode[] {
  recorded.length = 0;
  renderToStaticMarkup(element);
  return [...recorded];
}

/** The value `useWorkspaceSelector` returns for the next render. */
export function setWorkspaceValue(value: unknown): void {
  workspaceValue = value;
}

/** Hosts a finger or a screen reader can activate. */
export function interactiveHosts(hosts: readonly HostNode[]): HostNode[] {
  return hosts.filter(
    (node) =>
      typeof node.props.onPress === "function" ||
      typeof node.props.onAccessibilityAction === "function",
  );
}
