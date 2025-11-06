import { AnnouncementBanner } from '@/components/announcement-banner';
import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
});

export default function Layout(props: { children: any }) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <AnnouncementBanner />
        <RootProvider>{props.children}</RootProvider>
      </body>
    </html>
  );
}
