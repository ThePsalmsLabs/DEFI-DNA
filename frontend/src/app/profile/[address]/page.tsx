'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@radix-ui/react-tabs';
import { 
  Activity, 
  Trophy, 
  PieChart, 
  Clock, 
  Wallet,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  AlertCircle,
  Wifi,
  WifiOff,
  X
} from 'lucide-react';
import { DNAScoreCard } from '@/components/profile/DNAScoreCard';
import { AchievementGrid } from '@/components/profile/AchievementGrid';
import { PositionsList } from '@/components/profile/PositionsList';
import { ActivityTimeline } from '@/components/profile/ActivityTimeline';
import { VersionStats } from '@/components/profile/VersionStats';
import { useWebSocket, useAchievementToast } from '@/hooks/useWebSocket';
import { clsx } from 'clsx';
import { useState, useCallback } from 'react';

interface ProfileResponse {
  address: string;
  dnaScore: number;
  tier: string;
  migrationPath: {
    v2: string | null;
    v3: string | null;
    v4: string | null;
  };
  stats: {
    v2: {
      totalSwaps: number;
      totalVolume: number;
      totalPositions: number;
      firstAction: string | null;
    };
    v3: {
      totalSwaps: number;
      totalVolume: number;
      totalPositions: number;
      activePositions: number;
      totalFeesEarned: number;
      firstAction: string | null;
    };
    v4: {
      totalSwaps: number;
      totalVolume: number;
      totalPositions: number;
      activePositions: number;
      totalFeesEarned: number;
      totalLiquidityProvided: string;
      uniquePools: number;
      uniqueHooksUsed: number;
      firstAction: string | null;
    };
  };
  scoreBreakdown: {
    earlyAdopter: number;
    volume: number;
    lpEfficiency: number;
    diversity: number;
    consistency: number;
  };
  achievements: Array<{
    achievement_type: string;
    achievement_name: string;
    achievement_tier: string;
    earned_at: string;
    points: number;
  }>;
  recentActivity: {
    day_count: number;
    week_count: number;
    month_count: number;
  };
  updatedAt: string;
}

