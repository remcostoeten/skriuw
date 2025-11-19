import { ReactNode, useState, createContext, useContext } from "react";
import {
  OffcanvasRoot,
  OffcanvasSidebar,
  OffcanvasContent,
  useOffcanvas
} from "@/shared/ui/offcanvas-sidebar";
import { NoteSidebar } from "@/components/note-sidebar";

interface NoteSidebarContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  toggle: () => void;
  activeNote: any;
  setActiveNote: (note: any) => void;
}

const NoteSidebarContext = createContext<NoteSidebarContextType | undefined>(undefined);

interface NoteSidebarProviderProps {
  children: ReactNode;
}

export function NoteSidebarProvider({ children }: NoteSidebarProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeNote, setActiveNote] = useState<any>(null);

  const toggle = () => setIsOpen(prev => !prev);

  const value = {
    isOpen,
    setIsOpen,
    toggle,
    activeNote,
    setActiveNote
  };

  return (
    <NoteSidebarContext.Provider value={value}>
      {children}
    </NoteSidebarContext.Provider>
  );
}

export function useNoteSidebar() {
  const context = useContext(NoteSidebarContext);
  if (context === undefined) {
    throw new Error('useNoteSidebar must be used within a NoteSidebarProvider');
  }
  return context;
}