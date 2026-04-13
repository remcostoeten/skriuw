import { LayoutContainer } from "@/features/layout/components/layout-container";

export function NotesLayoutFallback() {
  return (
    <LayoutContainer className="bg-background">
      <div className="relative flex min-h-dvh flex-1" />
    </LayoutContainer>
  );
}
