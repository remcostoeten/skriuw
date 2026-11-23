import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist_Mono, Inter } from "next/font/google";
import { socialImage } from "@/data/seo";
import { cn } from "@skriuw/shared/helpers/cn";
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
    default: "Skriuw: Private, Local-First Notes App",
    template: "%s | Skriuw",
  },
  description:
    "Skriuw is a local-first notes app with a Markdown editor, a daily journal, tasks, and links between notes. It stores your notes in SQLite on your device and doesn't require an account.",
  openGraph: {
    type: "website",
    siteName: "Skriuw",
    url: "https://skriuw.com/",
    title: "Skriuw: Private, Local-First Notes App",
    description:
      "A local-first notes app. Your notes are stored in SQLite on your device, and sync is opt-in.",
    images: [socialImage],
  },
  twitter: { card: "summary_large_image", images: [socialImage] },
  icons: { icon: "/favicon.ico", apple: "/app-icon.png" },
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
    <html lang="en" className={cn(inter.variable, geistMono.variable)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
