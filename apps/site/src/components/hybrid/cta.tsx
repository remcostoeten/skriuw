import Link from "next/link";
import { cn } from "@skriuw/shared/helpers/cn";
import { appUrl, releasesUrl } from "@/data/content";
import { badge, outlineButton, primaryButton } from "@/components/hybrid/control";

export function HybridCta() {
  return (
    <section className="border-b-0!">
      <div className="hy-dots grid place-items-center rounded-[10px] border border-dashed border-line px-6 py-16 text-center">
        <span className={cn(badge, "bg-ink-900/8 text-ink-700")}>
          free · open source · no account
        </span>
        <h2 className="mt-6 font-serif text-[40px] leading-[44px] font-normal tracking-[-1.2px] text-balance text-ink-900">
          Open a page. Keep it yours.
        </h2>
        <p className="mt-4 max-w-[440px] text-[15px] leading-[23px] text-ink-500">
          The full app runs in your browser right now, with no install and no sign-up. The desktop
          build is the same renderer on the same Rust core.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          <Link href={appUrl} className={primaryButton}>
            Open the app
          </Link>
          <Link href={releasesUrl} className={cn(outlineButton, "h-10 px-4")}>
            Download for desktop
          </Link>
        </div>
      </div>
    </section>
  );
}
