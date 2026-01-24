'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { ArrowRight, Dna, Trophy, TrendingUp, Users, Search, Waves, Star, TreePine, Sprout, Seedling } from 'lucide-react';
import { ConnectButton } from '@/components/wallet/ConnectButton';

export default function HomePage() {
  const { isConnected, address } = useAccount();

  return (
    <div className="relative">
      {/* Hero Section */}
      <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary-900/20 via-transparent to-transparent" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary-500/10 rounded-full blur-3xl" />
        
        <div className="container mx-auto px-4 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* DNA Icon */}
            <div className="flex justify-center mb-8">
              <div className="relative">
                <div className="absolute inset-0 bg-primary-500/30 blur-2xl rounded-full" />
                <Dna className="relative w-20 h-20 text-primary-400" strokeWidth={1.5} />
              </div>
            </div>

            {/* Title */}
            <h1 className="font-display text-5xl md:text-7xl font-bold mb-6 glow-text">
              Discover Your
              <span className="block bg-gradient-to-r from-primary-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">
                DeFi DNA
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
              Track your journey across Uniswap V2, V3, and V4. 
              Earn achievements, analyze performance, and unlock your unique DeFi identity.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col items-center gap-4 w-full max-w-2xl mx-auto">
              {/* Primary CTA */}
              <div className="w-full">
                {isConnected ? (
                  <Link
                    href={`/profile/${address}`}
                    className="block w-full text-center px-8 py-4 bg-gradient-to-r from-primary-500 to-purple-500 text-white font-semibold rounded-xl hover:opacity-90 transition shadow-glow"
                  >
                    <div className="flex items-center justify-center gap-2">
                      View My DNA
                      <ArrowRight className="w-5 h-5" />
                    </div>
                  </Link>
                ) : (
                  <div className="w-full">
                    <ConnectButton />
                  </div>
                )}
              </div>

              {/* Secondary Actions */}
              <div className="flex flex-col sm:flex-row gap-3 w-full">
                <Link
                  href="/leaderboard"
                  className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-800/50 text-white font-medium rounded-xl hover:bg-gray-800 transition border border-gray-700/50 hover:border-gray-600"
                >
                  <Trophy className="w-4 h-4" />
                  Leaderboard
                </Link>

                <Link
                  href="/search"
                  className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-800/50 text-white font-medium rounded-xl hover:bg-gray-800 transition border border-gray-700/50 hover:border-gray-600"
                >
                  <Search className="w-4 h-4" />
                  Search Wallet
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 relative">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              What is DeFi DNA?
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              Your unique on-chain fingerprint based on your Uniswap activity across all versions.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="glass rounded-2xl p-8 card-hover"
              >
                <div className={`w-12 h-12 rounded-xl ${feature.color} flex items-center justify-center mb-6`}>
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="font-display text-xl font-semibold mb-3">{feature.title}</h3>
                <p className="text-gray-400">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Score Breakdown Section */}
      <section className="py-20 bg-gradient-to-b from-gray-900/50 to-transparent">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              How Your Score is Calculated
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              Your DNA score is composed of five key metrics, each measuring a different aspect of your DeFi activity.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-5 gap-4">
            {scoreComponents.map((component, index) => (
              <motion.div
                key={component.name}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className="glass rounded-xl p-6 text-center"
              >
                <div className="text-3xl font-bold text-primary-400 mb-2">{component.weight}%</div>
                <div className="font-medium mb-2">{component.name}</div>
                <p className="text-sm text-gray-500">{component.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Tiers Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              Tier System
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              Your tier reflects your DeFi expertise and activity level.
            </p>
          </motion.div>

          <div className="flex flex-wrap justify-center gap-4">
            {tiers.map((tier, index) => (
              <motion.div
                key={tier.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className={`px-6 py-4 rounded-xl border ${tier.class} flex items-center gap-3`}
              >
                <tier.icon className="w-6 h-6" />
                <div>
                  <div className="font-semibold">{tier.name}</div>
                  <div className="text-sm opacity-75">{tier.range}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="glass rounded-3xl p-12 text-center relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 to-purple-500/10" />
            <div className="relative z-10">
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
                Ready to discover your DNA?
              </h2>
              <p className="text-gray-400 max-w-xl mx-auto mb-8">
                Connect your wallet and explore your complete DeFi journey across Uniswap.
              </p>
              {!isConnected && <ConnectButton />}
              {isConnected && (
                <Link
                  href={`/profile/${address}`}
                  className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-primary-500 to-purple-500 text-white font-semibold rounded-xl hover:opacity-90 transition shadow-glow"
                >
                  View My Profile
                  <ArrowRight className="w-5 h-5" />
                </Link>
              )}
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}

const features = [
  {
    icon: Dna,
    title: 'Unique Identity',
    description: 'Your DNA score is calculated based on your complete on-chain history across all Uniswap versions.',
    color: 'bg-primary-500/20 text-primary-400',
  },
  {
    icon: Trophy,
    title: 'Achievements',
    description: 'Earn badges and achievements as you reach milestones in your DeFi journey.',
    color: 'bg-amber-500/20 text-amber-400',
  },
  {
    icon: TrendingUp,
    title: 'Performance Analytics',
    description: 'Track your LP efficiency, trading volume, and fee earnings with detailed analytics.',
    color: 'bg-emerald-500/20 text-emerald-400',
  },
];

const scoreComponents = [
  { name: 'Early Adopter', weight: 20, description: 'When you started using each version' },
  { name: 'Volume', weight: 25, description: 'Total trading volume' },
  { name: 'LP Efficiency', weight: 25, description: 'Fees earned vs liquidity provided' },
  { name: 'Diversity', weight: 15, description: 'Unique pools explored' },
  { name: 'Consistency', weight: 15, description: 'Regular activity over time' },
];

const tiers = [
  { name: 'Novice', range: '0-19', icon: Seedling, class: 'tier-novice' },
  { name: 'Beginner', range: '20-39', icon: Sprout, class: 'tier-beginner' },
  { name: 'Intermediate', range: '40-59', icon: TreePine, class: 'tier-intermediate' },
  { name: 'Expert', range: '60-79', icon: Star, class: 'tier-expert' },
  { name: 'Whale', range: '80-100', icon: Waves, class: 'tier-whale' },
];