// API fetch function
async function fetchProfile(address: string): Promise<ProfileResponse> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/profile/${address}`);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('PROFILE_NOT_FOUND');
    }
    throw new Error('Failed to fetch profile');
  }
  return res.json();
}

export default function ProfilePage() {
  const params = useParams();
  const address = params.address as string;
  const { achievements, addAchievement, removeAchievement } = useAchievementToast();
  const [actionToast, setActionToast] = useState<string | null>(null);

  // Handle real-time updates
  const handleAction = useCallback((action: any) => {
    setActionToast(`New ${action.type}: ${action.poolId?.slice(0, 10)}...`);
    setTimeout(() => setActionToast(null), 3000);
  }, []);

  const handleAchievement = useCallback((achievement: any) => {
    addAchievement(achievement);
  }, [addAchievement]);

  // WebSocket connection for real-time updates
  const { isConnected } = useWebSocket({
    address,
    onAction: handleAction,
    onAchievement: handleAchievement,
  });

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['profile', address],
    queryFn: () => fetchProfile(address),
    enabled: !!address,
    retry: (failureCount, error) => {
      // Don't retry for 404s
      if (error instanceof Error && error.message === 'PROFILE_NOT_FOUND') {
        return false;
      }
      return failureCount < 3;
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading your DeFi DNA...</p>
        </div>
      </div>
    );
  }

  if (error) {
    const isNotFound = error instanceof Error && error.message === 'PROFILE_NOT_FOUND';
    
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center max-w-md mx-auto">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gray-800 flex items-center justify-center">
            <AlertCircle className="w-10 h-10 text-gray-500" />
          </div>
          {isNotFound ? (
            <>
              <h2 className="text-xl font-display font-bold text-gray-300 mb-2">
                Profile Not Found
              </h2>
              <p className="text-gray-500 mb-4">
                This address hasn&apos;t interacted with Uniswap V4 yet, or data is still being indexed.
              </p>
              <p className="text-sm text-gray-600">
                Address: <code className="bg-gray-800 px-2 py-1 rounded">{address}</code>
              </p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-display font-bold text-gray-300 mb-2">
                Something went wrong
              </h2>
              <p className="text-gray-500">
                Failed to load profile data. Please try again later.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  // Ensure stats have defaults
  const stats = {
    v2: {
      totalSwaps: profile.stats?.v2?.totalSwaps || 0,
      totalVolume: profile.stats?.v2?.totalVolume || 0,
      totalPositions: profile.stats?.v2?.totalPositions || 0,
      firstAction: profile.stats?.v2?.firstAction || '',
    },
    v3: {
      totalSwaps: profile.stats?.v3?.totalSwaps || 0,
      totalVolume: profile.stats?.v3?.totalVolume || 0,
      totalPositions: profile.stats?.v3?.totalPositions || 0,
      activePositions: profile.stats?.v3?.activePositions || 0,
      totalFeesEarned: profile.stats?.v3?.totalFeesEarned || 0,
      firstAction: profile.stats?.v3?.firstAction || '',
    },
    v4: {
      totalSwaps: profile.stats?.v4?.totalSwaps || 0,
      totalVolume: profile.stats?.v4?.totalVolume || 0,
      totalPositions: profile.stats?.v4?.totalPositions || 0,
      activePositions: profile.stats?.v4?.activePositions || 0,
      totalFeesEarned: profile.stats?.v4?.totalFeesEarned || 0,
      uniquePools: profile.stats?.v4?.uniquePools || 0,
      uniqueHooksUsed: profile.stats?.v4?.uniqueHooksUsed || 0,
      firstAction: profile.stats?.v4?.firstAction || '',
    },
  };

  const scoreBreakdown = {
    earlyAdopter: profile.scoreBreakdown?.earlyAdopter || 0,
    volume: profile.scoreBreakdown?.volume || 0,
    lpEfficiency: profile.scoreBreakdown?.lpEfficiency || 0,
    diversity: profile.scoreBreakdown?.diversity || 0,
    consistency: profile.scoreBreakdown?.consistency || 0,
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Connection Status */}
      <div className="fixed top-4 right-4 z-50">
        <div className={clsx(
          'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium',
          isConnected 
            ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
            : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
        )}>
          {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {isConnected ? 'Live' : 'Connecting...'}
        </div>
      </div>

      {/* Achievement Toasts */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        <AnimatePresence>
          {achievements.map((achievement) => (
            <motion.div
              key={achievement.id}
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 100 }}
              className="bg-gradient-to-r from-purple-500 to-pink-500 p-4 rounded-xl shadow-lg max-w-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Trophy className="w-5 h-5 text-yellow-300" />
                    <span className="font-bold text-white">Achievement Unlocked!</span>
                  </div>
                  <p className="text-white/90 font-medium">{achievement.name}</p>
                  <p className="text-white/70 text-sm">{achievement.tier} • +{achievement.points} points</p>
                </div>
                <button 
                  onClick={() => removeAchievement(achievement.id)}
                  className="text-white/70 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Action Toast */}
        <AnimatePresence>
          {actionToast && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-gray-800 border border-gray-700 p-3 rounded-lg text-sm text-gray-300"
            >
              {actionToast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-primary-500 to-purple-500 flex items-center justify-center">
            <Wallet className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold">
              {address.slice(0, 6)}...{address.slice(-4)}
            </h1>
            <p className="text-gray-400">DeFi DNA Profile</p>
          </div>
        </div>
      </motion.div>

      {/* Main Grid */}
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Left Column - DNA Score */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
        >
          <DNAScoreCard
            score={profile.dnaScore || 0}
            tier={profile.tier || 'Novice'}
            breakdown={scoreBreakdown}
          />
        </motion.div>

        {/* Right Column - Stats & Tabs */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2"
        >
          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Total Volume"
              value={`$${formatNumber(
                (stats.v4.totalVolume || 0) + 
                (stats.v3.totalVolume || 0) + 
                (stats.v2.totalVolume || 0)
              )}`}
              icon={TrendingUp}
            />
            <StatCard
              label="Fees Earned"
              value={`$${formatNumber(
                (stats.v4.totalFeesEarned || 0) + 
                (stats.v3.totalFeesEarned || 0)
              )}`}
              icon={ArrowUpRight}
            />
            <StatCard
              label="Active Positions"
              value={(stats.v4.activePositions || 0) + (stats.v3.activePositions || 0)}
              icon={PieChart}
            />
            <StatCard
              label="Unique Pools"
              value={stats.v4.uniquePools || 0}
              icon={Activity}
            />
          </div>

          {/* Tabs */}
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="flex gap-2 border-b border-gray-800 pb-2">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-400 rounded-lg transition data-[state=active]:bg-primary-500/20 data-[state=active]:text-primary-400 hover:text-white"
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <VersionStats stats={stats} />
            </TabsContent>

            <TabsContent value="achievements">
              <AchievementGrid achievements={profile.achievements || []} />
            </TabsContent>

            <TabsContent value="positions">
              <PositionsList address={address} />
            </TabsContent>

            <TabsContent value="activity">
              <ActivityTimeline address={address} />
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  trend,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  trend?: number;
  icon: React.ElementType;
}) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <Icon className="w-5 h-5 text-gray-400" />
        {trend !== undefined && (
          <span className={clsx(
            'text-xs font-medium flex items-center gap-1',
            trend > 0 ? 'text-green-400' : 'text-red-400'
          )}>
            {trend > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const tabs = [
  { value: 'overview', label: 'Overview', icon: PieChart },
  { value: 'achievements', label: 'Achievements', icon: Trophy },
  { value: 'positions', label: 'Positions', icon: Activity },
  { value: 'activity', label: 'Activity', icon: Clock },
];
