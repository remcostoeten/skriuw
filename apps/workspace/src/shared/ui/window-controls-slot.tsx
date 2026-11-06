import { createContext, useContext, type ComponentType } from "react";

type Props = {
  className?: string;
};

const WindowControlsContext = createContext<ComponentType<Props> | null>(null);

export const WindowControlsProvider = WindowControlsContext.Provider;

export function WindowControlsSlot({ className }: Props) {
  const Controls = useContext(WindowControlsContext);
  return Controls ? <Controls className={className} /> : null;
}
