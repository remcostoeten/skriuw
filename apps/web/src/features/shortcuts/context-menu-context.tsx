import { createContext, useContext, useState, ReactNode } from 'react';

type ContextMenuState = {
  itemId: string | null;
  onDelete: ((id: string) => void) | null;
};

type ContextMenuContextValue = {
  contextMenuState: ContextMenuState;
  setContextMenuState: (state: ContextMenuState) => void;
};

const ContextMenuContext = createContext<ContextMenuContextValue | null>(null);

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [contextMenuState, setContextMenuState] = useState<ContextMenuState>({
    itemId: null,
    onDelete: null,
  });

  return (
    <ContextMenuContext.Provider value={{ contextMenuState, setContextMenuState }}>
      {children}
    </ContextMenuContext.Provider>
  );
}

export function useContextMenuState() {
  const context = useContext(ContextMenuContext);
  if (!context) {
    throw new Error('useContextMenuState must be used within ContextMenuProvider');
  }
  return context;
}