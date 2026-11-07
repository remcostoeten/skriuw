import { router } from "expo-router";
import { useEffect } from "react";
import { skriuwPlatform } from "../../../modules/skriuw-platform";
import { useChrome } from "../../shell/chrome";
import { createNote } from "../../shell/tree-actions";
import { useWorkspace } from "../../shell/workspace-provider";
import { JOURNAL_CAPTURE_PARAM } from "../journal/navigation";
import { parseQuickActionType, quickActionInbox, type QuickActionType } from "./quick-actions";

export function QuickActionHandler() {
  const { openSheet, closeSheet } = useChrome();
  const session = useWorkspace();

  useEffect(() => {
    function perform(type: QuickActionType): void {
      switch (type) {
        case "new-note":
          closeSheet();
          router.replace("/");
          createNote(session, null).catch(session.reportFailure);
          return;
        case "capture":
          closeSheet();
          router.replace({ pathname: "/journal", params: { [JOURNAL_CAPTURE_PARAM]: "1" } });
          return;
        case "search":
          openSheet("search");
          return;
      }
    }

    function drain(): void {
      const type = quickActionInbox.take();
      if (type !== null) {
        perform(type);
      }
    }

    function receive(reported: string | null): void {
      const type = reported === null ? null : parseQuickActionType(reported);
      if (type !== null) {
        quickActionInbox.deliver(type);
      }
    }

    const stopInbox = quickActionInbox.subscribe(drain);
    const stopNative = skriuwPlatform.subscribeQuickActions(receive);
    receive(skriuwPlatform.takeQuickAction());
    drain();
    return () => {
      stopNative();
      stopInbox();
    };
  }, [closeSheet, openSheet, session]);

  return null;
}
