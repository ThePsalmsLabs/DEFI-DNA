export interface PoolInteraction {
  poolId: string;
  poolKey?: {
    currency0: string;
    currency1: string;
    fee: number;
    tickSpacing: number;
    hooks: string;
  };
  totalSwaps: number;
  totalVolumeUsd: number;
  totalFeesEarned: number;
  firstInteraction: number;
  lastInteraction: number;
  positions?: Array<{
    tokenId: string;
    liquidity: string;
    tickLower: number;
    tickUpper: number;
    isActive: boolean;
  }>;
}

export interface WalletSearchResult {
  address: string;
  summary: {
    totalSwaps: number;
    totalVolumeUsd: number;
    totalFeesEarned: number;
    totalPositions: number;
    activePositions: number;
    uniquePools: number;
    dnaScore: number;
    tier: string;
    firstActionTimestamp: number;
    lastActionTimestamp: number;
  };
  poolInteractions: PoolInteraction[];
  recentActivity?: Array<{
    type: 'swap' | 'mint' | 'burn' | 'collect';
    poolId: string;
    timestamp: number;
    txHash?: string;
  }>;
}
