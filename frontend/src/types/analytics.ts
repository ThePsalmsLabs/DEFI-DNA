/**
 * Types for analytics API responses
 */

export interface PlatformOverview {
  totalUsers: number;
  totalVolumeUsd: number;
  totalFeesEarned: number;
  totalPositions: number;
  activePositions: number;
  avgDnaScore: number;
}

export interface TierDistribution {
  tiers: Array<{ tier: string; count: number }>;
}

export interface TopPoolEntry {
  poolId: string;
  totalVolume: number;
  totalSwaps: number;
  uniqueUsers: number;
  feesEarned: number;
}

export interface TopPoolsResponse {
  pools: TopPoolEntry[];
}

export interface ActivityDay {
  date: string;
  swaps: number;
  mints: number;
  burns: number;
  collects: number;
}

export interface ActivityData {
  data: ActivityDay[];
}

export interface ScoreBucket {
  range: string;
  count: number;
}

export interface ScoreDistribution {
  distribution: ScoreBucket[];
}
