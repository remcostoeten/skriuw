import Link from "next/link";
import { Container, Wordmark } from "@/components/ui/primitives";
import { GithubSocial, XSocial } from "@/components/ui/icons";
import { footerColumns, repoUrl } from "@/data/content";

const socials = [
  { label: "GitHub", href: repoUrl, Icon: GithubSocial },
  { label: "X", href: "https://x.com/remcostoeten", Icon: XSocial },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <Container className="grid gap-12 py-16 md:grid-cols-[minmax(0,1.6fr)_minmax(0,2fr)]">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-[280px] text-[15px] leading-[22px] text-ink-500">
            <em>skriuw</em> · verb · Frisian · “to write”. A local-first workspace for writing,
            journaling, and connected knowledge.
          </p>
          <div className="mt-7 flex items-center gap-4 text-ink-400">
            {socials.map(({ label, href, Icon }) => (
              <Link
                key={label}
                href={href}
                aria-label={label}
                className="transition-colors hover:text-ink-900 focus-visible:text-focus-ink"
              >
                <Icon className="size-[18px]" />
              </Link>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {footerColumns.map((column) => (
            <div key={column.title}>
              <h3 className="text-[15px] font-medium text-ink-900">{column.title}</h3>
              <ul className="mt-5 space-y-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-[14px] text-ink-500 transition-colors hover:text-ink-900 focus-visible:text-focus-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>

      <Container className="flex flex-wrap items-center justify-between gap-4 border-t border-border py-6">
        <p className="text-[14px] text-ink-400">
          © 2026 Remco Stoeten. Released under the MIT License.
        </p>
        <div className="flex items-center gap-4">
          <Link
            href={`${repoUrl}/blob/daddy/.github/SECURITY.md`}
            className="text-[14px] text-ink-400 transition-colors hover:text-ink-900 focus-visible:text-focus-ink"
          >
            Security
          </Link>
          <Link
            href={`${repoUrl}/blob/daddy/.github/CODE_OF_CONDUCT.md`}
            className="text-[14px] text-ink-400 transition-colors hover:text-ink-900 focus-visible:text-focus-ink"
          >
            Code of conduct
          </Link>
        </div>
      </Container>
    </footer>
  );
}
