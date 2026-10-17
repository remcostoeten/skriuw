import { useCallback, useSyncExternalStore } from "react";
import {
  annotationMenuStateEqual,
  closedAnnotationMenu,
  type AnnotationMenuState,
} from "../annotations/menu";
import { closedLinkMenu, linkMenuStateEqual, type LinkMenuState } from "../links/menu";
import { bubbleMenuStateEqual, closedBubbleMenu, type BubbleMenuState } from "./bubble";

type MenuStates = {
  bubble: BubbleMenuState;
  link: LinkMenuState;
  annotation: AnnotationMenuState;
};

type MenuKey = keyof MenuStates;

type MenuUpdate<Key extends MenuKey> =
  | MenuStates[Key]
  | ((previous: MenuStates[Key]) => MenuStates[Key]);

export type EditorMenuStore = {
  get<Key extends MenuKey>(key: Key): MenuStates[Key];
  set<Key extends MenuKey>(key: Key, next: MenuUpdate<Key>): void;
  subscribe(key: MenuKey, listener: () => void): () => void;
};

const menuEquality: {
  [Key in MenuKey]: (left: MenuStates[Key], right: MenuStates[Key]) => boolean;
} = {
  bubble: bubbleMenuStateEqual,
  link: linkMenuStateEqual,
  annotation: annotationMenuStateEqual,
};

function resolveUpdate<Key extends MenuKey>(
  next: MenuUpdate<Key>,
  previous: MenuStates[Key],
): MenuStates[Key] {
  return typeof next === "function" ? next(previous) : next;
}

/**
 * @name createEditorMenuStore
 * @description Holds the bubble, link and annotation menu states outside React
 * state. A write that equals the stored value is dropped, and a real change
 * notifies only the listeners of that menu, so the editor never re-renders for
 * a menu update and a menu re-renders only when its own state moved.
 *
 * @example
 * const menus = createEditorMenuStore();
 * menus.set("link", closedLinkMenu);
 * const unsubscribe = menus.subscribe("link", () => render(menus.get("link")));
 */
export function createEditorMenuStore(): EditorMenuStore {
  const states: MenuStates = {
    bubble: closedBubbleMenu,
    link: closedLinkMenu,
    annotation: closedAnnotationMenu,
  };
  const listeners: { [Key in MenuKey]: Set<() => void> } = {
    bubble: new Set(),
    link: new Set(),
    annotation: new Set(),
  };
  return {
    get: (key) => states[key],
    set: (key, next) => {
      const previous = states[key];
      const resolved = resolveUpdate(next, previous);
      if (menuEquality[key](previous, resolved)) return;
      states[key] = resolved;
      for (const listener of listeners[key]) listener();
    },
    subscribe: (key, listener) => {
      listeners[key].add(listener);
      return () => {
        listeners[key].delete(listener);
      };
    },
  };
}

/**
 * @name useEditorMenuValue
 * @description Reads a value derived from one menu's state and re-renders only
 * when that derived value changes, for callers that need one field rather than
 * the whole menu.
 *
 * @example
 * const activeThreadId = useEditorMenuValue(menus, "annotation", (menu) =>
 *   menu.open ? menu.threadId : "",
 * );
 */
export function useEditorMenuValue<Key extends MenuKey, Value>(
  store: EditorMenuStore,
  key: Key,
  select: (state: MenuStates[Key]) => Value,
): Value {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(key, listener),
    [store, key],
  );
  function getSnapshot(): Value {
    return select(store.get(key));
  }
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * @name useEditorMenu
 * @description Subscribes a component to one menu's state in the editor menu
 * store and re-renders it only when that menu's state changes.
 *
 * @example
 * function ConnectedLinkMenu({ menus }: Props) {
 *   const state = useEditorMenu(menus, "link");
 *   return <LinkMenu state={state} />;
 * }
 */
export function useEditorMenu<Key extends MenuKey>(
  store: EditorMenuStore,
  key: Key,
): MenuStates[Key] {
  return useEditorMenuValue(store, key, (state) => state);
}
