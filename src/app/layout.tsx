import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "@/app/globals.css";
import { AppProviders } from "@/providers/app-providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://skriuw.app"),
  title: {
    default: "Skriuw",
    template: "%s | Skriuw",
  },
  description:
    "A calm, keyboard-first notes and journal workspace with account-backed sync across web and mobile.",
  applicationName: "Skriuw",
  keywords: ["Skriuw", "notes", "journal", "writing", "knowledge base", "cloud sync"],
  openGraph: {
    title: "Skriuw",
    description:
      "A calm notes and journal workspace with account-backed sync across web and mobile.",
    siteName: "Skriuw",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Skriuw",
    description:
      "A calm notes and journal workspace with account-backed sync across web and mobile.",
  },
};

export const viewport: Viewport = {
  themeColor: "#f5efe7",
  width: "device-width",
  initialScale: 1,
};

type Props = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: Props) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
