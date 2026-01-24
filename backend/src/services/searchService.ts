import { ethers } from 'ethers';
import { Pool } from 'pg';
import { DNASubscriberABI, DNAReaderABI } from '../types/contracts';

interface PoolInteraction {
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

interface WalletSearchResult {
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

export class SearchService {
  private provider: ethers.JsonRpcProvider;
  private dnaSubscriber: ethers.Contract;
  private dnaReader: ethers.Contract;
  private db?: Pool;

  constructor(
    rpcUrl: string,
    dnaSubscriberAddress: string,
    dnaReaderAddress: string,
    dbPool?: Pool
  ) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.dnaSubscriber = new ethers.Contract(
      dnaSubscriberAddress,
      DNASubscriberABI,
      this.provider
    );
    this.dnaReader = new ethers.Contract(
      dnaReaderAddress,
      DNAReaderABI,
      this.provider
    );
    this.db = dbPool;
  }

  /**
   * Search for wallet interactions across all pools
   */
  async searchWallet(walletAddress: string): Promise<WalletSearchResult> {
    // Validate address
    if (!ethers.isAddress(walletAddress)) {
      throw new Error('Invalid wallet address');
    }

    const normalizedAddress = ethers.getAddress(walletAddress);

    // Fetch on-chain data from DNASubscriber
    const onChainData = await this.fetchOnChainData(normalizedAddress);

    // Fetch database data if available
    const dbData = this.db ? await this.fetchDatabaseData(normalizedAddress) : null;

    // Fetch position details
    const positions = await this.fetchPositions(normalizedAddress);

    // Aggregate pool interactions
    const poolInteractions = await this.aggregatePoolInteractions(
      normalizedAddress,
      onChainData,
      dbData,
      positions
    );

    // Calculate DNA score and tier
    const dnaScore = await this.calculateDNAScore(normalizedAddress);
    const tier = await this.getTier(normalizedAddress);

    return {
      address: normalizedAddress,
      summary: {
        totalSwaps: Number(onChainData.totalSwaps) || 0,
        totalVolumeUsd: Number(onChainData.totalVolumeUsd) / 1e18 || 0,
        totalFeesEarned: Number(onChainData.totalFeesEarned) / 1e18 || 0,
        totalPositions: Number(onChainData.totalPositions) || 0,
        activePositions: Number(onChainData.activePositions) || 0,
        uniquePools: Number(onChainData.uniquePools) || 0,
        dnaScore: Number(dnaScore) || 0,
        tier: tier || 'Novice',
        firstActionTimestamp: Number(onChainData.firstActionTimestamp) || 0,
        lastActionTimestamp: Number(onChainData.lastActionTimestamp) || 0,
      },
      poolInteractions,
      recentActivity: dbData?.recentActivity || undefined,
    };
  }

  /**
   * Fetch on-chain user stats from DNASubscriber
   */
  private async fetchOnChainData(address: string) {
    try {
      const stats = await this.dnaSubscriber.getUserStats(address);
      return {
        totalSwaps: stats.totalSwaps,
        totalVolumeUsd: stats.totalVolumeUsd,
        totalFeesEarned: stats.totalFeesEarned,
        totalPositions: stats.totalPositions,
        activePositions: stats.activePositions,
        uniquePools: stats.uniquePools,
        firstActionTimestamp: stats.firstActionTimestamp,
        lastActionTimestamp: stats.lastActionTimestamp,
      };
    } catch (error) {
      console.error('Error fetching on-chain data:', error);
      // Return empty stats if contract call fails
      return {
        totalSwaps: 0n,
        totalVolumeUsd: 0n,
        totalFeesEarned: 0n,
        totalPositions: 0,
        activePositions: 0,
        uniquePools: 0,
        firstActionTimestamp: 0,
        lastActionTimestamp: 0,
      };
    }
  }

  /**
   * Fetch historical data from database if available
   */
  private async fetchDatabaseData(address: string) {
    if (!this.db) return null;

    try {
      // Get recent activity
      const activityResult = await this.db.query(
        `SELECT action_type, pool_id, tx_hash, block_number, timestamp
         FROM user_actions
         WHERE address = $1
         ORDER BY timestamp DESC
         LIMIT 50`,
        [address]
      );

      const recentActivity = activityResult.rows.map((row) => ({
        type: row.action_type === 'swap' ? 'swap' as const : 
              row.action_type === 'mint' ? 'mint' as const :
              row.action_type === 'burn' ? 'burn' as const : 'collect' as const,
        poolId: row.pool_id,
        timestamp: new Date(row.timestamp).getTime() / 1000,
        txHash: row.tx_hash,
      }));

      // Get pool-specific stats
      const poolStatsResult = await this.db.query(
        `SELECT 
           pool_id,
           COUNT(*) as swap_count,
           SUM(amount_usd) as total_volume,
           MIN(timestamp) as first_interaction,
           MAX(timestamp) as last_interaction
         FROM user_actions
         WHERE address = $1 AND action_type = 'swap'
         GROUP BY pool_id`,
        [address]
      );

      return {
        recentActivity,
        poolStats: poolStatsResult.rows,
      };
    } catch (error) {
      console.error('Error fetching database data:', error);
      return null;
    }
  }

