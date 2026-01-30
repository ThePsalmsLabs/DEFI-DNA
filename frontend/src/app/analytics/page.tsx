'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Users,
  DollarSign,
  Activity,
  TrendingUp,
  Loader2,
  AlertCircle,
  Layers,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import {
  getAnalyticsOverview,
  getTierDistribution,
  getTopPools,
  getActivityTimeSeries,
  getScoreDistribution,
} from '@/lib/api';

const TIER_COLORS: Record<string, string> = {
  Novice: '#6b7280',
  Beginner: '#10b981',
  Intermediate: '#3b82f6',
  Expert: '#8b5cf6',
  Whale: '#f59e0b',
};

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

export default function AnalyticsPage() {
  const overview = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: getAnalyticsOverview,
    staleTime: 60_000,
  });

  const tiers = useQuery({
    queryKey: ['analytics', 'tiers'],
    queryFn: getTierDistribution,
    staleTime: 60_000,
  });

  const pools = useQuery({
    queryKey: ['analytics', 'pools', 10],
    queryFn: () => getTopPools(10),
    staleTime: 60_000,
  });

  const activity = useQuery({
    queryKey: ['analytics', 'activity', '30d'],
    queryFn: () => getActivityTimeSeries('30d'),
    staleTime: 60_000,
  });

  const scores = useQuery({
    queryKey: ['analytics', 'scores'],
    queryFn: getScoreDistribution,
    staleTime: 60_000,
  });

  const isLoading =
    overview.isLoading ||
    tiers.isLoading ||
    pools.isLoading ||
    activity.isLoading ||
    scores.isLoading;
  const hasError =
    overview.isError || tiers.isError || pools.isError || activity.isError || scores.isError;
  const errorMessage =
    overview.error instanceof Error
      ? overview.error.message
      : tiers.error instanceof Error
        ? tiers.error.message
        : pools.error instanceof Error
          ? pools.error.message
          : activity.error instanceof Error
            ? activity.error.message
            : scores.error instanceof Error
              ? scores.error.message
              : 'Failed to load analytics';

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
            <BarChart3 className="relative w-16 h-16 text-primary-400" strokeWidth={1.5} />
          </div>
        </div>
        <h1 className="font-display text-4xl font-bold mb-4">Analytics</h1>
        <p className="text-gray-400 max-w-xl mx-auto">
          Platform-wide metrics, tier distribution, top pools, and activity over time.
        </p>
      </motion.div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary-400 mx-auto mb-4" />
            <p className="text-gray-400">Loading analytics...</p>
          </div>
        </div>
      )}

      {/* Error */}
      {hasError && !isLoading && (
        <div className="glass rounded-xl p-6 border border-red-500/50 mb-8">
          <div className="flex items-center gap-3 mb-2">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <h2 className="text-red-400 text-lg font-semibold">Error Loading Analytics</h2>
          </div>
          <p className="text-gray-400 mb-4">{errorMessage}</p>
          <button
            onClick={() => {
              overview.refetch();
              tiers.refetch();
              pools.refetch();
              activity.refetch();
              scores.refetch();
            }}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition"
          >
            Try Again
          </button>
        </div>
      )}

      {!isLoading && !hasError && (
        <>
          {/* Platform Stats Cards */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
          >
            <StatCard
              title="Total Users"
              value={overview.data?.totalUsers ?? 0}
              icon={Users}
              format="number"
            />
            <StatCard
              title="Total Volume (USD)"
              value={overview.data?.totalVolumeUsd ?? 0}
              icon={DollarSign}
              format="usd"
            />
            <StatCard
              title="Active Positions"
              value={overview.data?.activePositions ?? 0}
              icon={Activity}
              format="number"
            />
            <StatCard
              title="Avg DNA Score"
              value={overview.data?.avgDnaScore ?? 0}
              icon={TrendingUp}
              format="score"
            />
          </motion.section>

          {/* Tier Distribution + Top Pools row */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8"
          >
            {/* Tier Distribution Donut */}
            <div className="glass rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Layers className="w-5 h-5 text-primary-400" />
                Tier Distribution
              </h2>
              {tiers.data?.tiers && tiers.data.tiers.length > 0 ? (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={tiers.data.tiers.map((t) => ({ name: t.tier, value: t.count }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {tiers.data.tiers.map((t, i) => (
                          <Cell
                            key={t.tier}
                            fill={TIER_COLORS[t.tier] ?? `hsl(${(i * 60) % 360}, 70%, 50%)`}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgb(17 24 39)',
                          border: '1px solid rgb(75 85 99)',
                          borderRadius: '0.75rem',
                        }}
                        formatter={(value: number) => [value, 'Users']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-gray-500">
                  No tier data yet
                </div>
              )}
            </div>

            {/* Top Pools Table */}
            <div className="glass rounded-xl overflow-hidden">
              <h2 className="text-lg font-semibold p-6 pb-0 flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary-400" />
                Top Pools by Volume
              </h2>
              <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="px-6 py-3 text-left text-sm font-medium text-gray-400">
                        Pool
                      </th>
                      <th className="px-6 py-3 text-right text-sm font-medium text-gray-400">
                        Volume
                      </th>
                      <th className="px-6 py-3 text-right text-sm font-medium text-gray-400">
                        Swaps
                      </th>
                      <th className="px-6 py-3 text-right text-sm font-medium text-gray-400">
                        Users
                      </th>
                      <th className="px-6 py-3 text-right text-sm font-medium text-gray-400">
                        Fees
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pools.data?.pools && pools.data.pools.length > 0 ? (
                      pools.data.pools.map((p) => (
                        <tr
                          key={p.poolId}
                          className="border-b border-gray-800/50 hover:bg-gray-800/30 transition"
                        >
                          <td className="px-6 py-3 font-mono text-sm truncate max-w-[140px]">
                            {p.poolId.slice(0, 8)}...{p.poolId.slice(-6)}
                          </td>
                          <td className="px-6 py-3 text-right text-sm">
                            ${formatNumber(p.totalVolume)}
                          </td>
                          <td className="px-6 py-3 text-right text-sm">
                            {formatNumber(p.totalSwaps)}
                          </td>
                          <td className="px-6 py-3 text-right text-sm">{p.uniqueUsers}</td>
                          <td className="px-6 py-3 text-right text-sm">
                            ${formatNumber(p.feesEarned)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-8 text-center text-gray-500"
                        >
                          No pool data yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.section>

          {/* Activity Timeline */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass rounded-xl p-6 mb-8"
          >
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary-400" />
              Activity (Last 30 Days)
            </h2>
            {activity.data?.data && activity.data.data.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={activity.data.data}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(75 85 99)" opacity={0.3} />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: '#9ca3af', fontSize: 12 }}
                      tickFormatter={(v) => v.slice(5)}
                    />
                    <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgb(17 24 39)',
                        border: '1px solid rgb(75 85 99)',
                        borderRadius: '0.75rem',
                      }}
                      labelFormatter={(v) => v}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="swaps"
                      name="Swaps"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="mints"
                      name="Mints"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="burns"
                      name="Burns"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="collects"
                      name="Collects"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-gray-500">
                No activity data yet
              </div>
            )}
          </motion.section>

          {/* Score Distribution */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="glass rounded-xl p-6"
          >
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary-400" />
              DNA Score Distribution
            </h2>
            {scores.data?.distribution && scores.data.distribution.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={scores.data.distribution}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(75 85 99)" opacity={0.3} />
                    <XAxis
                      dataKey="range"
                      tick={{ fill: '#9ca3af', fontSize: 12 }}
                    />
                    <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgb(17 24 39)',
                        border: '1px solid rgb(75 85 99)',
                        borderRadius: '0.75rem',
                      }}
                    />
                    <Bar dataKey="count" name="Users" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-gray-500">
                No score distribution data yet
              </div>
            )}
          </motion.section>
        </>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  format,
}: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  format: 'number' | 'usd' | 'score';
}) {
  const display =
    format === 'usd'
      ? `$${formatNumber(value)}`
      : format === 'score'
        ? value.toFixed(1)
        : formatNumber(value);

  return (
    <div className="glass rounded-xl p-6 card-hover">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-lg bg-primary-500/20 flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary-400" />
        </div>
        <span className="text-sm text-gray-400">{title}</span>
      </div>
      <p className="text-2xl font-bold">{display}</p>
    </div>
  );
}
