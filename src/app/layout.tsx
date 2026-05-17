import type { Metadata, Viewport } from "next";
import "@/app/globals.css";
import { editorFontVariables } from "@/app/editor-fonts";

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
      <body className={`${editorFontVariables} font-sans`}>
        {children}
      </body>
    </html>
  );
}
