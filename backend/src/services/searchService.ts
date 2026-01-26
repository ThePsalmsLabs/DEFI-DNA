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

// PositionManager ABI (ERC721 + PositionManager functions)
const POSITION_MANAGER_ABI = [
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
  'function getPoolAndPositionInfo(uint256 tokenId) view returns (tuple, uint256)',
  'function getPositionLiquidity(uint256 tokenId) view returns (uint128)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];

// Base Mainnet PositionManager address
const BASE_POSITION_MANAGER = '0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e';

export class SearchService {
  private provider: ethers.JsonRpcProvider;
  private dnaSubscriber: ethers.Contract;
  private dnaReader: ethers.Contract;
  private positionManager: ethers.Contract;
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
    // Initialize PositionManager contract
    this.positionManager = new ethers.Contract(
      BASE_POSITION_MANAGER,
      POSITION_MANAGER_ABI,
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

    // Fetch on-chain data from DNASubscriber (may be empty if not subscribed)
    const onChainData = await this.fetchOnChainData(normalizedAddress);

    // Fetch database data if available
    const dbData = this.db ? await this.fetchDatabaseData(normalizedAddress) : null;

    // Fetch position details (from both DNASubscriber and PositionManager)
    const positions = await this.fetchPositions(normalizedAddress);

    // Aggregate pool interactions
    const poolInteractions = await this.aggregatePoolInteractions(
      normalizedAddress,
      onChainData,
      dbData,
      positions
    );

    // Calculate DNA score and tier (from DNASubscriber if available)
    const dnaScore = await this.calculateDNAScore(normalizedAddress);
    const tier = await this.getTier(normalizedAddress);

    // Calculate actual position counts from fetched positions
    const totalPositions = positions.length;
    const activePositions = positions.filter(p => p.isActive).length;
    
    // Extract unique pools from positions
    const uniquePoolsSet = new Set<string>();
    positions.forEach(p => {
      if (p.poolId && p.poolId !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
        uniquePoolsSet.add(p.poolId.toLowerCase());
      }
    });
    const uniquePools = uniquePoolsSet.size;

    return {
      address: normalizedAddress,
      summary: {
        totalSwaps: Number(onChainData.totalSwaps) || 0,
        totalVolumeUsd: Number(onChainData.totalVolumeUsd) / 1e18 || 0,
        totalFeesEarned: Number(onChainData.totalFeesEarned) / 1e18 || 0,
        totalPositions: totalPositions || Number(onChainData.totalPositions) || 0,
        activePositions: activePositions || Number(onChainData.activePositions) || 0,
        uniquePools: uniquePools || Number(onChainData.uniquePools) || 0,
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
    } catch (error: any) {
      console.error('Error fetching on-chain data:', error);
      // Log more details for debugging
      if (error.message) {
        console.error('Error message:', error.message);
      }
      if (error.code) {
        console.error('Error code:', error.code);
      }
      // Return empty stats if contract call fails
      // This is normal for wallets that haven't interacted with tracked contracts
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
   * First tries DNASubscriber (subscribed positions), then queries PositionManager directly
   */
  private async fetchPositions(address: string) {
    const positions: any[] = [];
    const tokenIdSet = new Set<string>();

    // Step 1: Get positions from DNASubscriber (subscribed positions)
    try {
      const subscribedTokenIds = await this.dnaSubscriber.getOwnerTokenIds(address);
      
      if (subscribedTokenIds && subscribedTokenIds.length > 0) {
        for (let i = 0; i < Math.min(20, subscribedTokenIds.length); i++) {
          try {
            const tokenId = subscribedTokenIds[i].toString();
            tokenIdSet.add(tokenId);
            
            const positionData = await this.dnaSubscriber.getPosition(subscribedTokenIds[i]);
            
            let poolIdHex = '0x';
            if (Array.isArray(positionData.poolId)) {
              poolIdHex = '0x' + positionData.poolId.map((b: number) => 
                b.toString(16).padStart(2, '0')
              ).join('');
            } else if (typeof positionData.poolId === 'string') {
              poolIdHex = positionData.poolId;
            } else {
              poolIdHex = '0x' + positionData.poolId.toString(16).padStart(64, '0');
            }

            positions.push({
              tokenId,
              poolId: poolIdHex,
              liquidity: positionData.liquidity?.toString() || '0',
              tickLower: Number(positionData.tickLower) || 0,
              tickUpper: Number(positionData.tickUpper) || 0,
              isActive: positionData.isActive || false,
              isSubscribed: true,
            });
          } catch (error) {
            console.error(`Error fetching subscribed position ${subscribedTokenIds[i]}:`, error);
          }
        }
      }
    } catch (error) {
      console.log('No subscribed positions found (this is normal if positions not subscribed)');
    }

    // Step 2: Query PositionManager Transfer events to find ALL positions
    try {
      console.log(`Querying PositionManager events for ${address}...`);
      
      // Get Transfer events where this address received tokens (minted or transferred to)
      const currentBlock = await this.provider.getBlockNumber();
      // Query last 50k blocks (Base mainnet has ~2s block time, so ~28 days of history)
      // Adjust this based on when Uniswap V4 launched on Base
      const fromBlock = Math.max(0, currentBlock - 50000);
      
      const transferFilter = this.positionManager.filters.Transfer(null, address);
      const transfers = await this.positionManager.queryFilter(transferFilter, fromBlock, 'latest');
      
      console.log(`Found ${transfers.length} Transfer events to ${address}`);

      // Also check transfers FROM this address (to handle current ownership)
      const fromTransfers = await this.positionManager.queryFilter(
        this.positionManager.filters.Transfer(address, null),
        fromBlock,
        'latest'
      );

      // Build set of token IDs that were minted to or transferred to this address
      const receivedTokenIds = new Set<string>();
      for (const event of transfers) {
        if ('args' in event && event.args && event.args.tokenId) {
          receivedTokenIds.add(event.args.tokenId.toString());
        }
      }

      // Remove tokens that were transferred away
      for (const event of fromTransfers) {
        if ('args' in event && event.args && event.args.to && event.args.to.toLowerCase() !== address.toLowerCase()) {
          receivedTokenIds.delete(event.args.tokenId.toString());
        }
      }

      console.log(`Found ${receivedTokenIds.size} unique positions for ${address}`);

      // Fetch details for positions not already in our list
      let fetchedCount = 0;
      const maxToFetch = 20; // Limit for performance

      for (const tokenIdStr of receivedTokenIds) {
        if (tokenIdSet.has(tokenIdStr) || fetchedCount >= maxToFetch) {
          continue;
        }

        try {
          // Verify current ownership
          const currentOwner = await this.positionManager.ownerOf(tokenIdStr);
          if (currentOwner.toLowerCase() !== address.toLowerCase()) {
            continue; // Not owned by this address anymore
          }

          // Use DNAReader to get position snapshot (includes poolId computation)
          const snapshot = await this.dnaReader.getPositionSnapshot(tokenIdStr);
          
          if (snapshot.owner && snapshot.owner.toLowerCase() === address.toLowerCase()) {
            // Convert poolId bytes32 to hex string
            let poolIdHex = '0x';
            if (typeof snapshot.poolId === 'string') {
              poolIdHex = snapshot.poolId.startsWith('0x') 
                ? snapshot.poolId 
                : '0x' + snapshot.poolId;
            } else if (snapshot.poolId) {
              // Handle BigNumber or other types
              const poolIdStr = snapshot.poolId.toString();
              poolIdHex = poolIdStr.startsWith('0x') 
                ? poolIdStr 
                : '0x' + poolIdStr.padStart(64, '0');
            }

            positions.push({
              tokenId: tokenIdStr,
              poolId: poolIdHex,
              liquidity: snapshot.liquidity?.toString() || '0',
              tickLower: Number(snapshot.tickLower) || 0,
              tickUpper: Number(snapshot.tickUpper) || 0,
              isActive: snapshot.isInRange || false,
              isSubscribed: tokenIdSet.has(tokenIdStr),
            });
            fetchedCount++;
          }
        } catch (error: any) {
          // Position might not exist or be invalid, skip it
          if (!error.message?.includes('ERC721: invalid token ID')) {
            console.error(`Error fetching position ${tokenIdStr}:`, error.message);
          }
        }
      }

      console.log(`Fetched ${fetchedCount} additional positions from PositionManager`);
    } catch (error: any) {
      console.error('Error querying PositionManager events:', error.message);
      // Continue with subscribed positions only
    }

    return positions;
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
