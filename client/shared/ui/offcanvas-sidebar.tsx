import { cn } from "@/lib/utils";
import { createContext, useContext, useState, type ReactNode } from "react";

interface OffcanvasContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  toggle: () => void;
}

const OffcanvasContext = createContext<OffcanvasContextType | undefined>(undefined);

interface OffcanvasProviderProps {
  children: ReactNode;
  defaultOpen?: boolean;
}

export function OffcanvasProvider({ children, defaultOpen = false }: OffcanvasProviderProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const toggle = () => setIsOpen(prev => !prev);

  return (
    <OffcanvasContext.Provider value={{ isOpen, setIsOpen, toggle }}>
      {children}
    </OffcanvasContext.Provider>
  );
}

export function useOffcanvas() {
  const context = useContext(OffcanvasContext);
  if (context === undefined) {
    throw new Error('useOffcanvas must be used within an OffcanvasProvider');
  }
  return context;
}

interface OffcanvasSidebarProps {
  children: ReactNode;
  side: 'left' | 'right';
  width?: string;
  className?: string;
}

export function OffcanvasSidebar({
  children,
  side,
  width = '320px',
  className
}: OffcanvasSidebarProps) {
  const { isOpen } = useOffcanvas();

  return (
    <div
      className={cn(
        "fixed top-0 h-full bg-background border-border border-r z-30",
        "transform transition-transform duration-300 ease-out",
        "shadow-lg",
        side === 'left' ? 'left-0 border-r' : 'right-0 border-l border-r-0',
        isOpen
          ? side === 'left' ? 'translate-x-0' : 'translate-x-0'
          : side === 'left' ? '-translate-x-full' : 'translate-x-full',
        className
      )}
      style={{
        width,
        transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        transitionDuration: isOpen ? '400ms' : '300ms'
      }}
    >
      {children}
    </div>
  );
}

interface OffcanvasContentProps {
  children: ReactNode;
  className?: string;
  offsetWidth?: string;
}

export function OffcanvasContent({
  children,
  className,
  offsetWidth = '320px'
}: OffcanvasContentProps) {
  const { isOpen } = useOffcanvas();

  return (
    <div
      className={cn(
        "transition-all duration-300 ease-out",
        className
      )}
      style={{
        marginLeft: isOpen ? offsetWidth : '0',
        marginRight: isOpen ? offsetWidth : '0',
        transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        transitionDuration: isOpen ? '400ms' : '300ms'
      }}
    >
      {children}
    </div>
  );
}

interface OffcanvasRootProps {
  children: ReactNode;
  defaultOpen?: boolean;
  side: 'left' | 'right';
  width?: string;
}

export function OffcanvasRoot({
  children,
  defaultOpen = false,
  side,
  width = '320px'
}: OffcanvasRootProps) {
  return (
    <OffcanvasProvider defaultOpen={defaultOpen}>
      {children}
    </OffcanvasProvider>
  );
}