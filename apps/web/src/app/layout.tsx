import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import { parseTheme, THEME_COOKIE } from '@/lib/theme';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = {
  title: { default: 'SwiftDrop', template: '%s · SwiftDrop' },
  description: 'Island-wide parcel delivery — book, track and manage deliveries.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f5f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0a1222' },
  ],
};

/** Root layout. The theme comes from the sd_theme cookie so the first paint already has the right colours. */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en" data-theme={theme} className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
