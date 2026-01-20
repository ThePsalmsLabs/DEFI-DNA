import type { Metadata } from 'next';
import { Inter, Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Header } from '@/components/layout/Header';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'DeFi DNA | Your Uniswap Journey',
  description: 'Track your DeFi journey across Uniswap V2, V3, and V4. Earn achievements, analyze performance, and discover your DeFi DNA.',
  keywords: ['DeFi', 'Uniswap', 'Analytics', 'LP', 'Liquidity', 'Web3'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} font-sans bg-gray-950 text-white antialiased`}>
        <Providers>
          <div className="min-h-screen flex flex-col">
            <Header />
            <main className="flex-1">
              {children}
            </main>
            <footer className="border-t border-gray-800 py-6 text-center text-sm text-gray-500">
              <p>DeFi DNA © 2024 | Built on Uniswap V4</p>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}

