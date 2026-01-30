'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dna, Trophy, BarChart3, Search, Menu, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ConnectButton } from '@/components/wallet/ConnectButton';
import { clsx } from 'clsx';

const navigation = [
  { name: 'Home', href: '/', icon: Dna },
  { name: 'Leaderboard', href: '/leaderboard', icon: Trophy },
  { name: 'Search', href: '/search', icon: Search },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
];

const NAV_HEIGHT = 'h-14 sm:h-16';
const CONTAINER_PADDING = 'px-4 sm:px-6 lg:px-8';
const MAX_WIDTH = 'max-w-7xl';

export function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <header
      className={clsx(
        'sticky top-0 z-50 w-full',
        'bg-gray-950/80 backdrop-blur-xl border-b border-white/[0.06]',
        'supports-[backdrop-filter]:bg-gray-950/70'
      )}
      role="banner"
    >
      <nav
        className={clsx('mx-auto w-full', MAX_WIDTH, CONTAINER_PADDING)}
        aria-label="Main navigation"
      >
        <div
          className={clsx(
            'flex items-center justify-between gap-4',
            NAV_HEIGHT
          )}
        >
          {/* Logo — responsive size, min touch target */}
          <Link
            href="/"
            className={clsx(
              'flex items-center gap-2 min-h-[44px] min-w-[44px] -ml-2 pl-2 rounded-lg',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950',
              'transition-opacity hover:opacity-90 active:opacity-80'
            )}
            aria-label="DeFi DNA — Home"
          >
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 bg-primary-500/25 blur-md rounded-full scale-150" />
              <Dna
                className="relative w-7 h-7 sm:w-8 sm:h-8 text-primary-400"
                strokeWidth={1.5}
                aria-hidden
              />
            </div>
            <span
              className={clsx(
                'font-display font-bold bg-gradient-to-r from-primary-400 to-purple-400 bg-clip-text text-transparent',
                'text-lg sm:text-xl truncate max-w-[120px] sm:max-w-none'
              )}
            >
              DeFi DNA
            </span>
          </Link>

          {/* Desktop nav — hidden on small screens */}
          <div className="hidden md:flex items-center gap-0.5 lg:gap-1 flex-1 justify-center max-w-2xl">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={clsx(
                    'flex items-center gap-2 rounded-lg text-sm font-medium transition-colors duration-200',
                    'min-h-[40px] px-3 py-2 sm:px-4',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950',
                    isActive
                      ? 'bg-primary-500/15 text-primary-400'
                      : 'text-gray-400 hover:text-white hover:bg-white/[0.06]'
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" aria-hidden />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>

          {/* Right: Connect + mobile menu button */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-shrink-0">
            <div className="min-w-0 w-full xs:w-auto max-w-[180px] sm:max-w-none">
              <ConnectButton />
            </div>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((o) => !o)}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              className={clsx(
                'md:hidden flex items-center justify-center rounded-lg',
                'min-h-[44px] min-w-[44px] p-2',
                'text-gray-400 hover:text-white hover:bg-white/[0.06]',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950',
                'transition-colors duration-200'
              )}
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6" aria-hidden />
              ) : (
                <Menu className="w-6 h-6" aria-hidden />
              )}
            </button>
          </div>
        </div>

        {/* Mobile nav — full-width overlay panel */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 top-14 sm:top-16 z-40 bg-gray-950/90 backdrop-blur-sm md:hidden"
                aria-hidden
                onClick={() => setMobileMenuOpen(false)}
              />
              <motion.div
                id="mobile-nav"
                role="dialog"
                aria-label="Mobile navigation"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                className="md:hidden overflow-hidden border-t border-white/[0.06] pb-4"
              >
                <div className="flex flex-col py-3 gap-0.5">
                  {navigation.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={clsx(
                          'flex items-center gap-3 rounded-lg text-base font-medium transition-colors duration-200',
                          'min-h-[48px] px-4 py-3 mx-2',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950',
                          isActive
                            ? 'bg-primary-500/15 text-primary-400'
                            : 'text-gray-300 hover:text-white hover:bg-white/[0.06]'
                        )}
                      >
                        <Icon className="w-5 h-5 flex-shrink-0 text-gray-400" aria-hidden />
                        <span>{item.name}</span>
                      </Link>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </nav>
    </header>
  );
}
