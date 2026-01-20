'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { 
  Trophy, 
  TrendingUp, 
  DollarSign, 
  Activity,
  ChevronDown,
  Medal,
  Crown
} from 'lucide-react';
import { clsx } from 'clsx';

const metrics = [
  { id: 'score', label: 'DNA Score', icon: Trophy },
  { id: 'volume', label: 'Volume', icon: TrendingUp },
  { id: 'fees', label: 'Fees Earned', icon: DollarSign },
  { id: 'positions', label: 'Positions', icon: Activity },
];

export default function LeaderboardPage() {
  const [selectedMetric, setSelectedMetric] = useState('score');
  const [showDropdown, setShowDropdown] = useState(false);

  const currentMetric = metrics.find(m => m.id === selectedMetric) || metrics[0];

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <div className="flex justify-center mb-4">
          <div className="relative">
            <div className="absolute inset-0 bg-amber-500/30 blur-2xl rounded-full" />
            <Trophy className="relative w-16 h-16 text-amber-400" strokeWidth={1.5} />
          </div>
        </div>
        <h1 className="font-display text-4xl font-bold mb-4">Leaderboard</h1>
        <p className="text-gray-400 max-w-xl mx-auto">
          Top DeFi DNA holders ranked by their on-chain activity and performance.
        </p>
      </motion.div>

      {/* Metric Selector */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex justify-center mb-8"
      >
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-3 px-6 py-3 bg-gray-800 rounded-xl border border-gray-700 hover:border-gray-600 transition"
          >
            <currentMetric.icon className="w-5 h-5 text-primary-400" />
            <span className="font-medium">Ranked by {currentMetric.label}</span>
            <ChevronDown className={clsx('w-4 h-4 transition', showDropdown && 'rotate-180')} />
          </button>

          {showDropdown && (
            <>
              <div className="fixed inset-0" onClick={() => setShowDropdown(false)} />
              <div className="absolute top-full mt-2 left-0 right-0 bg-gray-900 border border-gray-800 rounded-xl shadow-xl z-50 overflow-hidden">
                {metrics.map((metric) => (
                  <button
                    key={metric.id}
                    onClick={() => {
                      setSelectedMetric(metric.id);
                      setShowDropdown(false);
                    }}
                    className={clsx(
                      'w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800 transition',
                      selectedMetric === metric.id && 'bg-gray-800'
                    )}
                  >
                    <metric.icon className="w-4 h-4 text-gray-400" />
                    <span>{metric.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* Top 3 Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid md:grid-cols-3 gap-6 mb-8"
      >
        {mockLeaderboard.slice(0, 3).map((user, index) => (
          <TopCard key={user.address} user={user} rank={index + 1} metric={selectedMetric} />
        ))}
      </motion.div>

      {/* Rest of Leaderboard */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass rounded-xl overflow-hidden"
      >
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="px-6 py-4 text-left text-sm font-medium text-gray-400">Rank</th>
              <th className="px-6 py-4 text-left text-sm font-medium text-gray-400">Address</th>
              <th className="px-6 py-4 text-left text-sm font-medium text-gray-400">Tier</th>
              <th className="px-6 py-4 text-right text-sm font-medium text-gray-400">{currentMetric.label}</th>
            </tr>
          </thead>
          <tbody>
            {mockLeaderboard.slice(3).map((user, index) => (
              <motion.tr
                key={user.address}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * index }}
                className="border-b border-gray-800/50 hover:bg-gray-800/30 transition"
              >
                <td className="px-6 py-4">
                  <span className="text-gray-400">#{index + 4}</span>
                </td>
                <td className="px-6 py-4">
                  <Link 
                    href={`/profile/${user.address}`}
                    className="flex items-center gap-3 hover:text-primary-400 transition"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-r from-primary-500 to-purple-500" />
                    <div>
                      <p className="font-mono text-sm">
                        {user.address.slice(0, 6)}...{user.address.slice(-4)}
                      </p>
                      {user.ensName && (
                        <p className="text-xs text-gray-500">{user.ensName}</p>
                      )}
                    </div>
                  </Link>
                </td>
                <td className="px-6 py-4">
                  <TierBadge tier={user.tier} />
                </td>
                <td className="px-6 py-4 text-right font-medium">
                  {getMetricValue(user, selectedMetric)}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </div>
  );
}

function TopCard({ user, rank, metric }: { user: any; rank: number; metric: string }) {
  const rankConfig = {
    1: { color: 'from-amber-400 to-amber-600', icon: Crown, size: 'scale-110' },
    2: { color: 'from-gray-300 to-gray-500', icon: Medal, size: '' },
    3: { color: 'from-orange-400 to-orange-600', icon: Medal, size: '' },
  }[rank] || { color: 'from-gray-500 to-gray-700', icon: Medal, size: '' };

  return (
    <Link
      href={`/profile/${user.address}`}
      className={clsx(
        'block glass rounded-xl p-6 card-hover relative overflow-hidden',
        rank === 1 && 'ring-2 ring-amber-500/30'
      )}
    >
      {/* Rank badge */}
      <div className={clsx(
        'absolute -top-4 -right-4 w-20 h-20 rounded-full bg-gradient-to-br flex items-end justify-start p-4',
        rankConfig.color
      )}>
        <span className="text-2xl font-bold text-white">{rank}</span>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div className={clsx(
          'w-14 h-14 rounded-2xl bg-gradient-to-r from-primary-500 to-purple-500 flex items-center justify-center',
          rankConfig.size
        )}>
          <rankConfig.icon className="w-7 h-7 text-white" />
        </div>
        <div>
          <p className="font-mono text-sm">
            {user.address.slice(0, 6)}...{user.address.slice(-4)}
          </p>
          {user.ensName && (
            <p className="text-sm text-gray-500">{user.ensName}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <TierBadge tier={user.tier} />
        <div className="text-right">
          <p className="text-2xl font-bold">{getMetricValue(user, metric)}</p>
          <p className="text-xs text-gray-500">{metric === 'score' ? 'DNA Score' : metric}</p>
        </div>
      </div>
    </Link>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const tierClass = `tier-${tier.toLowerCase()}`;
  const emoji = {
    Whale: '🐋',
    Expert: '⭐',
    Intermediate: '🌳',
    Beginner: '🌿',
    Novice: '🌱',
  }[tier] || '🌱';

  return (
    <span className={clsx('px-3 py-1 rounded-full text-xs font-medium border', tierClass)}>
      {emoji} {tier}
    </span>
  );
}

function getMetricValue(user: any, metric: string): string {
  switch (metric) {
    case 'score':
      return user.score.toString();
    case 'volume':
      return `$${formatNumber(user.volume)}`;
    case 'fees':
      return `$${formatNumber(user.feesEarned)}`;
    case 'positions':
      return user.totalPositions.toString();
    default:
      return '-';
  }
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

const mockLeaderboard = [
  { address: '0x1234567890abcdef1234567890abcdef12345678', ensName: 'defi-whale.eth', tier: 'Whale', score: 95, volume: 15400000, feesEarned: 125000, totalPositions: 89 },
  { address: '0x2345678901abcdef2345678901abcdef23456789', ensName: 'liquidity-king.eth', tier: 'Whale', score: 92, volume: 12800000, feesEarned: 98000, totalPositions: 67 },
  { address: '0x3456789012abcdef3456789012abcdef34567890', ensName: null, tier: 'Whale', score: 88, volume: 9500000, feesEarned: 78000, totalPositions: 54 },
  { address: '0x4567890123abcdef4567890123abcdef45678901', ensName: 'swap-master.eth', tier: 'Expert', score: 82, volume: 5600000, feesEarned: 45000, totalPositions: 42 },
  { address: '0x5678901234abcdef5678901234abcdef56789012', ensName: null, tier: 'Expert', score: 78, volume: 4200000, feesEarned: 32000, totalPositions: 38 },
  { address: '0x6789012345abcdef6789012345abcdef67890123', ensName: 'uni-trader.eth', tier: 'Expert', score: 75, volume: 3800000, feesEarned: 28000, totalPositions: 35 },
  { address: '0x7890123456abcdef7890123456abcdef78901234', ensName: null, tier: 'Intermediate', score: 68, volume: 2100000, feesEarned: 18000, totalPositions: 28 },
  { address: '0x8901234567abcdef8901234567abcdef89012345', ensName: 'pool-explorer.eth', tier: 'Intermediate', score: 62, volume: 1500000, feesEarned: 12000, totalPositions: 22 },
  { address: '0x9012345678abcdef9012345678abcdef90123456', ensName: null, tier: 'Intermediate', score: 55, volume: 980000, feesEarned: 8500, totalPositions: 18 },
  { address: '0xa123456789abcdefa123456789abcdefa1234567', ensName: null, tier: 'Beginner', score: 42, volume: 450000, feesEarned: 3200, totalPositions: 12 },
];

