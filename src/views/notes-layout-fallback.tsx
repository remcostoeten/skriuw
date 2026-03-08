import { LayoutContainer } from "@/features/layout/components/layout-container";

export function NotesLayoutFallback() {
  return (
    <LayoutContainer className="bg-background">
      <div className="relative flex min-h-0 flex-1 gap-4 overflow-hidden p-5 md:p-6">
        <div className="hidden shrink-0 rounded-2xl bg-white/5 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.4)] md:block md:w-[min(22rem,26vw)]">
          <div className="h-8 w-32 animate-pulse rounded-xl bg-white/10" />
          <div className="mt-6 space-y-3">
            <div className="h-10 w-full animate-pulse rounded-2xl bg-white/6" />
            <div className="h-10 w-[90%] animate-pulse rounded-2xl bg-white/6" />
            <div className="h-10 w-[80%] animate-pulse rounded-2xl bg-white/6" />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-5">
          <div className="h-7 w-40 animate-pulse rounded-full bg-white/8" />
          <div className="h-10 w-[min(32rem,80%)] animate-pulse rounded-3xl bg-white/7" />
          <div className="h-4 w-full animate-pulse rounded-full bg-white/6" />
          <div className="h-4 w-[92%] animate-pulse rounded-full bg-white/6" />
          <div className="h-4 w-[85%] animate-pulse rounded-full bg-white/6" />
        </div>
      </div>
    </LayoutContainer>
  );
}
