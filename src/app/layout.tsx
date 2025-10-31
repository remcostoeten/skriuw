import { Providers } from "@/components/providers";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "InstantDB Notes",
  description: "Local-first note-taking app with InstantDB",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased dark`}
      >
        <nav className="bg-gray-900 text-white p-4 border-b border-gray-800">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <h1 className="text-xl font-bold">InstantDB Notes</h1>
            <div className="flex space-x-6">
              <Link
                href="/"
                className="hover:text-blue-400 transition-colors"
              >
                Notes
              </Link>
              <Link
                href="/platform-demo"
                className="hover:text-blue-400 transition-colors"
              >
                Platform Demo
              </Link>
            </div>
          </div>
        </nav>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
