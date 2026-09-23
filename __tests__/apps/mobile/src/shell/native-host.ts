import { createElement, Fragment, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Renders a React Native component tree in Node without a native runtime.
 *
 * The mobile suite loads `react-native-stub.ts` for `react-native` and
 * `shell-stubs.ts` for the shell modules that need a provider. Every host view
 * records the props it rendered with, so a test can read roles, labels, sizes
 * and handlers off the tree a screen reader and a finger would meet.
 */

export type HostNode = { type: string; props: Record<string, unknown> };

type Style = Record<string, unknown>;

const recorded: HostNode[] = [];
let workspaceValue: unknown = null;

/** A host view that records its props and renders its children. */
export function host(type: string) {
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

export function currentWorkspaceValue(): unknown {
  return workspaceValue;
}

/** Hosts a finger or a screen reader can activate. */
export function interactiveHosts(hosts: readonly HostNode[]): HostNode[] {
  return hosts.filter(
    (node) =>
      typeof node.props.onPress === "function" ||
      typeof node.props.onAccessibilityAction === "function",
  );
}
