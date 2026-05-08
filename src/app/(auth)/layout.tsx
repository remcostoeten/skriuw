import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { RawLogo } from "@/shared/icons/logo";
import { Button } from "@/shared/ui/button";
import { getServerUser } from "@/core/supabase/server-client";
import PixelBlast from "@/shared/PixelBlast";
import { AuthHeroCopy } from "@/features/auth/components/auth-hero-copy";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getServerUser();
  if (user) {
    redirect("/app");
  }
  return (
    <div className="flex h-dvh">
      <div className="relative hidden flex-col items-start justify-between overflow-hidden p-12 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700 md:flex md:w-1/2">
        <div className="absolute inset-0 pointer-events-none">
          <PixelBlast
            variant="circle"
            pixelSize={2}
            color="#B497CF"
            className="pixel-blast-auth-fade"
            style={{}}
            patternScale={1.5}
            patternDensity={0.6}
            enableRipples
            rippleSpeed={0.2}
            rippleThickness={0.25}
            rippleIntensityScale={0.6}
            speed={1.3}
            transparent
            edgeFade={0.2}
          />
        </div>
        <Button
          link="/"
          className="group cursor-pointer px-0! text-white/50 hover:bg-transparent hover:text-white/80"
          variant="ghost"
        >
          <ArrowLeft className="size-4 transition-transform duration-200 group-hover:translate-x-[-4px]" />
          Back
        </Button>
        <div className="relative z-10">
          <AuthHeroCopy />
        </div>
      </div>
      <div className="flex w-full flex-col overflow-auto md:w-1/2">
        <div className="flex flex-1 items-center justify-center px-0 py-8 md:p-8">
          <div className="w-full max-w-md">
            <div className="mb-6 flex justify-start px-6">
              <RawLogo variant="sidebar" size={32} className="text-foreground" />
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