  /**
   * Fetch position details for the wallet
   */
  private async fetchPositions(address: string) {
    try {
      const tokenIds = await this.dnaSubscriber.getOwnerTokenIds(address);
      
      if (!tokenIds || tokenIds.length === 0) {
        return [];
      }

      // Fetch position snapshots - limit to first 20 for performance
      const positions = [];
      const maxPositions = Math.min(20, tokenIds.length);

      for (let i = 0; i < maxPositions; i++) {
        try {
          const tokenId = tokenIds[i];
          const positionData = await this.dnaSubscriber.getPosition(tokenId);
          
          // Convert poolId from bytes32 to hex string
          let poolIdHex = '0x';
          if (Array.isArray(positionData.poolId)) {
            poolIdHex = '0x' + positionData.poolId.map((b: number) => 
              b.toString(16).padStart(2, '0')
            ).join('');
          } else if (typeof positionData.poolId === 'string') {
            poolIdHex = positionData.poolId;
          } else {
            // Handle BigNumber or other types
            poolIdHex = '0x' + positionData.poolId.toString(16).padStart(64, '0');
          }

          positions.push({
            tokenId: tokenId.toString(),
            poolId: poolIdHex,
            liquidity: positionData.liquidity?.toString() || '0',
            tickLower: Number(positionData.tickLower) || 0,
            tickUpper: Number(positionData.tickUpper) || 0,
            isActive: positionData.isActive || false,
          });
        } catch (error) {
          console.error(`Error fetching position ${tokenIds[i]}:`, error);
          // Continue with next position
        }
      }

      return positions;
    } catch (error) {
      console.error('Error fetching positions:', error);
      return [];
    }
  }

  /**
   * Aggregate pool interactions from multiple sources
   */
  private async aggregatePoolInteractions(
    address: string,
    onChainData: any,
    dbData: any,
    positions: any[]
  ): Promise<PoolInteraction[]> {
    const poolMap = new Map<string, PoolInteraction>();

    // Add positions to pool map
    for (const position of positions) {
      // Normalize poolId to lowercase for consistent mapping
      const poolId = position.poolId.toLowerCase();
      if (!poolMap.has(poolId)) {
        poolMap.set(poolId, {
          poolId,
          totalSwaps: 0,
          totalVolumeUsd: 0,
          totalFeesEarned: 0,
          firstInteraction: 0,
          lastInteraction: 0,
          positions: [],
        });
      }

      const pool = poolMap.get(poolId)!;
      pool.positions = pool.positions || [];
      pool.positions.push({
        tokenId: position.tokenId,
        liquidity: position.liquidity,
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
        isActive: position.isActive,
      });
    }

    // Add database stats if available
    if (dbData?.poolStats) {
      for (const stat of dbData.poolStats) {
        // Normalize poolId to lowercase
        const poolId = (stat.pool_id || '').toLowerCase();
        if (!poolId) continue;

        if (!poolMap.has(poolId)) {
          poolMap.set(poolId, {
            poolId,
            totalSwaps: 0,
            totalVolumeUsd: 0,
            totalFeesEarned: 0,
            firstInteraction: 0,
            lastInteraction: 0,
          });
        }

        const pool = poolMap.get(poolId)!;
        pool.totalSwaps += parseInt(stat.swap_count) || 0;
        pool.totalVolumeUsd += parseFloat(stat.total_volume) || 0;
        
        if (stat.first_interaction) {
          const firstTs = new Date(stat.first_interaction).getTime() / 1000;
          if (!pool.firstInteraction || firstTs < pool.firstInteraction) {
            pool.firstInteraction = firstTs;
          }
        }
        if (stat.last_interaction) {
          const lastTs = new Date(stat.last_interaction).getTime() / 1000;
          if (!pool.lastInteraction || lastTs > pool.lastInteraction) {
            pool.lastInteraction = lastTs;
          }
        }
      }
    }

    return Array.from(poolMap.values());
  }

  /**
   * Calculate DNA score on-chain
   */
  private async calculateDNAScore(address: string): Promise<bigint> {
    try {
      return await this.dnaSubscriber.calculateDNAScore(address);
    } catch (error) {
      console.error('Error calculating DNA score:', error);
      return 0n;
    }
  }

  /**
   * Get user tier on-chain
   */
  private async getTier(address: string): Promise<string> {
    try {
      return await this.dnaSubscriber.getUserTier(address);
    } catch (error) {
      console.error('Error getting tier:', error);
      return 'Novice';
    }
  }
}
