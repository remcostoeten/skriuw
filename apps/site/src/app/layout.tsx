import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist_Mono, Inter } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { socialImage } from "@/data/seo";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://skriuw.com"),
  title: {
    default: "Skriuw: Fast, Private, Local-First Notes",
    template: "%s | Skriuw",
  },
  description:
    "Skriuw is a local-first workspace for writing, journaling, and connected knowledge. Your notes are a SQLite file on your machine. No spinners, no round-trips, no account. macOS, Windows, Linux, and the browser.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Skriuw",
    url: "https://skriuw.com/",
    title: "Skriuw: Fast, Private, Local-First Notes",
    description:
      "A writing workspace that stays fast, keeps your notes local, and puts sync in your hands.",
    images: [socialImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "Skriuw: Fast, Private, Local-First Notes",
    description:
      "A writing workspace that stays fast, keeps your notes local, and puts sync in your hands.",
    images: [socialImage],
  },
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const themeScript = `(function(){try{var s=localStorage.getItem("skriuw-theme");var d=s==="dark"||(s!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}document.documentElement.dataset.reveal="on"})()`;

type Props = {
  children: ReactNode;
};

export default function RootLayout({ children }: Props) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
