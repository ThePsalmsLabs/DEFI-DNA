'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dna, Trophy, BarChart3, Clock, Menu, X, Search } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ConnectButton } from '@/components/wallet/ConnectButton';
import { clsx } from 'clsx';

const navigation = [
  { name: 'Home', href: '/', icon: Dna },
  { name: 'Leaderboard', href: '/leaderboard', icon: Trophy },
  { name: 'Search', href: '/search', icon: Search },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
];

export function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 glass border-b border-white/5">
      <nav className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="relative">
              <div className="absolute inset-0 bg-primary-500/30 blur-md rounded-full" />
              <Dna className="relative w-8 h-8 text-primary-400" strokeWidth={1.5} />
            </div>
            <span className="font-display text-xl font-bold bg-gradient-to-r from-primary-400 to-purple-400 bg-clip-text text-transparent">
              DeFi DNA
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={clsx(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition',
                    isActive
                      ? 'bg-primary-500/20 text-primary-400'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.name}
                </Link>
              );
            })}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-4">
            <ConnectButton />
            
            {/* Mobile menu button */}
            <button
              className="md:hidden p-2 text-gray-400 hover:text-white"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden py-4 border-t border-white/5"
            >
              <div className="flex flex-col gap-2">
                {navigation.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={clsx(
                        'flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition',
                        isActive
                          ? 'bg-primary-500/20 text-primary-400'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      )}
                    >
                      <item.icon className="w-4 h-4" />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </header>
  );
}

