'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useWebSocket } from '@/hooks/useWebSocket';
import { 
  Trophy, 
  TrendingUp, 
  DollarSign, 
  Activity,
  ChevronDown,
  Medal,
  Crown,
  Loader2,
  AlertCircle,
  Wifi,
  WifiOff,
  Waves,
  Star,
  TreePine,
  Sprout,
  Seedling
} from 'lucide-react';
import { clsx } from 'clsx';

const metrics = [
  { id: 'dna_score', label: 'DNA Score', icon: Trophy },
  { id: 'total_volume_usd', label: 'Volume', icon: TrendingUp },
  { id: 'total_fees_earned', label: 'Fees Earned', icon: DollarSign },
  { id: 'total_positions', label: 'Positions', icon: Activity },
];

interface LeaderboardEntry {
  address: string;
  ens_name: string | null;
  dna_score: number;
  tier: string;
  total_positions: number;
  total_volume_usd: number;
  total_fees_earned: number;
  rank: number;
}

export default function LeaderboardPage() {
  const [selectedMetric, setSelectedMetric] = useState('dna_score');
  const [showDropdown, setShowDropdown] = useState(false);
  const [tier, setTier] = useState<string | null>(null);
  const [limit, setLimit] = useState(100);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  // Fetch leaderboard data from API
  const { data: leaderboard, isLoading, error, refetch } = useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard', selectedMetric, tier, limit],
    queryFn: async () => {
      const params = new URLSearchParams({
        metric: selectedMetric,
        limit: limit.toString(),
      });
      if (tier) params.append('tier', tier);

      const response = await fetch(`${apiUrl}/api/v1/leaderboard?${params}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch leaderboard: ${response.statusText}`);
      }

      return response.json();
    },
    refetchInterval: 30000, // Refetch every 30 seconds as fallback
    staleTime: 10000,
  });

  // WebSocket for real-time updates
  useWebSocket({
    onConnect: () => {
      setWsConnected(true);
      console.log('[WebSocket] Connected to leaderboard updates');
    },
    onDisconnect: () => {
      setWsConnected(false);
      console.log('[WebSocket] Disconnected');
    },
    onUpdate: (data) => {
      if (data?.type === 'leaderboard_update' || data?.type === 'ranking_changes' || data?.type === 'new_leader') {
        console.log('[WebSocket] Leaderboard update received, refetching...');
        setLastUpdate(new Date());
        refetch();
      }
    },
  });

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

      {/* Tier Filter */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="flex justify-center mb-8"
      >
        <select
          value={tier || ''}
          onChange={(e) => setTier(e.target.value || null)}
          className="px-4 py-2 bg-gray-800 rounded-xl border border-gray-700 hover:border-gray-600 transition text-sm"
        >
          <option value="">All Tiers</option>
          <option value="Whale">Whale</option>
          <option value="Expert">Expert</option>
          <option value="Intermediate">Intermediate</option>
          <option value="Beginner">Beginner</option>
          <option value="Novice">Novice</option>
        </select>
      </motion.div>

      {/* Connection Status */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex items-center justify-end gap-2 mb-4"
      >
        <div className={clsx(
          'flex items-center gap-2 px-3 py-1 rounded-full text-sm',
          wsConnected ? 'bg-green-500/20 text-green-400' : 'bg-gray-800 text-gray-400'
        )}>
          {wsConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
          {wsConnected ? 'Live' : 'Offline'}
        </div>
        {lastUpdate && (
          <span className="text-sm text-gray-500">
            Updated {lastUpdate.toLocaleTimeString()}
          </span>
        )}
      </motion.div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary-400 mx-auto mb-4" />
            <p className="text-gray-400">Loading leaderboard...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="glass rounded-xl p-6 border border-red-500/50 mb-8">
          <div className="flex items-center gap-3 mb-2">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <h2 className="text-red-400 text-lg font-semibold">Error Loading Leaderboard</h2>
          </div>
          <p className="text-gray-400 mb-4">
            {error instanceof Error ? error.message : 'Unknown error occurred'}
          </p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Top 3 Cards */}
      {!isLoading && !error && leaderboard && leaderboard.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid md:grid-cols-3 gap-6 mb-8"
        >
          {leaderboard.slice(0, 3).map((user, index) => (
            <TopCard key={user.address} user={user} rank={user.rank || index + 1} metric={selectedMetric} />
          ))}
        </motion.div>
      )}

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
            {!isLoading && !error && leaderboard && leaderboard.length > 3 ? (
              leaderboard.slice(3).map((user, index) => (
                <motion.tr
                  key={user.address}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * index }}
                  className="border-b border-gray-800/50 hover:bg-gray-800/30 transition"
                >
                  <td className="px-6 py-4">
                    <span className="text-gray-400">#{user.rank || index + 4}</span>
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
                        {user.ens_name && (
                          <p className="text-xs text-gray-500">{user.ens_name}</p>
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
              ))
            ) : !isLoading && !error && leaderboard && leaderboard.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                  No users found matching the filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </motion.div>
    </div>
  );
}

function TopCard({ user, rank, metric }: { user: LeaderboardEntry; rank: number; metric: string }) {
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
          {user.ens_name && (
            <p className="text-sm text-gray-500">{user.ens_name}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <TierBadge tier={user.tier} />
        <div className="text-right">
          <p className="text-2xl font-bold">{getMetricValue(user, metric)}</p>
          <p className="text-xs text-gray-500">{metric === 'dna_score' ? 'DNA Score' : metric}</p>
        </div>
      </div>
    </Link>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const tierClass = `tier-${tier.toLowerCase()}`;
  const TierIcon = {
    Whale: Waves,
    Expert: Star,
    Intermediate: TreePine,
    Beginner: Sprout,
    Novice: Seedling,
  }[tier] || Seedling;

  return (
    <span className={clsx('px-3 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5', tierClass)}>
      <TierIcon className="w-3 h-3" />
      {tier}
    </span>
  );
}

function getMetricValue(user: LeaderboardEntry, metric: string): string {
  switch (metric) {
    case 'dna_score':
      return user.dna_score.toString();
    case 'total_volume_usd':
      return `$${formatNumber(user.total_volume_usd || 0)}`;
    case 'total_fees_earned':
      return `$${formatNumber(user.total_fees_earned || 0)}`;
    case 'total_positions':
      return user.total_positions.toString();
    default:
      return '-';
  }
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

// Mock data removed - now using real API data

