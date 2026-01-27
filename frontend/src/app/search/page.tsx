'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2, AlertCircle, ExternalLink, TrendingUp, DollarSign, Activity, Layers, Waves, Star, TreePine, Sprout, Leaf } from 'lucide-react';
import Link from 'next/link';
import { WalletSearchResult } from '@/types/search';
import { clsx } from 'clsx';

export default function SearchPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const { data: searchResult, isLoading, error, refetch } = useQuery<WalletSearchResult>({
    queryKey: ['search', walletAddress],
    queryFn: async () => {
      if (!walletAddress) throw new Error('No wallet address provided');

      const response = await fetch(`${apiUrl}/api/v1/search?wallet=${encodeURIComponent(walletAddress)}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to search: ${response.statusText}`);
      }

      return response.json();
    },
    enabled: !!walletAddress && /^0x[a-fA-F0-9]{40}$/.test(walletAddress),
    retry: 1,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    
    // Basic address validation
    if (trimmed && /^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      setWalletAddress(trimmed);
    } else if (trimmed) {
      alert('Please enter a valid Ethereum address (0x followed by 40 hex characters)');
    }
  };

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
            <div className="absolute inset-0 bg-primary-500/30 blur-2xl rounded-full" />
            <Search className="relative w-16 h-16 text-primary-400" strokeWidth={1.5} />
          </div>
        </div>
        <h1 className="font-display text-4xl font-bold mb-4">Wallet Search</h1>
        <p className="text-gray-400 max-w-xl mx-auto">
          Search for any wallet address to view their complete DeFi DNA across all Uniswap V4 pools.
        </p>
      </motion.div>

      {/* Search Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="max-w-2xl mx-auto mb-8"
      >
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter wallet address (0x...)"
              className="w-full pl-12 pr-4 py-4 bg-gray-800 rounded-xl border border-gray-700 focus:border-primary-500 focus:outline-none text-white placeholder-gray-500"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !searchQuery.trim()}
            className="px-8 py-4 bg-gradient-to-r from-primary-500 to-purple-500 text-white font-semibold rounded-xl hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                Searching...
              </>
            ) : (
              'Search'
            )}
          </button>
        </form>
      </motion.div>

      {/* Error State */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl mx-auto mb-8"
        >
          <div className="glass rounded-xl p-6 border border-red-500/50">
            <div className="flex items-center gap-3 mb-2">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <h2 className="text-red-400 text-lg font-semibold">Search Error</h2>
            </div>
            <p className="text-gray-400 mb-4">
              {error instanceof Error ? error.message : 'An error occurred while searching'}
            </p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition"
            >
              Try Again
            </button>
          </div>
        </motion.div>
      )}

      {/* Loading State */}
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-center min-h-[400px]"
        >
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary-400 mx-auto mb-4" />
            <p className="text-gray-400">Searching wallet data...</p>
          </div>
        </motion.div>
      )}

      {/* Results */}
      {searchResult && !isLoading && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-8"
        >
          {/* Summary Cards */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              icon={Activity}
              label="Total Swaps"
              value={searchResult.summary.totalSwaps.toLocaleString()}
              color="text-blue-400"
            />
            <SummaryCard
              icon={TrendingUp}
              label="Total Volume"
              value={`$${formatNumber(searchResult.summary.totalVolumeUsd)}`}
              color="text-green-400"
            />
            <SummaryCard
              icon={DollarSign}
              label="Fees Earned"
              value={`$${formatNumber(searchResult.summary.totalFeesEarned)}`}
              color="text-amber-400"
            />
            <SummaryCard
              icon={Layers}
              label="Unique Pools"
              value={searchResult.summary.uniquePools.toString()}
              color="text-purple-400"
            />
          </div>

          {/* Wallet Info Card */}
          <div className="glass rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Wallet Overview</h2>
                <p className="font-mono text-sm text-gray-400 break-all">{searchResult.address}</p>
              </div>
              <Link
                href={`/profile/${searchResult.address}`}
                className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition"
              >
                View Full Profile
              </Link>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-gray-400 mb-1">DNA Score</p>
                <p className="text-2xl font-bold">{searchResult.summary.dnaScore}</p>
                <TierBadge tier={searchResult.summary.tier} />
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">Total Positions</p>
                <p className="text-2xl font-bold">
                  {searchResult.summary.activePositions} / {searchResult.summary.totalPositions}
                </p>
                <p className="text-xs text-gray-500 mt-1">Active / Total</p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">First Activity</p>
                <p className="text-sm font-medium">
                  {searchResult.summary.firstActionTimestamp
                    ? new Date(searchResult.summary.firstActionTimestamp * 1000).toLocaleDateString()
                    : 'N/A'}
                </p>
              </div>
            </div>
          </div>

          {/* Pool Interactions */}
          {searchResult.poolInteractions.length > 0 && (
            <div className="glass rounded-xl overflow-hidden">
              <div className="p-6 border-b border-gray-800">
                <h2 className="text-2xl font-bold">Pool Interactions</h2>
                <p className="text-sm text-gray-400 mt-1">
                  {searchResult.poolInteractions.length} unique pool{searchResult.poolInteractions.length !== 1 ? 's' : ''} interacted with
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="px-6 py-4 text-left text-sm font-medium text-gray-400">Pool ID</th>
                      <th className="px-6 py-4 text-right text-sm font-medium text-gray-400">Swaps</th>
                      <th className="px-6 py-4 text-right text-sm font-medium text-gray-400">Volume</th>
                      <th className="px-6 py-4 text-right text-sm font-medium text-gray-400">Fees</th>
                      <th className="px-6 py-4 text-right text-sm font-medium text-gray-400">Positions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResult.poolInteractions.map((pool, index) => (
                      <motion.tr
                        key={pool.poolId}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="border-b border-gray-800/50 hover:bg-gray-800/30 transition"
                      >
                        <td className="px-6 py-4">
                          <div className="font-mono text-sm">
                            {pool.poolId.slice(0, 10)}...{pool.poolId.slice(-8)}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">{pool.totalSwaps}</td>
                        <td className="px-6 py-4 text-right">
                          ${formatNumber(pool.totalVolumeUsd)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          ${formatNumber(pool.totalFeesEarned)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {pool.positions?.length || 0}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Recent Activity */}
          {searchResult.recentActivity && searchResult.recentActivity.length > 0 && (
            <div className="glass rounded-xl p-6">
              <h2 className="text-2xl font-bold mb-4">Recent Activity</h2>
              <div className="space-y-3">
                {searchResult.recentActivity.slice(0, 10).map((activity, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        'w-8 h-8 rounded-full flex items-center justify-center',
                        activity.type === 'swap' && 'bg-blue-500/20 text-blue-400',
                        activity.type === 'mint' && 'bg-green-500/20 text-green-400',
                        activity.type === 'burn' && 'bg-red-500/20 text-red-400',
                        activity.type === 'collect' && 'bg-amber-500/20 text-amber-400',
                      )}>
                        {activity.type === 'swap' && <TrendingUp className="w-4 h-4" />}
                        {activity.type === 'mint' && <Activity className="w-4 h-4" />}
                        {activity.type === 'burn' && <AlertCircle className="w-4 h-4" />}
                        {activity.type === 'collect' && <DollarSign className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="font-medium capitalize">{activity.type}</p>
                        <p className="text-xs text-gray-400 font-mono">
                          {activity.poolId.slice(0, 8)}...{activity.poolId.slice(-6)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-400">
                        {new Date(activity.timestamp * 1000).toLocaleDateString()}
                      </p>
                      {activity.txHash && (
                        <a
                          href={`https://basescan.org/tx/${activity.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1 mt-1"
                        >
                          View <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {searchResult.poolInteractions.length === 0 && searchResult.summary.totalSwaps === 0 && (
            <div className="glass rounded-xl p-12 text-center">
              <div className="max-w-md mx-auto">
                <Activity className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No Activity Found</h3>
                <p className="text-gray-400 mb-4">
                  This wallet address hasn't interacted with Uniswap V4 pools tracked by DeFi DNA yet.
                </p>
                <p className="text-sm text-gray-500">
                  To see stats, the wallet needs to:
                </p>
                <ul className="text-sm text-gray-500 mt-2 space-y-1 text-left max-w-xs mx-auto">
                  <li>• Create positions in Uniswap V4 pools</li>
                  <li>• Perform swaps in tracked pools</li>
                  <li>• Have activity indexed by the DNASubscriber contract</li>
                </ul>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color }: {
  icon: any;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="glass rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <Icon className={clsx('w-6 h-6', color)} />
      </div>
      <p className="text-sm text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const tierConfig = {
    Whale: { icon: Waves, class: 'tier-whale' },
    Expert: { icon: Star, class: 'tier-expert' },
    Intermediate: { icon: TreePine, class: 'tier-intermediate' },
    Beginner: { icon: Sprout, class: 'tier-beginner' },
    Novice: { icon: Leaf, class: 'tier-novice' },
  }[tier] || { icon: Leaf, class: 'tier-novice' };

  const TierIcon = tierConfig.icon;

  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border mt-2', tierConfig.class)}>
      <TierIcon className="w-3 h-3" />
      {tier}
    </span>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
  return num.toFixed(2);
}
