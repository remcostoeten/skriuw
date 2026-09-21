import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { BackHandler, Platform } from "react-native";
import { createOverlayStack } from "./overlay-stack";
import { createToastHub, type ShellToast, type ToastRequest } from "./toast-hub";

export type SheetName = "tree" | "account" | "search";

export type ShellChrome = {
  sheet: SheetName | null;
  openSheet: (sheet: SheetName) => void;
  closeSheet: () => void;
  toast: ShellToast | null;
  showToast: (request: ToastRequest) => number;
  dismissToast: (id: number) => void;
  runToastAction: (id: number) => void;
};

const ChromeContext = createContext<ShellChrome | null>(null);

type Props = {
  children: ReactNode;
};

/**
 * The chrome's transient state: which sheet is open, what the toast says, and
 * which overlay answers the next back press. Android's hardware back closes
 * the overlay on top and otherwise leaves the application, per ADR-0047.
 */
export function ChromeProvider({ children }: Props) {
  const overlays = useRef(createOverlayStack()).current;
  const toasts = useRef(createToastHub()).current;
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const toast = useSyncExternalStore(toasts.subscribe, toasts.current, toasts.current);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }
    const subscription = BackHandler.addEventListener("hardwareBackPress", () =>
      overlays.handleBack(),
    );
    return () => {
      subscription.remove();
    };
  }, [overlays]);

  useEffect(() => {
    if (sheet === null) {
      return;
    }
    return overlays.open(() => setSheet(null));
  }, [overlays, sheet]);

  const openSheet = useCallback((next: SheetName) => {
    setSheet(next);
  }, []);
  const closeSheet = useCallback(() => {
    setSheet(null);
  }, []);
  const value = useMemo<ShellChrome>(
    () => ({
      sheet,
      openSheet,
      closeSheet,
      toast,
      showToast: toasts.show,
      dismissToast: toasts.dismiss,
      runToastAction: toasts.runAction,
    }),
    [closeSheet, openSheet, sheet, toast, toasts.dismiss, toasts.runAction, toasts.show],
  );

  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>;
}

export function useChrome(): ShellChrome {
  const chrome = useContext(ChromeContext);
  if (!chrome) {
    throw new Error("useChrome was called outside ChromeProvider");
  }
  return chrome;
}
