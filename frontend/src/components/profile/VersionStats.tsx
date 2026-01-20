'use client';

import { motion } from 'framer-motion';
import { clsx } from 'clsx';

interface Stats {
  v2: {
    totalSwaps: number;
    totalVolume: number;
    totalPositions: number;
    firstAction: string;
  };
  v3: {
    totalSwaps: number;
    totalVolume: number;
    totalPositions: number;
    activePositions: number;
    totalFeesEarned: number;
    firstAction: string;
  };
  v4: {
    totalSwaps: number;
    totalVolume: number;
    totalPositions: number;
    activePositions: number;
    totalFeesEarned: number;
    uniquePools: number;
    uniqueHooksUsed: number;
    firstAction: string;
  };
}

interface VersionStatsProps {
  stats: Stats;
}

export function VersionStats({ stats }: VersionStatsProps) {
  const versions = [
    {
      version: 'V2',
      color: 'from-pink-500 to-rose-500',
      border: 'border-pink-500/30',
      stats: [
        { label: 'Total Swaps', value: stats.v2.totalSwaps },
        { label: 'Volume', value: `$${formatNumber(stats.v2.totalVolume)}` },
        { label: 'Positions', value: stats.v2.totalPositions },
        { label: 'First Action', value: formatDate(stats.v2.firstAction) },
      ],
    },
    {
      version: 'V3',
      color: 'from-blue-500 to-cyan-500',
      border: 'border-blue-500/30',
      stats: [
        { label: 'Total Swaps', value: stats.v3.totalSwaps },
        { label: 'Volume', value: `$${formatNumber(stats.v3.totalVolume)}` },
        { label: 'Active Positions', value: stats.v3.activePositions },
        { label: 'Fees Earned', value: `$${formatNumber(stats.v3.totalFeesEarned)}` },
        { label: 'First Action', value: formatDate(stats.v3.firstAction) },
      ],
    },
    {
      version: 'V4',
      color: 'from-primary-500 to-purple-500',
      border: 'border-primary-500/30',
      highlight: true,
      stats: [
        { label: 'Total Swaps', value: stats.v4.totalSwaps },
        { label: 'Volume', value: `$${formatNumber(stats.v4.totalVolume)}` },
        { label: 'Active Positions', value: stats.v4.activePositions },
        { label: 'Fees Earned', value: `$${formatNumber(stats.v4.totalFeesEarned)}` },
        { label: 'Unique Pools', value: stats.v4.uniquePools },
        { label: 'Hooks Used', value: stats.v4.uniqueHooksUsed },
        { label: 'First Action', value: formatDate(stats.v4.firstAction) },
      ],
    },
  ];

  return (
    <div className="grid md:grid-cols-3 gap-6">
      {versions.map((version, index) => (
        <motion.div
          key={version.version}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className={clsx(
            'rounded-xl border overflow-hidden',
            version.border,
            version.highlight && 'ring-2 ring-primary-500/20'
          )}
        >
          {/* Header */}
          <div className={clsx('p-4 bg-gradient-to-r', version.color)}>
            <h3 className="text-lg font-display font-bold text-white">
              Uniswap {version.version}
            </h3>
            {version.highlight && (
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded text-white/90">
                Latest
              </span>
            )}
          </div>

          {/* Stats */}
          <div className="p-4 bg-gray-900/50 space-y-3">
            {version.stats.map((stat) => (
              <div key={stat.label} className="flex justify-between items-center">
                <span className="text-sm text-gray-400">{stat.label}</span>
                <span className="font-medium">{stat.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

function formatDate(dateStr: string): string {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

