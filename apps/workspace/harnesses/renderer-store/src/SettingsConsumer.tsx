import { recordRender } from "./ledger";
import { useRendererSelector } from "./useRendererSelector";
import type { RendererStore } from "./types";

type Props = {
  store: RendererStore;
};

function selectSettings(state: ReturnType<RendererStore["getState"]>) {
  return state.settingsSelection;
}

export function SettingsConsumer({ store }: Props) {
  recordRender("SettingsConsumer");
  const selection = useRendererSelector(store, selectSettings);
  return <span className="settings-consumer">settings / {selection}</span>;
}
